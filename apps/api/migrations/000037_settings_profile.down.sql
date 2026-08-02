DROP TABLE IF EXISTS username_history;
DROP INDEX IF EXISTS idx_users_username_lower;
ALTER TABLE users DROP COLUMN IF EXISTS category;
