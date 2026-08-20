-- New custom-field type for values that are themselves scanned off a
-- physical barcode/QR sticker already on the equipment (e.g. a manufacturer
-- serial number) -- distinct from the QR code the app uses to identify the
-- equipment record itself. Rendered as a text input with a scan button, so
-- it always has a manual-entry fallback.

alter type field_type add value if not exists 'barcode';
