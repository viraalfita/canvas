-- Canvas: Node-Based AI Workflow Generator
-- Initial schema. Paste this in Supabase SQL Editor (or run via supabase CLI).

-- ============================================================
-- Tables
-- ============================================================

create table if not exists public.workflows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Untitled workflow',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nodes (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  type text not null,
  position_x double precision not null default 0,
  position_y double precision not null default 0,
  params jsonb not null default '{}'::jsonb,
  output jsonb,
  status text not null default 'idle' check (status in ('idle','queued','running','success','failed')),
  apimart_task_id text,
  error text,
  usage jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nodes_workflow_id_idx on public.nodes(workflow_id);
create index if not exists nodes_apimart_task_id_idx on public.nodes(apimart_task_id) where apimart_task_id is not null;

create table if not exists public.edges (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  source_node_id uuid not null references public.nodes(id) on delete cascade,
  source_handle text not null,
  target_node_id uuid not null references public.nodes(id) on delete cascade,
  target_handle text not null,
  created_at timestamptz not null default now()
);

create index if not exists edges_workflow_id_idx on public.edges(workflow_id);

-- History of successful node outputs (versioning). nodes.output stays as the
-- "active" version; this table is append-only so users can revert / compare.
create table if not exists public.node_outputs (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references public.nodes(id) on delete cascade,
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  output jsonb not null,
  usage jsonb,
  created_at timestamptz not null default now()
);
create index if not exists node_outputs_node_id_idx
  on public.node_outputs (node_id, created_at desc);
create index if not exists node_outputs_workflow_id_idx
  on public.node_outputs (workflow_id);

-- ============================================================
-- updated_at trigger
-- ============================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_workflows_updated_at on public.workflows;
create trigger trg_workflows_updated_at before update on public.workflows
  for each row execute function public.set_updated_at();

drop trigger if exists trg_nodes_updated_at on public.nodes;
create trigger trg_nodes_updated_at before update on public.nodes
  for each row execute function public.set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.workflows enable row level security;
alter table public.nodes enable row level security;
alter table public.edges enable row level security;
alter table public.node_outputs enable row level security;

-- workflows: owner-only
drop policy if exists "workflows owner select" on public.workflows;
create policy "workflows owner select" on public.workflows
  for select using (user_id = auth.uid());
drop policy if exists "workflows owner insert" on public.workflows;
create policy "workflows owner insert" on public.workflows
  for insert with check (user_id = auth.uid());
drop policy if exists "workflows owner update" on public.workflows;
create policy "workflows owner update" on public.workflows
  for update using (user_id = auth.uid());
drop policy if exists "workflows owner delete" on public.workflows;
create policy "workflows owner delete" on public.workflows
  for delete using (user_id = auth.uid());

-- nodes: only via owned workflow
drop policy if exists "nodes via workflow" on public.nodes;
create policy "nodes via workflow" on public.nodes
  for all using (
    exists (select 1 from public.workflows w where w.id = nodes.workflow_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workflows w where w.id = nodes.workflow_id and w.user_id = auth.uid())
  );

-- edges: only via owned workflow
drop policy if exists "edges via workflow" on public.edges;
create policy "edges via workflow" on public.edges
  for all using (
    exists (select 1 from public.workflows w where w.id = edges.workflow_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workflows w where w.id = edges.workflow_id and w.user_id = auth.uid())
  );

-- node_outputs (history): only via owned workflow
drop policy if exists "node_outputs via workflow" on public.node_outputs;
create policy "node_outputs via workflow" on public.node_outputs
  for all using (
    exists (select 1 from public.workflows w where w.id = node_outputs.workflow_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workflows w where w.id = node_outputs.workflow_id and w.user_id = auth.uid())
  );

-- ============================================================
-- Realtime: publish nodes so frontend can subscribe to status
-- ============================================================

alter publication supabase_realtime add table public.nodes;
alter publication supabase_realtime add table public.node_outputs;

-- ============================================================
-- Storage bucket for outputs (public read for MVP)
-- ============================================================

insert into storage.buckets (id, name, public)
values ('outputs', 'outputs', true)
on conflict (id) do nothing;

-- Allow authenticated users to upload to their own folder; public read.
drop policy if exists "outputs public read" on storage.objects;
create policy "outputs public read" on storage.objects
  for select using (bucket_id = 'outputs');

drop policy if exists "outputs auth insert own folder" on storage.objects;
create policy "outputs auth insert own folder" on storage.objects
  for insert with check (
    bucket_id = 'outputs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
