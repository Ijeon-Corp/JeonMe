-- Modul Settings §4 (Team & Role Management) -- keputusan pengguna
-- 2026-07-31: perluas tabel collaborators yang sudah ada (No.87, Sprint 10)
-- alih-alih membangun team_members paralel. role di spec DIPETAKAN ke
-- kombinasi 3 flag boolean yang sudah ada (can_edit_links/products/design),
-- BUKAN menggantikannya -- middleware.ActAsOwner (routes.go) masih
-- menegakkan akses lewat kolom boolean itu apa adanya, role murni lapisan
-- tampilan/API yang lebih ramah di atasnya (lihat username.go/collaborator.go
-- untuk pemetaan role<->boolean).
ALTER TABLE collaborators ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'content_admin'
    CHECK (role IN ('content_admin', 'sales_admin', 'full_access'));

-- Backfill baris yang sudah ada dari kombinasi boolean saat ini supaya
-- kolaborator lama tidak tiba-tiba kehilangan akses yang sudah diberikan.
UPDATE collaborators SET role = CASE
    WHEN can_edit_links AND can_edit_products AND can_edit_design THEN 'full_access'
    WHEN can_edit_products AND NOT can_edit_links AND NOT can_edit_design THEN 'sales_admin'
    ELSE 'content_admin'
END;
