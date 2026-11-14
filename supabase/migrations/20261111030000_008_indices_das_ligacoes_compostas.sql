-- Índices que cobrem as chaves estrangeiras compostas (profissional/serviço + negócio).
-- Aceleram verificações e apagamentos em cascata quando houver muitos dados.
create index if not exists appointments_prof_biz_idx on public.appointments (professional_id, business_id);
create index if not exists appointments_serv_biz_idx on public.appointments (service_id, business_id);
create index if not exists blocked_times_prof_biz_idx on public.blocked_times (professional_id, business_id);
create index if not exists professional_services_prof_biz_idx on public.professional_services (professional_id, business_id);
create index if not exists professional_services_serv_biz_idx on public.professional_services (service_id, business_id);
create index if not exists working_hours_prof_biz_idx on public.working_hours (professional_id, business_id);
