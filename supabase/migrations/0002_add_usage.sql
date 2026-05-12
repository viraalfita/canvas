-- Tracks per-node usage info captured from APImart's task status response
-- (e.g. model used, actual generation time). Token cost isn't returned by
-- APImart per task; balance is account-level only.
alter table canvas.nodes
  add column if not exists usage jsonb;
