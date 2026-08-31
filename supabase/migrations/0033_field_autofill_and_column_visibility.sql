-- Two halves of the same complaint: the client's master file knows more
-- about a spare than the tag form ever asked it, and the admin had no say
-- over either end of that.

-- 1. Where a custom field's value comes from.
--
-- Autofill used to be inferred from the field's label -- a field called
-- "Make" got the make, one called "Item Description" got the name. That
-- reads well until the file carries "Item Group(Material Group)", "HSN/SAC
-- Code" or "Tax Rate", none of which any label heuristic will ever place,
-- and all of which sit in `attributes` where nothing was looking.
--
-- So the link is declared instead of guessed. `autofill_source` names the
-- client item master column this field is filled from: 'item_code',
-- 'item_name' and 'quantity' are real columns, anything else is a key in
-- `attributes` -- which is to say, a column some uploaded file brought with
-- it. Null keeps the old behaviour, so every field defined before today
-- goes on filling exactly as it did.
alter table public.field_definitions
  add column if not exists autofill_source text;

comment on column public.field_definitions.autofill_source is
  'Client item master column this field is autofilled from: item_code, item_name, quantity, or a key in bluestar_item_master.attributes. Null = infer from the label.';

-- 2. Which client item master columns the table shows.
--
-- 0028 pinned every built-in column visible, on the reasoning that they are
-- what the catalogue *is*. That holds for the identity and not much else:
-- a warehouse that does not work in quantities, or has no interest in the
-- tagging status, was still made to look at those columns forever.
--
-- The identity stays pinned -- rows are selected, deleted and linked by
-- item_code, and a table whose rows cannot be told apart is not a tidier
-- table. Everything else is now the admin's call.
alter table public.catalogue_columns
  drop constraint if exists catalogue_columns_core_always_visible;

alter table public.catalogue_columns
  add constraint catalogue_columns_identity_always_visible
  check (key <> 'item_code' or visible);

notify pgrst, 'reload schema';
