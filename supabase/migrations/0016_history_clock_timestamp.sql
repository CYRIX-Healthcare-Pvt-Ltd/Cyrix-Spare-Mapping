-- now() is the transaction start time, so two mapping changes made inside one
-- transaction get byte-identical timestamps and the history then sorts
-- arbitrarily between them. clock_timestamp() reads the actual wall clock at
-- insert, keeping the order stable no matter how the writes are batched.
--
-- Applied to the equipment history too, for the same reason.

alter table bluestar_item_mapping_history
  alter column performed_at set default clock_timestamp();

alter table equipment_history
  alter column performed_at set default clock_timestamp();
