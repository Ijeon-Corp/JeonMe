ALTER TABLE orders DROP COLUMN IF EXISTS collaborator_splits_snapshot;
ALTER TABLE products DROP COLUMN IF EXISTS collaborator_splits;
ALTER TABLE payouts DROP COLUMN IF EXISTS triggered_by;
ALTER TABLE payouts DROP COLUMN IF EXISTS payout_method_id;
DROP TABLE IF EXISTS payout_schedule;
DROP TABLE IF EXISTS payout_methods;
