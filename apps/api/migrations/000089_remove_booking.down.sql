ALTER TABLE products
    ADD COLUMN is_booking BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN booking_duration_minutes INT NOT NULL DEFAULT 30;

CREATE TABLE booking_slots (
    id                 UUID PRIMARY KEY,
    booking_product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    starts_at          TIMESTAMPTZ NOT NULL,
    ends_at            TIMESTAMPTZ NOT NULL,
    order_id           UUID REFERENCES orders(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_booking_slots_booking_product_id ON booking_slots(booking_product_id);
CREATE UNIQUE INDEX idx_booking_slots_product_starts_at ON booking_slots(booking_product_id, starts_at);

CREATE OR REPLACE FUNCTION ledger_source_for_product(pid UUID) RETURNS VARCHAR(30) AS $$
    SELECT CASE
        WHEN p.is_donation THEN 'donation'
        WHEN p.is_booking  THEN 'booking'
        WHEN p.is_event    THEN 'event'
        WHEN p.is_course   THEN 'course'
        WHEN p.is_bundle   THEN 'bundle'
        ELSE 'product'
    END
    FROM products p WHERE p.id = pid
$$ LANGUAGE sql STABLE;
