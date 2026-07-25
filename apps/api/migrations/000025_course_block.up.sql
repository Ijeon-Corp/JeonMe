ALTER TABLE products ADD COLUMN is_course BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN course_prerequisites TEXT NOT NULL DEFAULT '';

CREATE TABLE course_chapters (
    id                UUID PRIMARY KEY,
    course_product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    title             VARCHAR(200) NOT NULL,
    description       TEXT NOT NULL DEFAULT '',
    video_url         TEXT NOT NULL,
    position          INT NOT NULL
);

CREATE INDEX idx_course_chapters_course_product_id ON course_chapters(course_product_id);
