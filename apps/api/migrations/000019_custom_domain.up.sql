ALTER TABLE pages ADD COLUMN custom_domain VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE pages ADD COLUMN custom_domain_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE pages ADD COLUMN custom_domain_token VARCHAR(64) NOT NULL DEFAULT '';

CREATE UNIQUE INDEX idx_pages_custom_domain ON pages(custom_domain) WHERE custom_domain <> '';
