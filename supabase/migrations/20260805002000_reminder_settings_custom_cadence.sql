-- allow custom email reminder cadence

alter table public.reminder_settings
  add column if not exists custom_cadence_days int;

alter table public.reminder_settings
  alter column digest_frequency set default 'daily';

alter table public.reminder_settings
  drop constraint if exists reminder_settings_digest_frequency_check;

alter table public.reminder_settings
  add constraint reminder_settings_digest_frequency_check
  check (digest_frequency in ('daily', 'weekdays', 'weekly', 'custom'));

alter table public.reminder_settings
  drop constraint if exists reminder_settings_custom_cadence_days_check;

alter table public.reminder_settings
  add constraint reminder_settings_custom_cadence_days_check
  check (
    custom_cadence_days is null
    or custom_cadence_days between 1 and 365
  );
