-- Public shareable mini-profile (verified achievements only).
-- Run after schema.sql. Safe to re-run.

create or replace function public.get_shareable_profile(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_name text;
  v_title text;
begin
  select sl.profile_id into v_profile_id
  from shareable_links sl
  where sl.token = p_token and sl.revoked = false;

  if v_profile_id is null then
    return null;
  end if;

  select full_name, title into v_name, v_title
  from profiles where id = v_profile_id;

  return jsonb_build_object(
    'name', coalesce(v_name, 'Professional'),
    'title', coalesce(v_title, ''),
    'achievements', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'label', a.description,
          'kind', a.kind,
          'date', a.achievement_date
        ) order by a.achievement_date desc nulls last
      )
      from achievements a
      where a.profile_id = v_profile_id and a.verification_level >= 2
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_shareable_profile(text) from public;
grant execute on function public.get_shareable_profile(text) to anon, authenticated;
