# pipeline

A single-user personal CRM for MBA recruiting networking. One user (me).
`user_id` is on every table anyway as future multi-user insurance.

## Stack

- **Next.js 15** (App Router) + **TypeScript**, deployed on **Vercel**.
- **Supabase** (Postgres + Auth). Single user via Supabase email **magic link**.
- **Tailwind CSS** (v4).
- **Anthropic API** (`claude-sonnet-4-6`) for LLM features — **server-side only**,
  key in `ANTHROPIC_API_KEY`.
- **Groq** (`whisper-large-v3-turbo`) for voice-note transcription — **server-side
  only**, key in `GROQ_API_KEY`. Optional: without it the browser-native
  dictation path still works.
- **Resend** (`RESEND_API_KEY`) for email — not used yet; wired in a later prompt.

## Conventions

1. **All LLM calls live in `/src/lib/llm/`** as typed functions (server-side only).
2. **All Supabase queries live in `/src/lib/db/`** as typed functions.
3. **Server Actions over API routes** wherever possible. (Route handlers only
   where a GET redirect is required, e.g. the auth callback.)
4. **Mobile-first** — every screen must work at **390px** width.

## Project layout

```
src/
  app/
    (app)/            # authenticated shell (Nav + pages)
      layout.tsx      # auth guard + nav + <main>
      page.tsx        # Today
      contacts/       # Contacts
      board/          # Board
      log/            # Log (prominent button, not a tab)
    login/            # magic-link login (page + server action)
    auth/callback/    # magic-link landing (route handler)
    layout.tsx        # root layout + metadata/viewport
  components/
    nav.tsx           # top bar + mobile bottom bar
  lib/
    db/               # ALL Supabase queries (typed). types.ts = domain types
    llm/              # ALL Anthropic calls (typed, server-only)
    supabase/         # client.ts (browser), server.ts (RSC/actions),
                      # middleware.ts (session refresh), admin.ts (service role)
    auth/actions.ts   # signOut server action
  middleware.ts       # gates the app behind login
scripts/
  seed.ts             # import contacts from CSV
  sample-contacts.csv # sample used by `npm run seed -- --dry-run`
supabase/
  migrations/         # SQL migrations (source of truth for the schema)
```

## Schema

Tables (see `supabase/migrations/`). Every table has `id uuid pk`, `user_id uuid`,
timestamps, and **RLS enabled** scoped to `auth.uid() = user_id`.

### contacts
`name` (required), `company`, `title`, `email`, `linkedin_url`,
`vertical` (free text, e.g. "fintech", "infra", "consumer"),
`tier` (`priority` | `warm` | `background`, default `warm`),
`stage` (see stage list below, default `identified`),
`cadence_days` (int, **null ⇒ derive from tier**),
`snoozed_until` (date), `source` (how I met them), `notes` (freeform context).

### interactions
`contact_id` (fk), `occurred_at` (required),
`type` (`coffee_chat` | `call` | `email` | `event` | `note`),
`raw_notes` (what I typed/dictated), `summary` (LLM-generated),
`warmth` (int 1–5, LLM-proposed / user-confirmed),
`direction` (`outbound` | `inbound` | `mutual`).

### action_items
`contact_id` (fk), `interaction_id` (fk, nullable), `description` (required),
`owner` (`me` | `them`, default `me`), `due_date` (date),
`status` (`open` | `done` | `dropped`, default `open`).

### stage_events (append-only stage history)
`contact_id` (fk), `from_stage`, `to_stage` (required).

### transcription_usage (voice-note quota meter)
Primary key `(user_id, day)`. `seconds`, `requests`. Incremented atomically by
the `record_transcription_usage(int)` SQL function — the Groq key is shared and
its limits are org-wide, so this stops one user draining everyone's budget.

## tier → cadence defaults

When `contacts.cadence_days` is **null**, cadence is derived from tier:

| tier       | cadence (days) |
| ---------- | -------------- |
| priority   | 14             |
| warm       | 30             |
| background | 90             |

## Stage list (in order)

`identified` → `contacted` → `chatted` → `following_up` →
`referral_interview` → `offer` → `dormant`

## Derived fields — NOT stored

Exposed via the Postgres view **`contact_status`** (`security_invoker = on`, so it
respects the caller's RLS). Never persist these:

- `last_touch_at` — `max(interactions.occurred_at)` per contact.
- `effective_cadence_days` — `coalesce(cadence_days, tier default)`.
- `next_due_date` — `coalesce(last_touch_at, created_at) + effective cadence`,
  pushed out to `snoozed_until` when snoozed further into the future.
- `days_overdue` — `current_date - next_due_date` when positive, else `0`.
- `open_action_count` — count of `action_items` with `status = 'open'`.

## Decisions

- **Stage history is maintained by a DB trigger** (`contacts_log_stage_event`),
  not app code. Rationale: guarantees a complete audit trail regardless of the
  write path (app, seed, SQL editor). On INSERT it logs the initial stage with
  `from_stage = null`; on UPDATE it logs only when `stage` actually changes.
- **`contacts.updated_at`** is maintained by a `before update` trigger.
- **`next_due_date` base** falls back to `created_at` when a contact has no
  interactions yet, so freshly identified contacts still surface as due.

## Environment

Copy `.env.example` → `.env.local` (and mirror in Vercel):

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — client + server.
- `SUPABASE_SERVICE_ROLE_KEY` — server/scripts only, **bypasses RLS**.
- `ANTHROPIC_API_KEY` — server only.
- `GROQ_API_KEY` — server only, voice transcription. Optional.
- `RESEND_API_KEY` — not used yet.
- `NEXT_PUBLIC_SITE_URL` — magic-link redirect base.

## Common tasks

- **Dev:** `npm run dev`
- **Apply migrations:** link the project (`supabase link`) then
  `supabase db push`, or paste `supabase/migrations/*.sql` into the Supabase SQL
  editor.
- **Seed contacts:** `npm run seed -- --dry-run` (parse/validate only) or
  `npm run seed -- --file path/to.csv` (writes via service role).
- **Digest:** `npm run digest -- --dry-run` (rank + log, no email) or
  `npm run digest` (sends via Resend). Cron: `GET /api/cron/digest` daily
  11:00 UTC (7am ET) with `Authorization: Bearer $CRON_SECRET`.
- **Build:** `npm run build`
- **Tests:** `npm run test` (includes nudge engine scoring + digest tokens)

## Board & funnel

- `/board` is a Kanban of stages (`BOARD_STAGES` in `src/lib/db/funnel.ts`).
  Desktop: HTML5 drag between columns. Mobile: per-card stage picker.
  Stage changes go through `updateContactStage` (DB trigger writes `stage_events`).
- Filters (`vertical`, `tier`, `dormant=1`) persist in URL search params.
- Funnel stats (collapsible) + vertical conversion table live in
  `getFunnelStats()` — keep that query in `/lib/db/funnel.ts` for reuse.
- Days-in-stage on cards and median dwell come from `stage_events`.

## Nudge engine & daily digest

- Pure scoring lives in `src/lib/nudge/engine.ts` (unit-tested). Inputs are
  `contact_status` rows + open action items; output ≤5 `NudgeAction`s above
  score 30. Excludes snoozed contacts and stages `offer` / `dormant`.
- Suggested openers (top 3 only) come from one batched LLM call in
  `src/lib/llm/openers.ts` — never auto-sent.
- Digest email via Resend (`src/lib/digest/email.ts`). Zero nudges ⇒ no email.
- One-click Snooze / Mark touched use HMAC-signed URLs
  (`/api/digest/action`) so they work from the inbox without login.
- Each run is logged to `digest_runs` (payload jsonb) for later metrics.
- `/today` renders the same ranked list with in-app one-tap actions.

## Voice logging

`/log` has a record button that fills the same `rawText` textarea, so extraction,
the confirm step, and saving are unchanged. **Audio is never persisted** — it is
transcribed in flight and discarded.

Two engines, chosen at mount in `voice-recorder.tsx`:

| Browser | Engine | Cost |
| ---------------------------- | ------------------------------------- | ----- |
| Chrome, Edge, Android, macOS Safari | Web Speech API, in-browser | $0 |
| iOS Safari, Firefox | `MediaRecorder` → Groq Whisper | quota |

Web Speech carries most traffic and consumes no quota we own, which is what keeps
this free as user count grows. iOS is deliberately excluded from it: the API
exists there but ends sessions mid-sentence, and losing a brain dump is the worst
failure this screen has.

- Recording caps at `MAX_RECORDING_SECONDS` (180) at 24kbps mono — roughly 540KB,
  under Vercel's hard 4.5MB body limit. `experimental.serverActions.bodySizeLimit`
  in `next.config.ts` must stay above that; the default is 1MB.
- iOS `MediaRecorder` emits `audio/mp4`, not `audio/webm`. `extensionForMimeType`
  maps it to a filename Whisper accepts — sending the wrong extension is rejected.
- Whisper gets a vocabulary prompt seeded with the user's contact names and
  companies (picked contact first), which is where dictation usually fails.
- Per-user quota lives in `transcription_usage`; `transcribeAction` refuses before
  spending org quota. Duration is `max(client-reported, bytes/3000)` so a client
  under-reporting cannot slip past it.
- A failed upload keeps the blob client-side, so "Try again" never asks the user
  to re-record.
- `getUserMedia` requires HTTPS. `localhost:3002` is fine; testing from a phone
  over plain http on the LAN is not — use a Vercel preview URL.
- Provider is swappable via `createGroqProvider` in `src/lib/llm/transcribe.ts`.
