DROP TABLE IF EXISTS account_deletion_requests;
ALTER TABLE users DROP COLUMN IF EXISTS deactivated_at;
