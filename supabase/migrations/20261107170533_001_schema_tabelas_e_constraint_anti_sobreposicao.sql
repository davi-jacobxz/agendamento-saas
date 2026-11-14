
create extension if not exists btree_gist with schema extensions;

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

-- ============ businesses ============
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 40)
    check (slug not in ('admin','api','login','painel','privacidade','app','assets','static','suporte','super','sw','manifest','robots','sitemap')),
  name text not null check (char_length(name) between 2 and 80),
  contacto text check (char_length(contacto) <= 120),
  status text not null default 'ativo' check (status in ('ativo','bloqueado')),
  paid_until timestamptz,
  created_at timestamptz not null default now(),
  -- personalização
  logo_path text,
  cover_path text,
  primary_color text not null default '#7c3aed' check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  welcome_text text check (char_length(welcome_text) <= 500),
  address text check (char_length(address) <= 200),
  instagram text check (char_length(instagram) <= 60),
  whatsapp text check (whatsapp ~ '^\+[0-9]{8,15}$'),
  professional_label text not null default 'Profissional' check (char_length(professional_label) between 2 and 40),
  confirmation_message text check (char_length(confirmation_message) <= 500),
  -- regras
  min_notice_minutes int not null default 60 check (min_notice_minutes between 0 and 10080),
  max_advance_days int not null default 60 check (max_advance_days between 1 and 365),
  slot_interval_minutes int not null default 15 check (slot_interval_minutes in (5,10,15,20,30,45,60,75,90,100)),
  buffer_minutes int not null default 0 check (buffer_minutes between 0 and 120)
);
alter table public.businesses enable row level security;

-- ============ memberships ============
create table public.memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete cascade,
  role text not null check (role in ('super_admin','owner')),
  created_at timestamptz not null default now(),
  check ((role = 'super_admin' and business_id is null) or (role = 'owner' and business_id is not null))
);
alter table public.memberships enable row level security;
create index memberships_business_idx on public.memberships(business_id);

-- ============ professionals ============
create table public.professionals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  photo_path text,
  active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (id, business_id)
);
alter table public.professionals enable row level security;
create index professionals_business_idx on public.professionals(business_id);

-- ============ services ============
create table public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  description text check (char_length(description) <= 500),
  duration_minutes int not null check (duration_minutes between 5 and 720),
  price_cents int not null default 0 check (price_cents >= 0),
  category text check (char_length(category) <= 40),
  active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (id, business_id)
);
alter table public.services enable row level security;
create index services_business_idx on public.services(business_id);

-- ============ professional_services ============
create table public.professional_services (
  professional_id uuid not null,
  service_id uuid not null,
  business_id uuid not null,
  primary key (professional_id, service_id),
  foreign key (professional_id, business_id) references public.professionals(id, business_id) on delete cascade,
  foreign key (service_id, business_id) references public.services(id, business_id) on delete cascade
);
alter table public.professional_services enable row level security;
create index professional_services_service_idx on public.professional_services(service_id);
create index professional_services_business_idx on public.professional_services(business_id);

-- ============ working_hours (por profissional; pausas = intervalos separados) ============
create table public.working_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  professional_id uuid not null,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = domingo
  start_time time not null,
  end_time time not null,
  check (end_time > start_time),
  foreign key (professional_id, business_id) references public.professionals(id, business_id) on delete cascade
);
alter table public.working_hours enable row level security;
create index working_hours_prof_idx on public.working_hours(professional_id, weekday);
create index working_hours_business_idx on public.working_hours(business_id);

-- ============ blocked_times (negócio inteiro se professional_id nulo) ============
create table public.blocked_times (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  professional_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text check (char_length(reason) <= 120),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  foreign key (professional_id, business_id) references public.professionals(id, business_id) on delete cascade
);
alter table public.blocked_times enable row level security;
create index blocked_times_business_idx on public.blocked_times(business_id, starts_at);

-- ============ appointments ============
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  professional_id uuid not null,
  service_id uuid not null,
  inicio timestamptz not null,
  fim timestamptz not null,
  nome_cliente text,
  telefone text,
  status text not null default 'confirmado' check (status in ('confirmado','cancelado')),
  origem text not null default 'publico' check (origem in ('publico','manual')),
  consentimento_em timestamptz,
  anonimizado_em timestamptz,
  cancelado_em timestamptz,
  criado_em timestamptz not null default now(),
  check (fim > inicio),
  check ((nome_cliente is not null and telefone is not null) or anonimizado_em is not null),
  foreign key (professional_id, business_id) references public.professionals(id, business_id) on delete restrict,
  foreign key (service_id, business_id) references public.services(id, business_id) on delete restrict,
  -- ANTI-DUPLO AGENDAMENTO: nunca duas marcações confirmadas sobrepostas para o mesmo profissional
  constraint appointments_no_overlap
    exclude using gist (professional_id with =, tstzrange(inicio, fim) with &&)
    where (status = 'confirmado')
);
alter table public.appointments enable row level security;
create index appointments_business_inicio_idx on public.appointments(business_id, inicio);
create index appointments_professional_inicio_idx on public.appointments(professional_id, inicio);
create index appointments_telefone_idx on public.appointments(business_id, telefone);

-- ============ audit_log ============
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  business_id uuid references public.businesses(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.audit_log enable row level security;
create index audit_log_business_idx on public.audit_log(business_id, created_at desc);

-- ============ rate limit (interno, sem telefones/IPs em claro) ============
create table app_private.rate_events (
  id bigint generated always as identity primary key,
  bucket text not null,
  created_at timestamptz not null default now()
);
alter table app_private.rate_events enable row level security;
create index rate_events_bucket_idx on app_private.rate_events(bucket, created_at);

-- ============ todo negócio nasce com 1 profissional e horário base ============
create or replace function app_private.business_defaults()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_prof uuid;
begin
  insert into public.professionals (business_id, name) values (new.id, new.name) returning id into v_prof;
  insert into public.working_hours (business_id, professional_id, weekday, start_time, end_time)
  select new.id, v_prof, d, time '09:00', time '18:00' from generate_series(1,5) d;
  return new;
end $$;

create trigger businesses_defaults after insert on public.businesses
for each row execute function app_private.business_defaults();
