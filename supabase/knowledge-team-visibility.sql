-- ════════════════════════════════════════════════════════════════
-- Core-Roborate — Documentation "Immediate team" visibility
-- Additive. Run AFTER task-knowledge-agent.sql.
--
-- Adds a third sharing scope to documentation:
--   'org'     → Public (whole company)
--   'team'    → Immediate team (author's manager + peers + direct reports)
--   'private' → Just me
-- ('managers' is kept in the constraint for back-compat; the UI no longer
--  offers it.)
-- ════════════════════════════════════════════════════════════════

alter table documentation drop constraint if exists documentation_visibility_check;
alter table documentation add constraint documentation_visibility_check
  check (visibility in ('org', 'managers', 'team', 'private'));

-- Immediate team membership relative to a document's author:
--   • the viewer manages the author, OR
--   • the viewer reports to the author, OR
--   • the viewer and author share a manager (peers — includes the author).
create or replace function is_same_immediate_team(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles v, profiles a
    where v.id = auth.uid()
      and a.id = target
      and v.org_id = a.org_id
      and (
        a.manager_id = v.id
        or v.manager_id = a.id
        or (a.manager_id is not null and a.manager_id = v.manager_id)
      )
  )
$$;

drop policy if exists "doc: team read" on documentation;
create policy "doc: team read" on documentation for select
  using (org_id = current_org() and visibility = 'team' and is_same_immediate_team(author_id));
