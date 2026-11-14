
create or replace function app_private.is_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m where m.user_id = (select auth.uid()) and m.role = 'super_admin')
$$;

create or replace function app_private.my_business_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select m.business_id from public.memberships m where m.user_id = (select auth.uid()) and m.role = 'owner' limit 1
$$;

revoke all on function app_private.business_defaults() from public, anon, authenticated;
revoke all on function app_private.is_super_admin() from public, anon, authenticated;
revoke all on function app_private.my_business_id() from public, anon, authenticated;
grant usage on schema app_private to authenticated;
grant execute on function app_private.is_super_admin() to authenticated;
grant execute on function app_private.my_business_id() to authenticated;

revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;

grant select on public.businesses, public.memberships, public.professionals, public.services,
  public.professional_services, public.working_hours, public.blocked_times, public.appointments,
  public.audit_log to authenticated;

grant insert, update, delete on public.professionals, public.services, public.professional_services,
  public.working_hours, public.blocked_times to authenticated;

grant update (name, logo_path, cover_path, primary_color, welcome_text, address, instagram, whatsapp,
  professional_label, confirmation_message, min_notice_minutes, max_advance_days,
  slot_interval_minutes, buffer_minutes) on public.businesses to authenticated;

grant update (status) on public.appointments to authenticated;

create policy businesses_select on public.businesses for select to authenticated
  using ((select app_private.is_super_admin()) or id = (select app_private.my_business_id()));
create policy businesses_owner_update on public.businesses for update to authenticated
  using (id = (select app_private.my_business_id()))
  with check (id = (select app_private.my_business_id()));

create policy memberships_select on public.memberships for select to authenticated
  using (user_id = (select auth.uid()) or (select app_private.is_super_admin()));

create policy audit_log_select on public.audit_log for select to authenticated
  using ((select app_private.is_super_admin()));

create policy professionals_owner_all on public.professionals for all to authenticated
  using (business_id = (select app_private.my_business_id()))
  with check (business_id = (select app_private.my_business_id()));
create policy services_owner_all on public.services for all to authenticated
  using (business_id = (select app_private.my_business_id()))
  with check (business_id = (select app_private.my_business_id()));
create policy professional_services_owner_all on public.professional_services for all to authenticated
  using (business_id = (select app_private.my_business_id()))
  with check (business_id = (select app_private.my_business_id()));
create policy working_hours_owner_all on public.working_hours for all to authenticated
  using (business_id = (select app_private.my_business_id()))
  with check (business_id = (select app_private.my_business_id()));
create policy blocked_times_owner_all on public.blocked_times for all to authenticated
  using (business_id = (select app_private.my_business_id()))
  with check (business_id = (select app_private.my_business_id()));

create policy appointments_owner_select on public.appointments for select to authenticated
  using (business_id = (select app_private.my_business_id()));
create policy appointments_owner_update on public.appointments for update to authenticated
  using (business_id = (select app_private.my_business_id()))
  with check (business_id = (select app_private.my_business_id()));

create or replace function app_private.appointments_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('app.bypass_guard', true), '') = '1' then return new; end if;
  if (select auth.uid()) is null then return new; end if;
  if (to_jsonb(new) - 'status' - 'cancelado_em') is distinct from (to_jsonb(old) - 'status' - 'cancelado_em') then
    raise exception 'Só é permitido cancelar marcações.' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if not (old.status = 'confirmado' and new.status = 'cancelado') then
      raise exception 'Só é permitido cancelar marcações.' using errcode = '42501';
    end if;
    new.cancelado_em := now();
  end if;
  return new;
end $$;
revoke all on function app_private.appointments_guard() from public, anon, authenticated;

create trigger appointments_guard before update on public.appointments
for each row execute function app_private.appointments_guard();
