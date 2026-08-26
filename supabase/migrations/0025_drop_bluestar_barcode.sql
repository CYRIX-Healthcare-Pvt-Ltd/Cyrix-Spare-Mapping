-- Blue Star identifies a part by its item code. There is no separate barcode.
--
-- The column was carried from an earlier reading of the model, where the
-- string scanned off a label was assumed to be a barcode distinct from the
-- code. It never held anything: the catalogue is empty until the real master
-- file is loaded, and that file has no such column. Leaving it would keep
-- offering a second way to identify a part that does not exist, in the
-- importer, the export and the search.

drop index if exists bluestar_item_master_barcode_idx;
alter table bluestar_item_master drop column if exists barcode;

-- The history row snapshotted the barcode alongside the item code so the log
-- still read correctly after a re-upload. With no barcode there is nothing to
-- snapshot.
drop index if exists bluestar_item_mapping_history_barcode_idx;
alter table bluestar_item_mapping_history drop column if exists barcode;

notify pgrst, 'reload schema';
