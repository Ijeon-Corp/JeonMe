DROP INDEX IF EXISTS idx_analytics_events_product_id;
ALTER TABLE analytics_events DROP COLUMN IF EXISTS product_id;
