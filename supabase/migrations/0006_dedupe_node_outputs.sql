-- Cleanup: remove duplicate `node_outputs` rows from polling races.
-- Two cases are deduped:
--   (A) Same node + same URL — straight duplicates from overlapping ticks
--       both calling recordHistory after seeing the same APImart completion.
--   (B) Same node + DIFFERENT URLs created within ~30 seconds — happens when
--       overlapping ticks each upload their own copy to Supabase Storage
--       before recording. The URLs differ (different timestamps in path) but
--       conceptually they're the same generation.
--
-- Strategy: per node, keep the EARLIEST row in any cluster of close-in-time
-- entries; delete the rest. Re-runnable / idempotent.

-- Case A: same node + same URL → keep earliest
delete from public.node_outputs
 where id in (
   select id from (
     select id,
            row_number() over (
              partition by node_id, output->>'url'
              order by created_at asc
            ) as rn
       from public.node_outputs
   ) t
   where rn > 1
 );

-- Case B: same node, different URLs but created within 30s of an earlier row
delete from public.node_outputs t2
 where exists (
   select 1
     from public.node_outputs t1
    where t1.node_id = t2.node_id
      and t1.created_at < t2.created_at
      and t2.created_at - t1.created_at < interval '30 seconds'
 );
