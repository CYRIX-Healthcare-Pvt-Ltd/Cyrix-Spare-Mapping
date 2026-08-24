-- The real Cyrix item master carries more than code+name. These are columns
-- C..I of the source workbook (A and B are already item_code / item_name):
--
--   C In Stock              D Item Cost             E Additional Identifier
--   F Item Group            G Parent Equip          H Make
--   I Model
--
-- E..I are only 58-67% populated in the source file, so all are nullable.
-- "Additional Identifier" often holds a manufacturer/vendor part number,
-- which makes it a useful secondary key when matching against BPL's
-- catalogue -- hence the index.

alter table cyrix_item_master
  add column if not exists in_stock numeric,
  add column if not exists item_cost numeric,
  add column if not exists additional_identifier text,
  add column if not exists item_group text,
  add column if not exists parent_equipment text,
  add column if not exists make text,
  add column if not exists model text;

create index if not exists cyrix_item_master_addl_id_idx on cyrix_item_master(additional_identifier);
create index if not exists cyrix_item_master_group_idx on cyrix_item_master(item_group);
