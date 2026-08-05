ALTER TABLE pages DROP CONSTRAINT pages_page_type_check;
ALTER TABLE pages ADD CONSTRAINT pages_page_type_check CHECK (page_type IN ('bio', 'landing'));
