ALTER TABLE subscribers DROP COLUMN IF EXISTS telegram_username;
ALTER TABLE lead_capture_settings
    DROP COLUMN IF EXISTS welcome_voucher_id,
    DROP COLUMN IF EXISTS magnet_product_id,
    DROP COLUMN IF EXISTS collect_telegram;
