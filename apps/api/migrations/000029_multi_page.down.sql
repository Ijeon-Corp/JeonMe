DROP INDEX idx_pages_slug;
DROP INDEX idx_pages_one_primary_per_user;
ALTER TABLE pages DROP COLUMN slug;
ALTER TABLE pages DROP COLUMN name;
ALTER TABLE pages DROP COLUMN is_primary;
ALTER TABLE pages ADD CONSTRAINT pages_user_id_key UNIQUE (user_id);
