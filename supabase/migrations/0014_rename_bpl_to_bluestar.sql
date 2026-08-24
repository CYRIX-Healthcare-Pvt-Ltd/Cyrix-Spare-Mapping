-- The client is Blue Star, not "BPL" -- that was a misnomer carried through
-- from the initial description. Renaming rather than leaving it: the table is
-- still empty, so this is the last cheap moment to correct it, and a
-- mis-named core table would mislead every future reader.
--
-- Policies and foreign keys follow a renamed table automatically; indexes
-- keep working under their old names but are renamed here so nothing is left
-- referring to the wrong company.

alter table bpl_item_master rename to bluestar_item_master;

alter index bpl_item_master_barcode_idx rename to bluestar_item_master_barcode_idx;
alter index bpl_item_master_name_idx rename to bluestar_item_master_name_idx;
alter index bpl_item_master_cyrix_code_idx rename to bluestar_item_master_cyrix_code_idx;
alter index bpl_item_master_norm_idx rename to bluestar_item_master_norm_idx;

alter policy "bpl_item_master_select" on bluestar_item_master rename to "bluestar_item_master_select";
alter policy "bpl_item_master_admin_insert" on bluestar_item_master rename to "bluestar_item_master_admin_insert";
alter policy "bpl_item_master_admin_update" on bluestar_item_master rename to "bluestar_item_master_admin_update";
alter policy "bpl_item_master_admin_delete" on bluestar_item_master rename to "bluestar_item_master_admin_delete";
alter policy "bpl_item_master_map_update" on bluestar_item_master rename to "bluestar_item_master_map_update";

-- Grants carry over with the rename, but restate them so a fresh apply of
-- these migrations ends in the same place regardless of ordering.
grant select, insert, update, delete on public.bluestar_item_master to authenticated;
grant all on public.bluestar_item_master to service_role;
