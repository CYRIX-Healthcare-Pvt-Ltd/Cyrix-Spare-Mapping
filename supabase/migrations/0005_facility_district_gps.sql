-- District (admin level between city and state, common in India) and
-- GPS coordinates for facilities, captured via the browser's geolocation
-- API + reverse-geocoded to an address rather than typed by hand.

alter table facilities add column if not exists district text;
alter table facilities add column if not exists latitude double precision;
alter table facilities add column if not exists longitude double precision;
