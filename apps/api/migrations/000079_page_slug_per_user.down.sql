DROP INDEX idx_pages_user_slug;
CREATE UNIQUE INDEX idx_pages_slug ON pages(slug) WHERE slug IS NOT NULL;
