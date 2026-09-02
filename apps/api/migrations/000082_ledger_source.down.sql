DROP INDEX IF EXISTS idx_ledger_entries_user_source_created;
ALTER TABLE ledger_entries DROP COLUMN IF EXISTS source;
DROP FUNCTION IF EXISTS ledger_source_for_product(UUID);
