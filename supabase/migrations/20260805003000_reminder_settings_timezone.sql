-- store the user's timezone for reminder scheduling

alter table public.reminder_settings
  add column if not exists timezone text not null default 'America/New_York';
