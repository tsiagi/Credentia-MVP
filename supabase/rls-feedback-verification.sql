-- Run once in Supabase → SQL Editor (after schema.sql)
-- Lets signed-in users manage their own feedback cycles and verification requests.

create policy "own feedback cycles" on feedback_cycles
  for all using (auth.uid() = profile_id);

create policy "own verification requests" on verification_requests
  for all using (auth.uid() = profile_id);
