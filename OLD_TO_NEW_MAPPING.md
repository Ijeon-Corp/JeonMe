# OLD_TO_NEW_MAPPING.md — Restrukturisasi IA Dashboard jeon.id

> Diwajibkan `DASHBOARD-DESIGN-JEONID.md` §18/§29.1/§30. Memetakan SETIAP
> route & fitur dashboard yang BENAR-BENAR ADA ke IA baru yang diusulkan,
> dan menandai jujur status backend tiap item (ADA / TIDAK ADA / sebagian).
> Sumber: audit kode langsung 31 Agustus 2026 + `REDESIGN-AUDIT.md`.
> Fondasi visual (token `--jeon-*`, font, shell ungu-hitam) SUDAH selesai
> Fase 1-5 redesign sebelumnya — dokumen ini menambah lapisan IA/navigasi.

## A. Pemetaan route lama → menu IA baru

Aturan: route lama DIPERTAHANKAN (§18 "pertahankan route lama atau redirect");
yang berubah hanya PENGELOMPOKAN & LABEL nav. Nol perubahan URL.

| Menu IA baru (§5.2) | Sub-item doc | Route lama yang ada | Status |
|---|---|---|---|
| **Beranda** | — | `/dashboard` | ADA (restyle) |
| **Halaman Saya** | Link & Block | `/dashboard/links` | ADA |
| | Desain | `/dashboard/design` (+ /theme /header /tombol /font /sticker) | ADA |
| | Halaman Tambahan | dikelola DALAM `/dashboard/links` (pill switcher) | ADA |
| | Domain | — | **DIHAPUS** (permintaan user 31 Agu, commit 26aabe0) |
| | SEO & Sharing | `/dashboard/settings/seo` | ADA |
| **Produk & Penjualan** | Ringkasan/Produk | `/dashboard/products` (tab Overview/Manage/dst) | ADA |
| | Course | `/dashboard/courses` | ADA |
| | Appointment | `/dashboard/bookings` | ADA |
| | Event & Webinar | `/dashboard/events` (webinar = event online) | ADA (event); webinar tidak terpisah |
| | Donation | `/dashboard/donation` | ADA |
| | Affiliate | `/dashboard/affiliates` | ADA |
| | Pesanan | tab "Transaction" DALAM `/dashboard/products` | ADA |
| | Member Area | — | **TIDAK ADA** sbg halaman terpisah |
| | Review | tab "Reviews" DALAM `/dashboard/products` | ADA |
| | (extra) Voucher | `/dashboard/vouchers` | ADA |
| | (extra) Bundel | `/dashboard/bundles` | ADA |
| | (extra) Loyalitas | `/dashboard/loyalty` | ADA |
| **Audiens** | Kontak/Manager | `/dashboard/audience` | ADA |
| | Segmen | — | **TIDAK ADA** |
| | Form | bagian lead-capture DALAM `/dashboard/audience` + blok di links | ADA (parsial) |
| | Import/Export | Ekspor CSV ADA; import kontak **TIDAK ADA** | parsial |
| **Promosi** | Email Broadcast | seksi DALAM `/dashboard/audience` | ADA |
| | WhatsApp Broadcast | — | **TIDAK ADA** |
| | Auto Reply/DM | — | **TIDAK ADA** |
| | Coupon | = `/dashboard/vouchers` (sudah di Produk) | ADA (nama beda) |
| | Campaign | — | **TIDAK ADA** |
| | Automation | — | **TIDAK ADA** |
| | Social Proof | `/dashboard/social-proof` | ADA (fitur nyata, tidak di doc) |
| **Analitik** | Overview/Link | `/dashboard/statistik` (tab Link Bio/Toko) | ADA |
| | Produk/Revenue | tab Toko DALAM `/dashboard/statistik` | ADA |
| | Audience/Export | Ekspor CSV ADA; analitik audiens khusus TIDAK terpisah | parsial |
| **Keuangan** | Saldo/Transaksi/Penarikan | `/dashboard/balance` | ADA |
| | Rekening | `/dashboard/settings/payment` | ADA |
| | Invoice/Pajak | — | **TIDAK ADA** |
| **Integrasi** | Analytics & Pixels | `/dashboard/analytics` (GA4/Meta Pixel/CAPI/UTM) | ADA |
| | Email/WhatsApp/Sosial | `/dashboard/social-connect` (IG/TikTok connect) | ADA (parsial) |
| | Webhook | tab "Webhook Events" DALAM `/dashboard/products` | ADA (parsial) |
| | Payment/API | — | **TIDAK ADA** (API keys) |
| **Tim** | Anggota/Role | `/dashboard/team` (3 flag: links/products/design) | ADA (peran sederhana) |
| | Activity Log | — | **TIDAK ADA** |
| **Pengaturan** | Profil/Akun & Keamanan | `/dashboard/settings/{profile,security}` | ADA |
| | Billing & Paket | `/dashboard/settings/subscription` | ADA |
| | Notifikasi/Bahasa/Data | toggle bahasa ADA; halaman Notifikasi/Data-privasi **TIDAK ADA** | parsial |
| | Verifikasi KYC | `/dashboard/kyc` | ADA (fitur nyata, tidak di doc) |
| **(lepas, tak di IA doc)** | Quick Setup | `/dashboard/quick-setup` | ADA — pertahankan |
| | Import (screenshot+URL) | `/dashboard/import` | ADA — pertahankan |
| | Kartu Kontak | `/dashboard/business-card` | ADA — pertahankan |
| | Tutorial | `/dashboard/tutorial` | ADA — pertahankan |

## B. Fitur di doc yang backend-nya TIDAK ADA (jangan dibuat palsu, §3.4/§30)

Member Area terpisah · Segmen audiens · Import kontak CSV · WhatsApp Broadcast ·
Auto Reply/DM · Campaign · Automation (trigger→action) · Integration catalog page ·
API keys/scopes · Invoice/Pajak · Activity Log tim · peran tim >3 flag ·
Notifikasi per-channel · Data & Privasi page · Course "member area/progress" lanjutan
(course ADA tapi member-tracking terbatas).

→ Opsi tiap item: (a) **omit** dari nav (default — tidak dibuat sama sekali),
atau (b) badge **"Segera"** TANPA tombol fungsional HANYA bila memang masuk
roadmap resmi (dokumen §3.4/§29.8; saya tidak mengarang roadmap sendiri).

## C. Fitur NYATA yang tidak muncul di IA doc (§5.4: tak boleh disembunyikan)

Quick Setup, Import (AI screenshot), Kartu Kontak digital, Social Proof, KYC,
Stiker desain, Watermark toggle, Multi-halaman (bio/landing/produk), Loyalitas.
→ SEMUA wajib tetap punya jalur masuk di IA baru (masuk menu terdekat).

## D. Ketegangan keputusan (perlu arah user)

1. **Skala nav.** Sidebar baru saja dikonsolidasi 23→14 baris (permintaan user
   sebelumnya). Doc §5.3 mau **7 menu bisnis utama + progressive disclosure**
   (sub-menu muncul di header/secondary-nav, bukan sidebar penuh). Ini
   REKONSILIABEL — bukan ledakan 40 baris — tapi mengubah pengelompokan yang
   baru disepakati. Perlu konfirmasi arah.
2. **Cakupan.** Doc §5.4 punya MVP/Fase2/Fase3. "MVP" doc = Beranda/Halaman
   Saya/Produk/Pesanan/Audiens/Analitik/Keuangan/Integrasi/Pengaturan — SEMUA
   memetakan ke fitur yang SUDAH ADA. Ini cakupan realistis tanpa fitur palsu.
3. **Route baru vs lama.** Doc §18 usul route seperti `/dashboard/page`,
   `/dashboard/finance`. Route lama (`/dashboard/links`, `/dashboard/balance`)
   sudah dipakai email/bookmark/redirect — rekomendasi: **pertahankan route
   lama, ubah label nav saja** (§18 mengizinkan ini eksplisit).

## E. Fondasi yang sudah selesai (reusable, tidak diulang)

Token `--jeon-*` = token §7.2 doc (identik). Font display Inter Tight. Shell
sidebar ungu-hitam 226px + topbar 72px + pil Live/Draf. Semua komponen UI
(button/input/switch/tabs/dialog/toast/skeleton/empty-state/badge) sudah
bertema. `.glass` = kartu solid tenang. Autosave on-blur/on-change dipertahankan.
Feature-flag: TIDAK ADA sistem flag di repo → mitigasi = tag `pre-redesign`,
staging-first, komit per langkah.
