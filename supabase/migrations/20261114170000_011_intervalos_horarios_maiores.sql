-- Permite os novos intervalos entre horários (até 1 h 40 min).
-- A migração inicial continua intacta; esta migração atualiza bases já instaladas.
alter table public.businesses
  drop constraint if exists businesses_slot_interval_minutes_check;

alter table public.businesses
  add constraint businesses_slot_interval_minutes_check
  check (slot_interval_minutes in (5, 10, 15, 20, 30, 45, 60, 75, 90, 100));
