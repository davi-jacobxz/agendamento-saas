-- Aviso por e-mail ao proprietário quando uma cliente marca pela página pública.
-- O e-mail é enviado pela Edge Function `notify-booking` (sem nome nem telefone da cliente).
-- NOTA: o URL abaixo é o do projeto; num projeto novo, ajuste-o.
create extension if not exists pg_net with schema extensions;

-- garante que cada marcação gera no máximo UM e-mail
alter table public.appointments add column if not exists notificado_em timestamptz;

create or replace function app_private.notify_booking()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.origem = 'publico' and new.status = 'confirmado' then
    begin
      perform net.http_post(
        url := 'https://ipwiljwxedxkgoenwiwg.supabase.co/functions/v1/notify-booking',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object('appointment_id', new.id)
      );
    exception when others then
      null; -- um problema com o e-mail nunca pode impedir uma marcação
    end;
  end if;
  return new;
end $$;
revoke all on function app_private.notify_booking() from public, anon, authenticated;

drop trigger if exists appointments_notify on public.appointments;
create trigger appointments_notify after insert on public.appointments
for each row execute function app_private.notify_booking();
