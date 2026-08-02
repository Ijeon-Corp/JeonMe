ALTER TABLE users DROP COLUMN IF EXISTS two_factor_secret;
ALTER TABLE users DROP COLUMN IF EXISTS two_factor_enabled_at;
ALTER TABLE users DROP COLUMN IF EXISTS two_factor_snoozed_until;
