DROP INDEX IF EXISTS idx_analytics_events_created_at;
ALTER TABLE analytics_events DROP COLUMN utm_campaign;
ALTER TABLE analytics_events DROP COLUMN utm_medium;
ALTER TABLE analytics_events DROP COLUMN utm_source;
