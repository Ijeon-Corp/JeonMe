ALTER TABLE orders DROP COLUMN IF EXISTS donation_wishlist_item_id;
DROP TABLE IF EXISTS donation_wishlist_items;
ALTER TABLE products DROP COLUMN IF EXISTS donation_goal_started_at;
ALTER TABLE products DROP COLUMN IF EXISTS donation_goal_amount_idr;
ALTER TABLE products DROP COLUMN IF EXISTS donation_goal_title;
