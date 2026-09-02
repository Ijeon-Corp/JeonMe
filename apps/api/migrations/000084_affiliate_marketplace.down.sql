DROP INDEX IF EXISTS idx_products_affiliate_public;
ALTER TABLE products
    DROP COLUMN IF EXISTS affiliate_public_commission_percent,
    DROP COLUMN IF EXISTS affiliate_public;
