DELETE FROM blocked_keywords WHERE keyword = 'slot' AND match_type = 'domain_exact';
ALTER TABLE blocked_keywords DROP COLUMN match_type;
