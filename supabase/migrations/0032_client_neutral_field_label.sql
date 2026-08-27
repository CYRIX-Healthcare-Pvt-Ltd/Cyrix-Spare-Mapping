-- The customer must not be named anywhere a user of the site can see it.
--
-- Most of that is UI text, but this one is data: field_definitions.label is
-- admin-authored and renders as a form label and as a column header in the
-- tagged list, so it was showing the customer's name on every row of the
-- busiest table in the app. It cannot be fixed by editing the code.
--
-- Only the label changes. field_key stays 'barcode', because that is what
-- every equipment.custom_fields entry is keyed by and renaming it would
-- orphan every tag already recorded.
update field_definitions
   set label = 'Client item code'
 where field_key = 'barcode'
   and label ilike '%blue%star%';
