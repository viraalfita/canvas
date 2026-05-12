-- Canvas schema isolation.
-- Run this FIRST in the target Supabase project before schema.sql + later migrations.
--
-- Why: the target Supabase project may host other apps. Putting Canvas tables
-- under a dedicated `canvas` schema keeps namespaces clean and prevents
-- accidental collisions with other projects' tables in `public`.

create schema if not exists canvas;

-- Allow Supabase roles (anon/authenticated/service_role) to use objects in
-- the canvas schema. Without this, RLS-allowed selects still fail at the
-- schema-permission layer.
grant usage on schema canvas to anon, authenticated, service_role;
grant all on all tables in schema canvas to anon, authenticated, service_role;
grant all on all sequences in schema canvas to anon, authenticated, service_role;
grant all on all functions in schema canvas to anon, authenticated, service_role;

-- Future-proofing: anything created later in `canvas` inherits these grants.
alter default privileges in schema canvas
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema canvas
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema canvas
  grant all on functions to anon, authenticated, service_role;

-- IMPORTANT: After running this, go to Supabase Dashboard
--   Settings → API → Exposed schemas
-- and add `canvas` to the list (keep `public` too). PostgREST won't expose
-- the schema's tables to the client SDK otherwise.
