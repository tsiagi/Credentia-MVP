-- ════════════════════════════════════════════════════════════════
-- seed-admin-demo.sql — populates the Superadmin + Company-Admin views.
--
-- Prereqs: run supabase/admin-rls-notes.sql first (adds the org columns,
-- billing_events / tenant_integrations tables, is_superadmin(), etc.).
--
-- Creates 3 extra companies (alongside Demo Corp) across tiers/states, each
-- with users (auth.users + profiles), AI-usage rows, billing events, and one
-- live integration — so the superadmin Dashboard/Companies and the company
-- views all show real content. Idempotent: re-running replaces the seed rows.
--
-- Demo logins (no password set — these exist for metrics, not sign-in):
--   …@seed.core-roborate.test
-- Superadmin sign-in remains: superadmin@demo.corp.com.
-- ════════════════════════════════════════════════════════════════

-- Enrich the primary tenant (Demo Corp) with subscription + branding.
update organizations set
  status          = 'active',
  plan            = 'Enterprise',
  billing_status  = 'active',
  seats           = greatest(8, (select count(*) from profiles p where p.org_id = organizations.id)),
  monthly_price   = 1188,
  trial_starts_at = now() - interval '120 days',
  trial_ends_at   = now() - interval '90 days',
  brand_color     = coalesce(brand_color, accent_color, '#6B7FC0'),
  billing_notes   = 'Primary demo tenant'
where id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

do $$
declare
  v_nw   uuid := 'c0000001-0001-4001-8001-000000000001';
  v_ac   uuid := 'c0000002-0002-4002-8002-000000000002';
  v_in   uuid := 'c0000003-0003-4003-8003-000000000003';
  v_demo uuid := 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
  r record;
  v_uid uuid;
begin
  -- idempotent cleanup
  delete from profiles where org_id in (v_nw, v_ac, v_in);
  delete from auth.users where email like '%@seed.core-roborate.test';
  delete from ai_inference_reports where (org_id in (v_nw, v_ac, v_in) or org_id = v_demo) and model = 'seed';
  delete from billing_events where org_id in (v_nw, v_ac, v_in);
  delete from tenant_integrations where org_id in (v_nw, v_ac, v_in);
  delete from organizations where id in (v_nw, v_ac, v_in);

  -- companies across tiers / states (sso_provider accepts null|okta|azure|google)
  insert into organizations
    (id, name, status, plan, billing_status, seats, monthly_price, trial_starts_at, trial_ends_at,
     accent_color, brand_color, sso_provider, ai_coaching_enabled, promotion_engine_enabled, require_proof)
  values
    (v_nw, 'Northwind Logistics', 'active',    'Enterprise', 'active',   60, 720, now()-interval '200 days', null,                      '#6E7A4F','#6E7A4F','okta', true,  true,  true),
    (v_ac, 'Acme Industries',     'active',    'Growth',     'trial',    12, 0,   now()-interval '10 days',  now()+interval '20 days',  '#E07C5E','#E07C5E', null,  true,  true,  true),
    (v_in, 'Initech LLC',         'suspended', 'Growth',     'canceled', 18, 228, now()-interval '300 days', now()-interval '120 days', '#8E7CB0','#8E7CB0', null,  false, false, true);

  -- users (account_status accepts active_sso|active_invited|former_trial|former_free|former_paid)
  for r in select * from (values
      (v_nw,'northwind-amelia@seed.core-roborate.test','Amelia Stone','Logistics Lead','manager',   'active_sso'),
      (v_nw,'northwind-ben@seed.core-roborate.test',   'Ben Carter',  'Dispatch Analyst','employee', 'active_sso'),
      (v_nw,'northwind-chloe@seed.core-roborate.test', 'Chloe Diaz',  'Operations Analyst','employee','active_sso'),
      (v_nw,'northwind-dan@seed.core-roborate.test',   'Dan Ellis',   'Fleet Coordinator','employee','active_sso'),
      (v_nw,'northwind-olivia@seed.core-roborate.test','Olivia Reed', 'VP Operations','executive',   'active_sso'),
      (v_ac,'acme-fiona@seed.core-roborate.test',      'Fiona Grant', 'Plant Manager','manager',     'active_sso'),
      (v_ac,'acme-george@seed.core-roborate.test',     'George Hall', 'Line Supervisor','employee',  'active_invited'),
      (v_ac,'acme-hannah@seed.core-roborate.test',     'Hannah Price','Site Admin','admin',          'active_sso'),
      (v_in,'initech-ivan@seed.core-roborate.test',    'Ivan Novak',  'Project Manager','manager',   'former_paid'),
      (v_in,'initech-jane@seed.core-roborate.test',    'Jane Kim',    'Engineer','employee',         'active_sso')
    ) as t(org, email, name, title, role, acct)
  loop
    insert into auth.users
      (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values
      ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', r.email, '',
       now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb)
    returning id into v_uid;

    insert into profiles (id, org_id, role, full_name, title, account_status)
    values (v_uid, r.org, r.role, r.name, r.title, r.acct);
  end loop;

  -- AI-insight usage (ai_inference_reports → AI Usage metric)
  insert into ai_inference_reports (org_id, scope, period_type, period_start, period_end, report, confidence, model)
  select o, 'org', 'monthly',
         date_trunc('month', now())::date,
         (date_trunc('month', now()) + interval '1 month' - interval '1 day')::date,
         '{"summary":"[seed] monthly org synthesis"}'::jsonb, 0.72, 'seed'
  from (values (v_nw),(v_nw),(v_nw),(v_nw),(v_nw),(v_nw),(v_nw),(v_nw),
               (v_ac),(v_ac),(v_ac),
               (v_in),(v_in),
               (v_demo),(v_demo),(v_demo),(v_demo),(v_demo)) s(o);

  -- billing events + one live integration
  insert into billing_events (org_id, type, amount, detail) values
    (v_nw, 'plan_set',      720,  '{"seed":true,"seats":60}'::jsonb),
    (v_ac, 'trial_started', null, '{"seed":true,"trial_days":30}'::jsonb),
    (v_in, 'canceled',      null, '{"seed":true}'::jsonb);

  insert into tenant_integrations (org_id, source, status, records_imported, last_sync_at) values
    (v_nw, 'workday', 'connected', 60, now() - interval '1 day');
end $$;

-- Verify
select o.name, o.status, o.plan, o.billing_status, o.seats, o.monthly_price,
  (select count(*) from profiles p where p.org_id = o.id) as users,
  (select count(*) from ai_inference_reports r where r.org_id = o.id) as ai_reports
from organizations o order by o.name;
