-- voice logging — per-user transcription quota
--
-- The Groq API key is shared by every user and its rate limits are enforced at
-- the ORG level (20 RPM / 2,000 RPD / 7,200 audio-sec per hour / 28,800 per
-- day), so one heavy user can starve everyone else. This table meters usage per
-- user per day so the server action can refuse before spending org quota.

create table if not exists public.transcription_usage (
  user_id  uuid not null references auth.users (id) on delete cascade,
  day      date not null default current_date,
  seconds  int  not null default 0,
  requests int  not null default 0,
  primary key (user_id, day)
);

alter table public.transcription_usage enable row level security;

drop policy if exists "own rows" on public.transcription_usage;
create policy "own rows" on public.transcription_usage
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.transcription_usage to authenticated;

-- Atomic upsert + increment. Doing this in SQL avoids the read-modify-write
-- race two concurrent recordings from the same user would otherwise hit.
create or replace function public.record_transcription_usage(
  p_seconds int
)
returns table (seconds int, requests int)
language plpgsql
security invoker
as $$
begin
  return query
  insert into public.transcription_usage as tu (user_id, day, seconds, requests)
  values (auth.uid(), current_date, greatest(p_seconds, 0), 1)
  on conflict (user_id, day) do update
    set seconds  = tu.seconds + greatest(p_seconds, 0),
        requests = tu.requests + 1
  returning tu.seconds, tu.requests;
end;
$$;

grant execute on function public.record_transcription_usage(int) to authenticated;
