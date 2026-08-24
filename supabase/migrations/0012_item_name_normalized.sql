-- Matching BPL names to Cyrix names has to ignore punctuation and spacing:
-- "abc" and "ab -c" are the same part. A plain ILIKE can't see that, so both
-- catalogues get a stored, indexed column holding the name reduced to bare
-- alphanumerics -- that's what candidate lookup actually searches against.
--
-- Generated (not trigger-maintained) so it can never drift from item_name,
-- including on bulk upserts. regexp_replace and lower are both immutable,
-- which is what lets a generated column use them.

alter table cyrix_item_master
  add column name_normalized text
  generated always as (regexp_replace(lower(item_name), '[^a-z0-9]+', '', 'g')) stored;

alter table bpl_item_master
  add column name_normalized text
  generated always as (regexp_replace(lower(item_name), '[^a-z0-9]+', '', 'g')) stored;

create index cyrix_item_master_norm_idx on cyrix_item_master(name_normalized);
create index bpl_item_master_norm_idx on bpl_item_master(name_normalized);
