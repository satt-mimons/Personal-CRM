-- Gmail OAuth tokens for thank-you draft creation.
-- Refresh tokens are stored encrypted by the app (AES-GCM); this table only
-- holds ciphertext. Pipeline never auto-sends — only users.drafts.create.

create table if not exists public.gmail_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  refresh_token_ciphertext text not null,
  scopes text not null default 'https://www.googleapis.com/auth/gmail.compose',
  updated_at timestamptz not null default now()
);

alter table public.gmail_connections enable row level security;

drop policy if exists "own rows" on public.gmail_connections;
create policy "own rows" on public.gmail_connections
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.gmail_connections to authenticated;
