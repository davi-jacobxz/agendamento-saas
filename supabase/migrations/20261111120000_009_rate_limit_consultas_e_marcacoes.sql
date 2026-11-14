-- Rate limit: consultas públicas por IP, marcações por negócio e por telefone.
-- Tudo guardado como hash (nunca IPs nem telefones em claro).

create or replace function app_private.ip_hash()
returns text language plpgsql stable set search_path = '' as $$
declare v_hdr json; v_ip text;
begin
  begin
    v_hdr := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    return null;
  end;
  v_ip := nullif(btrim(split_part(coalesce(v_hdr->>'x-forwarded-for', ''), ',', 1)), '');
  if v_ip is null then return null; end if;
  return encode(sha256(convert_to(v_ip, 'utf8')), 'hex');
end $$;

-- true = pedido permitido (e contado); false = limite excedido
create or replace function app_private.rate_hit(p_bucket text, p_limit int, p_window interval)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  if (select count(*) from app_private.rate_events
      where bucket = p_bucket and created_at > now() - p_window) >= p_limit then
    return false;
  end if;
  insert into app_private.rate_events (bucket) values (p_bucket);
  if random() < 0.01 then
    delete from app_private.rate_events where created_at < now() - interval '2 days';
  end if;
  return true;
end $$;

revoke all on function app_private.ip_hash() from public, anon, authenticated;
revoke all on function app_private.rate_hit(text, int, interval) from public, anon, authenticated;

create or replace function public.get_public_business(p_slug text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare b public.businesses; v_ip text := app_private.ip_hash();
begin
  if v_ip is not null and not app_private.rate_hit('rd:' || v_ip, 600, interval '10 minutes') then
    raise exception 'muitas_tentativas' using errcode = 'P0001';
  end if;
  select * into b from public.businesses where slug = lower(coalesce(p_slug, ''));
  if not found then return jsonb_build_object('encontrado', false, 'disponivel', false); end if;
  if not app_private.business_available(b) then
    return jsonb_build_object('encontrado', true, 'disponivel', false);
  end if;
  return jsonb_build_object(
    'encontrado', true, 'disponivel', true,
    'negocio', jsonb_build_object(
      'nome', b.name, 'logo_path', b.logo_path, 'cover_path', b.cover_path,
      'cor_principal', b.primary_color, 'texto_boas_vindas', b.welcome_text,
      'endereco', b.address, 'instagram', b.instagram, 'whatsapp', b.whatsapp, 'mensagem_whatsapp', b.whatsapp_message,
      'rotulo_profissional', b.professional_label,
      'mensagem_confirmacao', b.confirmation_message,
      'antecedencia_max_dias', b.max_advance_days),
    'servicos', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.name, 'descricao', s.description,
               'duracao_minutos', s.duration_minutes, 'preco_cents', s.price_cents, 'categoria', s.category)
             order by s.position, s.name)
      from public.services s
      where s.business_id = b.id and s.active
        and exists (select 1 from public.professional_services ps
                    join public.professionals p on p.id = ps.professional_id and p.active
                    where ps.service_id = s.id)), '[]'::jsonb),
    'profissionais', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.name, 'foto_path', p.photo_path,
               'servicos', coalesce((select jsonb_agg(ps.service_id) from public.professional_services ps
                                     where ps.professional_id = p.id), '[]'::jsonb))
             order by p.position, p.name)
      from public.professionals p where p.business_id = b.id and p.active), '[]'::jsonb));
end $$;

create or replace function public.get_available_slots(
  p_slug text, p_service_id uuid, p_professional_id uuid, p_data date)
returns table (inicio timestamptz) language plpgsql volatile security definer set search_path = '' as $$
declare
  b public.businesses;
  s public.services;
  v_dow int;
  v_ip text := app_private.ip_hash();
begin
  if v_ip is not null and not app_private.rate_hit('rd:' || v_ip, 600, interval '10 minutes') then
    raise exception 'muitas_tentativas' using errcode = 'P0001';
  end if;
  select * into b from public.businesses where slug = lower(coalesce(p_slug, ''));
  if not found or not app_private.business_available(b) then return; end if;
  select * into s from public.services where id = p_service_id and business_id = b.id and active;
  if not found or p_data is null then return; end if;
  v_dow := extract(dow from p_data)::int;

  return query
  select distinct g.slot as inicio
  from (
    select generate_series(
             (p_data + wh.start_time) at time zone 'Europe/Lisbon',
             ((p_data + wh.end_time) at time zone 'Europe/Lisbon') - make_interval(mins => s.duration_minutes),
             make_interval(mins => b.slot_interval_minutes)) as slot,
           p.id as pid
    from public.professionals p
    join public.professional_services ps on ps.professional_id = p.id and ps.service_id = s.id
    join public.working_hours wh on wh.professional_id = p.id and wh.weekday = v_dow
    where p.business_id = b.id and p.active
      and (p_professional_id is null or p.id = p_professional_id)
  ) g
  where g.slot >= now() + make_interval(mins => b.min_notice_minutes)
    and g.slot <= now() + make_interval(days => b.max_advance_days)
    and app_private.slot_conflict(b.id, g.pid, g.slot, g.slot + make_interval(mins => s.duration_minutes),
                                  b.buffer_minutes, b.slot_interval_minutes, true) is null
  order by 1;
end $$;

create or replace function public.book_appointment(
  p_slug text, p_service_id uuid, p_professional_id uuid, p_inicio timestamptz,
  p_nome text, p_telefone text, p_consentimento boolean, p_website text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  b public.businesses;
  v_tel text;
  v_hdr json;
  v_ip text;
  v_tel_key text;
  v_ip_key text;
  v_res jsonb;
begin
  if coalesce(p_website, '') <> '' then
    return app_private.err('invalido', 'Pedido inválido.');
  end if;

  select * into b from public.businesses where slug = lower(coalesce(p_slug, ''));
  if not found or not app_private.business_available(b) then
    return app_private.err('indisponivel', 'Serviço indisponível.');
  end if;

  v_tel := app_private.normalize_phone(p_telefone);
  if v_tel is null then
    return app_private.err('telefone_invalido', 'Indique um número de telefone válido.');
  end if;

  v_tel_key := 'tel:' || encode(sha256(convert_to(v_tel, 'utf8')), 'hex');
  begin
    v_hdr := nullif(current_setting('request.headers', true), '')::json;
  exception when others then v_hdr := null;
  end;
  v_ip := nullif(btrim(split_part(coalesce(v_hdr->>'x-forwarded-for', ''), ',', 1)), '');

  if (select count(*) from app_private.rate_events
      where bucket = v_tel_key and created_at > now() - interval '1 hour') >= 5 then
    return app_private.err('muitas_tentativas', 'Demasiadas tentativas. Tente novamente mais tarde.');
  end if;
  insert into app_private.rate_events (bucket) values (v_tel_key);

  if v_ip is not null then
    v_ip_key := 'ip:' || encode(sha256(convert_to(v_ip, 'utf8')), 'hex');
    if (select count(*) from app_private.rate_events
        where bucket = v_ip_key and created_at > now() - interval '1 hour') >= 30 then
      return app_private.err('muitas_tentativas', 'Demasiadas tentativas. Tente novamente mais tarde.');
    end if;
    insert into app_private.rate_events (bucket) values (v_ip_key);
  end if;

  -- teto de marcações CRIADAS por hora em cada negócio (um ataque distribuído não consegue encher a agenda)
  if (select count(*) from app_private.rate_events
      where bucket = 'bizok:' || b.id::text and created_at > now() - interval '1 hour') >= 40 then
    return app_private.err('muitas_tentativas', 'Este negócio está a receber muitos pedidos. Tente novamente daqui a pouco.');
  end if;

  -- no máximo 5 marcações futuras por telefone em cada negócio (ninguém açambarca os horários)
  if (select count(*) from public.appointments a
      where a.business_id = b.id and a.telefone = v_tel and a.status = 'confirmado' and a.inicio > now()) >= 5 then
    return app_private.err('limite_marcacoes', 'Já tem 5 marcações futuras neste negócio. Para marcar mais, contacte o negócio.');
  end if;

  if random() < 0.02 then
    delete from app_private.rate_events where created_at < now() - interval '2 days';
  end if;

  v_res := app_private.create_appointment(b, p_service_id, p_professional_id, p_inicio,
                                          p_nome, v_tel, p_consentimento, false);
  if coalesce((v_res->>'ok')::boolean, false) then
    insert into app_private.rate_events (bucket) values ('bizok:' || b.id::text);
  end if;
  return v_res;
end $$;
