-- Provider-agnostic async job table. Holds the lifecycle of a single
-- generation request from submit → poll → terminal state.
--
-- Why a separate table (vs piggybacking on `nodes.apimart_task_id`):
--   - HeyGen / future providers need their own external id namespace.
--   - One node may produce many history rows; each successful run is one job.
--   - Polling worker (Cloudflare bridge + QStash) needs a queryable surface
--     independent of node state. Webhook callbacks lookup by external_job_id.
--
-- Status lifecycle (normalized across providers):
--   queued → running → success | failed | cancelled

create table if not exists canvas.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references canvas.nodes(id) on delete cascade,
  workflow_id uuid not null references canvas.workflows(id) on delete cascade,
  provider text not null,
  external_job_id text,
  status text not null default 'queued',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  error text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists generation_jobs_node_id_idx
  on canvas.generation_jobs (node_id, created_at desc);

create index if not exists generation_jobs_workflow_id_idx
  on canvas.generation_jobs (workflow_id);

-- Webhook callback path: bridge receives HeyGen completion event and must
-- find the job by (provider, external_job_id) to update status.
create unique index if not exists generation_jobs_provider_external_idx
  on canvas.generation_jobs (provider, external_job_id)
  where external_job_id is not null;

-- Polling worker filters open jobs by status.
create index if not exists generation_jobs_status_idx
  on canvas.generation_jobs (status)
  where status in ('queued', 'running');

alter table canvas.generation_jobs enable row level security;

drop policy if exists "generation_jobs via workflow" on canvas.generation_jobs;
create policy "generation_jobs via workflow" on canvas.generation_jobs
  for all using (
    exists (
      select 1 from canvas.workflows w
      where w.id = generation_jobs.workflow_id and w.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from canvas.workflows w
      where w.id = generation_jobs.workflow_id and w.user_id = auth.uid()
    )
  );

alter publication supabase_realtime add table canvas.generation_jobs;
