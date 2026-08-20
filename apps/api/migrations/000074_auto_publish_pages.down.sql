-- DEFAULT kolom dikembalikan (murni skema, aman di-rollback). Backfill data
-- (UPDATE is_published=true) SENGAJA TIDAK dibatalkan -- tidak ada cara
-- membedakan Halaman Utama yang memang sudah is_published=true dari
-- sebelumnya dengan yang ikut ter-backfill migrasi up ini, mengembalikan
-- ke false berisiko menyembunyikan halaman kreator yang sudah lama publik
-- sebelum migrasi ini sama sekali. Pola sama seperti
-- 000071_grandfather_email_verified.down.sql.
ALTER TABLE pages ALTER COLUMN is_published SET DEFAULT false;
