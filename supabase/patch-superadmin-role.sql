-- Allow superadmin role on profiles (remote DB may still use provisioning-lifecycle constraint).
-- Run in Supabase → SQL Editor if seed:test-users warns about superadmin.

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('superadmin', 'employee', 'manager', 'executive', 'admin', 'hr'));
