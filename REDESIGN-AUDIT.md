# REDESIGN-AUDIT.md — Pemetaan Lama → Baru untuk Redesign jeon.id

> Diwajibkan oleh `DESIGN-JEONID-REDESIGN.md` §4 & §29.2. Dokumen ini memetakan
> struktur/fitur/kontrak yang BENAR-BENAR ada di repo terhadap asumsi spec
> (yang ditulis generik, sebagian mengasumsikan struktur produk ala Beacons.ai
> yang tidak semuanya ada di Jeonme). Sumber: audit kode langsung, 31 Agustus
> 2026, commit `26aabe0` (tag rollback: `pre-redesign`).

---

## 1. Baseline (Phase 0 — SELESAI)

- Tag git `pre-redesign` dibuat & dipush di commit `26aabe0` — rollback = `git revert`/checkout tag ini.
- Screenshot situs lama: `docs/redesign-baseline/` (15 tangkapan: homepage/pricing/features/login/register/halaman kreator publik/7 halaman dashboard, desktop + mobile).
- DB: migrasi terakhir `000081`. Redesign ini TIDAK butuh migrasi DB apa pun (murni presentasi) — sejalan spec §24 "jangan jalankan destructive database migration bersamaan dengan redesign".
- Feature flag: **TIDAK ADA sistem feature flag di repo ini** (dicek frontend+backend). Spec §23 menulis "gunakan feature flag `new_ui` bila tersedia" — tidak tersedia. Mitigasi rollback: tag `pre-redesign` + deploy staging-dulu (push `main` = staging otomatis; production hanya lewat tag rilis + approval manual) + komit terpisah per fase supaya bisa revert granular.

## 2. Pemetaan Route (OLD_ROUTE → NEW_ROUTE)

**Aturan spec §10: "Gunakan route lama... ubah hanya label navigasinya." SEMUA URL tetap — nol perubahan route.**

### Publik (semua dipertahankan apa adanya)
| Route | Halaman | Perlakuan redesign |
|---|---|---|
| `/` | Homepage marketing | Ganti UI penuh (Fase 2), SEO/CTA behavior tetap |
| `/features` | Halaman fitur | Ikut gaya baru homepage |
| `/pricing` | Pricing (force-dynamic, harga live dari API) | Ganti UI, checkout & sumber harga TIDAK berubah |
| `/login`, `/register`, `/reset-password`, `/verify-email` | Auth | Ganti kulit (AuthShell), provider/callback/validasi tetap |
| `/auth/{google,apple,instagram,tiktok}/callback` | OAuth callback | TIDAK disentuh |
| `/{username}`, `/{username}/{slug}` | Halaman kreator publik | TIDAK di-redesign — tema kreator adalah konten kreator (spec §13 cuma minta kompatibilitas) |
| `/card/[username]`, `/checkout/[id]` | Kartu kontak & status order | TIDAK disentuh fase awal |
| `/privacy`, `/terms`, `/cookies` | Legal | URL tetap (spec §11.8) |

### Dashboard — konsep nav spec → route nyata
| Konsep spec §10 | Kenyataan di repo | Keputusan |
|---|---|---|
| My Page | Grup sidebar "Link Saya": `/dashboard/links` + `/dashboard/products` + `/dashboard/design` | Pertahankan grup & route; restyle saja |
| Store | `/dashboard/products`, label ID "Toko" / EN "Shop" | Route & label tetap ("Toko", BUKAN "Store" — lihat §5 catatan bahasa) |
| Audience | `/dashboard/audience` | Tetap |
| **Email** | **ADA, tapi bukan area sendiri** — seksi "Broadcast Email" di dalam `/dashboard/audience` (kirim manual sekali-jalan ke subscriber; TANPA automation/drip/scheduling) | Tetap di dalam Audiens. JANGAN dibuat nav "Email" sendiri — itu akan mengklaim area produk yang isinya cuma satu form (melanggar §29.7 "jangan membuat UI palsu") |
| **Media Kit** | **TIDAK ADA sama sekali** (nol file/route/string) | Diabaikan — bukan fitur Jeonme. Spec §30.5: jangan hapus fitur karena tak ada di mockup; kebalikannya juga: jangan karang fitur karena ada di mockup |
| **AI Assistant** | **TIDAK ADA nav AI.** Yang nyata: (1) "Tanya Analitik" di Statistik — rule-based/templat, EKSPLISIT bukan LLM; (2) "Import" (`/dashboard/import`) — Claude vision, Premium-only | Tidak membuat nav "AI". Seksi AI homepage (spec §11.5) hanya menjelaskan 2 fitur nyata ini, jujur soal apa yang rule-based vs AI sungguhan |
| Analytics | `/dashboard/statistik` (+ `/dashboard/analytics` = pengaturan pixel/GA4) | Tetap |
| Settings | `/dashboard/settings` (hub kartu) + subhalaman profile/security/payment/subscription/seo/danger-zone | Tetap. Catatan spec §10 menyebut "domain" di Settings — fitur domain kustom SUDAH DIHAPUS (permintaan eksplisit pengguna, commit `26aabe0`); baris spec §13/§25 soal custom domain = basi, diabaikan |
| Help | Ikon tutorial di top bar → `/dashboard/tutorial` | Tetap |
| (tidak di spec) | `/dashboard`, `/dashboard/quick-setup`, `/dashboard/import`, `/dashboard/monetisasi` (hub 8 fitur), `/dashboard/social-proof`, `/dashboard/business-card`, `/dashboard/balance`, `/dashboard/kyc`, `/dashboard/team`, dst | SEMUA dipertahankan (spec §30.5) — cuma di-restyle |

## 3. Kontrak Backend yang WAJIB dipertahankan persis (hasil audit handler)

- **Links CRUD**: `listLinks/createLink/createBlock/updateLink/deleteLink/duplicateLink/reorderLinks` (api-client.ts) → handler `links.go`. Toggle aktif = `updateLink(id,{is_active})` (TIDAK ada endpoint toggle terpisah). Delete = hard delete + konfirmasi. Reorder = `PATCH /dashboard/links/reorder` body `[{id,position}]`.
- **Publish**: per-HALAMAN (`pages.is_published`), BUKAN per-link. Link cuma punya `is_active` + jadwal `starts_at/ends_at`. Badge Live/Draft di UI baru = state halaman, toggle-nya `updateMyPage({is_published})`.
- **Moderasi link**: gerbang sinkron saat simpan (3 lapis: cache domain → keyword → Claude) → kalau kena, HTTP 400 + pesan, link TIDAK tersimpan. **TIDAK ADA state per-link "pending/rejected" yang persisten** — state "moderation pending/rejected" di spec §12.5 = fitur BARU (butuh skema+backend), di luar lingkup redesign visual. UI baru cukup menampilkan pesan error 400 moderasi dengan jelas (perilaku sekarang).
- **Permission**: Premium = binary `isPremiumUser()` (2 tier saja: Free/Premium — **"Creator Plus" di spec §18 tidak ada**, copy locked-state memakai "Premium"). Kolaborator = tepat 3 flag `can_edit_links/can_edit_products/can_edit_design` (header `X-Act-As-Owner`).
- **Analytics kreator**: tepat 3 event visitor (`view/click/product_click` via `trackEvent`) untuk dashboard Statistik kreator. **Product-analytics internal (link_created/theme_changed/upgrade_clicked dst di spec §22) TIDAK ADA dalam bentuk apa pun** — spec sendiri bilang "gunakan nama event lama jika sudah ada"; tidak ada = tidak dibuat (instrumentasi baru = keputusan produk terpisah).
- **Upload gambar**: satu pipeline seragam (ekstensi jpg/png/webp → `imageconv.ToWebP` → S3), beda cuma batas ukuran per fitur. UI upload baru tinggal restyle, validasi tetap.
- **Autosave**: SELURUH dashboard = autosave (onBlur utk teks, onChange utk toggle/pilihan tema) + optimistic UI + rollback saat gagal; satu-satunya pengecualian: panel Kontak Sosial (9 field, tombol Simpan eksplisit). Spec §12.10: jangan ubah model simpan → dipertahankan persis. Indikator "Menyimpan/Tersimpan/Gagal" boleh ditambah sebagai presentasi.
- **Undo/redo (spec §12.3)**: tidak ada fungsinya di sistem → tidak ditampilkan (aturan spec sendiri).

## 4. Design tokens: pemetaan lama → baru

Token baru dari spec §6 (`--jeon-*`) menggantikan identitas hijau-emas untuk **marketing + shell dashboard + auth SAJA**. Dua sistem yang TIDAK disentuh:

1. **`lib/page-themes.ts` + `PagePreview.tsx` + semua komponen halaman publik kreator** — tema kreator adalah pilihan/konten kreator, wajib render identik (spec §13, §27 "Theme lama dirender melalui fallback/adapter" — tidak butuh adapter karena memang tidak diubah sama sekali).
2. **Data tema kustom kreator di DB** — nol perubahan.

| Sistem lama | Nilai lama | Jadi |
|---|---|---|
| `primary` hijau `#1B4D3E` (+dark/light/subtle) | Brand hijau-emas PRD | Diganti `--jeon-purple #7657ff` utk CTA/aksen shell & marketing |
| `accent` emas `#C9A24B` | | `--jeon-coral #ff6448` (CTA marketing) / `--jeon-lime` aksen |
| `--app-bg/surface/surface-2/ink/muted/border` (mode terang) | Putih-hijau | Dipetakan ke `--jeon-paper #f5f1e8` / `--jeon-surface #fff` / ink `#111` / muted `#77736c` / border `rgba(17,17,17,.16)` |
| `--app-*` (mode gelap) | Hijau-hitam | **Dark mode DIPERTAHANKAN** (baru selesai dibangun sesi ini; spec diam soal dark mode → prinsip §2.2 preserve behavior). Varian gelap diturunkan dari keluarga `--jeon-sidebar #17151c` (ungu-hitam), bukan hijau-hitam |
| Sidebar `bg-primary-dark` hijau tua | | `--jeon-sidebar #17151c` |
| `font-heading` Poppins | | Display baru: **Inter Tight** — WAJIB self-host woff2 (`next/font/local`, pola sama `app/layout.tsx`; `next/font/google` DILARANG di repo ini — 2x build produksi gagal karena URL gstatic basi, lihat komentar layout.tsx) |
| `font-body` Inter | | Tetap Inter (sudah self-hosted) |
| shadow `card/refined` lembut | | `--shadow-card` neo-brutalist `10px 12px 0 rgba(17,17,17,.92)` utk marketing; dashboard pakai `--shadow-soft` (spec: dashboard lebih tenang) |
| Radius Tailwind default | | Skala `--radius-xs..section` spec |

## 5. Konflik spec ↔ kenyataan & keputusannya

| # | Konflik | Keputusan |
|---|---|---|
| 1 | Spec §9: wordmark wajib huruf kecil `jeon.id`; kode sekarang banyak "Jeon.id" (metadata title, logo, copy) | Ikuti spec: semua "Jeon.id" di UI/metadata → `jeon.id` (bertahap per fase, konsisten per halaman yang disentuh) |
| 2 | Spec §13/§25 menyebut custom domain harus tetap berfungsi/diuji | BASI — fitur dihapus atas permintaan eksplisit pengguna (lebih baru dari spec). Diabaikan |
| 3 | Spec §18 copy "paket Creator Plus" | Tier itu tidak ada → copy memakai "Premium" |
| 4 | Spec §12.5 state moderasi per-link | Tidak ada di sistem → di luar lingkup (lihat §3) |
| 5 | Spec §22 event product-analytics | Tidak ada instrumentasi apa pun → tidak dibuat (lihat §3) |
| 6 | Spec §23 feature flag `new_ui` | Tidak ada sistem flag → mitigasi: tag `pre-redesign`, staging-first, komit per fase |
| 7 | Spec diam soal dark mode & EN/ID i18n; keduanya baru selesai dibangun menyeluruh | Keduanya DIPERTAHANKAN — string baru wajib masuk dictionaries.ts di KEDUA locale, token baru wajib punya varian gelap |
| 8 | Spec §11.2 badge jumlah kreator "hanya jika data benar" | Tidak ada sumber data jumlah kreator terverifikasi → tidak ditampilkan |
| 9 | Spec §11.3 creator marquee butuh kreator nyata + izin | Belum ada daftar berizin → fictional placeholders (diizinkan spec) |
| 10 | Spec §12.1 layout 3 kolom sidebar 226px / preview 360-390px | Sudah mirip struktur sekarang (sidebar + editor + LivePreviewPanel 360px) — restyle, bukan rombak struktur |

## 6. Urutan implementasi (mengikuti spec §23)

- **Fase 0 — Baseline**: ✅ selesai (tag, screenshot, audit ini).
- **Fase 1 — Foundation**: token `--jeon-*` + varian gelap di `globals.css` & `tailwind.config.ts` (menambah, tidak menghapus token lama supaya halaman yang belum dimigrasi tetap utuh); font Inter Tight self-host; komponen brand wordmark.
- **Fase 2 — Homepage**: header/hero/marquee/feature stories/AI section/pricing/testimonial/footer di `components/landing/*` + `/features` + `/pricing`; CTA tetap ke flow lama.
- **Fase 3 — Dashboard shell**: `dashboard/layout.tsx` (sidebar gelap `--jeon-sidebar`, topbar, mobile drawer) + AuthShell.
- **Fase 4 — Links editor**: restyle `dashboard/links/page.tsx` (kartu link + state hover/selected/saving/invalid/disabled/drag) TANPA mengubah trigger autosave/endpoint.
- **Fase 5 — Design & Analytics**: restyle `/dashboard/design/*` (kontrol tema — output data TIDAK berubah) & `/dashboard/statistik`.
- **Fase 6 — Halaman publik**: audit kompatibilitas saja (preview & tema kreator tidak diubah) — praktis no-op selain verifikasi.
- **Fase 7 — Cutover**: regression (build/typecheck/lint/e2e yang bisa jalan + Playwright live di staging), pantau, baru tag rilis produksi.

Verifikasi per fase: `tsc --noEmit` + `npm run lint` + `npm run build` + Playwright visual di staging; backend tidak disentuh sama sekali (nol perubahan `apps/api`).
