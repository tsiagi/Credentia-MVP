-- ════════════════════════════════════════════════════════════════
-- MESSAGING — M4 read-state + M2 Realtime enablement
-- Applied to the Credentia project (plepkdgxhrgptczzpbkp) 2026-06-19.
-- Kept here so the repo schema mirrors the live database.
-- ════════════════════════════════════════════════════════════════

-- ── M2: publish INSERTs on messages to Supabase Realtime ──
-- RLS on messages still scopes delivered rows to conversation participants;
-- the per-org-per-conversation channel name in lib/messaging.ts is the client
-- guard. This only governs which table changes Realtime broadcasts at all.
alter publication supabase_realtime add table public.messages;

-- ── M4: per-participant read state (unread counts) ──
-- Unread for a viewer = count of messages in a conversation with
-- created_at > last_read_at AND sender_id <> viewer. Participant-scoped via
-- the existing is_conversation_participant() RLS — never aggregated across orgs.
alter table public.conversation_participants
  add column if not exists last_read_at timestamptz;

-- A participant may UPDATE only their OWN row (to advance last_read_at).
-- There was no prior UPDATE policy on this table, so this is purely additive
-- and cannot widen read/insert/delete access.
drop policy if exists "cpart: self mark read" on public.conversation_participants;
create policy "cpart: self mark read"
  on public.conversation_participants
  for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
