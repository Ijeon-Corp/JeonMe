-- Live chat dukungan (permintaan langsung pengguna, 7 September 2026: "saya
-- itu ingin ada fitur live chat tetapi yang membalas nanti dari pihak jeon
-- id nya langsung bukan bot tapi tetep ada pertanyaan faq yang langsung
-- bisa diberikan jawaban nya ke creator"). SEBELUMNYA satu-satunya jalur
-- dukungan adalah email/WhatsApp manual di halaman Bantuan (help/page.tsx)
-- -- tidak ada riwayat percakapan tersimpan di produk sama sekali. FAQ
-- instan TETAP memakai konten statis yang SUDAH ada di halaman Bantuan
-- (diekstrak ke lib/help-faq.ts, BUKAN tabel baru, BUKAN CMS baru) -- tabel
-- ini HANYA untuk percakapan sungguhan dua-arah kreator<->staf.
--
-- SATU baris per pesan, SATU thread per kreator -- user_id ITU SENDIRI
-- adalah identitas thread (tidak ada tabel conversations terpisah, karena
-- selalu cuma kreator<->"Tim Jeon.id" yang tak dibeda-bedakan, tidak pernah
-- multi-pihak atau banyak thread paralel per kreator -- beda dari mis.
-- tiket dukungan bernomor). sender_admin_id mencatat staf mana yang
-- membalas (audit ringan internal, TIDAK ditampilkan ke kreator -- kreator
-- cuma melihat label digeneralisasi "Tim Jeon.id" di frontend), NULL kalau
-- sender_role='creator'. read_at menandai kapan PIHAK PENERIMA (kebalikan
-- sender_role) melihat pesan itu -- dipakai baik utk badge belum-dibaca
-- kreator (pesan sender_role='admin') MAUPUN sisi admin (dipakai di
-- AdminGetThread sbg side-effect "sudah dilihat admin"), TAPI TIDAK
-- dipakai utk definisi antrian "perlu dibalas" sisi admin (lihat
-- SupportChatHandler.AdminList: thread yg pesan TERBARUnya
-- sender_role='creator', murni berdasar urutan waktu, bukan read_at).
--
-- TIDAK ADA WebSocket/SSE (konsisten dgn seluruh codebase, lihat komentar
-- NotificationBell.tsx) -- kreator polling ringan (interval melambat saat
-- panel tertutup), admin memeriksa antrian /admin/support-chat secara
-- manual seperti antrian KYC/Laporan/Penarikan yang sudah ada -- tidak ada
-- dorongan push ke admin sama sekali.
CREATE TABLE support_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sender_role     VARCHAR(10) NOT NULL CHECK (sender_role IN ('creator', 'admin')),
    sender_admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
    body            TEXT NOT NULL,
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Riwayat satu thread (dashboard kreator sendiri MAUPUN detail admin).
CREATE INDEX idx_support_messages_user_id_created_at ON support_messages(user_id, created_at);

-- Badge "belum dibaca" sisi kreator (pesan dari admin yg belum dilihat).
CREATE INDEX idx_support_messages_unread_from_admin ON support_messages(user_id) WHERE sender_role = 'admin' AND read_at IS NULL;
