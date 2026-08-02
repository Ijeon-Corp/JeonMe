-- Modul Settings > Profile & Account. bio/avatar_url/display_name SUDAH ada
-- di tabel pages sejak awal (halaman publik) -- sengaja TIDAK diduplikasi di
-- users, supaya tidak ada dua sumber kebenaran untuk data yang sama.
-- category murni baru (belum ada kolom serupa di mana pun).
ALTER TABLE users ADD COLUMN category VARCHAR(50) NOT NULL DEFAULT '';

-- Username unik case-insensitive: constraint UNIQUE(username) yang ada
-- sejak 000001 case-SENSITIVE (mis. "Piko" dan "piko" dianggap beda) --
-- indeks unik lower() ini menutup celah itu tanpa mengubah kolom asli.
CREATE UNIQUE INDEX idx_users_username_lower ON users (lower(username));

-- Jejak ganti username, dipakai untuk (a) redirect permanen dari username
-- lama selama masih dalam window, (b) mencegah orang lain merebut username
-- yang baru saja ditinggalkan (squatting) selagi redirect itu masih aktif.
-- Window (90 hari) dihitung di query time dari changed_at, BUKAN kolom
-- expires_at terpisah -- pola yang sama dipakai holding period saldo
-- (BalanceHandler), supaya tidak perlu job pembersihan berkala.
CREATE TABLE username_history (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    old_username VARCHAR(30) NOT NULL,
    changed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_username_history_old_username ON username_history(old_username);
CREATE INDEX idx_username_history_user_id ON username_history(user_id);
