ALTER TABLE business_cards
    DROP COLUMN IF EXISTS linkedin,
    DROP COLUMN IF EXISTS tiktok,
    DROP COLUMN IF EXISTS instagram,
    DROP COLUMN IF EXISTS address,
    DROP COLUMN IF EXISTS tagline,
    DROP COLUMN IF EXISTS card_theme;
