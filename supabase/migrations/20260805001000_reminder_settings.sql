-- user-level reminder email preferences

create table if not exists public.reminder_settings (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  email_enabled    boolean not null default false,
  digest_frequency text not null default 'daily'
    check (digest_frequency in ('daily', 'weekdays', 'weekly', 'custom')),
  custom_cadence_days int
    check (custom_cadence_days is null or custom_cadence_days between 1 and 365),
  digest_time      time not null default '09:00',
  timezone         text not null default 'America/New_York',
  include_tasks    boolean not null default true,
  include_followups boolean not null default true,
  include_waiting  boolean not null default true,
  include_upcoming boolean not null default true
);

drop trigger if exists reminder_settings_set_updated_at
  on public.reminder_settings;
create trigger reminder_settings_set_updated_at
  before update on public.reminder_settings
  for each row execute function public.set_updated_at();

alter table public.reminder_settings enable row level security;

drop policy if exists "own rows" on public.reminder_settings;
create policy "own rows" on public.reminder_settings
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.reminder_settings to authenticated;
