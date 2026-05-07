-- Backfill: nodes that were generated before the history feature have a
-- current `nodes.output` but no row in `node_outputs`. Copy each one over
-- so the Versions strip + Edit button show up for older content too.
-- Idempotent — the NOT EXISTS guard prevents double-inserts on re-run.
insert into public.node_outputs (node_id, workflow_id, output, usage, created_at)
select n.id, n.workflow_id, n.output, n.usage, coalesce(n.updated_at, now())
  from public.nodes n
 where n.output is not null
   and not exists (
     select 1 from public.node_outputs h where h.node_id = n.id
   );
