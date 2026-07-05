-- pipeline: initial schema
-- Personal CRM for MBA recruiting networking. Single user, but user_id is on
-- every table for future multi-user support. RLS scopes all rows to auth.uid().

-- Needed for gen_random_uuid()
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- contacts
-- ---------------------------------------------------------------------------
create table if not exists public.contacts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  name          text not null,
  company       text,
  title         text,
  email         text,
  linkedin_url  text,

  vertical      text, -- free text, e.g. "fintech", "infra", "consumer"

  tier          text not null default 'warm'
                  check (tier in ('priority', 'warm', 'background')),

  stage         text not null default 'identified'
                  check (stage in (
                    'identified', 'contacted', 'chatted', 'following_up',
                    'referral_interview', 'offer', 'dormant'
                  )),

  -- null means: derive from tier (priority=14, warm=30, background=90)
  cadence_days  int,

  snoozed_until date,
  source        text, -- how I met them
  notes         text  -- freeform context that isn't an interaction
);

create index if not exists contacts_user_id_idx on public.contacts (user_id);
create index if not exists contacts_stage_idx on public.contacts (user_id, stage);

-- ---------------------------------------------------------------------------
-- interactions
-- ---------------------------------------------------------------------------
create table if not exists public.interactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  contact_id  uuid not null references public.contacts (id) on delete cascade,
  created_at  timestamptz not null default now(),

  occurred_at timestamptz not null,

  type        text check (type in ('coffee_chat', 'call', 'email', 'event', 'note')),

  raw_notes   text, -- what I typed / dictated
  summary     text, -- LLM-generated

  warmth      int check (warmth between 1 and 5), -- LLM-proposed, user-confirmed

  direction   text check (direction in ('outbound', 'inbound', 'mutual'))
);

create index if not exists interactions_contact_id_idx on public.interactions (contact_id);
create index if not exists interactions_user_occurred_idx
  on public.interactions (user_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- action_items
-- ---------------------------------------------------------------------------
create table if not exists public.action_items (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  contact_id     uuid not null references public.contacts (id) on delete cascade,
  interaction_id uuid references public.interactions (id) on delete set null,
  created_at     timestamptz not null default now(),

  description    text not null,

  owner          text not null default 'me' check (owner in ('me', 'them')),
  due_date       date,

  status         text not null default 'open' check (status in ('open', 'done', 'dropped'))
);

create index if not exists action_items_contact_id_idx on public.action_items (contact_id);
create index if not exists action_items_open_idx
  on public.action_items (user_id, status) where status = 'open';

-- ---------------------------------------------------------------------------
-- stage_events (append-only stage change history)
-- ---------------------------------------------------------------------------
create table if not exists public.stage_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  created_at timestamptz not null default now(),

  from_stage text,
  to_stage   text not null
);

create index if not exists stage_events_contact_id_idx on public.stage_events (contact_id, created_at);

-- ---------------------------------------------------------------------------
-- triggers
-- ---------------------------------------------------------------------------

-- keep contacts.updated_at fresh
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists contacts_set_updated_at on public.contacts;
create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

-- Stage history is maintained at the DB level (see CLAUDE.md "Decisions").
-- Rationale: guarantees a complete audit trail regardless of which code path
-- (app, seed, SQL editor) changes a stage. On INSERT we log the initial stage
-- with from_stage = null; on UPDATE we log only when stage actually changes.
create or replace function public.log_stage_event()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.stage_events (user_id, contact_id, from_stage, to_stage)
    values (new.user_id, new.id, null, new.stage);
    return new;
  elsif (tg_op = 'UPDATE' and new.stage is distinct from old.stage) then
    insert into public.stage_events (user_id, contact_id, from_stage, to_stage)
    values (new.user_id, new.id, old.stage, new.stage);
    return new;
  end if;
  return new;
end;
$$;

drop trigger if exists contacts_log_stage_event on public.contacts;
create trigger contacts_log_stage_event
  after insert or update of stage on public.contacts
  for each row execute function public.log_stage_event();

-- ---------------------------------------------------------------------------
-- derived view: contact_status (NOT stored)
-- ---------------------------------------------------------------------------
-- security_invoker => the view runs with the querying user's privileges so the
-- underlying RLS policies still apply.
create or replace view public.contact_status
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

  -- effective cadence: explicit cadence_days, else tier default
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

  -- next_due_date: (last touch, or created_at if never touched) + cadence,
  -- pushed out to snoozed_until when snoozed further into the future.
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

  -- days_overdue: positive when past due, else 0
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
  )                                      as days_overdue

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

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.contacts     enable row level security;
alter table public.interactions enable row level security;
alter table public.action_items enable row level security;
alter table public.stage_events enable row level security;

-- One "own rows" policy per table covering all commands.
drop policy if exists "own rows" on public.contacts;
create policy "own rows" on public.contacts
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own rows" on public.interactions;
create policy "own rows" on public.interactions
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own rows" on public.action_items;
create policy "own rows" on public.action_items
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own rows" on public.stage_events;
create policy "own rows" on public.stage_events
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Grants (RLS still restricts row visibility). Supabase sets sensible defaults,
-- but we grant explicitly so the schema is portable.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.contacts     to authenticated;
grant select, insert, update, delete on public.interactions to authenticated;
grant select, insert, update, delete on public.action_items to authenticated;
grant select, insert, update, delete on public.stage_events to authenticated;
grant select on public.contact_status to authenticated;
