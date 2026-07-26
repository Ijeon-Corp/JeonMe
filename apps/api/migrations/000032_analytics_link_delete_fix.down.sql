ALTER TABLE analytics_events DROP CONSTRAINT analytics_events_link_id_fkey;
ALTER TABLE analytics_events ADD CONSTRAINT analytics_events_link_id_fkey
    FOREIGN KEY (link_id) REFERENCES links(id);
