-- digest + upcoming chat support
-- Adds digest_runs for measuring snooze/dismiss rates, and a manual
-- upcoming_chat_at flag on contacts (Prompt 5 will use it more deeply).

alter table public.contacts
  add column if not exists upcoming_chat_at date;

create index if not exists contacts_upcoming_chat_at_idx
  on public.contacts (user_id, upcoming_chat_at)
  where upcoming_chat_at is not null;

-- Refresh contact_status to expose upcoming_chat_at.
-- Must DROP first: CREATE OR REPLACE cannot insert/reorder columns.
drop view if exists public.contact_status;

create view public.contact_status
with (security_invoker = on) as
select
  c.id                                   as contact_id,
  c.user_id,
  c.name,
  c.company,
  c.tier,
  c.stage,
  c.vertical,
  c.snoozed_until,
  c.created_at,

  coalesce(
    c.cadence_days,
    case c.tier
      when 'priority'   then 14
      when 'warm'       then 30
      when 'background' then 90
      else 30
    end
  )                                      as effective_cadence_days,

  li.last_touch_at,

  coalesce(ai.open_action_count, 0)      as open_action_count,

  greatest(
    (coalesce(li.last_touch_at, c.created_at)::date
      + coalesce(
          c.cadence_days,
          case c.tier
            when 'priority'   then 14
            when 'warm'       then 30
            when 'background' then 90
            else 30
          end
        )),
    coalesce(c.snoozed_until, '-infinity'::date)
  )                                      as next_due_date,

  greatest(
    current_date - greatest(
      (coalesce(li.last_touch_at, c.created_at)::date
        + coalesce(
            c.cadence_days,
            case c.tier
              when 'priority'   then 14
              when 'warm'       then 30
              when 'background' then 90
              else 30
            end
          )),
      coalesce(c.snoozed_until, '-infinity'::date)
    ),
    0
  )                                      as days_overdue,

  -- appended (not inserted mid-list) so column order stays compatible
  c.upcoming_chat_at

from public.contacts c
left join (
  select contact_id, max(occurred_at) as last_touch_at
  from public.interactions
  group by contact_id
) li on li.contact_id = c.id
left join (
  select contact_id, count(*) as open_action_count
  from public.action_items
  where status = 'open'
  group by contact_id
) ai on ai.contact_id = c.id;

grant select on public.contact_status to authenticated;

-- ---------------------------------------------------------------------------
-- digest_runs — one row per digest send (or dry evaluation)
-- ---------------------------------------------------------------------------
create table if not exists public.digest_runs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  sent_at     timestamptz not null default now(),
  nudge_count int not null default 0,
  payload     jsonb not null default '[]'::jsonb
);

create index if not exists digest_runs_user_sent_idx
  on public.digest_runs (user_id, sent_at desc);

alter table public.digest_runs enable row level security;

drop policy if exists "own rows" on public.digest_runs;
create policy "own rows" on public.digest_runs
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert on public.digest_runs to authenticated;
