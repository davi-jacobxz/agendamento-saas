-- Cancelamento autónomo de marcações através de um link privado com UUID.
-- Não expõe o telefone nem permite consultar marcações de outros negócios.

create or replace function public.get_my_appointment(p_slug text, p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ip text := app_private.ip_hash();
  v_status text;
  v_inicio timestamptz;
  v_fim timestamptz;
  v_servico text;
  v_profissional text;
begin
  if v_ip is not null and not app_private.rate_hit('rd:' || v_ip, 600, interval '10 minutes') then
    raise exception 'muitas_tentativas' using errcode = 'P0001';
  end if;

  select a.status, a.inicio, a.fim, s.name, p.name
    into v_status, v_inicio, v_fim, v_servico, v_profissional
  from public.appointments a
  join public.businesses b on b.id = a.business_id
  join public.services s on s.id = a.service_id
  join public.professionals p on p.id = a.professional_id
  where b.slug = lower(coalesce(p_slug, ''))
    and a.id = p_id;

  if not found then
    return jsonb_build_object('encontrada', false);
  end if;

  return jsonb_build_object(
    'encontrada', true,
    'status', v_status,
    'inicio', v_inicio,
    'fim', v_fim,
    'servico', v_servico,
    'profissional', v_profissional,
    'pode_cancelar', v_status = 'confirmado' and v_inicio > now()
  );
end;
$$;

create or replace function public.cancel_my_appointment(p_slug text, p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ip text := app_private.ip_hash();
  v_marcacao public.appointments;
  v_bypass_anterior text := coalesce(current_setting('app.bypass_guard', true), '');
begin
  if v_ip is not null and not app_private.rate_hit('rd:' || v_ip, 600, interval '10 minutes') then
    raise exception 'muitas_tentativas' using errcode = 'P0001';
  end if;

  select a.* into v_marcacao
  from public.appointments a
  join public.businesses b on b.id = a.business_id
  where b.slug = lower(coalesce(p_slug, ''))
    and a.id = p_id
  for update of a;

  if not found then
    return app_private.err('nao_encontrada', 'Não foi possível encontrar esta marcação.');
  end if;

  if v_marcacao.status = 'cancelado' then
    return app_private.err('ja_cancelada', 'Esta marcação já foi cancelada.');
  end if;

  if v_marcacao.inicio <= now() then
    return app_private.err('no_passado', 'Esta marcação já passou e não pode ser cancelada online.');
  end if;

  perform set_config('app.bypass_guard', '1', true);
  update public.appointments
     set status = 'cancelado', cancelado_em = now()
   where id = v_marcacao.id;
  perform set_config('app.bypass_guard', v_bypass_anterior, true);

  return jsonb_build_object('ok', true, 'status', 'cancelado');
end;
$$;

revoke all on function public.get_my_appointment(text, uuid) from public, anon, authenticated;
revoke all on function public.cancel_my_appointment(text, uuid) from public, anon, authenticated;

grant execute on function public.get_my_appointment(text, uuid) to anon, authenticated;
grant execute on function public.cancel_my_appointment(text, uuid) to anon, authenticated;
