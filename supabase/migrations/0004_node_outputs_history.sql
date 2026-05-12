-- History of every successful generation per node. The active version stays
-- on `nodes.output` (denormalized for fast read); this table is append-only
-- so the user can revert / compare past results.
create table if not exists canvas.node_outputs (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references canvas.nodes(id) on delete cascade,
  workflow_id uuid not null references canvas.workflows(id) on delete cascade,
  output jsonb not null,
  usage jsonb,
  created_at timestamptz not null default now()
);

create index if not exists node_outputs_node_id_idx
  on canvas.node_outputs (node_id, created_at desc);
create index if not exists node_outputs_workflow_id_idx
  on canvas.node_outputs (workflow_id);

alter table canvas.node_outputs enable row level security;

drop policy if exists "node_outputs via workflow" on canvas.node_outputs;
create policy "node_outputs via workflow" on canvas.node_outputs
  for all using (
    exists (
      select 1 from canvas.workflows w
      where w.id = node_outputs.workflow_id and w.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from canvas.workflows w
      where w.id = node_outputs.workflow_id and w.user_id = auth.uid()
    )
  );

alter publication supabase_realtime add table canvas.node_outputs;
