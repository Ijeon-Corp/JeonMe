DROP TABLE IF EXISTS webhook_deliveries;
DROP TABLE IF EXISTS product_codes;
ALTER TABLE orders DROP COLUMN IF EXISTS fulfilled_at;
ALTER TABLE products DROP COLUMN IF EXISTS webhook_url;
ALTER TABLE products DROP COLUMN IF EXISTS delivery_method;
