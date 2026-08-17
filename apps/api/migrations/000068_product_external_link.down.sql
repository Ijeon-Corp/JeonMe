ALTER TABLE products DROP CONSTRAINT products_product_kind_check;
ALTER TABLE products ADD CONSTRAINT products_product_kind_check
    CHECK (product_kind IN ('digital', 'payment_link'));
ALTER TABLE products DROP COLUMN IF EXISTS external_url;
