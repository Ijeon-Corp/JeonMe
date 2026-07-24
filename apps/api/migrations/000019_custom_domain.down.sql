DROP INDEX idx_pages_custom_domain;
ALTER TABLE pages DROP COLUMN custom_domain_token;
ALTER TABLE pages DROP COLUMN custom_domain_verified;
ALTER TABLE pages DROP COLUMN custom_domain;
