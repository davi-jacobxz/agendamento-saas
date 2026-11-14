-- Intervalo (descanso) POR SERVIÇO, depois de cada marcação.
-- Cada marcação ocupa [início, fim + intervalo do seu serviço). O intervalo do serviço fica gravado na marcação
-- (para mudar o serviço mais tarde não alterar marcações já feitas).
-- A restrição de exclusão (appointments_no_overlap) continua a garantir, ao nível da base de dados,
-- que a mesma profissional nunca tem duas marcações com horas reais sobrepostas, seja qual for o serviço.

alter table public.services
  add column if not exists buffer_minutes int not null default 0 check (buffer_minutes between 0 and 240);
alter table public.appointments
  add column if not exists intervalo_depois_min int not null default 0 check (intervalo_depois_min between 0 and 240);

-- serviços que já existem herdam o "descanso entre marcações" que o negócio tinha
update public.services s set buffer_minutes = b.buffer_minutes
from public.businesses b where b.id = s.business_id and s.buffer_minutes = 0 and b.buffer_minutes > 0;

create or replace function app_private.slot_conflict(
  p_business_id uuid, p_professional_id uuid, p_inicio timestamptz, p_fim timestamptz,
  p_buffer int, p_slot_interval int, p_strict boolean)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz constant text := 'Europe/Lisbon';
  v_date date := (p_inicio at time zone 'Europe/Lisbon')::date;
  v_dow int := extract(dow from (p_inicio at time zone 'Europe/Lisbon')::date)::int;
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

  -- Cada marcação ocupa [início, fim + intervalo do seu serviço). Duas marcações da MESMA profissional
  -- não podem ter blocos que se toquem por dentro, seja qual for o serviço.
  -- Marcação manual (p_strict = false): só se verifica a sobreposição das horas reais.
  if exists (
    select 1 from public.appointments a
    where a.professional_id = p_professional_id and a.status = 'confirmado'
      and a.inicio between p_inicio - interval '2 days' and p_fim + interval '2 days'
      and tstzrange(a.inicio, a.fim + make_interval(mins => case when p_strict then a.intervalo_depois_min else 0 end))
          && tstzrange(p_inicio, p_fim + make_interval(mins => case when p_strict then p_buffer else 0 end))
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
    v_code := app_private.slot_conflict(b.id, r.id, p_inicio, v_fim, s.buffer_minutes, b.slot_interval_minutes, not p_manual);
    if v_code is null then
      begin
        insert into public.appointments (business_id, professional_id, service_id, inicio, fim,
                                         nome_cliente, telefone, origem, consentimento_em, intervalo_depois_min)
        values (b.id, r.id, s.id, p_inicio, v_fim, v_nome, p_telefone,
                case when p_manual then 'manual' else 'publico' end,
                case when coalesce(p_consentimento, false) then now() end, s.buffer_minutes)
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
                                  s.buffer_minutes, b.slot_interval_minutes, true) is null
  order by 1;
end $$;
