-- Public Verified Resume Network + audit read policies
-- Run in Supabase SQL Editor after schema.sql and rls-policies.sql

-- ── Public passport RPC (anon-safe, no AI / comp / value score data) ──

create or replace function public.get_public_passport(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_title_level smallint := 1;
  v_verified jsonb := '[]'::jsonb;
  v_self jsonb := '[]'::jsonb;
  r record;
begin
  select p.id into v_id
  from profiles p
  where p.public_slug = p_slug and p.passport_published = true;

  if v_id is null then
    return null;
  end if;

  select coalesce(max(f.verification_level), 1) into v_title_level
  from verified_facts f
  where f.profile_id = v_id and f.kind in ('employment', 'title', 'tenure');

  -- verified_facts
  for r in
    select f.id, f.kind, f.label, f.verification_level, f.attested_at
    from verified_facts f where f.profile_id = v_id
  loop
    if r.verification_level >= 2 or r.attested_at is not null then
      v_verified := v_verified || jsonb_build_object(
        'id', r.id, 'kind', r.kind, 'label', r.label,
        'level', greatest(r.verification_level, 2),
        'date', coalesce(r.attested_at::date::text, null)
      );
    else
      v_self := v_self || jsonb_build_object(
        'id', r.id, 'kind', r.kind, 'label', r.label, 'level', 1, 'date', null
      );
    end if;
  end loop;

  -- achievements
  for r in
    select a.id, a.kind, a.description, a.verification_level, a.achievement_date
    from achievements a where a.profile_id = v_id
  loop
    if r.verification_level >= 2 then
      v_verified := v_verified || jsonb_build_object(
        'id', r.id, 'kind', r.kind, 'label', r.description,
        'level', r.verification_level, 'date', r.achievement_date::text
      );
    else
      v_self := v_self || jsonb_build_object(
        'id', r.id, 'kind', r.kind, 'label', r.description, 'level', 1, 'date', r.achievement_date::text
      );
    end if;
  end loop;

  -- projects
  for r in
    select p2.id, p2.description, p2.verification_level, p2.created_at
    from projects p2 where p2.profile_id = v_id
  loop
    if r.verification_level >= 2 then
      v_verified := v_verified || jsonb_build_object(
        'id', r.id, 'kind', 'project', 'label', r.description,
        'level', r.verification_level, 'date', r.created_at::date::text
      );
    else
      v_self := v_self || jsonb_build_object(
        'id', r.id, 'kind', 'project', 'label', r.description, 'level', 1, 'date', r.created_at::date::text
      );
    end if;
  end loop;

  -- kpis (approved = verified; pending/clarify = self-reported)
  for r in
    select k.id, k.title, k.status, k.created_at,
           coalesce(k.current_value, 0) as cv, coalesce(k.target, 0) as tg
    from kpis k where k.employee_id = v_id
  loop
    if r.status = 'approved' then
      v_verified := v_verified || jsonb_build_object(
        'id', r.id, 'kind', 'kpi', 'label', r.title,
        'detail', r.cv || ' / ' || r.tg, 'level', 2, 'date', r.created_at::date::text
      );
    else
      v_self := v_self || jsonb_build_object(
        'id', r.id, 'kind', 'kpi', 'label', r.title,
        'detail', r.cv || ' / ' || r.tg, 'level', 1, 'date', r.created_at::date::text
      );
    end if;
  end loop;

  return (
    select jsonb_build_object(
      'fullName', p.full_name,
      'title', p.title,
      'orgName', o.name,
      'titleLevel', v_title_level,
      'verified', v_verified,
      'selfReported', v_self
    )
    from profiles p
    left join organizations o on o.id = p.org_id
    where p.id = v_id
  );
end;
$$;

revoke all on function public.get_public_passport(text) from public;
grant execute on function public.get_public_passport(text) to anon, authenticated;

-- ── Audit log: owner, manager, actor can read related history ──

create or replace function public.can_read_audit_row(p_table text, p_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  if current_role_name() = 'admin' then
    return true;
  end if;

  case p_table
    when 'profiles' then v_profile := p_id;
    when 'achievements' then select profile_id into v_profile from achievements where id = p_id;
    when 'projects' then select profile_id into v_profile from projects where id = p_id;
    when 'process_improvements' then select profile_id into v_profile from process_improvements where id = p_id;
    when 'verified_facts' then select profile_id into v_profile from verified_facts where id = p_id;
    when 'kpis' then select coalesce(employee_id, profile_id) into v_profile from kpis where id = p_id;
    when 'feedback_cycles' then select profile_id into v_profile from feedback_cycles where id = p_id;
    when 'verification_requests' then select profile_id into v_profile from verification_requests where id = p_id;
    else v_profile := null;
  end case;

  if v_profile is null then
    return false;
  end if;

  return v_profile = auth.uid()
    or is_manager_of(v_profile)
    or is_org_leader_of(v_profile);
end;
$$;

drop policy if exists "audit: read related" on audit_log;
create policy "audit: read related"
  on audit_log for select
  using (
    actor_id = auth.uid()
    or can_read_audit_row(target_table, target_id)
  );
