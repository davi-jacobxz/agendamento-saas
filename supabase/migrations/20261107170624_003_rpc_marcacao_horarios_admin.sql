
create or replace function app_private.err(p_code text, p_msg text)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('ok', false, 'code', p_code, 'mensagem', p_msg)
$$;

create or replace function app_private.business_available(b public.businesses)
returns boolean language sql stable set search_path = '' as $$
  select b.status = 'ativo' and b.paid_until is not null and b.paid_until > now()
$$;

create or replace function app_private.normalize_phone(p text)
returns text language plpgsql immutable set search_path = '' as $$
declare v text := regexp_replace(coalesce(p, ''), '[\s\-\.\(\)]', '', 'g');
begin
  if v ~ '^00' then v := '+' || substr(v, 3); end if;
  if v ~ '^[29][0-9]{8}$' then return '+351' || v; end if;
  if v ~ '^\+351[29][0-9]{8}$' then return v; end if;
  if v ~ '^\+(?!351)[1-9][0-9]{7,14}$' then return v; end if;
  return null;
end $$;

create or replace function app_private.slot_conflict(
  p_business_id uuid, p_professional_id uuid, p_inicio timestamptz, p_fim timestamptz,
  p_buffer int, p_slot_interval int, p_strict boolean)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz constant text := 'Europe/Lisbon';
  v_date date := (p_inicio at time zone 'Europe/Lisbon')::date;
  v_dow int := extract(dow from (p_inicio at time zone 'Europe/Lisbon')::date)::int;
  v_buffer int := case when p_strict then p_buffer else 0 end;
begin
  if p_strict then
    if not exists (
      select 1 from public.working_hours wh
      where wh.professional_id = p_professional_id and wh.weekday = v_dow
        and p_inicio >= ((v_date + wh.start_time) at time zone v_tz)
        and p_fim <= ((v_date + wh.end_time) at time zone v_tz)
        and mod((extract(epoch from (p_inicio - ((v_date + wh.start_time) at time zone v_tz))) / 60)::int, p_slot_interval) = 0
    ) then return 'fora_do_horario'; end if;

    if exists (
      select 1 from public.blocked_times bt
      where bt.business_id = p_business_id
        and (bt.professional_id is null or bt.professional_id = p_professional_id)
        and tstzrange(bt.starts_at, bt.ends_at) && tstzrange(p_inicio, p_fim)
    ) then return 'bloqueado'; end if;
  end if;

  if exists (
    select 1 from public.appointments a
    where a.professional_id = p_professional_id and a.status = 'confirmado'
      and tstzrange(a.inicio - make_interval(mins => v_buffer), a.fim + make_interval(mins => v_buffer))
          && tstzrange(p_inicio, p_fim)
  ) then return 'ocupado'; end if;

  return null;
end $$;

create or replace function app_private.create_appointment(
  b public.businesses, p_service_id uuid, p_professional_id uuid, p_inicio timestamptz,
  p_nome text, p_telefone text, p_consentimento boolean, p_manual boolean)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  s public.services;
  v_nome text := btrim(coalesce(p_nome, ''));
  v_fim timestamptz;
  r record;
  v_code text;
  v_found boolean := false;
  v_busy boolean := false;
  v_id uuid;
  v_prof_name text;
begin
  if p_inicio is null then return app_private.err('invalido', 'Pedido inválido.'); end if;
  if char_length(v_nome) < 2 or char_length(v_nome) > 100 then
    return app_private.err('nome_invalido', 'Indique um nome válido.');
  end if;
  if not p_manual and not coalesce(p_consentimento, false) then
    return app_private.err('consentimento_necessario', 'É necessário aceitar o uso do telefone para confirmar a marcação.');
  end if;

  select * into s from public.services where id = p_service_id and business_id = b.id and active;
  if not found then return app_private.err('servico_invalido', 'Serviço indisponível.'); end if;

  v_fim := p_inicio + make_interval(mins => s.duration_minutes);

  if not p_manual then
    if p_inicio < now() then
      return app_private.err('no_passado', 'Esse horário já passou. Escolha outro.');
    end if;
    if p_inicio < now() + make_interval(mins => b.min_notice_minutes) then
      return app_private.err('antecedencia_minima', 'Esse horário já não tem antecedência suficiente. Escolha outro.');
    end if;
    if p_inicio > now() + make_interval(days => b.max_advance_days) then
      return app_private.err('antecedencia_maxima', 'Ainda não é possível marcar para essa data.');
    end if;
  end if;

  for r in
    select pr.id, pr.name from public.professionals pr
    join public.professional_services ps on ps.professional_id = pr.id and ps.service_id = s.id
    where pr.business_id = b.id and pr.active
      and (p_professional_id is null or pr.id = p_professional_id)
    order by pr.position, pr.id
  loop
    v_found := true;
    perform pg_advisory_xact_lock(hashtextextended(r.id::text, 0));
    v_code := app_private.slot_conflict(b.id, r.id, p_inicio, v_fim, b.buffer_minutes, b.slot_interval_minutes, not p_manual);
    if v_code is null then
      begin
        insert into public.appointments (business_id, professional_id, service_id, inicio, fim,
                                         nome_cliente, telefone, origem, consentimento_em)
        values (b.id, r.id, s.id, p_inicio, v_fim, v_nome, p_telefone,
                case when p_manual then 'manual' else 'publico' end,
                case when coalesce(p_consentimento, false) then now() end)
        returning id into v_id;
        v_prof_name := r.name;
        exit;
      exception when exclusion_violation then
        v_code := 'ocupado';
      end;
    end if;
    if v_code in ('ocupado', 'bloqueado') then v_busy := true; end if;
  end loop;

  if v_id is null then
    if not v_found then
      return app_private.err('profissional_invalido', 'Profissional indisponível para este serviço.');
    elsif v_busy then
      return app_private.err('slot_taken', 'Esse horário acabou de ser ocupado. Escolha outro.');
    else
      return app_private.err('fora_do_horario', 'Esse horário não está disponível. Escolha outro.');
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'marcacao', jsonb_build_object(
      'id', v_id, 'inicio', p_inicio, 'fim', v_fim, 'servico', s.name,
      'duracao_minutos', s.duration_minutes, 'preco_cents', s.price_cents,
      'profissional', v_prof_name, 'nome_cliente', v_nome),
    'negocio', b.name,
    'mensagem_confirmacao', b.confirmation_message,
    'whatsapp', b.whatsapp);
end $$;

create or replace function public.get_public_business(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare b public.businesses;
begin
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
      'endereco', b.address, 'instagram', b.instagram, 'whatsapp', b.whatsapp,
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
returns table (inicio timestamptz) language plpgsql stable security definer set search_path = '' as $$
declare
  b public.businesses;
  s public.services;
  v_dow int;
begin
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

  if random() < 0.02 then
    delete from app_private.rate_events where created_at < now() - interval '2 days';
  end if;

  return app_private.create_appointment(b, p_service_id, p_professional_id, p_inicio,
                                        p_nome, v_tel, p_consentimento, false);
end $$;

create or replace function public.owner_create_appointment(
  p_service_id uuid, p_professional_id uuid, p_inicio timestamptz, p_nome text, p_telefone text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare b public.businesses; v_tel text;
begin
  select * into b from public.businesses where id = app_private.my_business_id();
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  v_tel := app_private.normalize_phone(p_telefone);
  if v_tel is null then return app_private.err('telefone_invalido', 'Indique um número de telefone válido.'); end if;
  return app_private.create_appointment(b, p_service_id, p_professional_id, p_inicio, p_nome, v_tel, false, true);
end $$;

create or replace function public.owner_erase_client_data(p_telefone text)
returns int language plpgsql volatile security definer set search_path = '' as $$
declare v_biz uuid := app_private.my_business_id(); v_tel text; v_n int;
begin
  if v_biz is null then raise exception 'forbidden' using errcode = '42501'; end if;
  v_tel := app_private.normalize_phone(p_telefone);
  if v_tel is null then return 0; end if;
  perform set_config('app.bypass_guard', '1', true);
  update public.appointments
     set nome_cliente = null, telefone = null, anonimizado_em = now()
   where business_id = v_biz and telefone = v_tel;
  get diagnostics v_n = row_count;
  perform set_config('app.bypass_guard', '', true);
  insert into public.audit_log (actor_id, business_id, action, details)
  values ((select auth.uid()), v_biz, 'erase_client_data', jsonb_build_object('linhas', v_n));
  return v_n;
end $$;

create or replace function public.admin_list_businesses()
returns table (id uuid, slug text, name text, contacto text, status text, paid_until timestamptz,
               created_at timestamptz, total_marcacoes bigint, disponivel boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app_private.is_super_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select b.id, b.slug, b.name, b.contacto, b.status, b.paid_until, b.created_at,
         (select count(*) from public.appointments a where a.business_id = b.id),
         app_private.business_available(b)
  from public.businesses b order by b.created_at desc;
end $$;

create or replace function public.admin_create_business(
  p_name text, p_slug text, p_contacto text, p_paid_until timestamptz)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not app_private.is_super_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.businesses (name, slug, contacto, paid_until)
  values (btrim(p_name), lower(btrim(p_slug)), nullif(btrim(coalesce(p_contacto, '')), ''), p_paid_until)
  returning id into v_id;
  insert into public.audit_log (actor_id, business_id, action) values ((select auth.uid()), v_id, 'create_business');
  return jsonb_build_object('id', v_id, 'slug', lower(btrim(p_slug)));
end $$;

create or replace function public.admin_set_paid_until(p_business_id uuid, p_paid_until timestamptz)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not app_private.is_super_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.businesses set paid_until = p_paid_until where id = p_business_id;
  insert into public.audit_log (actor_id, business_id, action, details)
  values ((select auth.uid()), p_business_id, 'set_paid_until', jsonb_build_object('paid_until', p_paid_until));
end $$;

create or replace function public.admin_set_blocked(p_business_id uuid, p_blocked boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not app_private.is_super_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.businesses set status = case when p_blocked then 'bloqueado' else 'ativo' end where id = p_business_id;
  insert into public.audit_log (actor_id, business_id, action, details)
  values ((select auth.uid()), p_business_id, case when p_blocked then 'block' else 'unblock' end, '{}'::jsonb);
end $$;

create or replace function public.admin_open_support_view(p_business_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare b public.businesses;
begin
  if not app_private.is_super_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into b from public.businesses where id = p_business_id;
  if not found then return null; end if;
  insert into public.audit_log (actor_id, business_id, action) values ((select auth.uid()), b.id, 'support_view');
  return jsonb_build_object(
    'negocio', to_jsonb(b),
    'profissionais', coalesce((select jsonb_agg(to_jsonb(p) order by p.position, p.name) from public.professionals p where p.business_id = b.id), '[]'::jsonb),
    'servicos', coalesce((select jsonb_agg(to_jsonb(s) order by s.position, s.name) from public.services s where s.business_id = b.id), '[]'::jsonb),
    'horarios', coalesce((select jsonb_agg(to_jsonb(w)) from public.working_hours w where w.business_id = b.id), '[]'::jsonb),
    'bloqueios', coalesce((select jsonb_agg(to_jsonb(t)) from public.blocked_times t where t.business_id = b.id), '[]'::jsonb),
    'marcacoes', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'inicio', a.inicio, 'fim', a.fim, 'status', a.status,
               'professional_id', a.professional_id, 'service_id', a.service_id,
               'nome_cliente', a.nome_cliente,
               'telefone', case when a.telefone is null then null else '•••••' || right(a.telefone, 3) end)
             order by a.inicio)
      from public.appointments a
      where a.business_id = b.id and a.inicio >= now() - interval '7 days' and a.inicio < now() + interval '30 days'), '[]'::jsonb));
end $$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'public' and p.proname in (
            'get_public_business','get_available_slots','book_appointment',
            'owner_create_appointment','owner_erase_client_data',
            'admin_list_businesses','admin_create_business','admin_set_paid_until',
            'admin_set_blocked','admin_open_support_view'))
       or n.nspname = 'app_private'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

grant execute on function public.get_public_business(text) to anon, authenticated;
grant execute on function public.get_available_slots(text, uuid, uuid, date) to anon, authenticated;
grant execute on function public.book_appointment(text, uuid, uuid, timestamptz, text, text, boolean, text) to anon, authenticated;
grant execute on function public.owner_create_appointment(uuid, uuid, timestamptz, text, text) to authenticated;
grant execute on function public.owner_erase_client_data(text) to authenticated;
grant execute on function public.admin_list_businesses() to authenticated;
grant execute on function public.admin_create_business(text, text, text, timestamptz) to authenticated;
grant execute on function public.admin_set_paid_until(uuid, timestamptz) to authenticated;
grant execute on function public.admin_set_blocked(uuid, boolean) to authenticated;
grant execute on function public.admin_open_support_view(uuid) to authenticated;

grant execute on function app_private.is_super_admin() to authenticated;
grant execute on function app_private.my_business_id() to authenticated;
