# DESIGN.md — jeon.id Redesign Specification

> Spesifikasi desain dan migrasi tampilan jeon.id dari website lama ke pengalaman baru bertema **Modern Playful Creator Platform**. Dokumen ini ditujukan untuk coding agent yang mengerjakan repository jeon.id yang sudah berjalan. Proyek ini adalah **redesign bertahap**, bukan pembangunan ulang sistem dari nol.

---

## 1. Ringkasan Produk

jeon.id adalah platform creator untuk membuat halaman link-in-bio, mengelola tautan, membangun audiens, menampilkan media kit, menjual produk digital, dan memantau performa halaman.

Redesign mencakup dua permukaan utama:

1. **Marketing homepage** — memperkenalkan manfaat jeon.id dan mengarahkan pengguna ke registrasi/login.
2. **Creator dashboard** — workspace untuk mengelola halaman creator, link, desain, preview, dan analytics.

Tujuan redesign:

- mengganti tampilan lama dengan identitas visual baru tanpa menghilangkan fungsi yang sudah berjalan;
- membuat jeon.id terlihat lebih modern, playful, premium, dan relevan untuk creator Indonesia;
- meningkatkan keterbacaan, hierarki, serta kemudahan pengelolaan link;
- mempertahankan URL publik, data pengguna, autentikasi, paket berlangganan, analytics, dan integrasi lama;
- memungkinkan migrasi per halaman tanpa big-bang rewrite.

---

## 2. Prinsip Utama Redesign

### 2.1 Redesign, bukan rebuild

Agent wajib menggunakan aplikasi lama sebagai sumber kebenaran untuk:

- model database;
- endpoint API;
- autentikasi dan session;
- authorization dan permission;
- paket Free/Premium/Creator Plus;
- URL publik creator;
- upload media;
- analytics;
- pembayaran;
- moderasi link;
- feature flags;
- status publish/draft;
- error handling dan validation rules.

Tampilan baru tidak boleh mengubah kontrak backend hanya demi menyesuaikan komponen UI.

### 2.2 Preserve behavior

Jika fungsi lama sudah bekerja, pertahankan perilakunya kecuali dokumen ini secara eksplisit meminta perubahan UX. UI baru harus memanggil service, action, hook, store, atau endpoint lama.

### 2.3 Incremental migration

Implementasi harus bisa dilakukan per route atau per komponen. Website lama harus tetap dapat digunakan selama proses migrasi.

### 2.4 Visual consistency

Homepage, dashboard, halaman creator publik, login, billing, dan settings harus terasa berada dalam satu brand, tetapi tingkat kepadatan UI boleh berbeda:

- homepage: ekspresif dan editorial;
- dashboard: ringkas dan produktif;
- halaman creator publik: fleksibel mengikuti tema creator;
- auth/settings: bersih dan fokus.

---

## 3. Batasan Migrasi yang Wajib Dipatuhi

### Jangan diubah tanpa audit dan persetujuan

- nama tabel, kolom, migration, dan relasi database;
- bentuk request/response API;
- JWT/session/cookie configuration;
- OAuth callback URL;
- slug dan format URL creator yang sudah aktif;
- payment callback/webhook;
- role dan permission;
- event analytics yang sudah dikonsumsi dashboard;
- storage path dan public media URL;
- proses moderasi link dan image;
- cron job, queue, worker, atau background task;
- environment variable;
- domain production dan staging;
- aturan paket berlangganan;
- canonical URL dan redirect lama.

### Boleh diubah

- komposisi layout;
- tipografi;
- warna dan token visual;
- icon dan illustration system;
- spacing, radius, border, shadow;
- susunan navigasi dengan mapping yang jelas;
- presentation layer;
- component styling;
- empty/loading/error state;
- microinteraction;
- responsive behavior;
- copy UI selama makna dan konsekuensinya tetap sama.

---

## 4. Audit Sebelum Coding

Coding agent wajib membuat daftar berikut sebelum mengganti UI:

```txt
OLD_ROUTE → NEW_ROUTE
OLD_COMPONENT → NEW_COMPONENT
OLD_ACTION/HANDLER → NEW_UI_TRIGGER
OLD_API → NEW_COMPONENT_CONSUMER
OLD_PERMISSION → NEW_VISIBILITY_RULE
OLD_ANALYTICS_EVENT → NEW_INTERACTION
```

Audit minimum:

- semua route publik dan dashboard;
- seluruh state form;
- loading, empty, error, success;
- desktop dan mobile navigation;
- modal, confirmation, toast;
- API call dari setiap tombol;
- analytics event dari setiap interaksi;
- permission Free/Premium/Admin;
- route yang digunakan pada email atau link eksternal;
- SEO metadata halaman publik;
- redirect untuk slug lama.

Hasil audit disimpan sebagai `REDESIGN-AUDIT.md` di repository implementasi.

---

## 5. Arah Visual

### Nama tema

**Modern Playful Creator Platform** dengan sentuhan **Neo-Brutalism ringan** dan **Editorial Design**.

### Karakter

- modern dan mudah dipercaya;
- youthful tanpa terlihat kekanak-kanakan;
- penuh energi, tetapi tidak ramai;
- heading besar dan ekspresif;
- outline hitam tipis serta shadow tegas;
- kartu dengan radius besar;
- warna cerah sebagai pemisah fungsi;
- dashboard lebih tenang daripada homepage.

### Kata kunci

```txt
creator-first · bold · editorial · playful · productive · modular · premium
```

---

## 6. Design Tokens

Semua nilai harus disimpan sebagai CSS variables atau theme configuration. Jangan menulis warna hex berulang pada komponen.

```css
:root {
  --jeon-ink: #111111;
  --jeon-paper: #f5f1e8;
  --jeon-surface: #ffffff;
  --jeon-purple: #7657ff;
  --jeon-purple-dark: #5636e8;
  --jeon-lavender: #d9ceff;
  --jeon-orange: #ff7043;
  --jeon-coral: #ff6448;
  --jeon-lime: #d7ff60;
  --jeon-blue: #8ad5ff;
  --jeon-pink: #ffafd0;
  --jeon-success: #168153;
  --jeon-warning: #d98600;
  --jeon-danger: #d93d36;
  --jeon-muted: #77736c;
  --jeon-border: rgba(17, 17, 17, 0.16);
  --jeon-sidebar: #17151c;

  --radius-xs: 8px;
  --radius-sm: 10px;
  --radius-md: 14px;
  --radius-lg: 20px;
  --radius-xl: 32px;
  --radius-section: 42px;
  --radius-pill: 999px;

  --shadow-soft: 0 12px 35px rgba(24, 17, 47, 0.10);
  --shadow-card: 10px 12px 0 rgba(17, 17, 17, 0.92);
  --shadow-focus: 0 0 0 3px rgba(118, 87, 255, 0.18);

  --container: 1360px;
  --dashboard-sidebar: 226px;
  --dashboard-preview: 390px;
}
```

### Semantic mapping

| Fungsi | Token |
| --- | --- |
| CTA utama | `--jeon-purple` |
| CTA marketing | `--jeon-coral` |
| Background global | `--jeon-paper` |
| Dashboard sidebar | `--jeon-sidebar` |
| Success/live | `--jeon-success` |
| Focus ring | purple 18% opacity |
| Error/destructive | `--jeon-danger` |

---

## 7. Typography

### Font

- Display: `Inter Tight`, `Satoshi`, atau `Neue Montreal`.
- Body/UI: `Inter`.
- Editorial accent: `Georgia` atau serif display sejenis.
- Fallback: `Arial`, sans-serif.

```css
--font-display: "Inter Tight", "Helvetica Neue", Arial, sans-serif;
--font-body: "Inter", "Helvetica Neue", Arial, sans-serif;
--font-editorial: Georgia, "Times New Roman", serif;
```

### Scale

| Style | Desktop | Mobile | Weight | Line height |
| --- | ---: | ---: | ---: | ---: |
| Hero | 86–180px | 60–72px | 800 | 0.80–0.88 |
| Section title | 58–112px | 46–58px | 750 | 0.88–0.95 |
| Dashboard title | 20–28px | 18–22px | 700 | 1.2 |
| Card title | 14–20px | 14–18px | 650 | 1.3 |
| Body marketing | 18–20px | 16–18px | 400 | 1.5 |
| Body UI | 13–15px | 13–15px | 400 | 1.45 |
| Label | 10–12px | 10–12px | 700 | 1.2 |

Heading display menggunakan negative letter spacing. Teks dashboard tidak boleh terlalu rapat.

---

## 8. Icon System

- Gunakan satu library icon outline yang konsisten.
- Stroke default `1.75–2px`.
- Ukuran sidebar `18–20px`.
- Ukuran button `16–18px`.
- Ukuran decorative `24–48px`.
- Jangan mencampurkan emoji dengan icon production.
- Simbol `✦` boleh dipakai sebagai brand accent jeon.id, bukan untuk semua icon.

Icon penting:

- My Page: layout/grid;
- Store: shopping bag;
- Audience: users;
- Email: mail;
- Media Kit: file/profile;
- AI: sparkle;
- Analytics: chart;
- Settings: gear;
- Help: circle question;
- Share: arrow up-right;
- Publish: rocket/upload/cloud check.

---

## 9. Branding jeon.id

### Wordmark

- Penulisan wajib: `jeon.id` menggunakan huruf kecil.
- Jangan menulis `Jeon.id`, `JEON.ID`, `Beacon`, atau `Beacons` pada UI final.
- Wordmark dipasangkan dengan simbol sparkle/geometris sederhana.
- Pada background gelap: teks putih, accent lime/purple.
- Pada background terang: teks ink, accent purple.

### URL contoh

```txt
jeon.id/mayalin
jeon.id/mayalin/playbook
jeon.id/mayalin/community
```

URL contoh harus diganti dengan data user sebenarnya saat terhubung ke backend.

---

## 10. Information Architecture

### Public routes

| Route konseptual | Halaman | Migrasi |
| --- | --- | --- |
| `/` | Marketing homepage | Ganti UI, pertahankan SEO/CTA behavior |
| `/pricing` | Pricing | Pertahankan plan ID dan checkout flow |
| `/login` | Login | Pertahankan auth provider/callback |
| `/register` | Registration | Pertahankan validation/verification |
| `/{username}` | Public creator page | Pertahankan slug dan redirect |
| `/{username}/{item}` | Store/product/content | Pertahankan canonical URL |

### Dashboard routes

Gunakan route lama jika sudah ada. Nama berikut adalah konsep navigasi, bukan instruksi untuk mengubah URL:

| Menu | Tujuan |
| --- | --- |
| My Page | Mengelola link dan preview |
| Store | Produk digital, course, order |
| Audience | Subscriber dan segment |
| Email | Broadcast dan automation |
| Media Kit | Profile dan metrics |
| Analytics | Views, clicks, CTR, conversion |
| AI Assistant | Bantuan AI yang sudah tersedia |
| Settings | Profil, domain, billing, security |

Jika route lama berbeda, gunakan route lama dan ubah hanya label navigasinya.

---

## 11. Homepage Specification

### 11.1 Header

- Sticky, tinggi `80–86px` desktop dan `68–72px` mobile.
- Logo jeon.id kiri.
- Nav: Creators, Managers, Brands, Pricing, Dashboard.
- Login sebagai text button.
- CTA utama: `Mulai gratis` atau `Buka dashboard` sesuai auth state.
- Saat user sudah login, CTA harus mengarah ke dashboard lama yang valid.
- Mobile menggunakan drawer/menu yang dapat dinavigasi keyboard.

### 11.2 Hero

Headline:

```txt
Bangun
kehadiranmu.
```

Alternatif copy jika website lama sudah memiliki messaging yang disetujui:

```txt
Satu link untuk semua.
```

Supporting copy menjelaskan link-in-bio, monetisasi, dan creator business hub.

Elemen:

- display heading sangat besar;
- CTA primary dan optional secondary;
- interactive flip card;
- badge jumlah creator hanya jika data benar dan dapat dibuktikan;
- dekorasi tidak boleh menghalangi CTA.

### 11.3 Creator marquee

- Menampilkan creator nyata hanya dengan izin.
- Jika belum ada, gunakan fictional placeholders.
- Infinite horizontal motion.
- Pause pada hover.
- Nonaktif pada `prefers-reduced-motion`.

### 11.4 Feature stories

Empat section:

1. **Build your presence** — link-in-bio page builder.
2. **Monetize your work** — store, product, course.
3. **Land your dream deal** — media kit dan partnership.
4. **Own your audience** — email, subscriber, analytics.

Setiap section:

- menggunakan warna berbeda;
- desktop split layout;
- mobile stacked;
- copy maksimal 2 paragraf;
- visual mockup memakai data dummy yang aman;
- CTA menuju fitur existing, bukan route baru yang belum tersedia.

### 11.5 AI section

- Pertahankan nama fitur AI lama jika sudah dikenal user.
- Jangan mengganti provider atau backend AI dalam pekerjaan redesign.
- Jelaskan fungsi yang benar-benar tersedia.
- Status `Coming soon` untuk fungsi yang belum production.
- Jika API key tidak tersedia, UI harus menunjukkan unavailable state sesuai behavior backend, bukan mengklaim aktif.

### 11.6 Pricing

- Nama paket, harga, fee, limit, dan entitlement harus berasal dari konfigurasi/backend lama.
- Jangan hardcode plan ID.
- Card populer hanya digunakan untuk paket yang benar-benar direkomendasikan.
- Checkout lama harus tetap digunakan.
- Tampilkan loading dan error saat harga tidak dapat diambil.

### 11.7 Testimonial

- Gunakan testimonial yang memiliki izin.
- Jangan mengarang angka pendapatan atau followers sebagai klaim nyata.
- Placeholder harus diberi data fictional pada development.

### 11.8 Footer

- Wordmark jeon.id.
- Product, Company, Legal, Help.
- Link lama harus diaudit sebelum dipindahkan.
- Privacy dan Terms tidak boleh berubah URL tanpa redirect.
- Copyright menggunakan tahun dinamis.

---

## 12. Dashboard Specification

### 12.1 Layout desktop

```txt
┌──────────────┬───────────────────────────┬──────────────────┐
│ Sidebar      │ Editor / Main workspace   │ Live preview     │
│ 226px        │ fluid                     │ 360–390px        │
└──────────────┴───────────────────────────┴──────────────────┘
```

- Sidebar sticky setinggi viewport.
- Header dashboard tinggi `72–76px`.
- Tab bar di bawah header.
- Workspace tidak memiliki marketing hero.
- Preview selalu terlihat pada desktop lebar.

### 12.2 Sidebar

Urutan:

- jeon.id logo;
- My Page;
- Store;
- Audience;
- Email;
- Media Kit;
- AI;
- Help;
- Settings;
- account switcher/profile.

Rules:

- menu yang tidak dimiliki paket user menampilkan lock/upgrade state;
- jangan menyembunyikan menu hanya di frontend jika permission backend menolak;
- active item purple;
- collapsed sidebar pada tablet;
- drawer pada mobile.

### 12.3 Top bar

- Judul halaman.
- Status `Live`, `Draft`, atau `Unpublished` dari data backend.
- Undo/redo hanya muncul jika benar-benar berfungsi.
- Share memakai URL creator sebenarnya.
- Publish memakai action publish lama.
- Publish memiliki loading, success, dan error state.
- Tombol tidak boleh menampilkan sukses sebelum response backend berhasil.

### 12.4 My Page tabs

Tabs:

- Links;
- Design;
- Analytics.

Pada mobile, tab tetap dapat diakses tanpa horizontal overflow.

### 12.5 Links editor

Setiap link row memuat:

- drag handle;
- type/icon;
- title;
- destination URL;
- clicks;
- active switch;
- overflow menu.

Actions:

- add link;
- edit title;
- edit URL;
- reorder;
- enable/disable;
- duplicate jika fitur lama tersedia;
- schedule jika fitur lama tersedia;
- archive/delete dengan confirmation;
- inspect analytics.

State:

- default;
- hover;
- selected;
- editing;
- saving;
- invalid URL;
- moderation pending;
- moderation rejected;
- disabled;
- drag;
- save failed.

Optimistic UI hanya boleh dipakai jika rollback tersedia.

### 12.6 Add link flow

1. User menekan `Tambah link`.
2. Gunakan modal/sheet/form lama jika sudah ada.
3. Pilih tipe block bila platform mendukung beberapa tipe.
4. Isi title dan destination.
5. Jalankan validation serta moderasi lama.
6. Tampilkan status saving.
7. Setelah berhasil, masukkan ke list dan fokuskan card.
8. Jika gagal, pertahankan input dan tampilkan pesan yang jelas.

### 12.7 Design editor

Controls minimum:

- theme preset;
- background;
- font;
- button style;
- radius;
- shadow;
- profile image;
- page title/bio;
- social links;
- branding visibility sesuai entitlement.

Theme editor harus menghasilkan schema yang kompatibel dengan public page lama. Jika schema baru dibutuhkan, buat adapter dan migration plan; jangan menimpa theme user lama tanpa fallback.

### 12.8 Analytics

Metrics:

- page views;
- unique visitors bila tersedia;
- link clicks;
- CTR;
- conversion bila tersedia;
- top links;
- referrer;
- device;
- country/city hanya jika memang dikumpulkan secara legal.

Rules:

- definisi metric mengikuti backend lama;
- timeframe tidak boleh sekadar mengubah label;
- chart memiliki tooltip dan accessible summary;
- zero state berbeda dari loading;
- failure state menyediakan retry;
- timezone mengikuti setting akun atau behavior lama.

### 12.9 Live preview

- Preview mengambil state editor terbaru.
- Default device: mobile.
- Device toggle mobile/desktop.
- Preview tidak boleh menjalankan external script berbahaya.
- Link pada editor preview dapat dinonaktifkan agar user tidak kehilangan perubahan.
- Gunakan iframe sandbox jika merender public page asli.
- Preview harus menunjukkan theme user lama dengan benar melalui adapter.

### 12.10 Autosave

Jika sistem lama sudah memiliki autosave:

- debounce `500–1000ms`;
- status: `Menyimpan`, `Tersimpan`, `Gagal menyimpan`;
- retry aman;
- jangan kehilangan perubahan saat pindah tab;
- before-unload warning untuk perubahan yang belum tersimpan.

Jika sistem lama menggunakan Save manual, jangan mengubahnya menjadi autosave tanpa desain data dan conflict handling.

---

## 13. Public Creator Page

Walaupun mockup utama berfokus pada homepage dan dashboard, public page wajib ikut audit karena preview bergantung padanya.

Requirements:

- URL lama tetap hidup;
- semua block type lama tetap dirender;
- theme lama memiliki fallback;
- image lazy-loaded;
- link tracking tidak berubah;
- sponsored/affiliate disclosure tetap muncul;
- report button tetap tersedia;
- SEO title, description, OG image, canonical, dan structured data dipertahankan;
- custom domain tetap berfungsi;
- watermark/branding mengikuti entitlement lama;
- page view tidak double-count akibat preview/dashboard.

---

## 14. Component Architecture

```txt
src/
├── components/
│   ├── brand/
│   │   ├── JeonLogo
│   │   └── BrandMark
│   ├── marketing/
│   │   ├── MarketingHeader
│   │   ├── HeroSection
│   │   ├── CreatorMarquee
│   │   ├── FeatureStory
│   │   ├── PricingCard
│   │   └── MarketingFooter
│   ├── dashboard/
│   │   ├── DashboardSidebar
│   │   ├── DashboardTopbar
│   │   ├── DashboardTabs
│   │   ├── LinkCard
│   │   ├── LinkEditor
│   │   ├── ThemeEditor
│   │   ├── AnalyticsPanel
│   │   ├── DevicePreview
│   │   └── PublishStatus
│   └── ui/
│       ├── Button
│       ├── Input
│       ├── Select
│       ├── Switch
│       ├── Dialog
│       ├── Sheet
│       ├── Tabs
│       ├── Toast
│       ├── Skeleton
│       └── EmptyState
├── adapters/
│   ├── legacy-theme-adapter
│   ├── legacy-link-adapter
│   └── legacy-analytics-adapter
└── features/
    ├── links
    ├── themes
    ├── analytics
    ├── publishing
    └── billing
```

Sesuaikan struktur dengan framework lama. Jangan memindahkan semua file hanya agar cocok dengan contoh ini.

---

## 15. Data Contract Rules

Komponen baru menerima normalized view model dari adapter.

```ts
type CreatorLinkView = {
  id: string;
  type: string;
  title: string;
  destinationUrl: string;
  active: boolean;
  position: number;
  clickCount?: number;
  moderationStatus?: "approved" | "pending" | "rejected";
  schedule?: { startsAt?: string; endsAt?: string };
};
```

Adapter bertanggung jawab mengubah response lama ke bentuk view model. Jangan mengubah API agar sesuai dengan nama field contoh.

---

## 16. Responsive Rules

### Desktop ≥ 1200px

- Dashboard tiga kolom.
- Sidebar `226px`.
- Preview `360–390px`.
- Editor fluid.

### Tablet 801–1199px

- Sidebar collapsed `72–80px`.
- Label menu disembunyikan.
- Preview dapat diperkecil.
- Editor minimum `470px`.

### Mobile ≤ 800px

- Sidebar menjadi drawer.
- Preview pindah ke bawah editor atau sheet.
- Header action diringkas.
- Tombol publish tetap terlihat.
- Link row tidak horizontal scroll.
- Drag reorder harus touch-friendly.
- Preview device tidak lebih lebar dari viewport.

Breakpoint harus mengikuti sistem lama jika sudah digunakan secara konsisten.

---

## 17. Interaction and Motion

| Motion | Durasi | Penggunaan |
| --- | ---: | --- |
| Hover | 160–200ms | button/card |
| Panel | 220–300ms | sheet/sidebar |
| Toast | 200ms | notification |
| Marketing reveal | 550–800ms | section entrance |
| Marquee | 30–45s | creator strip |

Rules:

- dashboard tidak memakai animasi scroll dekoratif;
- drag state harus terasa langsung;
- loading bukan sekadar animasi tanpa label;
- hormati `prefers-reduced-motion`;
- gunakan transform/opacity untuk motion;
- hindari layout shift.

---

## 18. UI States

Setiap feature harus memiliki:

- loading;
- empty;
- partial data;
- success;
- validation error;
- server error;
- permission denied;
- offline/network error;
- rate-limited bila relevan;
- feature unavailable;
- subscription locked.

Contoh copy Bahasa Indonesia:

| State | Copy |
| --- | --- |
| Loading | `Memuat halamanmu…` |
| Saving | `Menyimpan perubahan…` |
| Saved | `Semua perubahan tersimpan` |
| Failed | `Perubahan belum tersimpan. Coba lagi.` |
| Empty links | `Belum ada link. Tambahkan link pertamamu.` |
| Locked | `Fitur ini tersedia di paket Creator Plus.` |
| Moderation pending | `Link sedang diperiksa.` |
| Rejected | `Link tidak dapat dipublikasikan.` |

---

## 19. Accessibility

- satu `h1` per halaman;
- semantic landmark;
- focus ring terlihat;
- minimum touch target `44 × 44px`;
- sidebar dapat digunakan keyboard;
- switch memiliki accessible name;
- drag reorder memiliki alternatif move up/down;
- modal memiliki focus trap;
- toast menggunakan live region yang tepat;
- error terhubung ke input dengan `aria-describedby`;
- contrast minimum WCAG AA;
- chart memiliki tabel/ringkasan teks;
- jangan mengandalkan warna saja untuk status;
- reduced motion dihormati.

---

## 20. Security and Privacy

Redesign tidak boleh melemahkan keamanan lama.

- sanitize title, bio, HTML, embed, dan URL;
- gunakan allowlist protocol `https/http` sesuai aturan lama;
- cegah `javascript:` URL;
- preview external content harus sandboxed;
- jangan expose token/API key di client;
- authorization divalidasi server-side;
- upload mengikuti validation MIME/size lama;
- moderation lama tetap dipanggil;
- destructive action memakai confirmation;
- analytics menghormati privacy policy dan consent;
- jangan mencatat sensitive data ke console.

---

## 21. Performance

Target:

- homepage Lighthouse performance ≥ 90;
- dashboard initial load tidak menarik data semua module;
- LCP homepage < 2.5s;
- CLS < 0.1;
- lazy-load mockup di bawah fold;
- route-level code splitting;
- debounce autosave;
- chart library dimuat hanya pada Analytics;
- image memakai WebP/AVIF dan dimension eksplisit;
- jangan menghapus caching lama tanpa audit.

---

## 22. SEO and Analytics

### SEO

- metadata memakai brand `jeon.id`;
- canonical existing dipertahankan;
- OG image baru hanya setelah asset siap;
- sitemap tidak kehilangan public creator pages;
- redirect 301 untuk URL yang benar-benar berubah;
- jangan index dashboard/auth/private page.

### Product analytics

Event lama harus dipetakan, bukan dihapus.

```txt
homepage_cta_clicked
dashboard_opened
link_created
link_updated
link_toggled
link_reordered
theme_changed
preview_opened
publish_started
publish_succeeded
publish_failed
upgrade_clicked
```

Gunakan nama event lama jika sudah ada. Daftar di atas hanya menunjukkan intent.

---

## 23. Migration Strategy

### Phase 0 — Baseline

- backup database;
- catat current routes;
- screenshot website lama;
- simpan Lighthouse baseline;
- catat API contract;
- catat analytics event;
- siapkan rollback.

### Phase 1 — Foundation

- tambahkan token baru;
- buat primitives baru tanpa menghapus komponen lama;
- tambahkan brand jeon.id;
- gunakan feature flag `new_ui` bila tersedia;
- hindari global CSS yang merusak halaman lama.

### Phase 2 — Homepage

- implement header, hero, features, pricing, testimonial, footer;
- hubungkan CTA ke flow lama;
- validasi SEO;
- bandingkan conversion dengan baseline.

### Phase 3 — Dashboard Shell

- sidebar;
- topbar;
- routing dan permission;
- profile/account menu;
- mobile navigation.

### Phase 4 — Link Management

- list link;
- add/edit/toggle/reorder;
- moderation state;
- preview;
- publish/save.

### Phase 5 — Design and Analytics

- legacy theme adapter;
- theme controls;
- analytics metrics/chart;
- entitlement states.

### Phase 6 — Public Page

- renderer compatibility;
- custom domain;
- analytics tracking;
- SEO;
- watermark/branding.

### Phase 7 — Cutover

- regression test;
- staged rollout;
- monitor errors;
- compare metrics;
- remove feature flag setelah stabil;
- komponen lama dihapus terakhir.

---

## 24. Rollback Plan

Sebelum deployment:

- retain versi UI lama;
- pastikan feature flag dapat mematikan UI baru;
- jangan jalankan destructive database migration bersamaan dengan redesign;
- record deployment version;
- pastikan asset lama belum dihapus.

Trigger rollback:

- login failure meningkat;
- publish gagal;
- link publik 404;
- click tracking berhenti;
- payment/upgrade gagal;
- theme user rusak;
- error rate meningkat signifikan;
- performance turun drastis.

---

## 25. Testing Matrix

### Functional

- register/login/logout;
- Google/OAuth bila tersedia;
- create/edit/delete link;
- enable/disable;
- reorder;
- link validation;
- moderation;
- upload image;
- theme change;
- save/publish;
- preview;
- share;
- analytics timeframe;
- plan restriction;
- billing/upgrade;
- custom domain;
- public creator page.

### Browser

- Chrome latest;
- Safari latest;
- Firefox latest;
- mobile Safari;
- Android Chrome.

### Viewport

```txt
320 × 568
390 × 844
768 × 1024
1024 × 768
1440 × 900
```

### Regression

- API snapshot;
- visual regression;
- permission matrix;
- old public URL;
- old shared link;
- email CTA links;
- webhook/payment flow;
- analytics counting.

---

## 26. Visual Acceptance Criteria

- [ ] Semua brand lama telah diganti menjadi `jeon.id`.
- [ ] Homepage mengikuti tema Modern Playful Creator Platform.
- [ ] Heading editorial besar tanpa overflow.
- [ ] Section menggunakan purple, orange, lime, blue, dan pink secara terkontrol.
- [ ] Dashboard lebih tenang dan produktif daripada homepage.
- [ ] Sidebar, editor, dan preview jelas terpisah.
- [ ] Link card memiliki selected, saving, invalid, dan disabled state.
- [ ] Preview mobile memperlihatkan perubahan tema/link.
- [ ] Tidak ada horizontal overflow pada 320px.
- [ ] Focus state terlihat.
- [ ] Dark sidebar memiliki contrast memadai.
- [ ] Icon konsisten dan tidak menggunakan emoji production.

---

## 27. Functional Acceptance Criteria

- [ ] Semua route lama tetap dapat diakses atau memiliki redirect benar.
- [ ] Auth lama tetap berfungsi.
- [ ] Data user lama tetap terbaca.
- [ ] Link lama tetap aktif.
- [ ] Create/edit/toggle/reorder tetap memanggil backend lama.
- [ ] Publish tidak hanya bersifat visual.
- [ ] Analytics tidak double-count.
- [ ] Paket dan entitlement mengikuti backend.
- [ ] Payment tidak berubah.
- [ ] Moderasi link/image tetap berjalan.
- [ ] Theme lama dirender melalui fallback/adapter.
- [ ] Error backend tampil sebagai pesan UI yang benar.
- [ ] Rollback telah diuji sebelum production rollout.

---

## 28. Definition of Done

Redesign dianggap selesai jika:

1. UI baru lolos acceptance criteria visual dan functional.
2. Seluruh core flow lama lolos regression test.
3. Tidak ada perubahan kontrak backend tanpa migration plan.
4. Data existing user tidak hilang atau berubah tidak kompatibel.
5. Production monitoring menunjukkan error rate normal.
6. Lighthouse dan Core Web Vitals tidak lebih buruk dari baseline.
7. Feature flag/rollback tersedia selama stabilization period.
8. Dokumentasi mapping old-to-new selesai.
9. Website lama baru boleh dibersihkan setelah UI baru stabil.

---

## 29. Instruksi Utama untuk Coding Agent

```txt
Anda sedang mengerjakan REDESIGN jeon.id pada aplikasi yang sudah berjalan,
bukan membuat aplikasi baru dari nol.

1. Audit repository, route, API, database, auth, permission, analytics,
   subscription, payment, upload, moderation, dan public creator URL.
2. Buat REDESIGN-AUDIT.md yang memetakan komponen dan behavior lama ke UI baru.
3. Pertahankan seluruh backend contract dan data existing user.
4. Implementasikan design system jeon.id secara terisolasi agar tidak merusak
   halaman lama.
5. Migrasikan bertahap: foundation → homepage → dashboard shell → links →
   design/analytics → public creator page.
6. Gunakan adapter bila model lama berbeda dengan view model baru.
7. Semua tombol wajib terhubung ke action nyata; jangan membuat UI palsu.
8. Pertahankan loading, empty, success, validation, permission, dan error state.
9. Jalankan regression test pada seluruh core flow sebelum cutover.
10. Sediakan feature flag dan rollback plan. Jangan hapus UI lama sebelum
    versi baru stabil di production.
```

---

## 30. Catatan Akhir

Mockup baru menjadi acuan visual, sedangkan repository dan behavior website lama menjadi acuan fungsional. Jika keduanya bertentangan:

1. keamanan dan integritas data menang;
2. kontrak backend lama dipertahankan;
3. desain baru disesuaikan melalui adapter;
4. perubahan behavior harus didokumentasikan dan disetujui;
5. jangan menghapus fitur hanya karena belum terlihat pada mockup.

Dokumen ini sengaja memisahkan **presentation redesign** dari **system rewrite** agar jeon.id dapat memperoleh tampilan baru tanpa kehilangan stabilitas produk lama.
