// Quick Setup -- permintaan langsung pengguna, 11 Agustus 2026: "buatkan 1
// menu saja seperti quick setup dan user disuruh pilih jenis template...
// template ini bukan hanya visual tapi juga blok layout dll". Beda dari
// Tema (60+ preset warna/gradien murni visual, lihat page-themes.ts) --
// template di sini = KOMBINASI tema + bio + tautan starter + (opsional)
// blok konten, dipasang sekaligus lewat satu klik di /dashboard/quick-setup.
//
// Keputusan cakupan (dikonfirmasi langsung ke pengguna): fitur monetisasi
// yang perlu data nyata (harga/durasi/dll) -- Donasi/Event/Kelas/
// Afiliasi -- SENGAJA TIDAK dibuat otomatis (tidak ada cara mengisi nilai
// itu dengan masuk akal tanpa input pengguna). Template hanya membuat:
// (1) tema, (2) saran bio (HANYA kalau bio masih kosong -- tidak menimpa
// konten kreator yang sudah ada), (3) tautan starter (title + URL dasar
// platform, kreator tinggal lengkapi handle/link asli miliknya), (4) blok
// `text`/`contact_form` (satu-satunya block_type yang valid TANPA data
// spesifik pengguna -- lihat validateBlockData di links.go: video butuh
// URL video nyata, faq butuh isi Q&A nyata, image butuh URL gambar nyata,
// maps butuh alamat nyata, jadi keempatnya TIDAK dipakai di sini).
// monetizationHint (kalau ada) cuma teks saran, ditampilkan setelah
// template diterapkan -- BUKAN baris/fitur yang dibuat diam-diam.
//
// Revisi 13 Agustus 2026 (permintaan langsung pengguna): "saya masih ingin
// perbanyakk tema dan layout di quick setup lebih banyak terutama
// background menggunakan wallpaper dan juga background yang bergerak" --
// 12 template dipindah dari tema gradien/warna solid ke 12 preset baru
// (6 wallpaper foto + 6 video, lihat WALLPAPER_THEME_NAMES/
// VIDEO_THEME_NAMES di page-themes.ts) yang cocok konteksnya: mis. "Cafe"
// -> "brew" (foto cafe sungguhan), "Gamer" -> "electric" (video neon),
// "DJ" -> "downtown" (video kota malam). Satu template per tema baru --
// showcase variasi tanpa mengubah SEMUA template sekaligus (46 template
// lainnya tetap gradien/warna solid seperti sebelumnya).
//
// Revisi 26 Agustus 2026 (permintaan langsung pengguna): "saya mau ubah
// semua isi dari quick template tiap template ikuti bloknya seperti yang
// ada di full-stack developer sebagai referensi jangan ikuti sama persis
// tapi ikuti blok sesuai kebutuhan tiap kategori nya" -- pola 3 elemen
// yang tadinya CUMA dipakai 3 template developer/desainer (24 Agustus
// 2026, lihat catatan "Dimas Dev" di bawah) diperluas ke SELURUH 74
// template: (1) deskripsi di tiap kartu tautan (param ke-3 baru di
// link()), (2) baris ikon sosial di bawah bio (social{}), (3) kartu
// "Unggulan" bergambar (project_showcase, lewat showcaseBlock()).
// Dikonfirmasi lewat AskUserQuestion: deskripsi tautan + baris sosial
// ditambahkan ke SEMUA template (selalu relevan, tidak ada downside),
// TAPI kartu showcase HANYA ke kategori yang punya "satu karya/layanan/
// paket unggulan" yang masuk akal ditonjolkan sendirian -- Business/
// Creator/Entertainment/Local/Tourism/sebagian Special. Shop/Education/
// Lifestyle SENGAJA dilewati: Shop sudah punya kartu produk ASLI
// (products[], gambar sungguhan) yang lebih pas jadi sorotan utama --
// showcase generik di situ jadi redundan; Education & Lifestyle isinya
// sudah cukup terwakili lewat kartu tautan+FAQ yang sudah diperkaya
// deskripsi. Dalam kategori yang termasuk cakupan, 3 template dengan
// tujuan SENGAJA sangat minimalis (link-hub/seasonal-greeting/coming-soon
// -- gestur "cuma butuh tautan", bukan "punya karya untuk dipamerkan")
// juga dilewati -- menambah kartu di situ melawan tujuan desainnya.
//
// showcaseBlock() TIDAK lagi otomatis fallback ke gambar dashboard-mockup
// generik (beda dari 3 template developer/desainer yang tetap eksplisit
// memakainya) -- imagePath dibiarkan kosong utk template baru ini supaya
// kartu tampil TANPA gambar (badge+judul+deskripsi+CTA saja, lihat
// `imageUrl && (...)` di PagePreview.tsx yang sudah menangani image_url
// kosong dengan baik) sampai kreator unggah FOTO ASLI lewat panel "Kelola
// gambar" -- foto generik/asal comot utk restoran/villa/gym sungguhan
// justru menyesatkan pengunjung, beda dari mockup dashboard SaaS abstrak
// yang dari awal memang tidak mengklaim proyek/tempat sungguhan tertentu.

import type { ReactElement } from "react";
import type { PagePreviewData } from "@/components/PagePreview";
import type { SocialPlatformKey } from "@/lib/social-links";
import type { ProfileExtras } from "@/lib/api-client";
import { detectLinkIcon } from "@/lib/link-icons";
import {
  IconBadgeCheck,
  IconBook,
  IconBriefcase,
  IconGift,
  IconHeart,
  IconMapPin,
  IconMusicNote,
  IconPlane,
  IconPlus,
  IconBox,
  IconChart,
  IconShield,
  IconTarget,
  IconUsers,
  IconShoppingBag,
  IconSparkle,
} from "@/components/icons";

export interface QuickSetupCategory {
  key: string;
  label: string;
  // Icon -- permintaan langsung pengguna, 27 Agustus 2026 (redesain Quick
  // Setup ala alur "Microsite" s.id: layar pertama "Specify Your Microsite
  // Type" menampilkan grid kategori ikon+label, bukan chip filter seperti
  // sebelumnya). Referensi bentuk {key,label,Icon} SAMA PERSIS dengan
  // CONTENT_TILES (dashboard/links/page.tsx).
  Icon: (props: { className?: string }) => ReactElement;
}

// Kategori "tourism" ditambahkan 17 Agustus 2026 (permintaan langsung
// pengguna: "dari semua foto itu tambahkan layout yang belum ada ke quick
// setup") -- hasil analisa galeri tema kompetitor (folder theme/): template
// s.id secara eksplisit memisahkan "Pariwisata" sebagai kategori sendiri
// (destinasi + peta + itinerary), sesuatu yang TIDAK direpresentasikan sama
// sekali di 8 kategori Jeonme sebelumnya -- "local" fokus ke bisnis jasa
// warga lokal (barbershop/salon/fotografer), bukan agen wisata/pemandu yang
// melayani wisatawan.
export const QUICK_SETUP_CATEGORIES: QuickSetupCategory[] = [
  // "profile" -- permintaan langsung pengguna, 24 September 2026 ("buat
  // quick template yang seperti ini karna ini sesuai tema home page nya",
  // gambar 5 kartu profil): 10 template bergaya kartu profil jeon.id
  // (layout "profile" + tema keluarga Joyful). Ditaruh PALING DEPAN karena
  // paling sesuai identitas visual homepage.
  { key: "profile", label: "Profil Kreator", Icon: IconBadgeCheck },
  { key: "creator", label: "Kreator & Personal Brand", Icon: IconSparkle },
  { key: "business", label: "Bisnis & Profesional", Icon: IconBriefcase },
  { key: "shop", label: "Toko Online", Icon: IconShoppingBag },
  { key: "education", label: "Edukasi", Icon: IconBook },
  { key: "entertainment", label: "Hiburan", Icon: IconMusicNote },
  { key: "local", label: "Usaha Lokal", Icon: IconMapPin },
  { key: "tourism", label: "Wisata & Travel", Icon: IconPlane },
  { key: "lifestyle", label: "Gaya Hidup", Icon: IconHeart },
  { key: "special", label: "Kebutuhan Khusus", Icon: IconGift },
  // "custom" -- permintaan langsung pengguna, 29 Agustus 2026: "di quick
  // setup tambahkan kategori other yaitu custom sendiri". Beda dari 9
  // kategori lain (masing-masing berisi beberapa template niche siap pakai)
  // -- kategori ini SENGAJA cuma berisi SATU template "kosong" (lihat
  // "custom-blank" di QUICK_SETUP_TEMPLATES) untuk kreator yang tidak
  // cocok dengan niche mana pun dan lebih suka mulai dari nol lalu susun
  // sendiri lewat editor Link Bio biasa. Selalu ditaruh PALING TERAKHIR di
  // grid kategori (bukan sesuatu yang perlu ditemukan duluan).
  // 5 kategori berikut ditambahkan 1 September 2026 (permintaan langsung
  // pengguna: "tambahkan 5 kategori lagi dengan benchmark dari s.id
  // linktree dan lynk id"). Dasar tiap kategori diambil dari taksonomi
  // NYATA ketiga platform, bukan karangan:
  //
  // - Linktree /s/templates/categories (diambil langsung dari HTML-nya)
  //   memakai kategori tingkat atas: Fashion, Health and Fitness,
  //   Influencer and Creator, Marketing, Music, Small Business, Social
  //   Media, Sports, Telegram, Whatsapp.
  // - s.id (home.s.id) menyegmentasi audiensnya: Marketing Teams, Content
  //   Creators, Agencies, E-commerce.
  // - Lynk.id (lynk.id memblokir fetch non-browser, jadi lewat riset
  //   sekunder) memposisikan diri di produk digital (ebook, template Canva,
  //   preset Lightroom, template Notion), kelas online, webinar/workshop,
  //   dan konsultasi/mentoring 1-on-1.
  //
  // Yang SENGAJA TIDAK dijadikan kategori baru karena sudah terwakili:
  // Fashion/Music/Social Media (sudah ada di shop/entertainment/creator),
  // Small Business & E-commerce (shop + business), Agencies (business
  // sudah punya template "Agency"), Real Estate & Wedding (sudah di
  // "local"). Gym & Sports Facility tetap di "local" karena itu VENUE,
  // sedangkan "health"/"sports" di bawah ini berisi praktisi/klub.
  { key: "health", label: "Kesehatan & Wellness", Icon: IconShield },
  { key: "sports", label: "Olahraga", Icon: IconTarget },
  { key: "coaching", label: "Coaching & Konsultasi", Icon: IconUsers },
  { key: "digital", label: "Produk Digital", Icon: IconBox },
  { key: "marketing", label: "Marketing & Media Sosial", Icon: IconChart },
  { key: "custom", label: "Lainnya / Kustom", Icon: IconPlus },
];

// PLATFORM_URL -- URL dasar starter per platform (pola sama seperti
// urlTemplate di SUGGESTED_PLATFORMS, dashboard/links/page.tsx). Platform
// yang TIDAK dikenali detectLinkIcon (lib/link-icons.ts) -- Twitch/Discord/
// Shopee/Tokopedia/Apple Music/Apple Podcasts/Google Maps/Website generik
// -- tetap valid dibuat (URL asli, cuma tampil pakai ikon tautan generik,
// bukan ikon brand, sampai lib/link-icons.ts diperluas suatu saat nanti).
const PLATFORM_URL = {
  instagram: "https://instagram.com/",
  tiktok: "https://tiktok.com/@",
  youtube: "https://youtube.com/@",
  whatsapp: "https://wa.me/62",
  spotify: "https://open.spotify.com/",
  telegram: "https://t.me/",
  x: "https://x.com/",
  facebook: "https://facebook.com/",
  linkedin: "https://linkedin.com/in/",
  email: "mailto:",
  twitch: "https://twitch.tv/",
  discord: "https://discord.gg/",
  shopee: "https://shopee.co.id/",
  tokopedia: "https://www.tokopedia.com/",
  appleMusic: "https://music.apple.com/",
  applePodcasts: "https://podcasts.apple.com/",
  googleMaps: "https://maps.google.com/",
  // "https://" polos (cuma skema, tanpa host) DITOLAK validator URL
  // backend (binding:"url", createLinkRequest.URL, links.go) -- bug
  // ditemukan lewat error 400 sungguhan saat menerapkan template Company.
  // Placeholder domain jelas-jelas bukan alamat asli supaya kreator tahu
  // harus diganti, TAPI tetap lolos validasi format URL.
  website: "https://websitekamu.com",
} as const;

type PlatformKey = keyof typeof PLATFORM_URL;

export interface QuickSetupTemplateLink {
  title: string;
  url: string;
  // description -- permintaan langsung pengguna, 24 Agustus 2026 (contoh
  // tangkapan layar template "Dimas Dev"): subjudul opsional di bawah
  // judul (kartu ikon+judul+deskripsi+panah). Kosong/undefined = baris
  // judul tunggal seperti template lain -- lihat linkItem.Description
  // (links.go) & PagePreviewLink.description. Diperluas ke SEMUA template
  // 26 Agustus 2026 (lihat catatan revisi di atas) lewat parameter ke-3
  // baru di link().
  description?: string;
  // iconKey/accentColor/badgeText -- template "Profil Kreator" (24
  // September 2026): ikon galeri, warna tombol per tautan, dan chip
  // harga/label -- diterapkan lewat updateLink setelah createLink.
  iconKey?: string;
  accentColor?: string;
  badgeText?: string;
}

export interface QuickSetupTemplateFaqItem {
  question: string;
  answer: string;
}

export interface QuickSetupTemplateBlock {
  // maps -- lihat catatan lengkap di mapsBlock() di bawah: AMAN dibuat
  // tanpa alamat asli selama embed=false.
  // faq -- permintaan langsung pengguna: "layout beda per kategori" --
  // FAQ dipakai untuk membedakan STRUKTUR konten per kategori (portofolio
  // dapat FAQ soal proyek, toko dapat FAQ soal pembayaran/pengiriman,
  // edukasi dapat FAQ soal kelas, dst), BUKAN cuma tema/judul beda. AMAN
  // dibuat dengan Q&A dummy karena validateBlockData (links.go) cuma
  // butuh question+answer TIDAK KOSONG, tidak ada validasi konten/relevansi.
  // image/video/heading/button SENGAJA TIDAK dipakai -- image/video butuh
  // URL media nyata, heading/button cuma valid & tampil benar di halaman
  // page_type="landing" (builder blok terpisah), BUKAN di halaman bio
  // (lihat catatan cakupan lengkap di atas file ini & renderLinkOrBlock,
  // PagePreview.tsx -- tidak ada case untuk keduanya di situ).
  // project_showcase -- permintaan langsung pengguna, 24 Agustus 2026
  // (contoh tangkapan layar template "Dimas Dev"): kartu "Project
  // Unggulan" (badge+gambar+judul+deskripsi+CTA). AMAN dibuat otomatis
  // (beda dari image/video/dst yang butuh media pengguna nyata) karena
  // gambarnya OPSIONAL (lihat showcaseBlock() & catatan revisi 26 Agustus
  // di atas) -- 3 template developer/desainer memakai aset statis Jeonme
  // sendiri (showcaseImagePath), template lain sengaja dibiarkan tanpa
  // gambar sampai kreator unggah foto asli lewat panel "Kelola gambar".
  type: "text" | "contact_form" | "maps" | "faq" | "project_showcase";
  title: string;
  text?: string;
  url?: string;
  faqItems?: QuickSetupTemplateFaqItem[];
  // description/badgeText/ctaText/showcaseImagePath -- khusus
  // "project_showcase", lihat catatan di atas.
  description?: string;
  badgeText?: string;
  ctaText?: string;
  showcaseImagePath?: string;
}

// QuickSetupTemplateProduct -- permintaan langsung pengguna, 17 Agustus
// 2026: "tambahkan template untuk produk yang siap pakai juga". BEDA dari
// Donasi/Event/Kelas/Afiliasi (SENGAJA tetap tidak dibuat otomatis,
// lihat catatan cakupan di atas) -- produk generik cuma butuh nama/harga/
// deskripsi, TIDAK butuh tanggal/durasi/jadwal yang mustahil disintesis
// masuk akal, jadi placeholder yang JELAS-JELAS contoh (sama semangatnya
// dengan PLATFORM_URL.website di bawah) aman dibuat otomatis.
//
// productKind "digital" (default, ProductHandler.Create, product.go) --
// TETAP BELUM AKTIF sampai kreator mengunggah file sungguhan (tidak pernah
// tampil sebagai bisa dibeli ke publik dalam keadaan draft), aman dibuat
// tanpa data nyata. "payment_link" (dipakai KHUSUS food-beverage di bawah,
// sebagai contoh jalur berbeda) langsung AKTIF tanpa file -- cocok untuk
// kasus kumpulkan pembayaran duluan (DP/voucher/pre-order), bukan produk
// bisa diunduh.
// coverImagePath -- susulan permintaan pengguna: "buat gambar product nya
// ambil dari sumber online yang free saja dan jangan 1 product". Foto
// SUNGGUHAN (bukan placeholder buatan sendiri) dari Wikimedia Commons
// (lisensi CC0/CC-BY/CC-BY-SA/Public Domain, semuanya bebas dipakai) --
// diunduh & disimpan statis di public/quick-setup-products/*.jpg (pola
// SAMA PERSIS dengan wallpaper tema di public/wallpapers/*.jpg: diproses
// SEKALI lalu jadi aset statis, bukan fetch dari internet tiap kali
// template diterapkan) supaya tidak bergantung pada ketersediaan/CORS host
// eksternal saat runtime. Path relatif ke root publik Next.js (dipakai
// LANGSUNG sebagai <img src>, dan di-fetch same-origin lalu diunggah ulang
// lewat uploadProductCover saat template diterapkan -- lihat applyTemplate,
// dashboard/quick-setup/page.tsx).
export interface QuickSetupTemplateProduct {
  name: string;
  description: string;
  priceIDR: number;
  productKind?: "digital" | "payment_link";
  coverImagePath?: string;
}

export interface QuickSetupTemplate {
  key: string;
  category: string;
  label: string;
  description: string;
  theme: string;
  bio: string;
  links: QuickSetupTemplateLink[];
  blocks?: QuickSetupTemplateBlock[];
  // products -- opsional, HANYA diisi utk template yang jelas-jelas jualan
  // (lihat catatan lengkap di QuickSetupTemplateProduct) -- dibuat lewat
  // createProduct saat template diterapkan (dashboard/quick-setup/page.tsx),
  // TIDAK PERNAH dihapus/ditimpa saat kreator mengganti ke template lain
  // (beda dari tautan/blok yang memang diganti total) -- produk account-
  // wide punya siklus hidupnya sendiri, konsisten dgn prinsip "quick setup
  // tidak pernah menghancurkan data monetisasi" yang sudah ada.
  products?: QuickSetupTemplateProduct[];
  monetizationHint?: string;
  // profileExtras -- chip keahlian & baris statistik layout "profile"
  // (migrasi 000109), diterapkan lewat updateMyPageProfileExtras.
  profileExtras?: ProfileExtras;
  // showcaseFirst -- kartu "project_showcase" tampil DI ATAS tautan (bukan
  // di bawah seperti urutan bawaan orderedTemplateItems), sesuai gambar
  // referensi template Profil Kreator.
  showcaseFirst?: boolean;
  // social -- permintaan langsung pengguna, 24 Agustus 2026 (contoh
  // tangkapan layar template "Dimas Dev": baris ikon GitHub/LinkedIn/
  // Website/Email di bawah bio). Sama semangatnya dengan PLATFORM_URL.website
  // di atas -- nilai PLACEHOLDER jelas contoh (mis. "username"), kreator
  // tinggal lengkapi lewat panel Kontak Sosial. Diperluas ke SEMUA 74
  // template 26 Agustus 2026 (lihat catatan revisi di atas) -- key HARUS
  // salah satu dari SocialPlatformKey (social-links.ts), platform lain
  // (Twitch/Discord/Spotify/dll, cuma valid di PLATFORM_URL/`links`) TIDAK
  // bisa dipakai di sini.
  social?: Partial<Record<SocialPlatformKey, string>>;
  // layoutVariant -- permintaan langsung pengguna: "yang saya minta
  // layouting nya juga berbeda", lalu susulan "tambahkan jenis model
  // layout selain 2 yang sudah ada" (jadi 4), lalu susulan lagi "tambahkan
  // lagi 2 bentuk layout lain nya" (jadi 6, semua 12 Agustus 2026).
  //
  // Revisi 13 Agustus 2026 (permintaan langsung pengguna): "saya mau
  // bentuk layout template mockup di tiap kategori itu dibedakan jangan
  // ada yang sama di tiap kategori... bukan hanya mengubah tema ataupun
  // isi blok di dalam nya tapi juga struktur layoutnya, ambil referensi
  // dari web lain nya sesuai dengan kategori yang ada" -- SEBELUMNYA
  // creator & entertainment sama-sama "spotlight", lifestyle & special
  // sama-sama jatuh ke default "centered" (2 tabrakan). Saat itu KEDELAPAN
  // kategori diberi SATU varian struktur unik masing-masing.
  //
  // Revisi 20 Agustus 2026 (permintaan langsung pengguna): "saya mau
  // tambahkan jadi total 15 layout yang berbeda ambil referensi dari web
  // serupa dan buat unik dan sesuai dengan kategorinya" -- 7 varian baru
  // ditambah (split/ticket/headline/ribbon/duo/masthead/portrait, lihat
  // catatan lengkap tiap varian di renderBioHeader, PagePreview.tsx).
  // Dengan 15 varian tapi cuma 9 kategori, "satu varian per kategori"
  // sudah tidak berlaku lagi -- kategori dengan banyak template (Business/
  // Shop/Education/Local/Lifestyle/Creator/Entertainment) sekarang dibagi
  // jadi beberapa SUB-KELOMPOK, tiap sub-kelompok dapat varian sendiri
  // (bukan cuma tema/isi blok beda, strukturnya juga beda) supaya makin
  // variatif TANPA kehilangan "signature look" utama tiap kategori:
  //   - creator       -> "hero" (avatar penuh edge-to-edge -- ref: Linktree
  //                       Hero/bio Instagram) untuk persona umum (Creator
  //                       Profile/Influencer/Personal Branding/Public
  //                       Figure); "portrait" (foto tegak ala poster gig,
  //                       ref: cover album/poster konser) khusus Streamer &
  //                       Gamer -- kesan "karakter/panggung" lebih kuat.
  //   - business      -> "banner" (avatar kecil rata kiri sebaris nama+bio
  //                       -- ref: header profil LinkedIn) untuk profil umum
  //                       (Business Profile/Company/Freelancer); "split"
  //                       (2 kolom, foto persegi kiri + identitas kanan --
  //                       ref: about-page Carrd/Notion) untuk yang butuh
  //                       kesan lebih formal/CV (Consultant/Agency/
  //                       Professional CV).
  //   - shop          -> "card" (identitas dibungkus kartu bertema, avatar
  //                       menonjol -- ref: header toko Shopify) untuk toko
  //                       umum (Online Store/Small Business); "ribbon"
  //                       (badge aksen + pita nama selebar penuh, ref:
  //                       badge produk marketplace) untuk yang visual/
  //                       retail (Fashion/Beauty Store); "masthead" (pita
  //                       warna berisi identitas langsung, ref: cover photo
  //                       Facebook Page) untuk yang berkesan toko fisik
  //                       (Food & Beverage/Affiliate Store).
  //   - education     -> "minimal" (avatar kecil sebaris nama, konten jadi
  //                       pusat perhatian -- ref: header dokumen Notion)
  //                       untuk Teacher/Tutor; "headline" (teks dulu, foto
  //                       kecil menyusul -- ref: header profil Substack/
  //                       Medium) untuk yang lebih ke konten/pesan (Course
  //                       Creator/Student/Education Brand).
  //   - entertainment -> "spotlight" (avatar besar dalam badge bulat --
  //                       ref: artwork bulat Spotify/cover circle Apple
  //                       Podcasts) untuk Artist/Podcaster/Content Creator;
  //                       "portrait" (ref: poster konser/cover album) untuk
  //                       Musician & DJ -- lebih pas kesan "tampil di
  //                       panggung"nya.
  //   - local         -> "cover" (pita warna ala foto sampul, avatar
  //                       menindih tepi bawahnya -- ref: cover photo
  //                       Facebook Page/Google Business Profile) untuk
  //                       Restaurant/Cafe/Event Organizer; "masthead"
  //                       untuk jasa dengan kesan "papan nama toko fisik"
  //                       (Barbershop/Salon/Photographer); "ticket" (ref:
  //                       boarding pass/tiket acara) khusus Sports Facility
  //                       (booking lapangan = reservasi); "spotlight" tetap
  //                       dipakai Nightlife Venue (kesan panggung/showcase).
  //   - tourism       -> "hero" untuk Travel Agency, "polaroid" untuk Tour
  //                       Guide -- SUDAH bervariasi sejak awal (kategori
  //                       ini cuma 2 template), tidak diubah.
  //   - lifestyle     -> "polaroid" (avatar KOTAK dibingkai putih & sedikit
  //                       dimiringkan ala foto polaroid -- ref: cover board
  //                       Pinterest/estetika feed VSCO) untuk konten visual
  //                       (Travel Blogger/Lifestyle Creator/Fashion
  //                       Creator); "duo" (avatar+nama jadi satu chip pil,
  //                       ref: kartu profil Discord/WhatsApp Business)
  //                       untuk persona "personal trainer/consultant"
  //                       (Fitness Coach/Beauty Creator).
  //   - special       -> "centered" (bawaan, gaya Linktree klasik -- paling
  //                       pas utk kategori hub/serba-guna seperti "Link
  //                       Hub"/"Coming Soon" yang memang tidak butuh
  //                       identitas visual berat) untuk semua template
  //                       KECUALI Event, yang dapat "ticket" (ref: boarding
  //                       pass/tiket acara) -- struktur selaras isi
  //                       ("Event" = literally soal tiket).
  // Kosong/undefined = "centered".
  layoutVariant?:
    | "centered"
    | "banner"
    | "card"
    | "spotlight"
    | "cover"
    | "minimal"
    | "hero"
    | "polaroid"
    | "split"
    | "ticket"
    | "headline"
    | "ribbon"
    | "duo"
    | "masthead"
    | "portrait"
    | "profile"
    | "billboard";
}

// Judul default per platform -- permintaan langsung pengguna (referensi
// tangkapan layar halaman Linktree sungguhan): "MAKSUDNYA LANGSUNG DATA
// SEPERTI INI SAJAA BENTUKNYAA LANGSUNG JADI GITU" -- judul platform
// polos ("Instagram", "WhatsApp") diganti frasa ajakan (CTA) natural ala
// referensi ("Ikuti Update Kami", "Chat via WhatsApp"), bukan cuma nama
// platform. Template masih bisa override lewat argumen kedua `link()`
// untuk konteks yang lebih spesifik per template (mis. "Pesan Menu" utk
// F&B, bukan "Chat via WhatsApp" generik). Argumen ke-3 (description) --
// susulan revisi 26 Agustus 2026, lihat catatan lengkap di atas file ini
// & QuickSetupTemplateLink.description -- subjudul kartu, konteksnya
// beda-beda tiap template walau platformnya sama.
function link(platform: PlatformKey, title?: string, description?: string): QuickSetupTemplateLink {
  const labels: Record<PlatformKey, string> = {
    instagram: "Follow di Instagram",
    tiktok: "Follow di TikTok",
    youtube: "Tonton di YouTube",
    whatsapp: "Chat via WhatsApp",
    spotify: "Dengerin di Spotify",
    telegram: "Gabung Telegram",
    x: "Follow di X",
    facebook: "Kunjungi Facebook",
    linkedin: "Terhubung di LinkedIn",
    email: "Kirim Email",
    twitch: "Nonton di Twitch",
    discord: "Gabung Discord",
    shopee: "Belanja di Shopee",
    tokopedia: "Belanja di Tokopedia",
    appleMusic: "Dengerin di Apple Music",
    applePodcasts: "Dengerin di Apple Podcasts",
    googleMaps: "Lihat Lokasi",
    website: "Kunjungi Website",
  };
  return { title: title ?? labels[platform], url: PLATFORM_URL[platform], description };
}

// mapsBlock -- lihat catatan lengkap di QuickSetupTemplateBlock.type di
// atas. embed SENGAJA selalu false (direct link, bukan popup peta) --
// mode embed butuh koordinat hasil geocoding alamat NYATA (lihat
// resolveMapsEmbedCoords, links.go), tidak bisa disintesis di sini.
function mapsBlock(title = "Lokasi Kami"): QuickSetupTemplateBlock {
  return { type: "maps", title, url: PLATFORM_URL.googleMaps };
}

// faqBlock -- lihat catatan lengkap di QuickSetupTemplateBlock.type di
// atas. Judul blok "Pertanyaan Umum" konsisten di semua template (nama
// generik netral), isi Q&A yang membedakan konteks per kategori.
function faqBlock(items: QuickSetupTemplateFaqItem[], title = "Pertanyaan Umum"): QuickSetupTemplateBlock {
  return { type: "faq", title, faqItems: items };
}

// showcaseBlock -- lihat catatan lengkap di QuickSetupTemplateBlock.type
// ("project_showcase"). url WAJIB host asli (placeholder domain sama
// seperti PLATFORM_URL.website di atas, "https://" polos ditolak
// validator backend). imagePath OPSIONAL -- beda dari sebelumnya (24
// Agustus 2026) yang otomatis fallback ke dashboard-mockup.jpg kalau tidak
// diisi, sejak revisi 26 Agustus 2026 (lihat catatan lengkap di atas file
// ini) dibiarkan kosong APA ADANYA kalau tidak dioper: 3 template
// developer/desainer tetap eksplisit mengoper path aset statisnya sendiri,
// template lain sengaja TANPA gambar (kartu badge+judul+deskripsi+CTA
// saja) sampai kreator unggah foto asli.
function showcaseBlock(args: {
  title: string;
  description: string;
  badgeText?: string;
  ctaText?: string;
  url: string;
  imagePath?: string;
}): QuickSetupTemplateBlock {
  return {
    type: "project_showcase",
    title: args.title,
    description: args.description,
    badgeText: args.badgeText,
    ctaText: args.ctaText,
    url: args.url,
    showcaseImagePath: args.imagePath,
  };
}

// OrderedTemplateItem -- bentuk SIAP RENDER (dipakai LANGSUNG oleh
// quick-setup/page.tsx untuk membangun PagePreviewData/payload createLink/
// createBlock, tidak perlu logika pemetaan block_data terpisah lagi di
// sana) supaya urutan & isi yang terlihat di pratinjau SELALU sama persis
// dengan yang benar-benar dibuat applyTemplate.
export interface OrderedTemplateItem {
  title: string;
  blockType: "link" | "text" | "contact_form" | "maps" | "faq" | "project_showcase";
  url: string;
  text?: string;
  faqItems?: QuickSetupTemplateFaqItem[];
  description?: string;
  badgeText?: string;
  ctaText?: string;
  showcaseImagePath?: string;
  iconKey?: string;
  accentColor?: string;
  // linkBadgeText -- chip harga tautan biasa (beda dari badgeText milik
  // project_showcase yang artinya label kartu).
  linkBadgeText?: string;
}

// CATEGORY_ACCENT_PALETTE + inferTemplateIconKey -- permintaan langsung
// pengguna 25 September 2026 (hasil audit visual template: cuma 18/148
// template yg tombolnya berwarna & berikon, 12 template masih jatuh ke
// ikon rantai generik): "give every template gallery icons and per-button
// colours, using a palette per category". Diterapkan TERPUSAT di
// orderedTemplateItems (bukan ditulis ulang di 130+ template satu per
// satu) sehingga pratinjau & hasil "Terapkan Template" otomatis identik.
// Template yang SUDAH mengatur gaya tombolnya sendiri (Profil Kreator,
// kartu homepage -- ada accentColor/iconKey eksplisit) tidak disentuh.
// Warna diambil dari keluarga warna jeon.id (lime/lavender/pink/koral/
// langit/mint); teks di atasnya dipilih readableTextOn (PagePreview.tsx)
// berdasarkan rasio kontras WCAG, jadi warna terang maupun pekat aman.
const CATEGORY_ACCENT_PALETTE: Record<string, string[]> = {
  creator: ["#ffafd0", "#d9ceff", "#d7ff60"],
  business: ["#8ad5ff", "#d9ceff", "#e2e8f0"],
  shop: ["#ff6448", "#ffd166", "#ffafd0"],
  education: ["#ffd166", "#8ad5ff", "#83f98b"],
  entertainment: ["#5b3fe0", "#ff6448", "#ffafd0"],
  local: ["#ffb86b", "#83f98b", "#ffd166"],
  tourism: ["#5eead4", "#8ad5ff", "#ffd166"],
  lifestyle: ["#ffafd0", "#ffd6c9", "#d9ceff"],
  special: ["#d7ff60", "#ffafd0", "#8ad5ff"],
  health: ["#83f98b", "#8ad5ff", "#d9ceff"],
  sports: ["#ff6448", "#d7ff60", "#8ad5ff"],
  coaching: ["#d9ceff", "#ffd166", "#83f98b"],
  digital: ["#5b3fe0", "#d7ff60", "#8ad5ff"],
  marketing: ["#ff6448", "#ffd166", "#5b3fe0"],
};

// Urutan penting: kata kunci yang lebih spesifik dicek lebih dulu (mis.
// "newsletter" sebelum "baca/artikel", "menu" sebelum "paket").
const TEMPLATE_ICON_RULES: [RegExp, string][] = [
  [/\b(cv|resume|deck|media kit)\b|\.pdf/i, "file-text"],
  [/newsletter|email/i, "mail"],
  [/artikel|blog|baca|insight|cerita/i, "newspaper"],
  [/portofolio|portfolio|proyek|project|karya|studi kasus/i, "briefcase"],
  [/materi|kelas|kursus|belajar|program|webinar/i, "graduation-cap"],
  [/jadwal|booking|reservasi|janji|daftar|konsultasi/i, "calendar"],
  [/menu|makan|pesan antar/i, "utensils"],
  [/tiket|event|acara|manggung|konser|undangan/i, "ticket"],
  [/trip|wisata|pendakian|destinasi|tur\b|tour/i, "plane"],
  [/selam|diving|snorkel/i, "waves"],
  [/donasi|kampanye|galang|terkumpul/i, "heart-handshake"],
  [/katalog|belanja|beli|produk|toko|shop|order/i, "shopping-bag"],
  [/promo|ongkir|diskon|voucher/i, "percent"],
  [/paket|harga|layanan|pricelist/i, "tag"],
  [/lokasi|alamat|peta/i, "map-pin"],
  [/tentang|profil/i, "user"],
  [/coba|demo|dashboard|mulai/i, "rocket"],
  [/live|streaming|tonton|video/i, "play-circle"],
];

// inferTemplateIconKey -- ikon galeri HANYA utk tautan yang URL-nya tidak
// dikenali detectLinkIcon (jatuh ke ikon rantai generik). Tautan platform
// (wa.me, instagram, dll) tetap memakai logo aslinya.
function inferTemplateIconKey(title: string, url: string): string | undefined {
  if (!detectLinkIcon(url).isFallback) return undefined;
  const text = `${title} ${url}`;
  for (const [re, key] of TEMPLATE_ICON_RULES) if (re.test(text)) return key;
  return "globe";
}

// orderedTemplateItems -- SATU sumber kebenaran urutan tampil: blok
// "maps" ("Lokasi Kami") PALING ATAS, lalu tautan biasa, lalu blok lain
// (text/faq/contact_form/project_showcase) PALING BAWAH -- pola yang sama
// persis dengan referensi Linktree sungguhan yang diberikan pengguna
// (lokasi di atas, kontak/sosial di tengah, formulir "Kritik dan Saran"
// di bawah).
export function orderedTemplateItems(t: QuickSetupTemplate): OrderedTemplateItem[] {
  const mapsBlocks = (t.blocks ?? []).filter((b) => b.type === "maps");
  const otherBlocks = (t.blocks ?? []).filter((b) => b.type !== "maps");
  const toBlockItem = (b: QuickSetupTemplateBlock): OrderedTemplateItem => ({
    title: b.title,
    blockType: b.type,
    url: b.url ?? "",
    text: b.text,
    faqItems: b.faqItems,
    description: b.description,
    badgeText: b.badgeText,
    ctaText: b.ctaText,
    showcaseImagePath: b.showcaseImagePath,
  });
  const autoStyle = !t.links.some((l) => l.accentColor || l.iconKey);
  const palette = autoStyle ? CATEGORY_ACCENT_PALETTE[t.category] : undefined;
  const linkItems: OrderedTemplateItem[] = t.links.map((l, i) => ({
    title: l.title,
    blockType: "link" as const,
    url: l.url,
    description: l.description,
    iconKey: l.iconKey ?? (autoStyle ? inferTemplateIconKey(l.title, l.url) : undefined),
    accentColor: l.accentColor ?? (palette ? palette[i % palette.length] : undefined),
    linkBadgeText: l.badgeText,
  }));
  if (t.showcaseFirst) {
    return [
      ...mapsBlocks.map((b) => ({ title: b.title, blockType: "maps" as const, url: b.url ?? "" })),
      ...otherBlocks.filter((b) => b.type === "project_showcase").map(toBlockItem),
      ...linkItems,
      ...otherBlocks.filter((b) => b.type !== "project_showcase").map(toBlockItem),
    ];
  }
  return [
    ...mapsBlocks.map((b) => ({ title: b.title, blockType: "maps" as const, url: b.url ?? "" })),
    ...linkItems,
    ...otherBlocks.map((b) => ({
      title: b.title,
      blockType: b.type,
      url: b.url ?? "",
      text: b.text,
      faqItems: b.faqItems,
      description: b.description,
      badgeText: b.badgeText,
      ctaText: b.ctaText,
      showcaseImagePath: b.showcaseImagePath,
    })),
  ];
}

// buildQuickSetupPreviewData -- SATU fungsi dipakai baik untuk mockup kecil
// di galeri /dashboard/quick-setup MAUPUN kartu Template di homepage
// (components/landing/Templates.tsx, permintaan langsung pengguna 23
// Agustus 2026: "tampilkan sama persis seperti yang ada di quick template
// beserta isi blok nya") supaya keduanya selalu identik -- bukan dua
// implementasi terpisah yang bisa tidak sinkron. Dipindah dari
// dashboard/quick-setup/page.tsx (SEBELUMNYA lokal di sana) ke sini,
// SATU sumber kebenaran yang sama seperti orderedTemplateItems di atas.
export function buildQuickSetupPreviewData(t: QuickSetupTemplate, username: string, displayName: string, avatarUrl: string): PagePreviewData {
  return {
    username,
    displayName,
    bio: t.bio,
    avatarUrl,
    theme: t.theme,
    layoutVariant: t.layoutVariant ?? "centered",
    profileExtras: t.profileExtras,
    // id = indeks + judul, BUKAN judul saja -- audit visual template 25
    // September 2026: "Tempat Hiburan Malam" punya tautan DAN formulir
    // sama-sama berjudul "Reservasi Meja"; id kembar = key React kembar,
    // dan satu kartu basi ikut "nyangkut" di pratinjau 6 template
    // berikutnya sampai halaman dimuat ulang.
    links: orderedTemplateItems(t).map((item, i) => ({
      id: `${i}:${item.title}`,
      title: item.title,
      url: item.url,
      blockType: item.blockType,
      blockData:
        item.blockType === "maps"
          ? { embed: false }
          : item.blockType === "text"
          ? { text: item.text }
          : item.blockType === "faq"
          ? { items: item.faqItems }
          : item.blockType === "project_showcase"
          ? { badge_text: item.badgeText, cta_text: item.ctaText, image_url: item.showcaseImagePath }
          : {},
      // description -- dipakai ulang utk tautan biasa (subjudul) MAUPUN
      // "project_showcase" (paragraf) -- lihat catatan lengkap di
      // QuickSetupTemplateLink.description.
      description: item.description,
      iconKey: item.iconKey,
      accentColor: item.accentColor,
      badgeText: item.linkBadgeText,
    })),
    products: (t.products ?? []).map((p, i) => ({ id: `${i}:${p.name}`, name: p.name, price_idr: p.priceIDR, cover_image_url: p.coverImagePath })),
    social: t.social,
  };
}

export const QUICK_SETUP_TEMPLATES: QuickSetupTemplate[] = [
  // ---------- Profil Kreator (24 September 2026) ----------
  // Permintaan langsung pengguna: template bergaya kartu profil seperti
  // gambar referensi homepage (Full-Stack Developer, Penulis Buku, Guru,
  // Freelancer, Toko Online) + 5 niche tambahan. Semuanya layout "profile"
  // (PagePreview.tsx) dgn tema keluarga Joyful, chip & statistik
  // (profileExtras), kartu unggulan bergambar DI ATAS tombol
  // (showcaseFirst), tombol warna palet brand (accentColor), dan chip
  // harga (badgeText). Foto kartu unggulan CC0, lihat
  // public/quick-setup-showcase/CREDITS.md.
  {
    key: "profile-fullstack-developer",
    category: "profile",
    layoutVariant: "profile",
    label: "Full-Stack Developer",
    description: "Proyek unggulan, GitHub, CV, dan jasa pembuatan website",
    theme: "joyful",
    bio: "Full-Stack Developer",
    social: { github: "username", linkedin: "username", website: "websitekamu.com" },
    profileExtras: { chips: [{ label: "React", icon: "brand-react" }, { label: "Laravel", icon: "brand-laravel" }, { label: "Go", icon: "brand-go" }], stats: [{ value: "48", label: "Proyek" }, { value: "6", label: "Tahun" }, { value: "4.9 ★", label: "Rating" }] },
    showcaseFirst: true,
    links: [
      { title: "Lihat GitHub", url: "https://github.com/username", iconKey: "brand-github", accentColor: "#d7ff60" },
      { title: "Unduh CV", url: "https://websitekamu.com/cv.pdf", iconKey: "file-text", accentColor: "#d9ceff" },
      { title: "Buat Website", url: "https://wa.me/62", description: "Website profesional untuk bisnis atau personal brand kamu.", iconKey: "laptop", badgeText: "Mulai Rp3jt" },
    ],
    blocks: [
      showcaseBlock({
        title: "Sistem Ticketing Modern",
        description: "Aplikasi manajemen tiket untuk tim modern, dengan notifikasi real-time dan laporan lengkap.",
        badgeText: "Proyek Unggulan",
        ctaText: "Lihat proyek",
        url: "https://websitekamu.com/proyek",
        imagePath: "/quick-setup-showcase/dashboard-mockup.jpg",
      }),
    ],
    monetizationHint: "Tambahkan Produk Digital (paket review kode, template project) di menu Toko untuk penghasilan tambahan.",
  },
  {
    key: "profile-book-author",
    category: "profile",
    layoutVariant: "profile",
    label: "Penulis Buku",
    description: "Buku terbaru, artikel, newsletter, dan media sosial",
    theme: "joyful",
    bio: "Penulis · Editor · Storyteller",
    social: { instagram: "username", youtube: "@namachannel", tiktok: "username", website: "websitekamu.com" },
    profileExtras: { chips: [], stats: [{ value: "5", label: "Buku" }, { value: "120K", label: "Pembaca" }, { value: "4.8", label: "Rating" }] },
    showcaseFirst: true,
    links: [
      { title: "Beli Bukunya", url: "https://websitekamu.com/beli", iconKey: "shopping-bag", accentColor: "#ff6448" },
      { title: "Baca Artikel", url: "https://websitekamu.com/blog", iconKey: "newspaper", accentColor: "#d9ceff" },
      { title: "Newsletter Mingguan", url: "https://websitekamu.com/newsletter", description: "Rekomendasi buku, tulisan baru, dan cerita di balik layar.", iconKey: "mail", badgeText: "Gratis" },
    ],
    blocks: [
      showcaseBlock({
        title: "Pulang Sebelum Senja",
        description: "Tentang rumah, kehilangan, dan keberanian untuk kembali.",
        badgeText: "Buku Terbaru",
        ctaText: "Baca sinopsis",
        url: "https://websitekamu.com/buku",
        imagePath: "/quick-setup-showcase/book-writer.jpg",
      }),
    ],
    monetizationHint: "Jual e-book atau bab bonus langsung dari menu Toko sebagai Produk Digital.",
  },
  {
    key: "profile-teacher",
    category: "profile",
    layoutVariant: "profile",
    label: "Guru",
    description: "Info kelas, materi gratis, jadwal, dan les privat",
    theme: "joyful",
    bio: "Guru Matematika & Sains",
    social: { instagram: "username", youtube: "@namachannel", whatsapp: "62812xxxxxxxx" },
    profileExtras: { chips: [{ label: "Matematika", icon: "calculator" }, { label: "Sains", icon: "lightbulb" }, { label: "Edukasi", icon: "book-open" }], stats: [{ value: "320", label: "Siswa" }, { value: "86", label: "Materi" }, { value: "4.9", label: "Rating" }] },
    showcaseFirst: true,
    links: [
      { title: "Lihat Materi Gratis", url: "https://websitekamu.com/materi", iconKey: "book-open", accentColor: "#d7ff60" },
      { title: "Jadwal Kelas", url: "https://websitekamu.com/jadwal", iconKey: "calendar-days", accentColor: "#8ad5ff" },
      { title: "Private Class Online", url: "https://wa.me/62", description: "Sesi 1-on-1 sesuai kebutuhanmu.", iconKey: "video", badgeText: "Rp75K" },
    ],
    blocks: [
      showcaseBlock({
        title: "Matematika Jadi Mudah",
        description: "Konsep simpel, contoh nyata, dan latihan interaktif.",
        badgeText: "Kelas Terbaru",
        ctaText: "Lihat kelas",
        url: "https://websitekamu.com/kelas",
        imagePath: "/quick-setup-showcase/teacher-class.jpg",
      }),
    ],
    monetizationHint: "Buka Kelas & Kursus berbayar atau jual modul latihan sebagai Produk Digital di menu Toko.",
  },
  {
    key: "profile-freelancer-designer",
    category: "profile",
    layoutVariant: "profile",
    label: "Freelancer",
    description: "Portofolio, layanan, harga, dan konsultasi",
    theme: "joyful",
    bio: "Freelance UI/UX Designer",
    social: { instagram: "username", linkedin: "username", website: "websitekamu.com" },
    profileExtras: { chips: [{ label: "Figma", icon: "brand-figma" }, { label: "UI Design", icon: "palette" }, { label: "UX Research", icon: "target" }], stats: [{ value: "92", label: "Proyek" }, { value: "68", label: "Klien" }, { value: "5.0", label: "Rating" }] },
    showcaseFirst: true,
    links: [
      { title: "Lihat Portofolio", url: "https://behance.net/username", iconKey: "brand-behance", accentColor: "#5b3fe0" },
      { title: "Paket Layanan", url: "https://websitekamu.com/layanan", iconKey: "layout-grid", accentColor: "#ffafd0" },
      { title: "Konsultasi Desain", url: "https://wa.me/62", description: "Diskusi kebutuhan proyekmu.", iconKey: "calendar", badgeText: "30 Menit" },
    ],
    blocks: [
      showcaseBlock({
        title: "Redesign Aplikasi Finansial",
        description: "Desain UI/UX untuk aplikasi keuangan yang lebih simpel, aman, dan modern.",
        badgeText: "Portofolio Pilihan",
        ctaText: "Lihat studi kasus",
        url: "https://websitekamu.com/studi-kasus",
        imagePath: "/quick-setup-showcase/app-design.jpg",
      }),
    ],
    monetizationHint: "Jual UI kit atau template Figma sebagai Produk Digital di menu Toko.",
  },
  {
    key: "profile-online-store",
    category: "profile",
    layoutVariant: "profile",
    label: "Toko Online",
    description: "Produk laris, katalog, marketplace, dan promo",
    theme: "joyful",
    bio: "Aksesori Lokal Penuh Warna",
    social: { instagram: "username", tiktok: "username", whatsapp: "62812xxxxxxxx" },
    profileExtras: { chips: [], stats: [{ value: "12K", label: "Pembeli" }, { value: "180", label: "Produk" }, { value: "4.9", label: "Rating" }] },
    showcaseFirst: true,
    links: [
      { title: "Belanja Sekarang", url: "https://shopee.co.id/username", iconKey: "shopping-cart", accentColor: "#ffafd0" },
      { title: "Katalog Terbaru", url: "https://websitekamu.com/katalog", iconKey: "layout-grid", accentColor: "#8ad5ff" },
      { title: "Gratis Ongkir", url: "https://websitekamu.com/promo", description: "Min. belanja Rp150K ke seluruh Indonesia.", iconKey: "package", badgeText: "Promo" },
    ],
    blocks: [
      showcaseBlock({
        title: "Everyday Mini Bag",
        description: "Praktis, ringan, dan cocok untuk segala aktivitas.",
        badgeText: "Paling Laku",
        ctaText: "Lihat produk",
        url: "https://websitekamu.com/produk",
        imagePath: "/quick-setup-showcase/leather-bag.jpg",
      }),
    ],
    products: [
      {
        name: "Everyday Mini Bag (Contoh)",
        description: "Ganti dengan produk aslimu -- ini contoh draft, belum aktif sampai kamu unggah file & sesuaikan harga di menu Toko.",
        priceIDR: 189000,
        coverImagePath: "/quick-setup-products/fashion-store-1.jpg",
      },
      {
        name: "Koleksi Aksesori Terbaru (Contoh)",
        description: "Ganti dengan produk aslimu -- ini contoh draft, belum aktif sampai kamu unggah file & sesuaikan harga di menu Toko.",
        priceIDR: 79000,
        coverImagePath: "/quick-setup-products/fashion-store-2.jpg",
      },
    ],
    monetizationHint: "Lengkapi produk di menu Toko -- pembeli bisa checkout langsung tanpa pindah ke marketplace.",
  },
  {
    key: "profile-content-creator",
    category: "profile",
    layoutVariant: "profile",
    label: "Content Creator",
    description: "Video terbaru, kolaborasi brand, dan media kit",
    theme: "spark",
    bio: "Content Creator · Lifestyle & Travel",
    social: { instagram: "username", tiktok: "username", youtube: "@namachannel" },
    profileExtras: { chips: [{ label: "Vlog", icon: "video" }, { label: "Travel", icon: "plane" }, { label: "Kuliner", icon: "utensils" }], stats: [{ value: "250K", label: "Followers" }, { value: "1.2K", label: "Video" }, { value: "80+", label: "Brand" }] },
    showcaseFirst: true,
    links: [
      { title: "Tonton di YouTube", url: "https://youtube.com/@namachannel", iconKey: "brand-youtube", accentColor: "#d7ff60" },
      { title: "Kolaborasi Brand", url: "https://wa.me/62", iconKey: "handshake", accentColor: "#d9ceff" },
      { title: "Media Kit", url: "https://websitekamu.com/mediakit", description: "Statistik audiens & rate card terbaru.", iconKey: "file-text", badgeText: "PDF" },
    ],
    blocks: [
      showcaseBlock({
        title: "Seminggu Keliling Flores",
        description: "Itinerary lengkap, budget, dan spot tersembunyi yang wajib dikunjungi.",
        badgeText: "Video Terbaru",
        ctaText: "Tonton sekarang",
        url: "https://youtube.com/@namachannel",
        imagePath: "/quick-setup-showcase/video-creator.jpg",
      }),
    ],
    monetizationHint: "Aktifkan Brand & Sponsor atau jual preset/itinerary sebagai Produk Digital di menu Toko.",
  },
  {
    key: "profile-photographer",
    category: "profile",
    layoutVariant: "profile",
    label: "Fotografer",
    description: "Portofolio foto, paket sesi, dan booking",
    theme: "breezy",
    bio: "Fotografer Wedding & Portrait",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx", website: "websitekamu.com" },
    profileExtras: { chips: [{ label: "Wedding", icon: "heart" }, { label: "Portrait", icon: "camera" }, { label: "Produk", icon: "package" }], stats: [{ value: "300+", label: "Sesi" }, { value: "8", label: "Tahun" }, { value: "5.0", label: "Rating" }] },
    showcaseFirst: true,
    links: [
      { title: "Lihat Portofolio", url: "https://websitekamu.com/portfolio", iconKey: "images", accentColor: "#ff6448" },
      { title: "Paket & Harga", url: "https://websitekamu.com/paket", iconKey: "tags", accentColor: "#d7ff60" },
      { title: "Booking Sesi Foto", url: "https://wa.me/62", description: "Cek tanggal kosong & konsultasi konsep.", iconKey: "calendar-days", badgeText: "Mulai Rp1,5jt" },
    ],
    blocks: [
      showcaseBlock({
        title: "Golden Hour di Pantai",
        description: "Sesi prewedding saat matahari terbenam, 120 foto teredit.",
        badgeText: "Karya Pilihan",
        ctaText: "Lihat galeri",
        url: "https://websitekamu.com/galeri",
        imagePath: "/quick-setup-showcase/photographer.jpg",
      }),
    ],
    monetizationHint: "Jual preset Lightroom sebagai Produk Digital atau terima DP booking lewat Payment Link di menu Toko.",
  },
  {
    key: "profile-musician",
    category: "profile",
    layoutVariant: "profile",
    label: "Musisi",
    description: "Rilisan terbaru, jadwal manggung, dan booking",
    theme: "dreamy",
    bio: "Singer-Songwriter · Akustik",
    social: { instagram: "username", youtube: "@namachannel", tiktok: "username" },
    profileExtras: { chips: [{ label: "Akustik", icon: "music" }, { label: "Pop", icon: "music-2" }, { label: "Live", icon: "mic" }], stats: [{ value: "1.2M", label: "Streams" }, { value: "24", label: "Lagu" }, { value: "120", label: "Show" }] },
    showcaseFirst: true,
    links: [
      { title: "Dengar di Spotify", url: "https://open.spotify.com", iconKey: "brand-spotify", accentColor: "#d7ff60" },
      { title: "Jadwal Manggung", url: "https://websitekamu.com/jadwal", iconKey: "ticket", accentColor: "#d9ceff" },
      { title: "Booking Acara", url: "https://wa.me/62", description: "Wedding, kafe, dan acara kantor.", iconKey: "mic", badgeText: "Tersedia" },
    ],
    blocks: [
      showcaseBlock({
        title: "Rumah di Ujung Jalan",
        description: "Single terbaru, kini tersedia di semua platform musik.",
        badgeText: "Rilisan Baru",
        ctaText: "Dengarkan",
        url: "https://open.spotify.com",
        imagePath: "/quick-setup-showcase/guitar-music.jpg",
      }),
    ],
    monetizationHint: "Jual tiket konser lewat Event atau terima dukungan penggemar lewat Donasi di menu Toko.",
  },
  {
    key: "profile-cafe",
    category: "profile",
    layoutVariant: "profile",
    label: "Kafe & Kuliner",
    description: "Menu favorit, pesan antar, lokasi, dan reservasi",
    theme: "cheer",
    bio: "Kopi & Roti Rumahan",
    social: { instagram: "username", tiktok: "username", whatsapp: "62812xxxxxxxx" },
    profileExtras: { chips: [{ label: "Kopi", icon: "coffee" }, { label: "Pastry", icon: "croissant" }, { label: "Wi-Fi", icon: "wifi" }], stats: [{ value: "4.8", label: "Rating" }, { value: "25", label: "Menu" }, { value: "7", label: "Hari Buka" }] },
    showcaseFirst: true,
    links: [
      { title: "Pesan Antar", url: "https://wa.me/62", iconKey: "brand-whatsapp", accentColor: "#d7ff60" },
      { title: "Lokasi Kafe", url: "https://maps.google.com", iconKey: "map-pin", accentColor: "#8ad5ff" },
      { title: "Reservasi Meja", url: "https://wa.me/62", description: "Untuk acara, meeting, atau kumpul bareng.", iconKey: "calendar", badgeText: "Gratis" },
    ],
    blocks: [
      showcaseBlock({
        title: "Es Kopi Susu Gula Aren",
        description: "Espresso house blend, susu segar, dan gula aren asli.",
        badgeText: "Menu Favorit",
        ctaText: "Lihat menu",
        url: "https://websitekamu.com/menu",
        imagePath: "/quick-setup-showcase/cafe-table.jpg",
      }),
    ],
    monetizationHint: "Terima pre-order atau voucher lewat Payment Link di menu Toko.",
  },
  {
    key: "profile-fitness-coach",
    category: "profile",
    layoutVariant: "profile",
    label: "Fitness Coach",
    description: "Program latihan, jadwal kelas, dan konsultasi",
    theme: "zesty",
    bio: "Personal Trainer · Strength & Mobility",
    social: { instagram: "username", youtube: "@namachannel", tiktok: "username" },
    profileExtras: { chips: [{ label: "Strength", icon: "dumbbell" }, { label: "Mobility", icon: "activity" }, { label: "Nutrisi", icon: "salad" }], stats: [{ value: "500+", label: "Klien" }, { value: "7", label: "Tahun" }, { value: "4.9", label: "Rating" }] },
    showcaseFirst: true,
    links: [
      { title: "Mulai Program", url: "https://websitekamu.com/program", iconKey: "rocket", accentColor: "#d7ff60" },
      { title: "Jadwal Kelas", url: "https://websitekamu.com/jadwal", iconKey: "calendar-days", accentColor: "#ffafd0" },
      { title: "Konsultasi Gratis", url: "https://wa.me/62", description: "Cek kebutuhan latihan & target kamu.", iconKey: "message-circle", badgeText: "15 Menit" },
    ],
    blocks: [
      showcaseBlock({
        title: "8 Minggu Lebih Kuat",
        description: "Program latihan bertahap untuk pemula, lengkap dengan video panduan.",
        badgeText: "Program Unggulan",
        ctaText: "Lihat program",
        url: "https://websitekamu.com/program",
        imagePath: "/quick-setup-showcase/gym-studio.jpg",
      }),
    ],
    monetizationHint: "Jual program latihan sebagai Produk Digital atau buka Kelas & Kursus di menu Toko.",
  },
  // ---------- Creator & Personal Brand ----------
  {
    key: "creator-profile",
    category: "creator",
    layoutVariant: "hero",
    label: "Profil Kreator",
    description: "Foto profil, bio, media sosial, YouTube, TikTok",
    // theme "bloom" (gradien ungu-fuchsia vivid) diganti "lemon" 26
    // Agustus 2026 (permintaan langsung pengguna, tangkapan layar
    // "sangat jelek dan menggangu mata") -- lihat catatan lengkap di
    // motivational-speaker (kategori Entertainment) soal cakupan
    // perubahan ini.
    theme: "lemon",
    bio: "Content creator | Berbagi konten setiap hari ✨",
    social: { instagram: "username", tiktok: "username", youtube: "@namachannel", email: "kamu@email.com" },
    links: [
      link("instagram", undefined, "Konten harian & momen keseharian"),
      link("tiktok", undefined, "Video pendek yang lagi rame ditonton"),
      link("youtube", undefined, "Vlog & konten durasi panjang"),
    ],
    blocks: [
      showcaseBlock({
        title: "Sehari Jadi Content Creator",
        description: "Proses bikin konten dari riset ide, syuting, sampai editing -- video paling banyak ditonton bulan ini.",
        badgeText: "Konten Favorit",
        ctaText: "Tonton videonya",
        url: PLATFORM_URL.youtube,
      }),
      { type: "text", title: "Tentang Aku", text: "Tuliskan cerita singkat tentangmu & jenis konten yang kamu buat di sini." },
      faqBlock([
        { question: "Terbuka untuk kerja sama brand?", answer: "Terbuka banget! DM lewat Instagram untuk diskusi kolaborasi & rate card." },
        { question: "Konten apa yang paling sering kamu bikin?", answer: "Cek highlight & feed Instagram untuk lihat jenis konten favoritku belakangan ini." },
      ]),
    ],
  },
  {
    key: "influencer",
    category: "creator",
    layoutVariant: "hero",
    label: "Influencer",
    description: "Media sosial + afiliasi + produk",
    theme: "blaze",
    bio: "Influencer & Content Creator",
    social: { instagram: "username", tiktok: "username", youtube: "@namachannel", email: "kamu@email.com" },
    links: [
      link("instagram", undefined, "Konten kolaborasi & keseharian"),
      link("tiktok", undefined, "Video promosi & konten viral"),
      link("youtube", undefined, "Review produk & vlog kolaborasi"),
    ],
    blocks: [
      showcaseBlock({
        title: "Kolaborasi Brand Skincare Lokal",
        description: "Review jujur produk skincare lokal -- proses pakai 2 minggu sampai hasil akhirnya.",
        badgeText: "Campaign Terbaru",
        ctaText: "Lihat hasilnya",
        url: PLATFORM_URL.instagram,
      }),
      { type: "text", title: "Rate Card & Kerja Sama", text: "Tuliskan jenis konten & rate endorse/kerja sama yang kamu tawarkan di sini." },
      faqBlock([{ question: "Bagaimana cara kerja sama endorse/promosi?", answer: "Kirim proposal kerja sama lewat DM Instagram, aku balas secepatnya dengan rate card & ketentuan." }]),
    ],
    monetizationHint: "Cocok dipasangkan dengan Afiliasi & Toko -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "personal-branding",
    category: "creator",
    layoutVariant: "hero",
    label: "Personal Branding",
    description: "Portofolio, pencapaian, kontak",
    theme: "minimal",
    bio: "Membangun personal brand, satu langkah setiap hari.",
    social: { linkedin: "username", instagram: "username", email: "kamu@email.com" },
    links: [
      link("linkedin", undefined, "Pengalaman profesional & koneksi karier"),
      link("instagram", undefined, "Cerita di balik proses & keseharian kerja"),
    ],
    blocks: [
      showcaseBlock({
        title: "Terpilih Jadi Pembicara Konferensi Industri",
        description: "Ringkasan pencapaian & momen penting dalam perjalanan membangun personal brand tahun ini.",
        badgeText: "Pencapaian Terbaru",
        ctaText: "Baca selengkapnya",
        url: PLATFORM_URL.linkedin,
      }),
      { type: "text", title: "Pencapaian", text: "Tuliskan pencapaian & penghargaanmu di sini." },
      { type: "contact_form", title: "Hubungi Saya" },
    ],
  },
  {
    key: "public-figure",
    category: "creator",
    layoutVariant: "hero",
    label: "Figur Publik",
    description: "Media sosial, event, merchandise",
    theme: "golden",
    bio: "Figur publik | Info kegiatan & kolaborasi",
    social: { instagram: "username", x: "username", youtube: "@namachannel", email: "kamu@email.com" },
    links: [
      link("instagram", undefined, "Update kegiatan & momen terbaru"),
      link("x", undefined, "Opini & tanggapan isu terkini"),
      link("youtube", undefined, "Wawancara & liputan kegiatan"),
    ],
    blocks: [
      showcaseBlock({
        title: "Liputan Kegiatan Sosial Bulan Ini",
        description: "Dokumentasi kegiatan & kolaborasi terbaru yang mendapat banyak sorotan publik.",
        badgeText: "Sorotan Media",
        ctaText: "Lihat liputannya",
        url: PLATFORM_URL.instagram,
      }),
      { type: "text", title: "Kegiatan Mendatang", text: "Tuliskan jadwal kegiatan, kolaborasi, atau kemunculan publik terbarumu di sini." },
      faqBlock([
        { question: "Bagaimana cara mengundang untuk acara/kolaborasi?", answer: "Kirim detail acara & undangan lewat DM Instagram, tim kami akan meninjau & menghubungi balik." },
        { question: "Apakah menerima endorse produk?", answer: "Menerima, sesuai kecocokan brand -- kirim proposal lengkap lewat DM untuk ditinjau." },
      ]),
      { type: "contact_form", title: "Undangan Acara" },
    ],
    monetizationHint: "Cocok dipasangkan dengan Event -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "streamer",
    category: "creator",
    // Tampilan persis kartu template homepage (public/homepage/templates/
    // *.png, 25 September 2026): tema foto + layout "billboard", isi tombol/
    // kartu dibaca langsung dari kartunya (OCR), warna tombol dari sampel
    // piksel. Lihat catatan di PAGE_THEMES "villa" (page-themes.ts).
    layoutVariant: "billboard",
    label: "Streamer",
    description: "Twitch, YouTube, Discord, donasi",
    theme: "arcade",
    bio: "Main bareng, lebih seru.",
    social: { instagram: "username", youtube: "@namachannel", email: "kamu@email.com" },
    links: [
      { title: "Jadwal Live", url: "https://websitekamu.com/jadwal", description: "Setiap Senin - Jumat", iconKey: "calendar", badgeText: "LIVE" },
      { title: "Tonton Sekarang", url: "https://youtube.com/@namachannel", iconKey: "radio", accentColor: "#f45a4a" },
    ],
    monetizationHint: "Cocok dipasangkan dengan Dukungan (Donasi) -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "gamer",
    category: "creator",
    layoutVariant: "portrait",
    label: "Gamer",
    description: "Profil game, Discord, YouTube, Twitch",
    theme: "electric",
    bio: "Gamer | Main bareng di sini",
    social: { instagram: "username", youtube: "@namachannel", email: "kamu@email.com" },
    links: [
      link("discord", undefined, "Gabung server & main bareng"),
      link("youtube", undefined, "Gameplay & highlight terbaru"),
      link("twitch", undefined, "Live streaming main game"),
    ],
    blocks: [
      showcaseBlock({
        title: "Clutch Moment Ranked Match Terbaik",
        description: "Momen paling epic dari sesi push rank minggu ini -- lengkap sama reaksi tim.",
        badgeText: "Highlight Game",
        ctaText: "Tonton clip-nya",
        url: PLATFORM_URL.youtube,
      }),
      { type: "text", title: "Game yang Dimainkan", text: "Tuliskan game favorit yang sering kamu mainkan & rank/level saat ini di sini." },
    ],
  },
  // 2 template baru, 21 Agustus 2026 -- lihat catatan lengkap di homestay-
  // villa (kategori Tourism).
  {
    key: "islamic-creator",
    category: "creator",
    layoutVariant: "hero",
    label: "Kreator Dakwah",
    description: "Konten dakwah, media sosial, kolaborasi",
    theme: "ivory",
    bio: "Konten dakwah & inspirasi -- semoga bermanfaat",
    social: { instagram: "username", youtube: "@namachannel", tiktok: "username", email: "kamu@email.com" },
    links: [
      link("instagram", undefined, "Kajian singkat & motivasi harian"),
      link("youtube", undefined, "Kajian lengkap & ceramah"),
      link("tiktok", undefined, "Tips ibadah dalam video pendek"),
    ],
    blocks: [
      showcaseBlock({
        title: "Kajian Rutin: Ikhlas dalam Beramal",
        description: "Salah satu kajian paling banyak diminati -- bahas cara menjaga niat ikhlas sehari-hari.",
        badgeText: "Kajian Pilihan",
        ctaText: "Tonton kajiannya",
        url: PLATFORM_URL.youtube,
      }),
      { type: "text", title: "Tentang Konten Ini", text: "Tuliskan fokus kontenmu (kajian, motivasi, tips ibadah sehari-hari) di sini." },
      faqBlock([{ question: "Terbuka untuk kolaborasi kajian/event?", answer: "Terbuka, DM lewat Instagram untuk diskusi jadwal & tema kolaborasi." }]),
    ],
  },
  {
    key: "book-author",
    category: "creator",
    layoutVariant: "headline",
    label: "Penulis Buku",
    description: "Buku terbaru, website, media sosial",
    theme: "cocoa",
    bio: "Penulis buku -- cerita yang lahir dari kata demi kata",
    social: { instagram: "username", website: "websitekamu.com", email: "kamu@email.com" },
    links: [
      link("instagram", undefined, "Cuplikan tulisan & proses menulis"),
      link("website", "Kunjungi Website Kami", "Katalog lengkap semua buku"),
    ],
    blocks: [
      showcaseBlock({
        title: "Ketika Kata Menemukan Rumahnya",
        description: "Novel terbaru yang bercerita tentang pencarian makna lewat kata demi kata -- sudah tersedia di toko buku favoritmu.",
        badgeText: "Buku Terbaru",
        ctaText: "Baca sinopsis lengkap",
        url: PLATFORM_URL.website,
      }),
      { type: "text", title: "Buku Terbaru", text: "Tuliskan judul & sinopsis singkat buku terbarumu di sini." },
      faqBlock([{ question: "Apakah menerima undangan bedah buku?", answer: "Menerima, kirim detail acara lewat DM Instagram untuk diskusi jadwal." }]),
    ],
  },
  // 2 template berikut ditambahkan 6 September 2026 (permintaan langsung
  // pengguna: "buatkan template quick setup sesuai tema website minimal 2
  // di tiap category, template tema joyfull") -- niche UGC & voice over
  // belum terwakili di kategori ini, bertema "joyful" (lihat catatan
  // lengkap di PageThemeName, page-themes.ts, kenapa tema ini dibuat).
  {
    key: "ugc-creator",
    category: "creator",
    layoutVariant: "hero",
    label: "UGC Creator",
    description: "Portofolio konten, rate card, kontak brand",
    theme: "joyful",
    bio: "UGC Creator | Bikin konten autentik untuk brand kamu",
    social: { instagram: "username", tiktok: "username", email: "halo@domainmu.com" },
    links: [
      link("tiktok", "Contoh Konten UGC", "Video produk & testimoni gaya organik"),
      link("email", "Kerja Sama Brand", "Kirim brief produk & budget kampanye"),
    ],
    blocks: [
      showcaseBlock({
        title: "Paket Konten UGC",
        description: "Tuliskan jumlah video, revisi, dan hak pakai konten yang termasuk dalam satu paket.",
        badgeText: "RATE CARD",
        ctaText: "Lihat Paket",
        url: PLATFORM_URL.tiktok,
      }),
      faqBlock([
        { question: "Berapa lama pengerjaan satu video?", answer: "Tulis estimasi waktu dari brief sampai video jadi." },
        { question: "Apakah termasuk hak pakai iklan?", answer: "Jelaskan apakah brand boleh pakai kontennya untuk iklan berbayar (whitelisting) dan biaya tambahannya." },
      ]),
    ],
    monetizationHint: "Payment Link memudahkan menagih DP sebelum syuting konten dimulai.",
  },
  {
    key: "voice-over-artist",
    category: "creator",
    layoutVariant: "spotlight",
    label: "Voice Over Talent",
    description: "Demo reel, rate, kontak booking",
    theme: "joyful",
    bio: "Voice over talent | Suara untuk iklan, e-learning, dan animasi",
    social: { instagram: "username", youtube: "@namachannel", email: "halo@domainmu.com" },
    links: [
      link("youtube", "Dengar Demo Reel", "Contoh suara untuk berbagai gaya & karakter"),
      link("email", "Booking Job", "Kirim naskah & tenggat rekaman"),
    ],
    blocks: [
      { type: "text", title: "Jenis Job yang Diterima", text: "Tuliskan jenis voice over yang kamu kerjakan (iklan, e-learning, dubbing, IVR) beserta tarif per menit/proyek." },
      faqBlock([
        { question: "Bisa rekam remote?", answer: "Jelaskan setup home studio dan format file yang bisa dikirim." },
        { question: "Berapa lama revisi?", answer: "Tulis jumlah revisi yang termasuk dalam satu tarif." },
      ]),
    ],
    monetizationHint: "Payment Link memudahkan menagih DP sebelum sesi rekaman dimulai.",
  },

  // ---------- Business & Professional ----------
  {
    key: "business-profile",
    category: "business",
    layoutVariant: "banner",
    label: "Profil Bisnis",
    description: "Website, WhatsApp, lokasi, kontak",
    theme: "ocean",
    bio: "Profil bisnis resmi kami.",
    social: { website: "websitekamu.com", whatsapp: "62812xxxxxxxx", email: "kamu@email.com" },
    links: [
      link("website", "Kunjungi Website Kami", "Info lengkap produk & layanan kami"),
      link("whatsapp", "Chat Admin Kami", "Respon cepat untuk pertanyaan kamu"),
    ],
    blocks: [
      mapsBlock(),
      showcaseBlock({
        title: "Konsultasi Gratis untuk Klien Baru",
        description: "Sesi konsultasi awal tanpa biaya untuk memahami kebutuhanmu sebelum memulai kerja sama.",
        badgeText: "Layanan Unggulan",
        ctaText: "Jadwalkan sekarang",
        url: PLATFORM_URL.whatsapp,
      }),
      faqBlock([{ question: "Bagaimana cara menghubungi kami?", answer: "Chat lewat WhatsApp atau isi formulir di bawah, tim kami akan segera merespons." }]),
      { type: "contact_form", title: "Kritik dan Saran" },
    ],
  },
  {
    key: "company",
    category: "business",
    layoutVariant: "banner",
    label: "Perusahaan",
    description: "Tentang, layanan, portofolio, kontak",
    theme: "minimal",
    bio: "Tentang perusahaan kami.",
    social: { website: "websitekamu.com", linkedin: "username", email: "kamu@email.com" },
    links: [
      link("website", "Kunjungi Website Kami", "Profil & portofolio perusahaan lengkap"),
      link("linkedin", undefined, "Update perusahaan & lowongan kerja"),
    ],
    blocks: [
      mapsBlock("Kantor Kami"),
      showcaseBlock({
        title: "Solusi Digital untuk Bisnis Menengah",
        description: "Layanan andalan yang paling banyak dipercaya klien kami tahun ini.",
        badgeText: "Layanan Kami",
        ctaText: "Pelajari layanan ini",
        url: PLATFORM_URL.website,
      }),
      { type: "text", title: "Layanan Kami", text: "Tuliskan daftar layanan perusahaanmu di sini." },
      faqBlock([{ question: "Bagaimana proses kerja sama dengan kami?", answer: "Mulai dari konsultasi kebutuhan, proposal, sampai eksekusi -- hubungi kami untuk mulai diskusi." }]),
      { type: "contact_form", title: "Hubungi Kami" },
    ],
  },
  {
    key: "freelancer",
    category: "business",
    layoutVariant: "banner",
    label: "Freelancer",
    description: "Portofolio, layanan, harga, kontak",
    theme: "forest",
    bio: "Freelancer | Siap bantu proyekmu",
    social: { linkedin: "username", instagram: "username", email: "kamu@email.com" },
    links: [
      link("linkedin", undefined, "Rekam jejak & pengalaman kerja"),
      link("instagram", "Lihat Portofolio", "Contoh hasil kerja terbaru"),
    ],
    blocks: [
      showcaseBlock({
        title: "Redesain Landing Page Konversi 2x Lipat",
        description: "Studi kasus singkat proyek terbaru -- dari brief awal sampai hasil akhir yang bikin klien puas.",
        badgeText: "Proyek Terbaru",
        ctaText: "Lihat studi kasus",
        url: PLATFORM_URL.linkedin,
      }),
      { type: "text", title: "Layanan & Harga", text: "Tuliskan daftar layanan dan harga di sini." },
      faqBlock([{ question: "Berapa lama waktu pengerjaan?", answer: "Tergantung kompleksitas proyek, biasanya 3-14 hari kerja. Chat dulu buat estimasi lebih pasti." }]),
      { type: "contact_form", title: "Hubungi Saya" },
    ],
  },
  {
    key: "consultant",
    category: "business",
    layoutVariant: "split",
    label: "Konsultan",
    description: "Layanan, booking, testimoni",
    theme: "noir",
    bio: "Konsultan | Booking sesi konsultasi",
    social: { linkedin: "username", whatsapp: "62812xxxxxxxx", email: "kamu@email.com" },
    links: [link("linkedin", undefined, "Latar belakang & jam terbang konsultasi")],
    blocks: [
      showcaseBlock({
        title: "Pendampingan Strategi Bisnis 3 Bulan",
        description: "Hasil pendampingan klien yang berhasil menaikkan omzet lewat perbaikan strategi operasional.",
        badgeText: "Studi Kasus",
        ctaText: "Baca ceritanya",
        url: PLATFORM_URL.linkedin,
      }),
      faqBlock([{ question: "Bagaimana proses konsultasinya?", answer: "Booking slot yang tersedia, lalu kita diskusi via video call sesuai kebutuhanmu." }]),
      { type: "contact_form", title: "Hubungi Saya" },
    ],
    monetizationHint: "Cocok dipasangkan dengan Produk Digital atau Kelas & Kursus -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "agency",
    category: "business",
    layoutVariant: "split",
    label: "Agensi",
    description: "Layanan, portofolio, daftar klien",
    theme: "midnight",
    bio: "Agency kreatif | Lihat portofolio kami",
    social: { website: "websitekamu.com", instagram: "username", linkedin: "username", email: "kamu@email.com" },
    links: [
      link("website", undefined, "Portofolio lengkap semua proyek kami"),
      link("instagram", undefined, "Cuplikan proses kerja & hasil karya"),
      link("linkedin", undefined, "Profil tim & rekam jejak agency"),
    ],
    blocks: [
      showcaseBlock({
        title: "Rebranding Total untuk Klien F&B Nasional",
        description: "Salah satu proyek favorit tim kami -- dari riset brand sampai peluncuran identitas baru.",
        badgeText: "Proyek Unggulan",
        ctaText: "Lihat portofolio lengkap",
        url: PLATFORM_URL.website,
      }),
      { type: "text", title: "Klien Kami", text: "Tuliskan daftar klien/mitra di sini." },
      faqBlock([
        { question: "Bagaimana memulai proyek dengan agency ini?", answer: "Hubungi kami lewat website atau LinkedIn di atas, kita mulai dari sesi diskusi kebutuhanmu." },
        { question: "Berapa lama proses satu proyek biasanya?", answer: "Bervariasi tergantung skala -- kita bahas timeline detail di sesi konsultasi awal." },
      ]),
    ],
  },
  {
    key: "professional-cv",
    category: "business",
    layoutVariant: "split",
    label: "CV Profesional",
    description: "Pengalaman, keahlian, pendidikan, kontak",
    theme: "minimal",
    bio: "CV digital -- pengalaman, keahlian, & kontak.",
    social: { linkedin: "username", email: "kamu@email.com" },
    links: [link("linkedin", undefined, "Riwayat karier & rekomendasi kolega")],
    blocks: [
      showcaseBlock({
        title: "Memimpin Proyek Lintas Tim Tepat Waktu",
        description: "Pencapaian profesional yang paling ingin aku tonjolkan -- konteks lengkap ada di CV.",
        badgeText: "Pencapaian",
        ctaText: "Lihat detail CV",
        url: PLATFORM_URL.linkedin,
      }),
      { type: "text", title: "Pengalaman & Keahlian", text: "Tuliskan pengalaman kerja dan keahlianmu di sini." },
      { type: "contact_form", title: "Hubungi Saya" },
    ],
  },
  // 2 template baru, 21 Agustus 2026 -- lihat catatan lengkap di homestay-
  // villa (kategori Tourism).
  {
    key: "insurance-agent",
    category: "business",
    layoutVariant: "split",
    label: "Agen Asuransi",
    description: "Produk asuransi, konsultasi, kontak",
    theme: "corporate",
    bio: "Agen asuransi -- lindungi masa depanmu",
    social: { whatsapp: "62812xxxxxxxx", linkedin: "username", email: "kamu@email.com" },
    links: [
      link("whatsapp", "Konsultasi Gratis", "Konsultasi kebutuhan asuransi gratis"),
      link("linkedin", undefined, "Profil & lisensi agen resmi"),
    ],
    blocks: [
      showcaseBlock({
        title: "Asuransi Kesehatan Keluarga Plus",
        description: "Produk paling banyak dipilih klienku -- proteksi kesehatan lengkap untuk seluruh keluarga.",
        badgeText: "Produk Favorit",
        ctaText: "Tanya detail produk",
        url: PLATFORM_URL.whatsapp,
      }),
      { type: "text", title: "Produk Asuransi", text: "Tuliskan jenis produk asuransi (jiwa, kesehatan, pendidikan) yang kamu tawarkan di sini." },
      faqBlock([{ question: "Bagaimana cara klaim asuransi?", answer: "Aku bantu proses klaim dari awal sampai selesai -- hubungi langsung begitu ada kejadian." }]),
      { type: "contact_form", title: "Konsultasi Asuransi" },
    ],
  },
  {
    key: "coworking-space",
    category: "business",
    layoutVariant: "masthead",
    label: "Coworking Space",
    description: "Paket, fasilitas, booking",
    theme: "obsidian",
    bio: "Coworking space -- kerja produktif, kolaborasi maksimal",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx", email: "kamu@email.com" },
    links: [
      link("whatsapp", "Booking Ruang", "Booking ruang & tanya ketersediaan"),
      link("instagram", "Lihat Fasilitas Kami", "Suasana ruang kerja & fasilitas"),
    ],
    blocks: [
      mapsBlock("Lokasi Kami"),
      showcaseBlock({
        title: "Private Office untuk Tim hingga 10 Orang",
        description: "Paket paling diminati bulan ini -- ruang privat lengkap dengan meeting room & internet cepat.",
        badgeText: "Fasilitas Unggulan",
        ctaText: "Cek ketersediaan",
        url: PLATFORM_URL.whatsapp,
      }),
      { type: "text", title: "Paket & Harga", text: "Tuliskan paket membership (harian/bulanan) & fasilitas yang didapat di sini." },
      faqBlock([{ question: "Apakah ada meeting room?", answer: "Ada, bisa disewa terpisah per jam -- booking dulu via WhatsApp supaya tidak bentrok jadwal." }]),
    ],
  },
  // 2 template berikut ditambahkan 6 September 2026 (permintaan langsung
  // pengguna: "buatkan template quick setup sesuai tema website minimal 2
  // di tiap category, template tema joyfull") -- niche virtual assistant
  // & data analyst freelance belum terwakili di kategori ini.
  {
    key: "virtual-assistant",
    category: "business",
    layoutVariant: "banner",
    label: "Virtual Assistant",
    description: "Layanan admin, harga paket, kontak",
    theme: "joyful",
    bio: "Virtual assistant | Bantu urus admin bisnismu dari jarak jauh",
    social: { instagram: "username", linkedin: "username", email: "halo@domainmu.com" },
    links: [
      link("email", "Diskusi Kebutuhan", "Ceritakan tugas admin yang mau didelegasikan"),
      link("linkedin", "Pengalaman Kerja", "Klien & jenis pekerjaan sebelumnya"),
    ],
    blocks: [
      { type: "text", title: "Layanan yang Ditawarkan", text: "Tuliskan jenis tugas yang kamu bantu (email, jadwal, data entry, media sosial) beserta paket jam kerja & harganya." },
      faqBlock([
        { question: "Kerja jam berapa saja?", answer: "Tulis zona waktu dan jam kerja yang kamu sediakan." },
        { question: "Pakai tools apa untuk komunikasi?", answer: "Jelaskan tools yang biasa dipakai (WhatsApp, Slack, Notion, dst)." },
      ]),
    ],
    monetizationHint: "Produk Digital cocok untuk jual paket jam kerja bulanan dalam satu harga tetap.",
  },
  {
    key: "data-analyst",
    category: "business",
    layoutVariant: "split",
    label: "Data Analyst Freelance",
    description: "Layanan analisis data, dashboard, laporan",
    theme: "joyful",
    bio: "Data analyst | Ubah data mentah jadi keputusan bisnis",
    social: { linkedin: "username", github: "username", email: "halo@domainmu.com" },
    links: [
      link("email", "Konsultasi Proyek", "Ceritakan data & masalah yang mau dianalisis"),
      link("website", "Contoh Dashboard", "Portofolio dashboard & laporan sebelumnya"),
    ],
    blocks: [
      { type: "text", title: "Layanan Analisis", text: "Tuliskan jenis layanan (dashboard, laporan rutin, analisis ad-hoc) beserta tools yang kamu pakai (Excel/SQL/Python/Looker) dan tarifnya." },
      faqBlock([
        { question: "Datanya harus format apa?", answer: "Tulis format data yang bisa kamu proses (spreadsheet, database, API, dst)." },
        { question: "Apakah data dijamin rahasia?", answer: "Jelaskan kebijakan kerahasiaan data klien." },
      ]),
    ],
    monetizationHint: "Payment Link cocok untuk menagih fee per proyek atau langganan laporan bulanan.",
  },

  // ---------- Online Shop ----------
  // Susulan permintaan pengguna, 17 Agustus 2026: "coba tambahkan template
  // untuk produk yang siap pakai juga" -- lihat catatan lengkap di
  // QuickSetupTemplateProduct kenapa ini aman dibuat otomatis (beda dari
  // Event/Kelas). 5 dari 6 template di kategori ini dapat SATU
  // produk contoh (affiliate-store SENGAJA tidak -- intinya justru
  // mempromosikan produk ORANG LAIN, bukan produk sendiri). Blok konten
  // juga dirapikan supaya tidak semua template berbentuk sama (jumlah item
  // FAQ & kombinasi blok bervariasi, bukan selalu "1 text + 1 FAQ"). TIDAK
  // dapat kartu showcase (revisi 26 Agustus 2026, lihat catatan lengkap di
  // atas file ini) -- kartu produk ASLI (products[], gambar sungguhan)
  // sudah jadi sorotan utama, showcase generik di sini jadi redundan.
  {
    key: "online-store",
    category: "shop",
    layoutVariant: "card",
    label: "Toko Online",
    description: "Produk, marketplace, promosi",
    theme: "peach",
    bio: "Toko online -- produk terbaik untukmu",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("shopee", "Belanja di Shopee Kami", "Belanja aman dengan proteksi Shopee"),
      link("tokopedia", "Belanja di Tokopedia Kami", "Belanja praktis lewat Tokopedia"),
      link("whatsapp", "Chat Admin Kami", "Tanya stok & rekomendasi produk"),
    ],
    blocks: [
      faqBlock([
        { question: "Bagaimana cara pembayaran?", answer: "Kami terima transfer bank & e-wallet, konfirmasi pesanan lewat WhatsApp." },
        { question: "Berapa lama pengiriman?", answer: "1-3 hari kerja tergantung lokasi -- nomor resi kami kirim lewat WhatsApp begitu paket dikirim." },
      ]),
    ],
    products: [
      {
        name: "Produk Andalan Toko (Contoh)",
        description: "Ganti dengan produk aslimu -- ini contoh draft, belum aktif sampai kamu unggah file & sesuaikan harga di menu Toko.",
        priceIDR: 50000,
        coverImagePath: "/quick-setup-products/online-store-1.jpg",
      },
      {
        name: "Produk Terlaris (Contoh)",
        description: "Ganti dengan produk aslimu -- ini contoh draft, belum aktif sampai kamu unggah file & sesuaikan harga di menu Toko.",
        priceIDR: 65000,
        coverImagePath: "/quick-setup-products/online-store-2.jpg",
      },
    ],
  },
  {
    key: "fashion-store",
    category: "shop",
    layoutVariant: "ribbon",
    label: "Toko Fashion",
    description: "Katalog, Instagram, Shopee/Tokopedia",
    theme: "rose",
    bio: "Fashion store | Koleksi terbaru tiap minggu",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("instagram", "Lihat Koleksi Terbaru", "Lookbook koleksi terbaru tiap minggu"),
      link("shopee", undefined, "Belanja aman dengan proteksi Shopee"),
      link("tokopedia", undefined, "Belanja praktis lewat Tokopedia"),
    ],
    blocks: [
      { type: "text", title: "Panduan Ukuran", text: "Tuliskan tabel ukuran (S/M/L/XL dst) di sini supaya pembeli tidak salah pilih." },
      faqBlock([{ question: "Apakah bisa tukar ukuran?", answer: "Bisa, selama barang belum dipakai & masih dalam 3 hari sejak diterima. Hubungi kami via WhatsApp." }]),
    ],
    products: [
      {
        name: "Katalog Koleksi Terbaru (Contoh)",
        description: "Ganti dengan produk aslimu -- ini contoh draft, belum aktif sampai kamu unggah file & sesuaikan harga di menu Toko.",
        priceIDR: 15000,
        coverImagePath: "/quick-setup-products/fashion-store-1.jpg",
      },
      {
        name: "Item Best Seller (Contoh)",
        description: "Ganti dengan produk aslimu -- ini contoh draft, belum aktif sampai kamu unggah file & sesuaikan harga di menu Toko.",
        priceIDR: 120000,
        coverImagePath: "/quick-setup-products/fashion-store-2.jpg",
      },
    ],
  },
  {
    key: "beauty-store",
    category: "shop",
    layoutVariant: "ribbon",
    label: "Toko Kecantikan",
    description: "Produk, katalog, booking",
    theme: "peach",
    bio: "Beauty store | Produk kecantikan pilihan",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("instagram", "Lihat Produk Kami", "Review & tutorial pakai produk kami"),
      link("whatsapp", "Tanya-Tanya Produk", "Konsultasi produk sesuai jenis kulit"),
    ],
    blocks: [mapsBlock()],
    products: [
      {
        name: "E-Katalog Produk Kecantikan (Contoh)",
        description: "Ganti dengan produk aslimu -- ini contoh draft, belum aktif sampai kamu unggah file & sesuaikan harga di menu Toko.",
        priceIDR: 10000,
        coverImagePath: "/quick-setup-products/beauty-store-1.jpg",
      },
      {
        name: "Paket Perawatan (Contoh)",
        description: "Ganti dengan produk aslimu -- ini contoh draft, belum aktif sampai kamu unggah file & sesuaikan harga di menu Toko.",
        priceIDR: 85000,
        coverImagePath: "/quick-setup-products/beauty-store-2.jpg",
      },
    ],
    monetizationHint: "Cocok dipasangkan dengan Voucher atau Bundel -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "food-beverage",
    category: "shop",
    layoutVariant: "masthead",
    label: "Makanan & Minuman",
    description: "Menu, pemesanan, lokasi",
    theme: "amber",
    bio: "Food & beverage | Order sekarang",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Pesan via WhatsApp", "Pesan cepat, langsung diproses"),
      link("instagram", "Ikuti Update Kami", "Menu baru & promo mingguan"),
    ],
    blocks: [
      mapsBlock(),
      { type: "text", title: "Menu", text: "Tuliskan daftar menu & harga di sini." },
      faqBlock([{ question: "Apakah bisa delivery?", answer: "Bisa, order via WhatsApp dan kami info ongkirnya sesuai lokasimu." }]),
    ],
    // productKind "payment_link" -- contoh JALUR BEDA dari template shop
    // lain (semua "digital"): langsung aktif TANPA perlu unggah file,
    // pas untuk voucher/DP/pre-order yang memang tidak punya file diunduh.
    products: [
      {
        name: "Voucher Makan Digital (Contoh)",
        description: "Ganti dengan voucher/promo aslimu -- produk jenis Payment Link ini langsung aktif tanpa perlu unggah file, cocok utk DP/pre-order.",
        priceIDR: 50000,
        productKind: "payment_link",
        coverImagePath: "/quick-setup-products/food-beverage-1.jpg",
      },
      {
        name: "Menu Favorit (Contoh)",
        description: "Ganti dengan produk aslimu -- ini contoh draft, belum aktif sampai kamu unggah file & sesuaikan harga di menu Toko.",
        priceIDR: 25000,
        coverImagePath: "/quick-setup-products/food-beverage-2.jpg",
      },
    ],
  },
  {
    key: "small-business",
    category: "shop",
    layoutVariant: "card",
    label: "Usaha Kecil",
    description: "Produk, WhatsApp, marketplace",
    theme: "mint",
    bio: "Usaha kecil, kualitas besar.",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Pesan via WhatsApp", "Tanya produk & cara pemesanan"),
      link("shopee", undefined, "Belanja aman lewat marketplace"),
    ],
    blocks: [mapsBlock(), faqBlock([{ question: "Apakah bisa pesan custom?", answer: "Bisa banget, chat kami dulu buat diskusi kebutuhanmu." }])],
    products: [
      {
        name: "Produk Andalan Kamu (Contoh)",
        description: "Ganti dengan produk aslimu -- ini contoh draft, belum aktif sampai kamu unggah file & sesuaikan harga di menu Toko.",
        priceIDR: 35000,
        coverImagePath: "/quick-setup-products/small-business-1.jpg",
      },
      {
        name: "Produk Buatan Tangan (Contoh)",
        description: "Ganti dengan produk aslimu -- ini contoh draft, belum aktif sampai kamu unggah file & sesuaikan harga di menu Toko.",
        priceIDR: 45000,
        coverImagePath: "/quick-setup-products/small-business-2.jpg",
      },
    ],
  },
  {
    key: "affiliate-store",
    category: "shop",
    layoutVariant: "masthead",
    label: "Toko Afiliasi",
    description: "Rekomendasi produk + tautan afiliasi",
    // theme "bloom" -> "golden", lihat catatan lengkap di motivational-
    // speaker (kategori Entertainment).
    theme: "golden",
    bio: "Rekomendasi produk pilihanku",
    social: { instagram: "username", tiktok: "username" },
    links: [
      link("instagram", undefined, "Review jujur produk favoritku"),
      link("tiktok", undefined, "Demo produk dalam video singkat"),
    ],
    blocks: [
      { type: "text", title: "Rekomendasi Produk", text: "Tuliskan kategori produk yang kamu rekomendasikan & kenapa kamu pakai/suka di sini." },
      faqBlock([
        { question: "Apakah ada kode diskon?", answer: "Cek deskripsi tautan produk di atas -- kode diskon (kalau ada) selalu aku cantumkan di sana." },
        { question: "Kenapa harus beli lewat link kamu?", answer: "Harganya sama saja -- cuma bantu aku dapat komisi kecil dari toko, tanpa nambah biaya buat kamu." },
      ]),
    ],
    monetizationHint: "Cocok dipasangkan dengan Afiliasi -- aktifkan di menu Produk & Monetisasi.",
  },
  // 3 template baru, 21 Agustus 2026 -- lihat catatan lengkap di homestay-
  // villa (kategori Tourism). "products" SENGAJA tidak diisi utk ketiganya
  // (beda dari 5 template shop lain) -- belum ada foto produk contoh yang
  // relevan & benar-benar lisensi bebas tersedia untuk batik/jamu/pet
  // shop, jadi tidak dipaksakan asal comot gambar generik.
  {
    key: "batik-craft",
    category: "shop",
    layoutVariant: "ribbon",
    label: "Batik & Kerajinan",
    description: "Katalog, cerita produk, marketplace",
    theme: "kraft",
    bio: "Batik & kerajinan tradisional -- karya asli tangan lokal",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("instagram", "Lihat Koleksi Batik", "Koleksi motif & proses pembuatan"),
      link("whatsapp", "Pesan via WhatsApp", "Tanya motif & request custom"),
      link("shopee", undefined, "Belanja aman lewat marketplace"),
    ],
    blocks: [
      { type: "text", title: "Proses Pembuatan", text: "Ceritakan proses pembuatan batik/kerajinanmu (tulis tangan, cap, motif khas) di sini." },
      faqBlock([{ question: "Apakah bisa custom motif?", answer: "Bisa, chat dulu buat diskusi motif & warna sesuai keinginanmu." }]),
    ],
  },
  {
    key: "herbal-jamu",
    category: "shop",
    layoutVariant: "card",
    label: "Jamu & Herbal",
    description: "Produk, katalog, pemesanan",
    theme: "matcha",
    bio: "Jamu & herbal -- sehat alami ala nenek moyang",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Pesan via WhatsApp", "Konsultasi & pemesanan langsung"),
      link("instagram", "Lihat Produk Kami", "Manfaat bahan & testimoni pelanggan"),
    ],
    blocks: [faqBlock([{ question: "Apakah aman dikonsumsi rutin?", answer: "Aman, semua bahan alami tanpa pengawet -- tetap konsultasi dulu kalau kamu punya kondisi kesehatan khusus." }])],
  },
  {
    key: "petshop",
    category: "shop",
    layoutVariant: "ribbon",
    label: "Petshop",
    description: "Produk, lokasi, grooming",
    theme: "lemon",
    bio: "Pet shop -- semua kebutuhan hewan kesayanganmu",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Chat Admin Kami", "Tanya stok & booking grooming"),
      link("instagram", "Lihat Produk Kami", "Produk terbaru & tips rawat hewan"),
      link("shopee", undefined, "Belanja aman lewat marketplace"),
    ],
    blocks: [
      mapsBlock("Lokasi Toko"),
      faqBlock([{ question: "Apakah ada layanan grooming?", answer: "Ada, booking dulu via WhatsApp supaya tidak perlu antre lama." }]),
    ],
  },
  // 2 template berikut ditambahkan 6 September 2026 (permintaan langsung
  // pengguna: "buatkan template quick setup sesuai tema website minimal 2
  // di tiap category, template tema joyfull") -- niche toko bayi/anak &
  // toko buku belum terwakili di kategori ini.
  {
    key: "baby-kids-store",
    category: "shop",
    layoutVariant: "ribbon",
    label: "Toko Perlengkapan Bayi & Anak",
    description: "Produk, katalog, promo",
    theme: "joyful",
    bio: "Toko bayi & anak | Perlengkapan aman dan nyaman untuk si kecil",
    social: { instagram: "username", tiktok: "username" },
    links: [
      link("instagram", "Katalog Terbaru", "Produk baru & rekomendasi sesuai usia anak"),
      link("whatsapp", "Tanya Stok", "Cek ketersediaan ukuran & warna"),
    ],
    blocks: [
      showcaseBlock({
        title: "Paket Perlengkapan Newborn",
        description: "Tuliskan isi paket, merek, dan keunggulan produk andalan tokomu.",
        badgeText: "PALING LAKU",
        ctaText: "Lihat Produk",
        url: PLATFORM_URL.instagram,
      }),
      faqBlock([{ question: "Apakah bisa tukar ukuran?", answer: "Jelaskan kebijakan tukar/retur kalau ukuran tidak sesuai." }]),
    ],
    monetizationHint: "Cocok dipasangkan dengan Voucher untuk promo member baru.",
  },
  {
    key: "bookstore",
    category: "shop",
    layoutVariant: "card",
    label: "Toko Buku",
    description: "Katalog buku, pre-order, komunitas baca",
    theme: "joyful",
    bio: "Toko buku independen | Kurasi bacaan pilihan tiap minggu",
    social: { instagram: "username", tiktok: "username" },
    links: [
      link("instagram", "Rekomendasi Minggu Ini", "Buku pilihan & ulasan singkat"),
      link("whatsapp", "Pre-Order Buku", "Tanya ketersediaan judul & estimasi kirim"),
    ],
    blocks: [
      { type: "text", title: "Kategori Buku", text: "Tuliskan genre yang kamu jual (fiksi, non-fiksi, anak, impor) dan cara pemesanannya di sini." },
      faqBlock([{ question: "Apakah menerima titip jual dari penulis lokal?", answer: "Jelaskan syarat konsinyasi untuk penulis/penerbit independen." }]),
    ],
    monetizationHint: "Cocok dipasangkan dengan Komunitas untuk klub baca bulanan.",
  },

  // ---------- Education ----------
  // TIDAK dapat kartu showcase (revisi 26 Agustus 2026, lihat catatan
  // lengkap di atas file ini) -- kartu tautan+FAQ yang sudah diperkaya
  // deskripsi dinilai sudah cukup mewakili kategori ini.
  {
    key: "teacher",
    category: "education",
    layoutVariant: "minimal",
    label: "Guru",
    description: "Info kelas, materi, kontak",
    theme: "ocean",
    bio: "Guru | Info kelas & materi belajar",
    social: { whatsapp: "62812xxxxxxxx", email: "kamu@email.com" },
    links: [link("whatsapp", undefined, "Tanya jadwal & materi belajar")],
    blocks: [
      { type: "text", title: "Info Kelas", text: "Tuliskan jadwal & info kelasmu di sini." },
      faqBlock([{ question: "Apa saja yang diajarkan?", answer: "Lihat info kelas di atas, atau hubungi saya untuk tanya-tanya lebih detail." }]),
      { type: "contact_form", title: "Hubungi Saya" },
    ],
  },
  {
    key: "tutor",
    category: "education",
    layoutVariant: "minimal",
    label: "Tutor",
    description: "Kelas, jadwal, booking",
    theme: "maple",
    bio: "Tutor privat | Booking jadwal belajar",
    social: { whatsapp: "62812xxxxxxxx", email: "kamu@email.com" },
    links: [link("whatsapp", "Booking via WhatsApp", "Booking jadwal les sesuai waktumu")],
    blocks: [faqBlock([{ question: "Bagaimana jadwal lesnya?", answer: "Fleksibel sesuai kesepakatan -- chat dulu buat atur jadwal yang cocok." }])],
    monetizationHint: "Cocok dipasangkan dengan Kelas & Kursus -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "course-creator",
    category: "education",
    layoutVariant: "headline",
    label: "Kreator Kelas Online",
    description: "Kelas, testimoni, pendaftaran",
    theme: "golden",
    bio: "Kelas online -- belajar bareng aku",
    social: { instagram: "username", youtube: "@namachannel", email: "kamu@email.com" },
    links: [
      link("instagram", undefined, "Cuplikan materi & testimoni peserta"),
      link("youtube", undefined, "Video pembelajaran gratis contoh kelas"),
    ],
    blocks: [
      { type: "text", title: "Testimoni Peserta", text: "Tuliskan kesan/hasil peserta kelas sebelumnya di sini." },
      faqBlock([{ question: "Apakah ada sertifikat setelah selesai?", answer: "Ada, kamu dapat sertifikat digital setelah menyelesaikan semua modul kelas." }]),
    ],
    monetizationHint: "Cocok dipasangkan dengan Kelas & Kursus -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "student",
    category: "education",
    layoutVariant: "headline",
    label: "Pelajar & Mahasiswa",
    description: "Portofolio, proyek, media sosial",
    theme: "minimal",
    bio: "Mahasiswa/pelajar | Kumpulan proyekku",
    social: { instagram: "username", linkedin: "username" },
    links: [
      link("instagram", undefined, "Dokumentasi proyek & keseharian kuliah"),
      link("linkedin", undefined, "Pengalaman organisasi & magang"),
    ],
    blocks: [{ type: "text", title: "Proyek", text: "Tuliskan proyek-proyek yang pernah kamu kerjakan di sini." }],
  },
  {
    key: "education-brand",
    category: "education",
    layoutVariant: "headline",
    label: "Brand Edukasi",
    description: "Kelas, event, komunitas",
    theme: "atmos",
    bio: "Belajar bareng komunitas kami",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx", email: "kamu@email.com" },
    links: [
      link("instagram", undefined, "Info kelas & kegiatan komunitas"),
      link("whatsapp", "Gabung Grup WhatsApp", "Gabung grup info kelas terbaru"),
    ],
    blocks: [
      faqBlock([{ question: "Bagaimana cara bergabung?", answer: "Klik salah satu tautan di atas untuk gabung WhatsApp/Instagram, info kelas & event rutin kami bagikan di sana." }]),
      { type: "contact_form", title: "Daftar Kelas" },
    ],
    monetizationHint: "Cocok dipasangkan dengan Kelas & Kursus dan Event -- aktifkan di menu Produk & Monetisasi.",
  },
  // 1 template baru, 21 Agustus 2026 -- lihat catatan lengkap di homestay-
  // villa (kategori Tourism). layoutVariant "duo" dipakai ULANG dari
  // Lifestyle (Fitness Coach/Beauty Creator) -- kesan "kartu instruktur
  // personal" sama-sama cocok utk kursus privat/kelas kecil.
  {
    key: "language-course",
    category: "education",
    layoutVariant: "duo",
    label: "Kursus Bahasa",
    description: "Kelas bahasa, jadwal, pendaftaran",
    theme: "candy",
    bio: "Kursus bahasa -- lancar berbahasa, buka peluang baru",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx", email: "kamu@email.com" },
    links: [link("whatsapp", "Daftar Kelas", "Daftar & tanya jadwal kelas")],
    blocks: [
      { type: "text", title: "Kelas Tersedia", text: "Tuliskan bahasa yang diajarkan & level kelas (pemula-mahir) di sini." },
      faqBlock([{ question: "Kelas online atau tatap muka?", answer: "Tersedia keduanya -- pilih sesuai kenyamananmu saat mendaftar." }]),
    ],
    monetizationHint: "Cocok dipasangkan dengan Kelas & Kursus -- aktifkan di menu Produk & Monetisasi.",
  },
  // 2 template berikut ditambahkan 6 September 2026 (permintaan langsung
  // pengguna: "buatkan template quick setup sesuai tema website minimal 2
  // di tiap category, template tema joyfull") -- niche bimbingan belajar
  // (lembaga, beda dari "tutor" individu) & persiapan ujian/sertifikasi
  // belum terwakili di kategori ini.
  {
    key: "tutoring-center",
    category: "education",
    layoutVariant: "headline",
    label: "Bimbingan Belajar",
    description: "Program les, jadwal, pendaftaran",
    theme: "joyful",
    bio: "Bimbingan belajar | Pendampingan belajar dari SD sampai SMA",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Daftar Program", "Tanya jadwal & biaya sesuai jenjang"),
      link("instagram", "Kegiatan Belajar", "Suasana kelas & momen belajar bersama"),
    ],
    blocks: [
      { type: "text", title: "Program Tersedia", text: "Tuliskan jenjang (SD/SMP/SMA), mata pelajaran, dan format kelas (privat/kelompok) di sini." },
      mapsBlock("Lokasi Bimbel"),
      faqBlock([{ question: "Ada kelas online?", answer: "Jelaskan apakah tersedia opsi belajar online selain tatap muka." }]),
    ],
    monetizationHint: "Voucher bisa dipakai untuk promo pendaftaran gelombang baru.",
  },
  {
    key: "exam-prep",
    category: "education",
    layoutVariant: "minimal",
    label: "Persiapan Ujian & Sertifikasi",
    description: "Kelas TOEFL/IELTS/CPNS, jadwal, konsultasi",
    theme: "joyful",
    bio: "Persiapan ujian | TOEFL, IELTS, CPNS, dan tes lainnya",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Konsultasi Kelas", "Tanya program sesuai target skor/ujian"),
      link("instagram", "Tips & Latihan Soal", "Materi gratis tiap minggu"),
    ],
    blocks: [
      { type: "text", title: "Program Persiapan", text: "Tuliskan jenis ujian yang kamu bantu persiapkan, target skor, dan durasi program di sini." },
      faqBlock([
        { question: "Ada simulasi ujian?", answer: "Jelaskan apakah program termasuk try out/simulasi ujian sungguhan." },
        { question: "Berapa lama sampai siap ujian?", answer: "Tulis estimasi durasi belajar sampai target skor tercapai." },
      ]),
    ],
    monetizationHint: "Produk Digital cocok untuk jual paket soal latihan/e-book strategi ujian.",
  },

  // ---------- Entertainment ----------
  {
    key: "musician",
    category: "entertainment",
    layoutVariant: "portrait",
    label: "Musisi",
    description: "Spotify, YouTube, Apple Music, media sosial",
    theme: "ember",
    bio: "Musisi | Dengerin lagu terbaruku",
    social: { instagram: "username", youtube: "@namachannel", email: "kamu@email.com" },
    links: [
      link("spotify", undefined, "Dengerin album & single terbaru"),
      link("youtube", undefined, "Music video & live session"),
      link("appleMusic", undefined, "Streaming lengkap di Apple Music"),
      link("instagram", undefined, "Cerita di balik proses bikin lagu"),
    ],
    blocks: [
      showcaseBlock({
        title: "Single Terbaru: Pulang",
        description: "Lagu terbaru yang bercerita tentang rindu rumah -- sudah bisa didengarkan di semua platform musik.",
        badgeText: "Rilisan Terbaru",
        ctaText: "Dengerin sekarang",
        url: PLATFORM_URL.spotify,
      }),
      { type: "text", title: "Rilisan Terbaru", text: "Tuliskan single/album terbarumu, plus jadwal tur/manggung kalau ada, di sini." },
      faqBlock([
        { question: "Bisa booking untuk manggung?", answer: "Bisa, DM lewat Instagram untuk diskusi jadwal & rate manggung." },
        { question: "Di mana bisa dengerin lagu-lagunya?", answer: "Semua rilisan ada di Spotify & Apple Music, link-nya di atas." },
      ]),
    ],
  },
  {
    key: "artist",
    category: "entertainment",
    layoutVariant: "spotlight",
    label: "Seniman",
    description: "Portofolio, commission, media sosial",
    theme: "sakura",
    bio: "Seniman | Open commission",
    social: { instagram: "username", email: "kamu@email.com" },
    links: [link("instagram", undefined, "Galeri karya & proses menggambar")],
    blocks: [
      showcaseBlock({
        title: "Ilustrasi Digital: Potret Senja Kota",
        description: "Karya terbaru yang paling banyak mendapat apresiasi -- proses pengerjaan sekitar 12 jam.",
        badgeText: "Karya Terbaru",
        ctaText: "Lihat detail karya",
        url: PLATFORM_URL.instagram,
      }),
      { type: "text", title: "Open Commission", text: "Tuliskan info & harga commission di sini." },
      faqBlock([{ question: "Berapa lama proses pengerjaan commission?", answer: "Tergantung kompleksitas, biasanya 3-10 hari kerja. DM dulu buat estimasi lebih pasti." }]),
      { type: "contact_form", title: "Request Commission" },
    ],
  },
  {
    key: "dj",
    category: "entertainment",
    // Tampilan persis kartu template homepage (public/homepage/templates/
    // *.png, 25 September 2026): tema foto + layout "billboard", isi tombol/
    // kartu dibaca langsung dari kartunya (OCR), warna tombol dari sampel
    // piksel. Lihat catatan di PAGE_THEMES "villa" (page-themes.ts).
    layoutVariant: "billboard",
    label: "DJ",
    description: "Mix, event, booking",
    theme: "rave",
    bio: "Music connects us closer.",
    social: { instagram: "username", email: "kamu@email.com" },
    links: [
      { title: "Dengarkan Sekarang", url: "https://open.spotify.com", iconKey: "play-circle", accentColor: "#6f48fc" },
    ],
    monetizationHint: "Cocok dipasangkan dengan Event -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "podcaster",
    category: "entertainment",
    layoutVariant: "spotlight",
    label: "Podcaster",
    description: "Episode, platform, media sosial",
    theme: "noir",
    bio: "Podcast baru tiap minggu -- dengerin sekarang",
    social: { instagram: "username", youtube: "@namachannel", email: "kamu@email.com" },
    links: [
      link("spotify", undefined, "Episode terbaru & arsip lengkap"),
      link("applePodcasts", undefined, "Dengerin langsung di Apple Podcasts"),
      link("youtube", undefined, "Versi video tiap episode"),
    ],
    blocks: [
      showcaseBlock({
        title: "Eps. 42: Belajar dari Kegagalan Bisnis",
        description: "Episode paling banyak didengarkan bulan ini -- ngobrol soal bangkit setelah bisnis pertama gagal.",
        badgeText: "Episode Favorit",
        ctaText: "Dengerin episodenya",
        url: PLATFORM_URL.spotify,
      }),
      { type: "text", title: "Episode Terbaru", text: "Tuliskan judul & topik episode terbarumu di sini." },
      faqBlock([
        { question: "Bagaimana cara jadi bintang tamu?", answer: "Kirim DM lewat salah satu kanal di atas dengan topik yang ingin kamu bahas." },
        { question: "Episode baru rilis kapan?", answer: "Rutin tiap minggu -- subscribe di salah satu platform di atas biar tidak ketinggalan." },
      ]),
    ],
  },
  {
    key: "content-creator",
    category: "entertainment",
    layoutVariant: "spotlight",
    label: "Kreator Konten",
    description: "Konten terbaru + media sosial",
    // theme "bloom" -> "azure", lihat catatan lengkap di motivational-
    // speaker di bawah.
    theme: "azure",
    bio: "Konten terbaru setiap hari",
    social: { instagram: "username", tiktok: "username", youtube: "@namachannel", email: "kamu@email.com" },
    links: [
      link("instagram", undefined, "Konten harian & momen keseharian"),
      link("tiktok", undefined, "Video pendek paling ramai ditonton"),
      link("youtube", undefined, "Series & konten durasi panjang"),
    ],
    blocks: [
      showcaseBlock({
        title: "Series: Eksperimen Konten 30 Hari",
        description: "Series eksperimen paling seru bulan ini -- dari ide gagal sampai konten yang akhirnya viral.",
        badgeText: "Series Terbaru",
        ctaText: "Tonton series-nya",
        url: PLATFORM_URL.youtube,
      }),
      { type: "text", title: "Konten Terbaru", text: "Tuliskan konten atau series terbarumu di sini." },
      { type: "contact_form", title: "Ajak Kolaborasi" },
    ],
  },
  // 1 template baru, 21 Agustus 2026 -- lihat catatan lengkap di homestay-
  // villa (kategori Tourism).
  //
  // theme "vapor" (gradien fuchsia-ungu-cyan vivid) diganti "terracotta"
  // 26 Agustus 2026 (permintaan langsung pengguna, tangkapan layar
  // sungguhan halaman ini: "hilangkan semua template yang berwarna
  // gradient ungu seperti ini, sangat jelek dan menggangu mata") -- 3
  // template lain yang memakai gradien ungu vivid serupa ("bloom": creator-
  // profile/affiliate-store/content-creator) ikut diganti bersamaan (lihat
  // masing-masing). "blaze" (orange-pink-ungu, TAPI shade 800 gelap/kalem,
  // beda karakter dari vapor/bloom yang neon-terang) SENGAJA tidak ikut
  // diubah -- bukan yang dimaksud "seperti ini" di tangkapan layar (gradien
  // vivid magenta-cyan terang). Tema "vapor"/"bloom" itu SENDIRI tidak
  // dihapus dari page-themes.ts (masih valid dipilih manual lewat menu
  // Tema) -- yang diubah cuma pilihan DEFAULT template quick-setup ini.
  {
    key: "motivational-speaker",
    category: "entertainment",
    layoutVariant: "spotlight",
    label: "Pembicara Motivasi",
    description: "Topik seminar, booking, media sosial",
    theme: "terracotta",
    bio: "Motivator & pembicara publik -- bangkitkan semangatmu",
    social: { instagram: "username", youtube: "@namachannel", email: "kamu@email.com" },
    links: [
      link("instagram", undefined, "Kutipan motivasi & cuplikan seminar"),
      link("youtube", undefined, "Rekaman seminar & talkshow lengkap"),
      link("whatsapp", "Booking Jadi Pembicara", "Tanya jadwal & booking acara"),
    ],
    blocks: [
      showcaseBlock({
        title: "Bangkit Setelah Titik Terendah",
        description: "Materi paling diminati penyelenggara acara -- membahas cara bangkit dari kegagalan jadi motivasi baru.",
        badgeText: "Topik Andalan",
        ctaText: "Lihat detail materi",
        url: PLATFORM_URL.youtube,
      }),
      { type: "text", title: "Topik Favorit", text: "Tuliskan topik seminar/talkshow yang biasa kamu bawakan di sini." },
      faqBlock([{ question: "Bagaimana cara booking untuk event?", answer: "Kirim detail acara (tanggal, tema, jumlah peserta) lewat WhatsApp, tim akan konfirmasi ketersediaan." }]),
    ],
    monetizationHint: "Cocok dipasangkan dengan Event -- aktifkan di menu Produk & Monetisasi.",
  },
  // 2 template berikut ditambahkan 6 September 2026 (permintaan langsung
  // pengguna: "buatkan template quick setup sesuai tema website minimal 2
  // di tiap category, template tema joyfull") -- niche komika & MC/host
  // acara belum terwakili di kategori ini.
  {
    key: "standup-comedian",
    category: "entertainment",
    layoutVariant: "spotlight",
    label: "Komika",
    description: "Jadwal manggung, booking, cuplikan set",
    theme: "joyful",
    bio: "Komika | Bikin ketawa lewat cerita sehari-hari",
    social: { instagram: "username", tiktok: "username", youtube: "@namachannel" },
    links: [
      link("youtube", "Cuplikan Open Mic", "Highlight set komedi terbaru"),
      link("whatsapp", "Booking Manggung", "Untuk acara privat/korporat"),
    ],
    blocks: [
      { type: "text", title: "Jadwal Manggung", text: "Tuliskan jadwal open mic/gigs terdekat beserta lokasinya di sini." },
      faqBlock([{ question: "Bisa untuk acara kantor?", answer: "Jelaskan format set untuk acara korporat/privat & durasinya." }]),
    ],
    monetizationHint: "Event & Tiket cocok kalau kamu mengadakan show tiket sendiri.",
  },
  {
    key: "mc-host",
    category: "entertainment",
    layoutVariant: "portrait",
    label: "MC & Host Acara",
    description: "Portofolio, jenis acara, booking",
    theme: "joyful",
    bio: "MC & host acara | Bikin acaramu hidup dari awal sampai akhir",
    social: { instagram: "username", tiktok: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Booking Tanggal", "Cek ketersediaan & tarif sesuai jenis acara"),
      link("instagram", "Cuplikan Acara", "Dokumentasi jadi MC di berbagai acara"),
    ],
    blocks: [
      { type: "text", title: "Jenis Acara", text: "Tuliskan jenis acara yang kamu tangani (pernikahan, korporat, ulang tahun) beserta bahasa yang dikuasai di sini." },
      faqBlock([{ question: "Apakah bisa request rundown khusus?", answer: "Jelaskan proses koordinasi rundown sebelum hari-H." }]),
    ],
    monetizationHint: "Payment Link memudahkan menagih DP booking sebelum hari acara.",
  },

  // ---------- Local Business ----------
  {
    key: "restaurant",
    category: "local",
    // Tampilan persis kartu template homepage (public/homepage/templates/
    // *.png, 25 September 2026): tema foto + layout "billboard", isi tombol/
    // kartu dibaca langsung dari kartunya (OCR), warna tombol dari sampel
    // piksel. Lihat catatan di PAGE_THEMES "villa" (page-themes.ts).
    layoutVariant: "billboard",
    label: "Restoran",
    description: "Menu, reservasi, lokasi, WhatsApp",
    theme: "bistro",
    bio: "Cita rasa lokal untuk cerita yang lebih hangat.",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      { title: "Lihat Menu", url: "https://websitekamu.com/menu", iconKey: "utensils", accentColor: "#5d46fc" },
      { title: "Reservasi", url: "https://wa.me/62", iconKey: "calendar" },
    ],
  },
  {
    key: "cafe",
    category: "local",
    layoutVariant: "cover",
    label: "Kafe",
    description: "Menu, Instagram, Google Maps",
    theme: "brew",
    bio: "Cafe | Ngopi santai di sini",
    social: { instagram: "username" },
    links: [link("instagram", "Ikuti Update Kami", "Menu favorit & suasana cafe")],
    blocks: [
      mapsBlock(),
      showcaseBlock({
        title: "Kopi Susu Gula Aren Signature",
        description: "Menu paling dicari pelanggan -- racikan kopi susu gula aren khas cafe kami.",
        badgeText: "Menu Favorit",
        ctaText: "Lihat menu lengkap",
        url: PLATFORM_URL.instagram,
      }),
      { type: "text", title: "Menu", text: "Tuliskan menu andalan cafemu di sini." },
    ],
  },
  {
    key: "barbershop",
    category: "local",
    layoutVariant: "masthead",
    label: "Barbershop",
    description: "Layanan, daftar harga, booking",
    theme: "noir",
    bio: "Barbershop | Booking potong rambut",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [link("whatsapp", "Booking via WhatsApp", "Booking jadwal potong rambut")],
    blocks: [
      mapsBlock(),
      showcaseBlock({
        title: "Paket Potong + Cukur + Creambath",
        description: "Paket paling laris pelanggan -- kombinasi lengkap perawatan rambut & wajah dalam satu sesi.",
        badgeText: "Layanan Favorit",
        ctaText: "Cek harga lengkap",
        url: PLATFORM_URL.whatsapp,
      }),
      { type: "text", title: "Daftar Harga", text: "Tuliskan layanan & harga di sini." },
      faqBlock([{ question: "Perlu booking dulu atau bisa walk-in?", answer: "Bisa walk-in, tapi disarankan booking dulu via WhatsApp supaya tidak antre lama." }]),
    ],
    monetizationHint: "Cocok dipasangkan dengan Voucher untuk paket langganan -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "salon",
    category: "local",
    layoutVariant: "masthead",
    label: "Salon",
    description: "Layanan, portofolio, booking",
    theme: "surge",
    bio: "Salon kecantikan | Booking treatment",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("instagram", "Lihat Hasil Treatment", "Hasil treatment pelanggan sebelumnya"),
      link("whatsapp", "Booking via WhatsApp", "Booking jadwal treatment favoritmu"),
    ],
    blocks: [
      mapsBlock(),
      showcaseBlock({
        title: "Hair Spa & Smoothing Package",
        description: "Treatment paling diminati bulan ini -- rambut lembut & rapi tahan berbulan-bulan.",
        badgeText: "Treatment Favorit",
        ctaText: "Lihat paket lengkap",
        url: PLATFORM_URL.whatsapp,
      }),
      { type: "text", title: "Layanan & Treatment", text: "Tuliskan daftar treatment & harga yang kamu tawarkan di sini." },
    ],
    monetizationHint: "Cocok dipasangkan dengan Voucher untuk paket treatment -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "photographer",
    category: "local",
    layoutVariant: "masthead",
    label: "Fotografer",
    description: "Portofolio, harga, booking",
    theme: "nova",
    bio: "Fotografer | Booking sesi foto",
    social: { instagram: "username", email: "kamu@email.com" },
    links: [link("instagram", "Lihat Portofolio", "Portofolio hasil jepretan terbaik")],
    blocks: [
      mapsBlock("Lokasi Studio"),
      showcaseBlock({
        title: "Prewedding Golden Hour di Pantai",
        description: "Salah satu sesi foto favorit klien -- momen golden hour yang bikin hasil foto makin dramatis.",
        badgeText: "Karya Favorit",
        ctaText: "Lihat galeri lengkap",
        url: PLATFORM_URL.instagram,
      }),
      { type: "text", title: "Paket & Harga", text: "Tuliskan paket foto & harga di sini." },
      faqBlock([{ question: "Apakah harga sudah termasuk edit foto?", answer: "Ya, semua paket sudah termasuk edit dasar. Edit lanjutan tersedia dengan biaya tambahan." }]),
    ],
    monetizationHint: "Cocok dipasangkan dengan Bundel untuk paket foto -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "event-organizer",
    category: "local",
    // Tampilan persis kartu template homepage (public/homepage/templates/
    // *.png, 25 September 2026): tema foto + layout "billboard", isi tombol/
    // kartu dibaca langsung dari kartunya (OCR), warna tombol dari sampel
    // piksel. Lihat catatan di PAGE_THEMES "villa" (page-themes.ts).
    layoutVariant: "billboard",
    label: "Event Organizer",
    description: "Event, portofolio, kontak",
    theme: "gala",
    bio: "Event bermakna untuk lebih banyak cerita!",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      { title: "Sore di Taman", url: "https://websitekamu.com/event", description: "24 Agustus · Jakarta", iconKey: "calendar-days", badgeText: "24 Agu" },
      { title: "Dapatkan Tiket", url: "https://websitekamu.com/tiket", iconKey: "ticket", accentColor: "#defb53" },
    ],
    monetizationHint: "Cocok dipasangkan dengan Event -- aktifkan di menu Produk & Monetisasi.",
  },
  // "sports-facility"/"nightlife-venue" -- hasil analisa galeri tema
  // kompetitor, 17 Agustus 2026: template s.id "Sports Facility" (booking
  // lapangan) & "Nightlife" (reservasi meja/event malam) belum punya
  // padanan di kategori "local" -- barbershop/salon/fotografer di atas
  // semuanya jasa personal, bukan bisnis penyewaan tempat/venue.
  {
    key: "sports-facility",
    category: "local",
    layoutVariant: "ticket",
    label: "Fasilitas Olahraga",
    description: "Sewa lapangan, jadwal, booking",
    theme: "forest",
    bio: "Sewa lapangan -- booking jadwal main sekarang",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [link("whatsapp", "Booking Lapangan", "Booking jadwal & cek slot kosong")],
    blocks: [
      mapsBlock("Lokasi Lapangan"),
      showcaseBlock({
        title: "Lapangan Futsal Indoor Standar Turnamen",
        description: "Fasilitas paling banyak dibooking -- rumput sintetis kualitas turnamen dengan pencahayaan lengkap.",
        badgeText: "Fasilitas Favorit",
        ctaText: "Cek jadwal kosong",
        url: PLATFORM_URL.whatsapp,
      }),
      { type: "text", title: "Jadwal & Harga Sewa", text: "Tuliskan jam operasional & harga sewa per jam di sini." },
      faqBlock([{ question: "Apakah bisa booking harian atau harus langganan?", answer: "Bisa booking harian atau paket langganan bulanan -- chat WhatsApp buat cek slot kosong." }]),
    ],
    monetizationHint: "Cocok dipasangkan dengan Voucher untuk paket jam sewa -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "nightlife-venue",
    category: "local",
    layoutVariant: "spotlight",
    label: "Tempat Hiburan Malam",
    description: "Event, reservasi meja, lokasi",
    theme: "noir",
    bio: "Tempat nongkrong malam -- reservasi meja sekarang",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Reservasi Meja", "Reservasi meja untuk malam ini"),
      link("instagram", "Lihat Event Kami", "Line-up DJ & suasana malam ini"),
    ],
    blocks: [
      mapsBlock(),
      showcaseBlock({
        title: "Ladies Night: DJ Set & Promo Spesial",
        description: "Event mingguan paling ramai dikunjungi -- line-up DJ lokal dengan promo minuman spesial.",
        badgeText: "Event Malam Ini",
        ctaText: "Reservasi sekarang",
        url: PLATFORM_URL.whatsapp,
      }),
      { type: "text", title: "Event Malam Ini", text: "Tuliskan jadwal DJ/live music/tema malam mingguan di sini." },
      { type: "contact_form", title: "Reservasi Meja" },
    ],
  },
  // 4 template baru, 21 Agustus 2026 (permintaan langsung pengguna: "saya
  // mau buatkan lagi tema dan layout quick setup lebih banyak lagi pilihan
  // nya") -- niche jasa lokal yang belum terwakili (properti/pernikahan/
  // laundry/gym), lihat catatan lengkap di homestay-villa (kategori
  // Tourism) soal filosofi penambahan batch ini.
  {
    key: "real-estate-agent",
    category: "local",
    layoutVariant: "split",
    label: "Agen Properti",
    description: "Listing properti, konsultasi, kontak",
    theme: "corporate",
    bio: "Agen properti -- bantu wujudkan rumah impianmu",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx", email: "kamu@email.com" },
    links: [
      link("whatsapp", "Konsultasi Properti", "Konsultasi properti & simulasi KPR"),
      link("instagram", "Lihat Listing Rumah", "Listing terbaru & tur virtual rumah"),
    ],
    blocks: [
      showcaseBlock({
        title: "Rumah Minimalis 2 Lantai di Kawasan Strategis",
        description: "Listing paling banyak ditanyakan bulan ini -- lokasi strategis dekat akses tol & sekolah.",
        badgeText: "Listing Favorit",
        ctaText: "Lihat detail listing",
        url: PLATFORM_URL.whatsapp,
      }),
      { type: "text", title: "Listing Terbaru", text: "Tuliskan properti yang sedang kamu tawarkan (lokasi, harga, tipe) di sini." },
      faqBlock([{ question: "Apakah bisa bantu proses KPR?", answer: "Bisa, aku bantu proses dari awal sampai akad -- termasuk simulasi & pengajuan KPR ke bank rekanan." }]),
      { type: "contact_form", title: "Konsultasi Gratis" },
    ],
    monetizationHint: "Cocok dipasangkan dengan Produk Digital (panduan/e-book properti) -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "wedding-organizer",
    category: "local",
    layoutVariant: "ticket",
    label: "Wedding Organizer",
    description: "Paket nikah, portofolio, konsultasi",
    theme: "champagne",
    bio: "Wedding organizer -- wujudkan hari bahagiamu",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx", email: "kamu@email.com" },
    links: [
      link("whatsapp", "Konsultasi Paket Nikah", "Konsultasi konsep & cek jadwal tersedia"),
      link("instagram", "Lihat Portofolio Kami", "Portofolio pernikahan yang sudah kami tangani"),
    ],
    blocks: [
      showcaseBlock({
        title: "Konsep Garden Wedding Rustic",
        description: "Salah satu konsep pernikahan favorit klien -- nuansa outdoor hangat dengan dekorasi rustic.",
        badgeText: "Portofolio Favorit",
        ctaText: "Lihat portofolio lengkap",
        url: PLATFORM_URL.instagram,
      }),
      { type: "text", title: "Paket Pernikahan", text: "Tuliskan paket WO (harga, vendor, layanan) yang kamu tawarkan di sini." },
      faqBlock([{ question: "Berapa lama sebelum hari-H sebaiknya booking?", answer: "Idealnya 6-12 bulan sebelumnya supaya vendor favorit masih tersedia -- tapi tetap hubungi kami untuk cek jadwal terdekat." }]),
      { type: "contact_form", title: "Konsultasi Pernikahan" },
    ],
  },
  {
    key: "laundry-service",
    category: "local",
    layoutVariant: "masthead",
    label: "Jasa Laundry",
    description: "Layanan, harga, antar-jemput",
    theme: "azure",
    bio: "Laundry -- bersih, wangi, cepat selesai",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [link("whatsapp", "Order Antar-Jemput", "Order antar-jemput sekarang")],
    blocks: [
      mapsBlock(),
      showcaseBlock({
        title: "Paket Cuci Setrika Kilat 6 Jam",
        description: "Layanan paling sering dipesan pelanggan -- cocok untuk kebutuhan mendadak, selesai hari yang sama.",
        badgeText: "Layanan Favorit",
        ctaText: "Lihat harga lengkap",
        url: PLATFORM_URL.whatsapp,
      }),
      { type: "text", title: "Layanan & Harga", text: "Tuliskan jenis layanan (kiloan/satuan/setrika) & harga per kg di sini." },
      faqBlock([{ question: "Apakah ada layanan antar-jemput?", answer: "Ada, gratis untuk area sekitar -- chat WhatsApp untuk cek jangkauan & jadwal jemput." }]),
    ],
  },
  {
    key: "gym-fitness-center",
    category: "local",
    layoutVariant: "portrait",
    label: "Gym & Pusat Kebugaran",
    description: "Kelas, membership, booking",
    theme: "electric",
    bio: "Gym & fitness center -- mulai transformasi tubuhmu",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Daftar Member", "Daftar member & tanya jadwal kelas"),
      link("instagram", "Lihat Fasilitas Kami", "Suasana gym & momen member"),
    ],
    blocks: [
      mapsBlock("Lokasi Gym"),
      showcaseBlock({
        title: "HIIT Class: Transformasi 30 Hari",
        description: "Program kelas paling diminati member baru -- hasil terlihat nyata dalam 30 hari konsisten latihan.",
        badgeText: "Kelas Favorit",
        ctaText: "Lihat jadwal kelas",
        url: PLATFORM_URL.whatsapp,
      }),
      { type: "text", title: "Kelas & Membership", text: "Tuliskan jenis kelas (yoga, HIIT, angkat beban) & harga membership di sini." },
      faqBlock([{ question: "Ada trial gratis?", answer: "Ada, trial 1 hari gratis untuk member baru -- datang langsung atau daftar via WhatsApp dulu." }]),
    ],
    monetizationHint: "Cocok dipasangkan dengan Kelas & Kursus -- aktifkan di menu Produk & Monetisasi.",
  },
  // 2 template berikut ditambahkan 6 September 2026 (permintaan langsung
  // pengguna: "buatkan template quick setup sesuai tema website minimal 2
  // di tiap category, template tema joyfull") -- niche bengkel & jasa
  // percetakan/sablon belum terwakili di kategori ini.
  {
    key: "auto-repair-shop",
    category: "local",
    layoutVariant: "masthead",
    label: "Bengkel Motor & Mobil",
    description: "Layanan servis, harga, booking",
    theme: "joyful",
    bio: "Bengkel | Servis motor & mobil cepat dan terpercaya",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Booking Servis", "Pilih jenis servis & jadwal yang kosong"),
      link("instagram", "Hasil Kerja Kami", "Sebelum-sesudah servis & perbaikan"),
    ],
    blocks: [
      mapsBlock("Lokasi Bengkel"),
      { type: "text", title: "Layanan & Harga", text: "Tuliskan jenis servis (ganti oli, tune up, body repair) beserta estimasi harganya di sini." },
      faqBlock([{ question: "Apakah ada layanan panggil ke lokasi?", answer: "Jelaskan apakah tersedia servis panggil dan area jangkauannya." }]),
    ],
    monetizationHint: "Voucher bisa dipakai untuk promo servis rutin/member.",
  },
  {
    key: "print-shop",
    category: "local",
    layoutVariant: "cover",
    label: "Percetakan & Sablon",
    description: "Layanan cetak, katalog, pemesanan",
    theme: "joyful",
    bio: "Percetakan & sablon | Cetak cepat, hasil rapi",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Pesan Cetak", "Kirim desain & jumlah yang dibutuhkan"),
      link("instagram", "Portofolio Hasil Cetak", "Contoh hasil sablon & cetak sebelumnya"),
    ],
    blocks: [
      { type: "text", title: "Layanan Cetak", text: "Tuliskan jenis produk (kaos, banner, kartu nama, stiker) beserta minimum order dan estimasi harga di sini." },
      faqBlock([{ question: "Berapa lama proses cetak?", answer: "Tulis estimasi waktu pengerjaan tergantung jumlah & jenis produk." }]),
    ],
    monetizationHint: "Payment Link memudahkan menagih DP sebelum produksi dimulai.",
  },

  // ---------- Tourism & Travel ----------
  // Hasil analisa galeri tema kompetitor, 17 Agustus 2026 (permintaan
  // langsung pengguna): template s.id "Pariwisata" (skyline ilustrasi,
  // Google Maps, kartu destinasi) & "Hello Summer" (itinerary perjalanan)
  // -- kategori baru, lihat catatan lengkap di QUICK_SETUP_CATEGORIES.
  {
    key: "travel-agency",
    category: "tourism",
    layoutVariant: "hero",
    label: "Agen Travel",
    description: "Paket wisata, booking, lokasi",
    theme: "lagoon",
    bio: "Agen wisata, wujudkan liburan impianmu",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Booking Paket Wisata", "Booking paket & tanya ketersediaan"),
      link("instagram", "Lihat Destinasi Kami", "Dokumentasi trip & testimoni peserta"),
    ],
    blocks: [
      showcaseBlock({
        title: "Open Trip 3D2N Labuan Bajo",
        description: "Paket paling laris bulan ini -- island hopping, snorkeling, dan sunset di Pulau Padar.",
        badgeText: "Paket Favorit",
        ctaText: "Lihat detail paket",
        url: PLATFORM_URL.whatsapp,
      }),
      { type: "text", title: "Paket Wisata", text: "Tuliskan paket wisata & harga yang kamu tawarkan di sini." },
      mapsBlock("Kantor Kami"),
      faqBlock([{ question: "Apakah harga sudah termasuk penginapan?", answer: "Tergantung paket -- detail sudah dicantumkan di masing-masing paket, atau tanya langsung via WhatsApp." }]),
    ],
  },
  {
    key: "tour-guide",
    category: "tourism",
    layoutVariant: "polaroid",
    label: "Pemandu Wisata",
    description: "Rute wisata, cerita perjalanan, booking",
    theme: "dune",
    bio: "Pemandu wisata lokal -- jelajahi bareng aku",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Booking Tur", "Booking jadwal tur bareng aku"),
      link("instagram", "Lihat Cerita Perjalanan", "Cerita perjalanan & spot tersembunyi"),
    ],
    blocks: [
      showcaseBlock({
        title: "Susur Kota Tua: Jejak Sejarah Tersembunyi",
        description: "Rute paling diminati peserta tur -- jalan kaki santai sambil dengerin cerita sejarah tiap sudut kota.",
        badgeText: "Rute Favorit",
        ctaText: "Lihat rute lengkap",
        url: PLATFORM_URL.whatsapp,
      }),
      { type: "text", title: "Rute & Destinasi", text: "Tuliskan rute/destinasi favorit yang biasa kamu pandu di sini." },
      faqBlock([{ question: "Berapa orang maksimal per grup tur?", answer: "Fleksibel sesuai permintaan -- chat WhatsApp buat diskusi jumlah peserta & jadwal." }]),
    ],
  },
  // 5 template baru, 21 Agustus 2026 (permintaan langsung pengguna: "saya
  // mau buatkan lagi tema dan layout quick setup lebih banyak lagi pilihan
  // nya") -- Tourism sebelumnya kategori PALING SEDIKIT templatenya (cuma
  // 2), diperkuat jadi 7 supaya sepadan kategori lain. Tiap sub-niche dapat
  // varian layout & tema BERBEDA (bukan cuma 2 yang sama seperti sebelumnya)
  // supaya benar-benar variatif, bukan cuma jumlah bertambah.
  {
    key: "homestay-villa",
    category: "tourism",
    // Tampilan persis kartu template homepage (public/homepage/templates/
    // *.png, 25 September 2026): tema foto + layout "billboard", isi tombol/
    // kartu dibaca langsung dari kartunya (OCR), warna tombol dari sampel
    // piksel. Lihat catatan di PAGE_THEMES "villa" (page-themes.ts).
    layoutVariant: "billboard",
    label: "Homestay & Villa",
    description: "Fasilitas, lokasi, booking",
    theme: "villa",
    bio: "Rumah kedua, di tempat yang lebih indah.",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      { title: "Pesan Sekarang", url: "https://wa.me/62", iconKey: "calendar-days", accentColor: "#fe5642" },
      { title: "Lihat Lokasi", url: "https://maps.google.com", iconKey: "map-pin" },
    ],
  },
  {
    key: "diving-center",
    category: "tourism",
    // Tampilan persis kartu template homepage (public/homepage/templates/
    // *.png, 25 September 2026): tema foto + layout "billboard", isi tombol/
    // kartu dibaca langsung dari kartunya (OCR), warna tombol dari sampel
    // piksel. Lihat catatan di PAGE_THEMES "villa" (page-themes.ts).
    layoutVariant: "billboard",
    label: "Pusat Selam",
    description: "Paket diving, spot, booking",
    theme: "reef",
    bio: "Selam lebih dalam, jadi versi terbaikmu.",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      { title: "Kursus Selam", url: "https://websitekamu.com/kursus", description: "Untuk semua level", iconKey: "waves" },
      { title: "Paket Trip", url: "https://websitekamu.com/trip", description: "Raja Ampat & lainnya", iconKey: "ship" },
    ],
  },
  {
    key: "culinary-tour",
    category: "tourism",
    layoutVariant: "masthead",
    label: "Wisata Kuliner",
    description: "Rute kuliner, jadwal, booking",
    theme: "terracotta",
    bio: "Wisata kuliner -- jelajahi rasa autentik daerah ini",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Booking Tur Kuliner", "Booking jadwal tur kuliner terdekat"),
      link("instagram", "Lihat Menu Tur", "Cuplikan tiap pemberhentian tur"),
    ],
    blocks: [
      showcaseBlock({
        title: "Tur Malam: 5 Jajanan Legendaris Kota",
        description: "Rute paling laris -- lima tempat makan legendaris dalam satu tur malam yang bikin kenyang.",
        badgeText: "Rute Favorit",
        ctaText: "Lihat rute lengkap",
        url: PLATFORM_URL.whatsapp,
      }),
      { type: "text", title: "Rute Kuliner", text: "Tuliskan tempat makan/jajanan khas yang dikunjungi selama tur di sini." },
      faqBlock([{ question: "Harga tur sudah termasuk makanan?", answer: "Sudah, semua paket termasuk cicip makanan di setiap pemberhentian -- tinggal siapkan perut kosong!" }]),
    ],
  },
  {
    key: "adventure-guide",
    category: "tourism",
    // Tampilan persis kartu template homepage (public/homepage/templates/
    // *.png, 25 September 2026): tema foto + layout "billboard", isi tombol/
    // kartu dibaca langsung dari kartunya (OCR), warna tombol dari sampel
    // piksel. Lihat catatan di PAGE_THEMES "villa" (page-themes.ts).
    layoutVariant: "billboard",
    label: "Pemandu Petualangan",
    description: "Trekking, camping, booking",
    theme: "rimba",
    bio: "Lebih dari perjalanan, ini tentang makna.",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      { title: "Paket Pendakian", url: "https://websitekamu.com/paket", description: "Gunung Rinjani", iconKey: "mountain" },
      { title: "Konsultasi via WhatsApp", url: "https://wa.me/62", iconKey: "brand-whatsapp", accentColor: "#83f98b" },
    ],
  },
  {
    key: "city-tour",
    category: "tourism",
    layoutVariant: "hero",
    label: "Wisata Kota",
    description: "Destinasi, titik kumpul, booking",
    theme: "skyline",
    bio: "City tour -- kenali kota ini lebih dekat",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Booking City Tour", "Booking jadwal city tour terdekat"),
      link("instagram", "Lihat Destinasi Tur", "Cuplikan destinasi tiap tur"),
    ],
    blocks: [
      mapsBlock("Titik Kumpul"),
      showcaseBlock({
        title: "Tur Sore: Landmark & Sunset Point",
        description: "Rute paling diminati peserta -- kunjungi landmark bersejarah lalu ditutup dengan sunset point terbaik kota.",
        badgeText: "Destinasi Favorit",
        ctaText: "Lihat rute lengkap",
        url: PLATFORM_URL.whatsapp,
      }),
      { type: "text", title: "Destinasi Wajib", text: "Tuliskan landmark/tempat bersejarah yang dikunjungi selama tur di sini." },
      faqBlock([{ question: "Tur jalan kaki atau naik kendaraan?", answer: "Tergantung paket -- ada opsi jalan kaki santai atau naik kendaraan untuk jarak lebih jauh." }]),
    ],
  },
  // 2 template berikut ditambahkan 6 September 2026 (permintaan langsung
  // pengguna: "buatkan template quick setup sesuai tema website minimal 2
  // di tiap category, template tema joyfull") -- niche rental kendaraan
  // wisata & island hopping belum terwakili di kategori ini.
  {
    key: "car-rental",
    category: "tourism",
    layoutVariant: "hero",
    label: "Rental Mobil & Motor Wisata",
    description: "Armada, harga sewa, booking",
    theme: "joyful",
    bio: "Rental mobil & motor | Jelajah destinasi dengan nyaman",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Booking Sewa", "Pilih tanggal & jenis kendaraan"),
      link("instagram", "Daftar Armada", "Foto & spesifikasi kendaraan yang tersedia"),
    ],
    blocks: [
      { type: "text", title: "Armada & Harga", text: "Tuliskan daftar kendaraan, harga sewa harian, dan syarat sewa (KTP/SIM/deposit) di sini." },
      faqBlock([
        { question: "Sewa lepas kunci atau dengan sopir?", answer: "Jelaskan opsi yang tersedia dan perbedaan harganya." },
        { question: "Apakah antar-jemput bandara?", answer: "Tulis apakah tersedia layanan antar-jemput dan biayanya." },
      ]),
    ],
    monetizationHint: "Voucher bisa dipakai untuk promo sewa jangka panjang.",
  },
  {
    key: "island-hopping",
    category: "tourism",
    layoutVariant: "polaroid",
    label: "Island Hopping & Wisata Bahari",
    description: "Paket trip, spot, booking",
    theme: "joyful",
    bio: "Island hopping | Jelajah pulau & spot snorkeling tersembunyi",
    social: { instagram: "username", tiktok: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Booking Trip", "Pilih paket & tanggal keberangkatan"),
      link("instagram", "Spot Favorit", "Foto & cerita pulau yang pernah dikunjungi"),
    ],
    blocks: [
      { type: "text", title: "Paket Trip", text: "Tuliskan pulau/spot yang dikunjungi, durasi, dan apa saja yang termasuk (kapal, alat snorkeling, makan siang) di sini." },
      faqBlock([{ question: "Apakah aman untuk yang tidak bisa berenang?", answer: "Jelaskan ketersediaan life jacket dan pendampingan di air." }]),
    ],
    monetizationHint: "Produk Digital cocok untuk jual paket trip open trip dalam satu harga tetap.",
  },

  // ---------- Lifestyle ----------
  // TIDAK dapat kartu showcase (revisi 26 Agustus 2026, lihat catatan
  // lengkap di atas file ini) -- kartu tautan+FAQ yang sudah diperkaya
  // deskripsi dinilai sudah cukup mewakili kategori ini.
  {
    key: "travel-blogger",
    category: "lifestyle",
    layoutVariant: "polaroid",
    label: "Travel Blogger",
    description: "Destinasi, panduan perjalanan, media sosial",
    theme: "lagoon",
    bio: "Travel blogger | Cerita dari berbagai destinasi",
    social: { instagram: "username", youtube: "@namachannel", tiktok: "username" },
    links: [
      link("instagram", undefined, "Foto destinasi & cerita perjalanan"),
      link("youtube", undefined, "Vlog perjalanan durasi panjang"),
      link("tiktok", undefined, "Tips traveling dalam video singkat"),
    ],
    blocks: [
      { type: "text", title: "Destinasi Terbaru", text: "Tuliskan destinasi yang baru kamu kunjungi & tips perjalanannya di sini." },
      faqBlock([
        { question: "Bisa minta rekomendasi itinerary?", answer: "Bisa, DM lewat Instagram sebutkan destinasi & budgetmu, aku bantu kasih rekomendasi." },
        { question: "Kamera/alat apa yang kamu pakai?", answer: "Cek highlight Instagram-ku, ada rangkuman alat & aplikasi editing yang biasa aku pakai." },
      ]),
    ],
  },
  {
    key: "fitness-coach",
    category: "lifestyle",
    layoutVariant: "duo",
    label: "Pelatih Fitness",
    description: "Latihan, program, booking",
    theme: "dune",
    bio: "Fitness coach | Program latihan bareng aku",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("instagram", undefined, "Progress member & tips latihan"),
      link("whatsapp", undefined, "Konsultasi program sesuai tujuanmu"),
    ],
    blocks: [
      { type: "text", title: "Program Latihan", text: "Tuliskan jenis program latihan yang kamu tawarkan (durasi, target, harga) di sini." },
      { type: "contact_form", title: "Konsultasi Gratis" },
    ],
    monetizationHint: "Cocok dipasangkan dengan Kelas & Kursus -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "beauty-creator",
    category: "lifestyle",
    layoutVariant: "duo",
    label: "Kreator Kecantikan",
    description: "Tutorial, produk, media sosial",
    theme: "rose",
    bio: "Beauty creator | Tutorial makeup & skincare",
    social: { instagram: "username", tiktok: "username", youtube: "@namachannel" },
    links: [
      link("instagram", undefined, "Tutorial makeup & rekomendasi produk"),
      link("tiktok", undefined, "Tutorial singkat paling sering ditonton"),
      link("youtube", undefined, "Tutorial lengkap step-by-step"),
    ],
    blocks: [
      { type: "text", title: "Produk Favorit", text: "Tuliskan produk makeup/skincare favoritmu yang sering direkomendasikan di sini." },
      faqBlock([
        { question: "Bisa minta rekomendasi sesuai jenis kulit?", answer: "Bisa, DM lewat Instagram sebutkan jenis kulit & masalahmu, aku bantu rekomendasikan." },
        { question: "Semua produk yang kamu review original?", answer: "Selalu original, sebagian beli sendiri sebagian PR brand -- selalu aku sebutkan mana yang mana." },
      ]),
    ],
  },
  {
    key: "lifestyle-creator",
    category: "lifestyle",
    layoutVariant: "polaroid",
    label: "Kreator Gaya Hidup",
    description: "Konten, rekomendasi, afiliasi",
    theme: "peach",
    bio: "Lifestyle creator | Rekomendasi favoritku",
    social: { instagram: "username", tiktok: "username" },
    links: [
      link("instagram", undefined, "Rekomendasi tempat & produk favorit"),
      link("tiktok", undefined, "Konten singkat kebiasaan sehari-hari"),
    ],
    blocks: [{ type: "text", title: "Rekomendasi Favorit", text: "Tuliskan produk, tempat, atau kebiasaan favorit yang sering kamu bagikan di sini." }],
    monetizationHint: "Cocok dipasangkan dengan Afiliasi -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "fashion-creator",
    category: "lifestyle",
    layoutVariant: "polaroid",
    label: "Kreator Fashion",
    description: "Outfit, tautan belanja, media sosial",
    theme: "rose",
    bio: "Fashion creator | Inspirasi outfit harian",
    social: { instagram: "username", tiktok: "username" },
    links: [
      link("instagram", undefined, "Inspirasi outfit harian & mix-match"),
      link("tiktok", undefined, "OOTD dalam video singkat"),
    ],
    blocks: [
      { type: "text", title: "Outfit Guide", text: "Tuliskan gaya/kategori outfit yang sering kamu bagikan (kasual, kerja, formal, dst) di sini." },
      faqBlock([{ question: "Baju di outfit kamu beli di mana?", answer: "Cek deskripsi tautan produk di atas -- link belanja selalu aku cantumkan di sana." }]),
      { type: "contact_form", title: "Ajak Kolaborasi" },
    ],
    monetizationHint: "Cocok dipasangkan dengan Afiliasi -- aktifkan di menu Produk & Monetisasi.",
  },
  // 2 template berikut ditambahkan 6 September 2026 (permintaan langsung
  // pengguna: "saya mau buatkan 10 template yang sesuai dengan tema web
  // ini") -- mengisi celah niche kuliner & parenting yang belum
  // terwakili di kategori ini (5 template sebelumnya semua soal
  // travel/fitness/beauty/gaya hidup umum/fashion, belum ada yang
  // berpusat pada makanan atau keluarga).
  {
    key: "food-content-creator",
    category: "lifestyle",
    layoutVariant: "hero",
    label: "Food Content Creator",
    description: "Review kuliner, resep, rekomendasi tempat makan",
    theme: "terracotta",
    bio: "Food creator | Review jujur tempat makan & resep rumahan",
    social: { instagram: "username", tiktok: "username", youtube: "@namachannel" },
    links: [
      link("tiktok", "Review Tempat Makan", "Rekomendasi kuliner terbaru tiap minggu"),
      link("instagram", "Resep & Tips Dapur", "Resep simpel yang sering ditanyakan follower"),
    ],
    blocks: [
      { type: "text", title: "Kerja Sama Review", text: "Tuliskan jenis kerja sama yang kamu terima (endorse, visit resto, video review) beserta rate-nya di sini." },
      faqBlock([{ question: "Bagaimana cara ajak kerja sama?", answer: "Jelaskan cara & informasi yang perlu disiapkan calon klien sebelum menghubungimu." }]),
      { type: "contact_form", title: "Ajak Kolaborasi" },
    ],
    monetizationHint: "Cocok dipasangkan dengan Afiliasi -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "parenting-creator",
    category: "lifestyle",
    layoutVariant: "banner",
    label: "Parenting & Mom Blogger",
    description: "Tips parenting, rekomendasi produk anak",
    theme: "blush",
    bio: "Mom blogger | Cerita & tips seputar tumbuh kembang anak",
    social: { instagram: "username", tiktok: "username" },
    links: [
      link("instagram", "Cerita Parenting", "Momen & tips keseharian bersama anak"),
      link("tiktok", "Rekomendasi Produk Anak", "Barang yang benar-benar aku pakai"),
    ],
    blocks: [
      { type: "text", title: "Tentang Aku & Keluarga", text: "Tuliskan cerita singkat tentang kamu, usia anak, dan topik parenting yang sering kamu bahas di sini." },
      faqBlock([{ question: "Produk yang direkomendasikan beli di mana?", answer: "Cek deskripsi tautan produk di atas -- link belanja selalu aku cantumkan di sana." }]),
    ],
    monetizationHint: "Cocok dipasangkan dengan Afiliasi -- aktifkan di menu Produk & Monetisasi.",
  },
  // 2 template berikut ditambahkan 6 September 2026 (permintaan langsung
  // pengguna: "buatkan template quick setup sesuai tema website minimal 2
  // di tiap category, template tema joyfull") -- niche bookstagrammer &
  // konten dekorasi rumah belum terwakili di kategori ini.
  {
    key: "book-content-creator",
    category: "lifestyle",
    layoutVariant: "polaroid",
    label: "Bookstagrammer",
    description: "Ulasan buku, rekomendasi, media sosial",
    theme: "joyful",
    bio: "Bookstagrammer | Ulasan jujur buku yang layak dibaca",
    social: { instagram: "username", tiktok: "username" },
    links: [
      link("instagram", "Ulasan Buku Terbaru", "Rating & rekomendasi mingguan"),
      link("tiktok", "BookTok Favorit", "Rekomendasi singkat dalam video"),
    ],
    blocks: [
      { type: "text", title: "Genre Favorit", text: "Tuliskan genre buku yang sering kamu ulas dan gaya ulasanmu di sini." },
      faqBlock([{ question: "Bisa titip endorse buku?", answer: "Jelaskan cara & syarat kerja sama endorse dengan penerbit/penulis." }]),
    ],
    monetizationHint: "Cocok dipasangkan dengan Afiliasi -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "home-decor-creator",
    category: "lifestyle",
    layoutVariant: "duo",
    label: "Konten Dekorasi Rumah",
    description: "Inspirasi dekor, rekomendasi produk",
    theme: "joyful",
    bio: "Home decor creator | Inspirasi rumah nyaman dengan budget masuk akal",
    social: { instagram: "username", tiktok: "username" },
    links: [
      link("instagram", "Inspirasi Dekor", "Ide dekorasi ruang per ruang"),
      link("tiktok", "Before-After Rumah", "Transformasi ruang dalam video singkat"),
    ],
    blocks: [
      { type: "text", title: "Tentang Konten Ini", text: "Tuliskan gaya dekor yang kamu bagikan (minimalis, Jepang, industrial) dan budget range yang kamu rekomendasikan." },
      faqBlock([{ question: "Barang di video beli di mana?", answer: "Cek deskripsi tautan produk di atas -- link belanja selalu aku cantumkan di sana." }]),
    ],
    monetizationHint: "Cocok dipasangkan dengan Afiliasi -- aktifkan di menu Produk & Monetisasi.",
  },

  // ---------- Special Purpose ----------
  {
    key: "portfolio",
    category: "special",
    label: "Portofolio",
    description: "Proyek + keahlian + kontak",
    theme: "minimal",
    bio: "Portofolio -- proyek & keahlianku",
    social: { linkedin: "username", email: "kamu@email.com" },
    links: [link("linkedin", undefined, "Pengalaman kerja & rekomendasi kolega")],
    blocks: [
      showcaseBlock({
        title: "Studi Kasus: Optimasi Alur Kerja Tim",
        description: "Proyek yang paling ingin aku tonjolkan -- dari identifikasi masalah sampai solusi yang diterapkan.",
        badgeText: "Proyek Unggulan",
        ctaText: "Baca studi kasus",
        url: PLATFORM_URL.linkedin,
      }),
      { type: "text", title: "Proyek", text: "Tuliskan proyek-proyekmu di sini." },
      faqBlock([{ question: "Proyek seperti apa yang bisa kamu kerjakan?", answer: "Lihat pengalaman & keahlian di atas, atau hubungi saya langsung untuk diskusi proyekmu." }]),
      { type: "contact_form", title: "Hubungi Saya" },
    ],
  },
  {
    key: "link-hub",
    category: "special",
    label: "Kumpulan Tautan",
    description: "Kumpulan semua tautanmu",
    theme: "minimal",
    bio: "Semua link pentingku, di satu tempat.",
    // Sengaja TIDAK dapat kartu showcase (revisi 26 Agustus 2026, lihat
    // catatan lengkap di atas file ini) -- "Link Hub" tujuannya SANGAT
    // minimalis, cuma kumpulan tautan, menambah kartu di sini melawan
    // tujuan desainnya sendiri.
    social: { instagram: "username", tiktok: "username", youtube: "@namachannel", whatsapp: "62812xxxxxxxx" },
    links: [
      link("instagram", undefined, "Semua update ada di sini"),
      link("tiktok", undefined, "Konten video terbaru"),
      link("youtube", undefined, "Video lengkap & playlist"),
      link("whatsapp", undefined, "Chat langsung denganku"),
    ],
  },
  {
    key: "event",
    category: "special",
    layoutVariant: "ticket",
    label: "Event",
    description: "Info acara + tiket + lokasi",
    theme: "golden",
    bio: "Info acara -- jangan sampai ketinggalan!",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [link("instagram", undefined, "Info tiket & update terbaru acara")],
    blocks: [
      showcaseBlock({
        title: "Grand Opening: Malam Puncak Perayaan",
        description: "Momen utama acara yang paling dinanti -- jangan sampai lewatkan sesi ini.",
        badgeText: "Acara Utama",
        ctaText: "Lihat detail acara",
        url: PLATFORM_URL.instagram,
      }),
      { type: "text", title: "Info Acara", text: "Tuliskan tanggal, lokasi, dan info acara di sini." },
      faqBlock([{ question: "Bagaimana cara beli tiket?", answer: "Info tiket & harga akan diumumkan lewat Instagram -- pantau terus supaya tidak ketinggalan." }]),
    ],
    monetizationHint: "Cocok dipasangkan dengan Event -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "community",
    category: "special",
    label: "Komunitas",
    description: "WhatsApp, Discord, Telegram, pendaftaran",
    theme: "ocean",
    bio: "Gabung komunitas kami",
    social: { whatsapp: "62812xxxxxxxx", telegram: "username", instagram: "username" },
    links: [
      link("whatsapp", "Gabung Grup WhatsApp", "Gabung grup diskusi utama"),
      link("discord", undefined, "Ngobrol & main bareng member lain"),
      link("telegram", undefined, "Info & pengumuman tercepat"),
    ],
    blocks: [
      showcaseBlock({
        title: "Sharing Session Mingguan",
        description: "Kegiatan rutin paling seru yang bikin komunitas ini makin solid -- terbuka untuk semua member.",
        badgeText: "Kegiatan Rutin",
        ctaText: "Lihat jadwal lengkap",
        url: PLATFORM_URL.whatsapp,
      }),
      faqBlock([{ question: "Gratis atau berbayar gabung komunitasnya?", answer: "Gratis! Klik salah satu tautan di atas untuk langsung gabung." }]),
      { type: "contact_form", title: "Daftar Sekarang" },
    ],
  },
  {
    key: "donation",
    category: "special",
    label: "Donasi",
    description: "Platform donasi + media sosial",
    theme: "mint",
    bio: "Dukung perjuanganku",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [link("instagram", undefined, "Update progress & kabar terbaru")],
    blocks: [
      showcaseBlock({
        title: "Perjuangan yang Sedang Aku Jalani",
        description: "Cerita lengkap kenapa dukunganmu berarti banget buatku saat ini.",
        badgeText: "Progress Donasi",
        ctaText: "Baca cerita lengkap",
        url: PLATFORM_URL.instagram,
      }),
      { type: "text", title: "Tentang Perjuangan Ini", text: "Ceritakan kenapa kamu butuh dukungan & untuk apa dana yang terkumpul dipakai di sini." },
      faqBlock([{ question: "Dana yang terkumpul dipakai untuk apa?", answer: "Lihat cerita di atas untuk rinciannya -- setiap dukungan sangat berarti, terima kasih!" }]),
    ],
    monetizationHint: "Cocok dipasangkan dengan Dukungan (Donasi) -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "seasonal-greeting",
    category: "special",
    label: "Ucapan Musiman",
    description: "Ucapan musiman + media sosial",
    // theme "xmas" -- salah satu dari 5 tema baru hasil analisa galeri tema
    // kompetitor (17 Agustus 2026, folder theme/) yang ditambahkan
    // sebelumnya (xmas/pride/retro/kraft/monsoon) -- template ini sengaja
    // dibuat supaya kreator langsung punya jalan pakai temanya, bukan cuma
    // preset yang nongkrong di galeri tanpa konteks pemakaian.
    theme: "xmas",
    bio: "Selamat merayakan! Semoga hari-harimu penuh kehangatan.",
    // Sengaja TIDAK dapat kartu showcase (revisi 26 Agustus 2026, lihat
    // catatan lengkap di atas file ini) -- template ucapan musiman ini
    // sengaja dibuat SANGAT sederhana (satu paragraf ucapan), menambah
    // kartu di sini melawan tujuan desainnya.
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("instagram", undefined, "Ucapan & momen hangat musim ini"),
      link("whatsapp", undefined, "Kirim ucapan balik langsung"),
    ],
    blocks: [{ type: "text", title: "Ucapan Untukmu", text: "Tuliskan ucapan hangat musim ini untuk pengunjung halamanmu di sini." }],
  },
  {
    key: "coming-soon",
    category: "special",
    label: "Segera Hadir",
    description: "Teaser + email/WhatsApp",
    theme: "polaris",
    bio: "Sesuatu yang seru segera hadir. Nantikan!",
    // Sengaja TIDAK dapat kartu showcase (revisi 26 Agustus 2026, lihat
    // catatan lengkap di atas file ini) -- "Coming Soon" secara harfiah
    // BELUM ada yang bisa ditonjolkan, menambah kartu detail malah
    // bertentangan dengan konsep teaser-nya.
    social: { instagram: "username", whatsapp: "62812xxxxxxxx", email: "kamu@email.com" },
    links: [link("whatsapp", undefined, "Jadi yang pertama tahu saat rilis")],
    blocks: [{ type: "contact_form", title: "Beri Tahu Aku" }],
  },
  {
    key: "product-launch",
    category: "special",
    label: "Peluncuran Produk",
    description: "Produk + CTA + social proof",
    theme: "blaze",
    bio: "Produk baru sudah hadir!",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [link("instagram", undefined, "Sneak peek & update peluncuran")],
    blocks: [
      showcaseBlock({
        title: "Produk Andalan Edisi Perdana",
        description: "Produk utama yang kami luncurkan -- kombinasi kualitas terbaik dengan harga peluncuran spesial.",
        badgeText: "Baru Diluncurkan",
        ctaText: "Lihat detail produk",
        url: PLATFORM_URL.instagram,
      }),
      { type: "text", title: "Tentang Produk Ini", text: "Tuliskan keunggulan & alasan kenapa produk ini wajib dicoba di sini." },
      faqBlock([{ question: "Kapan produk ini bisa dibeli?", answer: "Cek tombol beli di Toko halaman ini, atau pantau Instagram kami untuk info stok terbaru." }]),
    ],
    // Susulan permintaan pengguna: "tambahkan template untuk produk yang
    // siap pakai juga" -- kandidat paling jelas di seluruh file ini
    // (template ini SECARA HARFIAH tentang meluncurkan produk baru).
    products: [
      {
        name: "Produk Baru Kamu (Contoh)",
        description: "Ganti dengan produk aslimu -- ini contoh draft, belum aktif sampai kamu unggah file & sesuaikan harga di menu Toko.",
        priceIDR: 75000,
        coverImagePath: "/quick-setup-products/product-launch-1.jpg",
      },
      {
        name: "Paket Bundling Peluncuran (Contoh)",
        description: "Ganti dengan produk aslimu -- ini contoh draft, belum aktif sampai kamu unggah file & sesuaikan harga di menu Toko.",
        priceIDR: 135000,
        coverImagePath: "/quick-setup-products/product-launch-2.jpg",
      },
    ],
    monetizationHint: "Aktifkan Social Proof di menu Audiens & Pemasaran supaya notifikasi pembelian produkmu tampil ke pengunjung.",
  },
  // 2 template baru, 21 Agustus 2026 -- lihat catatan lengkap di homestay-
  // villa (kategori Tourism).
  {
    key: "nonprofit-charity",
    category: "special",
    // Tampilan persis kartu template homepage (public/homepage/templates/
    // *.png, 25 September 2026): tema foto + layout "billboard", isi tombol/
    // kartu dibaca langsung dari kartunya (OCR), warna tombol dari sampel
    // piksel. Lihat catatan di PAGE_THEMES "villa" (page-themes.ts).
    layoutVariant: "billboard",
    label: "Nirlaba & Amal",
    description: "Program sosial, donasi, relawan",
    theme: "harapan",
    bio: "Langkah kecil, dampak besar.",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx", email: "kamu@email.com" },
    links: [
      { title: "Rp 48.250.000 terkumpul", url: "https://websitekamu.com/program", description: "dari target Rp 75.000.000", iconKey: "heart-handshake", badgeText: "64%" },
      { title: "Donasi Sekarang", url: "https://websitekamu.com/donasi", iconKey: "heart", accentColor: "#fea5cb" },
    ],
    monetizationHint: "Cocok dipasangkan dengan Dukungan (Donasi) -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "mosque-community",
    category: "special",
    layoutVariant: "masthead",
    label: "Masjid & Komunitas",
    description: "Jadwal kegiatan, info, kontak",
    theme: "emerald",
    bio: "Info kegiatan & jadwal komunitas kami",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Gabung Grup Info", "Gabung grup info kegiatan"),
      link("instagram", undefined, "Dokumentasi kajian & kegiatan rutin"),
    ],
    blocks: [
      mapsBlock("Lokasi Kami"),
      showcaseBlock({
        title: "Kajian Rutin Selepas Maghrib",
        description: "Kegiatan paling rutin diikuti jamaah -- kajian ringan bertema kehidupan sehari-hari selepas maghrib.",
        badgeText: "Kegiatan Favorit",
        ctaText: "Lihat jadwal lengkap",
        url: PLATFORM_URL.whatsapp,
      }),
      { type: "text", title: "Jadwal Kegiatan", text: "Tuliskan jadwal kajian/kegiatan rutin komunitas di sini." },
      faqBlock([{ question: "Bagaimana cara ikut kegiatan?", answer: "Gabung grup WhatsApp untuk info jadwal terbaru, semua kegiatan terbuka untuk umum." }]),
    ],
  },
  // 2 template berikut ditambahkan 6 September 2026 (permintaan langsung
  // pengguna: "buatkan template quick setup sesuai tema website minimal 2
  // di tiap category, template tema joyfull") -- niche giveaway/kontes &
  // waiting list pre-launch belum terwakili di kategori ini.
  {
    key: "giveaway",
    category: "special",
    layoutVariant: "ticket",
    label: "Giveaway & Kontes",
    description: "Info hadiah, syarat, cara ikut",
    theme: "joyful",
    bio: "Giveaway | Ikutan, siapa tahu kamu yang beruntung",
    social: { instagram: "username", tiktok: "username" },
    links: [
      link("instagram", "Cara Ikut Giveaway", "Syarat & langkah pendaftaran"),
      link("whatsapp", "Tanya-Tanya", "Kalau ada pertanyaan soal giveaway ini"),
    ],
    blocks: [
      showcaseBlock({
        title: "Hadiah Giveaway",
        description: "Tuliskan hadiah yang dibagikan, jumlah pemenang, dan periode pendaftaran.",
        badgeText: "GIVEAWAY",
        ctaText: "Ikut Sekarang",
        url: PLATFORM_URL.instagram,
      }),
      faqBlock([
        { question: "Kapan pemenang diumumkan?", answer: "Tulis tanggal pengumuman dan cara menghubungi pemenang." },
        { question: "Siapa saja yang boleh ikut?", answer: "Jelaskan syarat peserta (usia, wilayah, follow akun, dst)." },
      ]),
    ],
    monetizationHint: "Voucher paling pas untuk giveaway dengan kode promo eksklusif.",
  },
  {
    key: "waitlist",
    category: "special",
    layoutVariant: "centered",
    label: "Waiting List Pre-Launch",
    description: "Kumpulkan email/WhatsApp sebelum rilis",
    theme: "joyful",
    bio: "Segera hadir | Daftar sekarang, jadi yang pertama tahu",
    social: { instagram: "username" },
    links: [link("instagram", "Update Progress", "Cerita di balik layar sebelum rilis")],
    blocks: [
      { type: "text", title: "Apa yang Akan Datang", text: "Tuliskan produk/layanan yang akan diluncurkan dan kenapa orang harus menunggu ini." },
      { type: "contact_form", title: "Daftar Waiting List" },
    ],
    monetizationHint: "Setelah rilis, ganti ke Produk Digital atau Payment Link sesuai kebutuhan.",
  },
  // 3 template baru, 24 Agustus 2026 (permintaan langsung pengguna, contoh
  // tangkapan layar template link-in-bio developer bertema navy gelap
  // "Dimas Dev": kartu tautan ikon+judul+deskripsi+panah, kartu "Project
  // Unggulan" bergambar+badge+CTA, baris ikon sosial GitHub/Website) --
  // mendorong 3 fitur baru sekaligus: links[].description (subjudul kartu
  // kaya), block_type "project_showcase", dan platform sosial GitHub/
  // Website (lihat migrasi 000077/000078, linkItem.Description,
  // validateBlockData "project_showcase" di links.go). Tema "console"
  // (page-themes.ts) dibuat bareng batch ini -- navy-hitam + aksen teal,
  // dipakai 2 dari 3 template di bawah; "obsidian" (sudah ada, hitam matte
  // polos) dipakai template ke-2 supaya tidak monoton satu tema yang sama
  // 3x. Kategori "business" -- portofolio profesional developer/desainer/
  // founder, sejalan dgn "professional-cv"/"consultant"/"agency" yang
  // sudah ada di kategori ini, BUKAN kategori baru terpisah. Ketiga
  // template ini TETAP eksplisit memakai showcaseImagePath (dashboard-
  // mockup.jpg) -- beda dari perluasan showcase ke template lain 26
  // Agustus 2026 (lihat catatan revisi lengkap di atas file ini) yang
  // sengaja TANPA gambar.
  {
    key: "fullstack-developer",
    category: "business",
    layoutVariant: "spotlight",
    label: "Full-Stack Developer",
    description: "Proyek unggulan, GitHub, CV, kartu kaya + Project Unggulan",
    theme: "console",
    bio: "Full-Stack Developer -- proyek, GitHub, dan CV dalam satu tautan.",
    social: { github: "username", linkedin: "username", website: "websitekamu.com", email: "kamu@email.com" },
    links: [
      { title: "Tentang Saya", url: "https://websitekamu.com/tentang", description: "Tech stack, pengalaman, dan fokus kerja" },
      { title: "Featured Projects", url: "https://websitekamu.com/proyek", description: "Website, dashboard, dan aplikasi pilihan" },
      { title: "GitHub", url: "https://github.com/username", description: "Lihat repository dan kontribusi terbaru" },
      { title: "Download CV", url: "https://websitekamu.com/cv.pdf", description: "CV terbaru dalam format PDF" },
      { title: "Hubungi Saya", url: "https://wa.me/62", description: "Kolaborasi, freelance, dan konsultasi" },
    ],
    blocks: [
      showcaseBlock({
        title: "SaaS Analytics Dashboard",
        description: "Dashboard analytics real-time untuk monitoring KPI bisnis dan performa produk. Dibangun dengan Next.js, Tailwind CSS, dan PostgreSQL.",
        badgeText: "Project Unggulan",
        ctaText: "Lihat studi kasus",
        url: "https://websitekamu.com/studi-kasus",
        imagePath: "/quick-setup-showcase/dashboard-mockup.jpg",
      }),
    ],
    monetizationHint: "Tambahkan Produk Digital (paket review kode/arsitektur) di menu Produk & Monetisasi kalau mau menawarkan jasa review berbayar.",
  },
  {
    key: "ui-ux-designer",
    category: "business",
    layoutVariant: "portrait",
    label: "UI/UX Designer",
    description: "Case study, portfolio visual, dan konsultasi desain",
    theme: "obsidian",
    bio: "UI/UX Designer -- case study, portfolio, dan kolaborasi.",
    social: { website: "websitekamu.com", instagram: "username", linkedin: "username", email: "kamu@email.com" },
    links: [
      { title: "Portfolio Lengkap", url: "https://websitekamu.com/portfolio", description: "Seluruh studi kasus & proses desain" },
      { title: "Behance", url: "https://behance.net/username", description: "Galeri visual dan eksplorasi desain" },
      { title: "Dribbble", url: "https://dribbble.com/username", description: "Shot harian & eksperimen UI" },
      { title: "Konsultasi Desain", url: "https://wa.me/62", description: "Diskusi kebutuhan desain produkmu" },
    ],
    blocks: [
      showcaseBlock({
        title: "Redesain Aplikasi Perbankan",
        description: "Studi kasus peningkatan conversion rate 34% lewat riset pengguna & desain ulang alur onboarding.",
        badgeText: "Studi Kasus",
        ctaText: "Baca selengkapnya",
        url: "https://websitekamu.com/studi-kasus",
        imagePath: "/quick-setup-showcase/dashboard-mockup.jpg",
      }),
    ],
    monetizationHint: "Tambahkan Produk Digital (template Figma/UI kit) di menu Toko untuk monetisasi tambahan dari portofolio ini.",
  },
  {
    key: "startup-founder",
    category: "business",
    layoutVariant: "hero",
    label: "Founder Startup",
    description: "Progres produk, investor deck, dan insight",
    theme: "console",
    bio: "Startup Founder -- membangun produk, berbagi insight.",
    social: { github: "username", x: "username", linkedin: "username", website: "websitekamu.com" },
    links: [
      { title: "Tentang Produk Saya", url: "https://websitekamu.com/produk", description: "Visi, misi, dan progres terbaru startup" },
      { title: "Newsletter Insight", url: "https://websitekamu.com/newsletter", description: "Pelajaran membangun startup tiap minggu" },
      { title: "Investor Deck", url: "https://websitekamu.com/deck.pdf", description: "Ringkasan bisnis untuk calon investor/mitra" },
      { title: "Follow di X", url: "https://x.com/", description: "Update harian & thread insight" },
    ],
    blocks: [
      showcaseBlock({
        title: "Peluncuran MVP",
        description: "Dari ide sampai 1.000 pengguna pertama dalam 90 hari -- pelajaran validasi produk & growth awal.",
        badgeText: "Studi Kasus",
        ctaText: "Baca ceritanya",
        url: "https://websitekamu.com/studi-kasus",
        imagePath: "/quick-setup-showcase/dashboard-mockup.jpg",
      }),
    ],
    monetizationHint: "Aktifkan Dukungan (Donasi) kalau audiensmu ingin membantu biaya operasional produk secara sukarela.",
  },
  // ---------- Health & Wellness (benchmark Linktree "Health and Fitness") ----------
  // Fokus PRAKTISI/LAYANAN kesehatan. Venue-nya (Gym & Fitness Center,
  // Sports Facility) sengaja tetap di kategori "local".
  {
    key: "personal-trainer",
    category: "health",
    layoutVariant: "duo",
    label: "Personal Trainer",
    description: "Program latihan, jadwal, booking",
    theme: "surge",
    bio: "Personal trainer bersertifikat | Program latihan personal",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Konsultasi Program", "Ceritakan targetmu, aku susun programnya"),
      link("instagram", "Progress Klien", "Dokumentasi transformasi & tips latihan"),
    ],
    blocks: [
      { type: "text", title: "Paket Latihan", text: "Tuliskan paket yang kamu tawarkan (jumlah sesi, durasi, lokasi/online, harga) di sini." },
      faqBlock([
        { question: "Latihannya online atau tatap muka?", answer: "Tulis pilihan yang kamu layani beserta area jangkauannya." },
        { question: "Apakah dapat panduan makan?", answer: "Jelaskan apakah meal plan termasuk dalam paket atau terpisah." },
      ]),
      { type: "contact_form", title: "Konsultasi Awal Gratis" },
    ],
    monetizationHint: "Pasangkan dengan Kelas & Kursus untuk program latihan rekaman.",
  },
  {
    key: "yoga-studio",
    category: "health",
    layoutVariant: "cover",
    label: "Yoga & Pilates",
    description: "Kelas, jadwal, membership",
    theme: "matcha",
    bio: "Studio yoga & pilates | Kelas harian untuk semua level",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Daftar Kelas", "Cek jadwal & amankan slotmu"),
      link("instagram", "Suasana Studio", "Kelas, instruktur, dan jadwal terbaru"),
    ],
    blocks: [
      { type: "text", title: "Jadwal Kelas", text: "Tuliskan jadwal kelas mingguan (hari, jam, jenis kelas, instruktur) di sini." },
      mapsBlock("Lokasi Studio"),
      faqBlock([
        { question: "Pemula boleh ikut?", answer: "Jelaskan kelas mana yang ramah pemula dan apa yang perlu dibawa." },
        { question: "Apakah sewa matras tersedia?", answer: "Tulis ketentuan peminjaman peralatan di studiomu." },
      ]),
    ],
    monetizationHint: "Cocok dengan Kelas & Kursus dan Voucher untuk paket trial.",
  },
  {
    key: "nutritionist",
    category: "health",
    layoutVariant: "card",
    label: "Ahli Gizi & Nutrisi",
    description: "Konsultasi gizi, meal plan",
    theme: "mint",
    bio: "Ahli gizi | Meal plan realistis, tanpa diet ekstrem",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Konsultasi Gizi", "Diskusi kebutuhan gizi & target kesehatanmu"),
      link("instagram", "Edukasi Gizi", "Tips makan harian yang mudah diterapkan"),
    ],
    blocks: [
      { type: "text", title: "Layanan", text: "Tuliskan layanan yang kamu tawarkan (konsultasi, meal plan personal, pendampingan berkala) beserta durasinya." },
      { type: "contact_form", title: "Mulai Konsultasi" },
    ],
    monetizationHint: "Pasangkan dengan Produk Digital untuk panduan meal plan.",
  },
  {
    key: "clinic-practice",
    category: "health",
    layoutVariant: "banner",
    label: "Klinik & Praktik",
    description: "Jadwal praktik, lokasi, janji temu",
    theme: "azure",
    bio: "Klinik kesehatan | Layanan tepercaya untuk keluarga",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Buat Janji Temu", "Reservasi jadwal sebelum datang"),
      link("googleMaps", "Petunjuk Arah", "Lokasi & area parkir"),
    ],
    blocks: [
      { type: "text", title: "Jadwal Praktik", text: "Tuliskan hari, jam praktik, dan nama tenaga kesehatan yang bertugas di sini." },
      mapsBlock("Lokasi Klinik"),
      faqBlock([
        { question: "Apakah menerima BPJS/asuransi?", answer: "Tulis metode pembayaran & kerja sama asuransi yang kamu terima." },
        { question: "Perlu janji dulu atau bisa langsung datang?", answer: "Jelaskan alur pendaftaran pasien di kliniknya." },
      ]),
    ],
    monetizationHint: "Voucher bisa dipakai untuk paket pemeriksaan berkala -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "therapist-wellness",
    category: "health",
    layoutVariant: "minimal",
    label: "Terapis & Wellness",
    description: "Sesi terapi, pijat, relaksasi",
    theme: "champagne",
    bio: "Terapis wellness | Sesi relaksasi & pemulihan tubuh",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Reservasi Sesi", "Pilih jenis terapi & jadwal yang kosong"),
      link("instagram", "Tentang Layanan", "Suasana ruang terapi & testimoni klien"),
    ],
    blocks: [
      { type: "text", title: "Jenis Terapi", text: "Tuliskan jenis terapi yang tersedia beserta durasi dan harganya di sini." },
      { type: "contact_form", title: "Tanya Ketersediaan" },
    ],
    monetizationHint: "Voucher bisa dipakai untuk paket perawatan -- aktifkan di menu Produk & Monetisasi.",
  },
  // Ditambahkan 6 September 2026 (permintaan langsung pengguna: "saya mau
  // buatkan 10 template yang sesuai dengan tema web ini") -- mengisi celah
  // niche pemulihan cedera/medis, beda dari personal-trainer (fokus
  // performa/otot) dan clinic-practice (praktik umum) di kategori ini.
  {
    key: "physiotherapist",
    category: "health",
    layoutVariant: "split",
    label: "Fisioterapi & Rehabilitasi",
    description: "Jadwal terapi, konsultasi, booking",
    theme: "azure",
    bio: "Fisioterapis | Pemulihan cedera & nyeri gerak tubuh",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Buat Janji Terapi", "Ceritakan keluhan sebelum jadwal ditentukan"),
      link("instagram", "Edukasi Gerak Tubuh", "Tips pemulihan & pencegahan cedera"),
    ],
    blocks: [
      { type: "text", title: "Layanan Terapi", text: "Tuliskan jenis keluhan yang kamu tangani (cedera olahraga, nyeri punggung, pasca operasi, dst) beserta durasi sesinya." },
      mapsBlock("Lokasi Praktik"),
      faqBlock([
        { question: "Perlu rujukan dokter dulu?", answer: "Jelaskan apakah pasien bisa datang langsung atau perlu rujukan." },
        { question: "Berapa kali sesi biasanya dibutuhkan?", answer: "Tulis perkiraan jumlah sesi tergantung jenis keluhan." },
      ]),
    ],
    monetizationHint: "Voucher bisa dipakai untuk paket beberapa sesi terapi -- aktifkan di menu Produk & Monetisasi.",
  },
  // 2 template berikut ditambahkan 6 September 2026 (permintaan langsung
  // pengguna: "buatkan template quick setup sesuai tema website minimal 2
  // di tiap category, template tema joyfull") -- niche bidan & apotek
  // online belum terwakili di kategori ini.
  {
    key: "midwife",
    category: "health",
    layoutVariant: "card",
    label: "Bidan & Layanan Kehamilan",
    description: "Jadwal praktik, konsultasi, janji temu",
    theme: "joyful",
    bio: "Bidan | Pendampingan kehamilan hingga persalinan",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Buat Janji", "Konsultasi kehamilan & jadwal periksa"),
      link("instagram", "Edukasi Kehamilan", "Tips kehamilan sehat & persiapan persalinan"),
    ],
    blocks: [
      mapsBlock("Lokasi Praktik"),
      { type: "text", title: "Layanan Praktik", text: "Tuliskan layanan yang tersedia (periksa kehamilan, USG, konsultasi menyusui) beserta jadwal praktiknya di sini." },
      faqBlock([{ question: "Melayani persalinan di rumah?", answer: "Jelaskan apakah tersedia layanan persalinan di rumah atau hanya rujukan ke fasilitas kesehatan." }]),
    ],
    monetizationHint: "Voucher bisa dipakai untuk paket kelas edukasi kehamilan.",
  },
  {
    key: "online-pharmacy",
    category: "health",
    layoutVariant: "banner",
    label: "Apotek Online",
    description: "Katalog obat, konsultasi, pemesanan",
    theme: "joyful",
    bio: "Apotek online | Pesan obat & konsultasi tanpa antre",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Pesan Obat", "Kirim resep atau nama obat yang dibutuhkan"),
      link("instagram", "Info Kesehatan", "Tips & info obat yang aman dikonsumsi"),
    ],
    blocks: [
      { type: "text", title: "Layanan Apotek", text: "Tuliskan cara pemesanan, area pengantaran, dan apakah menerima resep dokter di sini." },
      faqBlock([
        { question: "Bisa konsultasi dulu sebelum beli?", answer: "Jelaskan apakah tersedia konsultasi dengan apoteker sebelum pembelian." },
        { question: "Berapa lama pengantaran?", answer: "Tulis estimasi waktu pengantaran sesuai area." },
      ]),
    ],
    monetizationHint: "Voucher bisa dipakai untuk promo ongkir gratis pesanan pertama.",
  },

  // ---------- Sports & Athletics (benchmark Linktree "Sports") ----------
  {
    key: "athlete-profile",
    category: "sports",
    layoutVariant: "spotlight",
    label: "Atlet",
    description: "Profil, prestasi, sponsor",
    theme: "blaze",
    bio: "Atlet | Prestasi, jadwal bertanding, dan kerja sama",
    social: { instagram: "username", tiktok: "username", youtube: "@namachannel" },
    links: [
      link("instagram", "Ikuti Perjalananku", "Latihan harian & momen pertandingan"),
      link("youtube", "Cuplikan Pertandingan", "Highlight & dokumentasi lomba"),
      link("email", "Kerja Sama & Sponsor", "Untuk penawaran sponsorship"),
    ],
    blocks: [
      { type: "text", title: "Prestasi", text: "Tuliskan prestasi utamamu (kejuaraan, tahun, capaian) di sini." },
      showcaseBlock({
        title: "Jadwal Pertandingan Terdekat",
        description: "Tuliskan nama kompetisi, tanggal, dan lokasi supaya pendukung bisa hadir atau menonton.",
        badgeText: "AGENDA",
        ctaText: "Lihat Detail",
        url: PLATFORM_URL.instagram,
      }),
    ],
    monetizationHint: "Dukungan (Donasi) memudahkan pendukung membantu biaya latihan & kompetisi.",
  },
  {
    key: "sports-club",
    category: "sports",
    layoutVariant: "banner",
    label: "Klub & Tim",
    description: "Anggota, jadwal, rekrutmen",
    theme: "forest",
    bio: "Klub olahraga | Latihan rutin & terbuka untuk anggota baru",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Gabung Klub", "Tanya syarat & biaya keanggotaan"),
      link("instagram", "Kegiatan Klub", "Latihan, pertandingan, dan kebersamaan tim"),
    ],
    blocks: [
      { type: "text", title: "Jadwal Latihan", text: "Tuliskan hari, jam, dan lokasi latihan rutin klubmu di sini." },
      mapsBlock("Lokasi Latihan"),
      faqBlock([
        { question: "Boleh ikut kalau masih pemula?", answer: "Jelaskan apakah ada kelompok latihan khusus pemula." },
        { question: "Berapa iuran anggotanya?", answer: "Tulis besaran iuran dan apa saja yang termasuk di dalamnya." },
      ]),
    ],
    monetizationHint: "Loyalitas atau Voucher bisa dipakai untuk program iuran anggota dan trial gratis.",
  },
  {
    key: "sports-academy",
    category: "sports",
    layoutVariant: "hero",
    label: "Akademi Olahraga",
    description: "Kelas usia, pelatih, pendaftaran",
    theme: "emerald",
    bio: "Akademi olahraga | Membina atlet muda sejak dini",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Daftar Siswa Baru", "Tanya kelas usia & jadwal trial"),
      link("instagram", "Aktivitas Akademi", "Latihan, turnamen, dan prestasi siswa"),
    ],
    blocks: [
      { type: "text", title: "Kelompok Usia", text: "Tuliskan pembagian kelompok usia, jadwal, dan pelatih penanggung jawab di sini." },
      mapsBlock("Lokasi Akademi"),
      { type: "contact_form", title: "Formulir Pendaftaran" },
    ],
    monetizationHint: "Kelas & Kursus cocok untuk program berjenjang -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "sports-tournament",
    category: "sports",
    layoutVariant: "ticket",
    label: "Turnamen & Kompetisi",
    description: "Pendaftaran tim, jadwal, hadiah",
    theme: "electric",
    bio: "Turnamen olahraga | Pendaftaran tim dibuka",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Daftarkan Tim", "Konfirmasi slot & pembayaran pendaftaran"),
      link("instagram", "Info Turnamen", "Jadwal, bracket, dan pengumuman"),
    ],
    blocks: [
      showcaseBlock({
        title: "Pendaftaran Dibuka",
        description: "Tuliskan kategori yang dilombakan, kuota tim, biaya pendaftaran, dan batas waktunya.",
        badgeText: "OPEN",
        ctaText: "Daftar Sekarang",
        url: PLATFORM_URL.whatsapp,
      }),
      faqBlock([
        { question: "Kapan technical meeting-nya?", answer: "Tulis tanggal, jam, dan tempat technical meeting." },
        { question: "Apa hadiah untuk juara?", answer: "Jelaskan total hadiah dan pembagiannya per juara." },
      ]),
      mapsBlock("Lokasi Pertandingan"),
    ],
    monetizationHint: "Event & Tiket paling pas untuk mengelola pendaftaran tim dan penonton.",
  },
  {
    key: "running-community",
    category: "sports",
    layoutVariant: "duo",
    label: "Komunitas Lari & Sepeda",
    description: "Rute, jadwal, gabung komunitas",
    theme: "tide",
    bio: "Komunitas lari & sepeda | Gowes dan lari bareng tiap pekan",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Gabung Grup", "Info rute & jadwal terbaru tiap pekan"),
      link("instagram", "Dokumentasi Rute", "Foto & cerita perjalanan komunitas"),
    ],
    blocks: [
      { type: "text", title: "Jadwal Rutin", text: "Tuliskan hari, jam kumpul, titik start, dan estimasi jarak rute di sini." },
      mapsBlock("Titik Kumpul"),
    ],
    monetizationHint: "Event & Tiket berguna kalau komunitasmu mengadakan fun run atau gowes berbayar.",
  },
  // Ditambahkan 6 September 2026 (permintaan langsung pengguna: "saya mau
  // buatkan 10 template yang sesuai dengan tema web ini") -- esports belum
  // terwakili di kategori Sports (4 template sebelumnya semua olahraga
  // fisik konvensional), beda dari "gamer" di kategori Creator (itu profil
  // INDIVIDU/streamer, ini identitas TIM/organisasi).
  {
    key: "esports-team",
    category: "sports",
    layoutVariant: "masthead",
    label: "Tim Esports",
    description: "Roster, jadwal turnamen, sponsor",
    theme: "pixel",
    bio: "Tim esports | Roster, jadwal tanding, dan merchandise",
    social: { instagram: "username", youtube: "@namachannel", tiktok: "username" },
    links: [
      link("youtube", "Siaran Ulang Match", "Highlight & VOD pertandingan tim"),
      link("instagram", "Update Roster & Jadwal", "Pengumuman line-up & jadwal tanding"),
      link("email", "Kerja Sama Sponsor", "Untuk penawaran sponsorship tim"),
    ],
    blocks: [
      { type: "text", title: "Roster Tim", text: "Tuliskan nama pemain, role/posisi masing-masing, dan game yang dikompetisikan tim ini di sini." },
      { type: "text", title: "Jadwal Turnamen", text: "Tuliskan turnamen yang sedang/akan diikuti beserta tanggal tandingnya di sini." },
      faqBlock([{ question: "Bagaimana cara jadi sponsor?", answer: "Jelaskan paket sponsorship & benefit yang didapat sponsor." }]),
    ],
    monetizationHint: "Toko Online cocok untuk jual jersey & merchandise tim.",
  },
  // 2 template berikut ditambahkan 6 September 2026 (permintaan langsung
  // pengguna: "buatkan template quick setup sesuai tema website minimal 2
  // di tiap category, template tema joyfull") -- niche pelatih cabang
  // olahraga spesifik (beda dari personal-trainer generik di kategori
  // health) & fotografer olahraga belum terwakili di kategori ini.
  {
    key: "sports-coach",
    category: "sports",
    layoutVariant: "duo",
    label: "Pelatih Cabang Olahraga",
    description: "Program latihan, jadwal, booking",
    theme: "joyful",
    bio: "Pelatih olahraga | Latihan terarah sesuai levelmu",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Booking Sesi Latihan", "Pilih cabang olahraga & jadwal latihan"),
      link("instagram", "Dokumentasi Latihan", "Progress murid & tips teknik dasar"),
    ],
    blocks: [
      { type: "text", title: "Cabang & Program", text: "Tuliskan cabang olahraga yang kamu latih (badminton, basket, sepak bola, dst), level murid, dan harga per sesi di sini." },
      faqBlock([{ question: "Latihan privat atau grup?", answer: "Jelaskan format latihan yang tersedia dan perbedaan harganya." }]),
    ],
    monetizationHint: "Produk Digital cocok untuk jual paket latihan beberapa sesi sekaligus.",
  },
  {
    key: "sports-photography",
    category: "sports",
    layoutVariant: "portrait",
    label: "Fotografer Olahraga",
    description: "Portofolio, jasa dokumentasi event",
    theme: "joyful",
    bio: "Fotografer olahraga | Abadikan momen terbaik di lapangan",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Booking Dokumentasi", "Untuk pertandingan/event olahraga"),
      link("instagram", "Portofolio Foto", "Hasil jepretan dari berbagai event"),
    ],
    blocks: [
      { type: "text", title: "Layanan Dokumentasi", text: "Tuliskan jenis event yang kamu tangani (pertandingan, turnamen, marathon) beserta paket harganya di sini." },
      faqBlock([{ question: "Berapa lama hasil foto diterima?", answer: "Tulis estimasi waktu edit & pengiriman hasil foto." }]),
    ],
    monetizationHint: "Payment Link memudahkan menagih DP sebelum hari pemotretan.",
  },

  // ---------- Coaching & Consulting (benchmark Lynk.id: konsultasi 1-on-1,
  // mentoring, coaching karier). Beda dari template "Consultant" di kategori
  // business yang berorientasi profil perusahaan -- yang ini berpusat pada
  // SESI terjadwal per orang.
  {
    key: "life-coach",
    category: "coaching",
    layoutVariant: "portrait",
    label: "Life Coach",
    description: "Sesi 1-on-1, program, testimoni",
    theme: "peach",
    bio: "Life coach | Bantu kamu menata arah dan kebiasaan",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Jadwalkan Sesi", "Pilih waktu sesi 1-on-1"),
      link("instagram", "Insight Harian", "Refleksi singkat & materi latihan diri"),
    ],
    blocks: [
      { type: "text", title: "Cara Kerja Sesi", text: "Jelaskan durasi sesi, media (online/tatap muka), dan apa yang didapat klien setelahnya." },
      faqBlock([
        { question: "Berapa lama satu sesi?", answer: "Tulis durasi dan jumlah sesi yang disarankan." },
        { question: "Apakah ada paket berkelanjutan?", answer: "Jelaskan paket pendampingan beberapa sesi kalau tersedia." },
      ]),
      { type: "contact_form", title: "Ceritakan Situasimu" },
    ],
    monetizationHint: "Kelas & Kursus untuk program rekaman -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "career-coach",
    category: "coaching",
    layoutVariant: "card",
    label: "Career Coach",
    description: "Review CV, interview, karier",
    theme: "corporate",
    bio: "Career coach | Bantu kamu naik level di dunia kerja",
    social: { linkedin: "username", instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Konsultasi Karier", "Diskusi target karier & rencana langkahnya"),
      link("linkedin", "Profil Profesional", "Latar belakang & pengalaman pendampingan"),
    ],
    blocks: [
      { type: "text", title: "Layanan", text: "Tuliskan layanan yang kamu tawarkan (review CV, simulasi interview, strategi pindah karier) beserta harganya." },
      faqBlock([
        { question: "Apakah CV-nya direvisi langsung?", answer: "Jelaskan bentuk hasil akhir yang klien terima." },
        { question: "Untuk level apa saja?", answer: "Tulis level karier yang biasa kamu dampingi." },
      ]),
    ],
    monetizationHint: "Produk digital (template CV) bisa jadi pelengkap sesi konsultasi berbayar.",
  },
  {
    key: "business-mentor",
    category: "coaching",
    layoutVariant: "split",
    label: "Mentor Bisnis",
    description: "Mentoring usaha, strategi, kelas",
    theme: "downtown",
    bio: "Mentor bisnis | Dampingi UMKM tumbuh terukur",
    social: { instagram: "username", linkedin: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Konsultasi Bisnis", "Bahas kondisi usahamu & prioritas perbaikannya"),
      link("instagram", "Studi Kasus", "Cerita pendampingan & pelajaran praktis"),
    ],
    blocks: [
      showcaseBlock({
        title: "Program Mentoring",
        description: "Tuliskan struktur program (durasi, frekuensi pertemuan, hasil yang ditargetkan) supaya calon klien paham komitmennya.",
        badgeText: "PROGRAM",
        ctaText: "Lihat Detail",
        url: PLATFORM_URL.whatsapp,
      }),
      { type: "contact_form", title: "Ajukan Sesi Perkenalan" },
    ],
    monetizationHint: "Kelas & Kursus untuk materi terstruktur -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "psychologist-counselor",
    category: "coaching",
    layoutVariant: "minimal",
    label: "Psikolog & Konselor",
    description: "Konseling, jadwal, kerahasiaan",
    theme: "ivory",
    bio: "Psikolog | Ruang aman untuk bercerita dan pulih",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Buat Janji Konseling", "Pilih jadwal sesi yang tersedia"),
      link("instagram", "Edukasi Kesehatan Mental", "Materi ringan yang bisa langsung dipakai"),
    ],
    blocks: [
      { type: "text", title: "Alur Konseling", text: "Jelaskan alur sesi, durasi, media (online/tatap muka), dan komitmen kerahasiaan di sini." },
      faqBlock([
        { question: "Apakah sesinya rahasia?", answer: "Tegaskan kebijakan kerahasiaan yang kamu terapkan." },
        { question: "Berapa biaya per sesi?", answer: "Tulis biaya dan metode pembayaran yang diterima." },
      ]),
    ],
    monetizationHint: "Produk Digital (worksheet/panduan self-help) bisa melengkapi layanan konselingmu.",
  },
  {
    key: "one-on-one-consult",
    category: "coaching",
    layoutVariant: "headline",
    label: "Konsultasi 1-on-1",
    description: "Sesi bayar per jam, bidang apa pun",
    theme: "polaris",
    bio: "Konsultasi 1-on-1 | Bayar per sesi, langsung ke inti masalah",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx", email: "halo@domainmu.com" },
    links: [
      link("whatsapp", "Pesan Sesi", "Pilih durasi sesi & topik yang mau dibahas"),
      link("email", "Pertanyaan Panjang", "Kirim detail kasusmu lebih dulu"),
    ],
    blocks: [
      { type: "text", title: "Topik yang Bisa Dibahas", text: "Tuliskan bidang keahlianmu dan contoh masalah yang biasa kamu bantu selesaikan." },
      faqBlock([
        { question: "Bagaimana kalau butuh lanjutan?", answer: "Jelaskan opsi paket beberapa sesi kalau tersedia." },
        { question: "Apakah ada rekaman sesinya?", answer: "Tulis kebijakanmu soal rekaman dan catatan sesi." },
      ]),
    ],
    monetizationHint: "Produk Digital cocok kalau mau jual paket sesi (mis. 3x konsultasi) dalam satu harga tetap.",
  },
  // 2 template berikut ditambahkan 6 September 2026 (permintaan langsung
  // pengguna: "saya mau buatkan 10 template yang sesuai dengan tema web
  // ini") -- mengisi celah niche keuangan pribadi & public speaking, belum
  // terwakili di 5 template sebelumnya (life/career/bisnis/psikolog/
  // konsultasi umum).
  {
    key: "financial-coach",
    category: "coaching",
    layoutVariant: "banner",
    label: "Konsultan Keuangan",
    description: "Konsultasi keuangan, budgeting, investasi",
    theme: "corporate",
    bio: "Konsultan keuangan | Bantu kamu atur uang & mulai investasi",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx", email: "halo@domainmu.com" },
    links: [
      link("whatsapp", "Konsultasi Keuangan", "Cek kondisi keuangan & susun rencana"),
      link("instagram", "Tips Uang Harian", "Edukasi budgeting & investasi ringan"),
    ],
    blocks: [
      { type: "text", title: "Layanan Konsultasi", text: "Tuliskan topik yang kamu bantu (budgeting, dana darurat, investasi, utang) beserta format sesinya di sini." },
      faqBlock([
        { question: "Konsultasinya online atau tatap muka?", answer: "Tulis media konsultasi yang kamu layani." },
        { question: "Apakah aman berbagi data keuangan?", answer: "Jelaskan kebijakan kerahasiaan data klien." },
      ]),
      { type: "contact_form", title: "Mulai Konsultasi" },
    ],
    monetizationHint: "Produk Digital cocok untuk jual paket konsultasi beberapa sesi dalam satu harga tetap.",
  },
  {
    key: "public-speaking-coach",
    category: "coaching",
    layoutVariant: "spotlight",
    label: "Coach Public Speaking",
    description: "Pelatihan presentasi, workshop, booking",
    theme: "champagne",
    bio: "Coach public speaking | Percaya diri bicara di depan umum",
    social: { instagram: "username", youtube: "@namachannel", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Booking Kelas", "Pilih format privat atau grup"),
      link("youtube", "Cuplikan Materi", "Tips singkat & momen kelas sebelumnya"),
    ],
    blocks: [
      { type: "text", title: "Program Pelatihan", text: "Tuliskan format pelatihan (privat/grup/workshop kantor) beserta durasi dan harganya di sini." },
      faqBlock([
        { question: "Cocok untuk pemula yang gugupan?", answer: "Jelaskan pendekatan yang kamu pakai untuk peserta pemula." },
        { question: "Apakah ada sertifikat?", answer: "Tulis apakah peserta mendapat sertifikat setelah pelatihan." },
      ]),
    ],
    monetizationHint: "Kelas & Kursus cocok untuk workshop rekaman yang bisa dijual berulang.",
  },
  // 2 template berikut ditambahkan 6 September 2026 (permintaan langsung
  // pengguna: "buatkan template quick setup sesuai tema website minimal 2
  // di tiap category, template tema joyfull") -- niche coach hubungan &
  // coach belajar/akademik belum terwakili di kategori ini.
  {
    key: "relationship-coach",
    category: "coaching",
    layoutVariant: "portrait",
    label: "Coach Hubungan & Pernikahan",
    description: "Sesi konseling, program, testimoni",
    theme: "joyful",
    bio: "Relationship coach | Bantu komunikasi lebih sehat dengan pasangan",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Jadwalkan Sesi", "Konseling individu atau pasangan"),
      link("instagram", "Tips Hubungan", "Insight komunikasi & resolusi konflik"),
    ],
    blocks: [
      { type: "text", title: "Cara Kerja Sesi", text: "Jelaskan format sesi (individu/pasangan), durasi, dan media (online/tatap muka) di sini." },
      faqBlock([
        { question: "Apakah rahasia terjamin?", answer: "Jelaskan kebijakan kerahasiaan sesi konseling." },
        { question: "Berapa sesi yang disarankan?", answer: "Tulis perkiraan jumlah sesi tergantung kompleksitas masalah." },
      ]),
    ],
    monetizationHint: "Produk Digital cocok untuk jual paket beberapa sesi dalam satu harga tetap.",
  },
  {
    key: "study-coach",
    category: "coaching",
    layoutVariant: "headline",
    label: "Coach Belajar & Akademik",
    description: "Bimbingan metode belajar, konsultasi",
    theme: "joyful",
    bio: "Study coach | Bantu kamu belajar lebih efektif, bukan lebih lama",
    social: { instagram: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Konsultasi Belajar", "Ceritakan kendala belajarmu sekarang"),
      link("instagram", "Tips Metode Belajar", "Teknik belajar efektif tiap minggu"),
    ],
    blocks: [
      { type: "text", title: "Program Pendampingan", text: "Tuliskan siapa target muridmu (pelajar/mahasiswa), metode yang kamu ajarkan, dan format sesinya di sini." },
      faqBlock([{ question: "Cocok untuk semua mata pelajaran?", answer: "Jelaskan apakah fokus ke metode belajar umum atau mata pelajaran tertentu." }]),
    ],
    monetizationHint: "Kelas & Kursus cocok untuk workshop metode belajar yang bisa dijual berulang.",
  },

  // ---------- Digital Product (benchmark Lynk.id: ebook, template Canva,
  // preset Lightroom, template Notion). "shop" fokus barang fisik/toko,
  // kategori ini fokus produk yang diunduh.
  {
    key: "ebook-author",
    category: "digital",
    layoutVariant: "polaroid",
    label: "Ebook & Panduan",
    description: "Jual ebook, preview, testimoni",
    theme: "kraft",
    bio: "Penulis ebook | Panduan praktis yang bisa langsung dipakai",
    social: { instagram: "username", email: "halo@domainmu.com" },
    links: [
      link("instagram", "Cuplikan Isi", "Potongan materi & respons pembaca"),
      link("email", "Kerja Sama", "Untuk kolaborasi & bundling"),
    ],
    blocks: [
      showcaseBlock({
        title: "Ebook Terbaru",
        description: "Tuliskan judul, untuk siapa ebook ini, dan apa yang pembaca dapat setelah menyelesaikannya.",
        badgeText: "EBOOK",
        ctaText: "Lihat Detail",
        url: PLATFORM_URL.instagram,
      }),
      faqBlock([
        { question: "Formatnya apa?", answer: "Tulis format file (PDF/EPUB) dan cara mengaksesnya setelah membeli." },
        { question: "Apakah ada update gratis?", answer: "Jelaskan kebijakan pembaruan isi ebook." },
      ]),
    ],
    monetizationHint: "Produk digital dengan pengiriman file otomatis -- pembeli langsung dapat tautan unduhannya.",
  },
  {
    key: "template-preset-seller",
    category: "digital",
    layoutVariant: "masthead",
    label: "Template & Preset",
    description: "Canva, Lightroom, desain siap pakai",
    theme: "candy",
    bio: "Template & preset siap pakai | Hemat waktu, hasil rapi",
    social: { instagram: "username", tiktok: "username" },
    links: [
      link("instagram", "Contoh Hasil", "Before-after & cara pemakaian"),
      link("tiktok", "Tutorial Singkat", "Cara pasang preset & edit template"),
    ],
    blocks: [
      showcaseBlock({
        title: "Paket Template Terlaris",
        description: "Tuliskan isi paket (jumlah template, format, software yang dibutuhkan) supaya pembeli tahu kompatibilitasnya.",
        badgeText: "BESTSELLER",
        ctaText: "Lihat Paket",
        url: PLATFORM_URL.instagram,
      }),
      faqBlock([
        { question: "Butuh aplikasi berbayar?", answer: "Tulis software yang dibutuhkan dan apakah versi gratisnya cukup." },
        { question: "Bisa dipakai untuk klien?", answer: "Jelaskan lisensi penggunaan (pribadi atau komersial)." },
      ]),
    ],
    monetizationHint: "Bundel cocok untuk menjual beberapa paket template sekaligus dengan harga lebih hemat.",
  },
  {
    key: "notion-productivity",
    category: "digital",
    layoutVariant: "split",
    label: "Notion & Spreadsheet",
    description: "Sistem kerja, tracker, dashboard",
    theme: "console",
    bio: "Template Notion & spreadsheet | Rapikan kerja dan keuanganmu",
    social: { instagram: "username", x: "username" },
    links: [
      link("instagram", "Preview Template", "Tampilan dashboard & cara pakainya"),
      link("x", "Tips Produktivitas", "Trik singkat merapikan sistem kerja"),
    ],
    blocks: [
      { type: "text", title: "Isi Template", text: "Tuliskan halaman/tab apa saja yang ada di dalam template dan masalah apa yang diselesaikannya." },
      faqBlock([
        { question: "Cara pakainya bagaimana?", answer: "Jelaskan langkah duplikasi template ke akun pembeli." },
        { question: "Apakah ada panduan?", answer: "Tulis apakah video atau dokumen panduan disertakan." },
      ]),
    ],
    monetizationHint: "Produk digital dengan file/tautan template -- tambahkan Voucher untuk peluncuran perdana.",
  },
  {
    key: "digital-art-asset",
    category: "digital",
    layoutVariant: "spotlight",
    label: "Digital Art & Aset",
    description: "Ilustrasi, font, aset desain",
    theme: "nova",
    bio: "Digital artist | Ilustrasi & aset desain siap pakai",
    social: { instagram: "username", tiktok: "username", email: "halo@domainmu.com" },
    links: [
      link("instagram", "Galeri Karya", "Kumpulan ilustrasi & aset terbaru"),
      link("email", "Komisi Custom", "Untuk permintaan karya khusus"),
    ],
    blocks: [
      { type: "text", title: "Portofolio Karya", text: "Tuliskan jenis karya yang kamu buat dan gaya khasmu di sini -- tambahkan blok Galeri lewat editor Link Bio untuk memajang gambarnya." },
      faqBlock([
        { question: "Boleh dipakai komersial?", answer: "Jelaskan lisensi pemakaian untuk tiap jenis aset." },
        { question: "Bisa pesan custom?", answer: "Tulis alur pemesanan komisi dan estimasi waktu pengerjaannya." },
      ]),
    ],
    monetizationHint: "Gabungkan produk digital (aset siap unduh) dengan Bundel untuk komisi custom.",
  },
  {
    key: "software-tools",
    category: "digital",
    layoutVariant: "hero",
    label: "Software & Tools",
    description: "Aplikasi, plugin, langganan",
    theme: "cyber",
    bio: "Bikin tools yang menyelesaikan masalah nyata",
    social: { x: "username", github: "username", email: "halo@domainmu.com" },
    links: [
      link("website", "Coba Produknya", "Demo & dokumentasi lengkap"),
      link("x", "Update Produk", "Fitur baru & catatan pengembangan"),
    ],
    blocks: [
      showcaseBlock({
        title: "Apa yang Diselesaikan",
        description: "Tuliskan masalah utama yang dipecahkan produkmu dan untuk siapa produk ini dibuat.",
        badgeText: "PRODUK",
        ctaText: "Coba Sekarang",
        url: PLATFORM_URL.website,
        imagePath: "/quick-setup-showcase/dashboard-mockup.jpg",
      }),
      faqBlock([
        { question: "Apakah ada versi gratis?", answer: "Jelaskan batasan versi gratis dan keuntungan versi berbayar." },
        { question: "Bagaimana dukungannya?", answer: "Tulis kanal dukungan dan waktu responsmu." },
      ]),
    ],
    monetizationHint: "Payment Link cocok untuk lisensi; Voucher untuk promo early adopter.",
  },
  // 2 template berikut ditambahkan 6 September 2026 (permintaan langsung
  // pengguna: "saya mau buatkan 10 template yang sesuai dengan tema web
  // ini") -- mengisi celah niche produk audio & kuliner, beda dari 5
  // template sebelumnya yang semuanya soal dokumen/desain/software.
  {
    key: "beat-producer",
    category: "digital",
    layoutVariant: "cover",
    label: "Beat & Sound Kit",
    description: "Jual beat, sample pack, lisensi",
    theme: "vapor",
    bio: "Music producer | Beat & sound kit siap pakai",
    social: { instagram: "username", youtube: "@namachannel", email: "halo@domainmu.com" },
    links: [
      link("spotify", "Dengerin Portofolio", "Beat & lagu yang pernah aku produksi"),
      link("youtube", "Preview Beat Baru", "Cuplikan beat terbaru tiap minggu"),
    ],
    blocks: [
      showcaseBlock({
        title: "Beat Pack Terbaru",
        description: "Tuliskan genre, jumlah beat dalam pack, dan jenis lisensi (non-eksklusif/eksklusif) yang kamu tawarkan.",
        badgeText: "SOUND KIT",
        ctaText: "Dengerin Sekarang",
        url: PLATFORM_URL.youtube,
      }),
      faqBlock([
        { question: "Lisensinya bagaimana?", answer: "Jelaskan perbedaan lisensi non-eksklusif dan eksklusif serta hak penggunaannya." },
        { question: "Formatnya apa saja?", answer: "Tulis format file yang didapat pembeli (MP3/WAV/stems)." },
      ]),
    ],
    monetizationHint: "Produk digital dengan pengiriman file otomatis -- pembeli langsung dapat tautan unduhannya.",
  },
  {
    key: "recipe-ebook",
    category: "digital",
    layoutVariant: "ribbon",
    label: "Ebook Resep Masakan",
    description: "Jual ebook resep, tips masak",
    theme: "cocoa",
    bio: "Food creator | Kumpulan resep rumahan siap coba",
    social: { instagram: "username", tiktok: "username", email: "halo@domainmu.com" },
    links: [
      link("instagram", "Resep Gratis Harian", "Cuplikan resep & tips dapur"),
      link("tiktok", "Video Cara Masak", "Tutorial singkat langkah demi langkah"),
    ],
    blocks: [
      showcaseBlock({
        title: "Ebook Resep Terbaru",
        description: "Tuliskan tema ebook (mis. masakan rumahan 30 menit), jumlah resep, dan format filenya.",
        badgeText: "EBOOK RESEP",
        ctaText: "Lihat Isi Ebook",
        url: PLATFORM_URL.instagram,
      }),
      faqBlock([
        { question: "Resepnya untuk berapa porsi?", answer: "Tulis standar porsi tiap resep dan apakah bisa disesuaikan." },
        { question: "Ada video panduannya juga?", answer: "Jelaskan apakah ebook dilengkapi tautan video tutorial." },
      ]),
    ],
    monetizationHint: "Produk digital dengan pengiriman file otomatis -- pembeli langsung dapat tautan unduhannya.",
  },
  // 2 template berikut ditambahkan 6 September 2026 (permintaan langsung
  // pengguna: "buatkan template quick setup sesuai tema website minimal 2
  // di tiap category, template tema joyfull") -- niche stock media & font
  // seller belum terwakili di kategori ini.
  {
    key: "stock-media-seller",
    category: "digital",
    layoutVariant: "spotlight",
    label: "Stock Foto & Video",
    description: "Jual foto/video stok, lisensi",
    theme: "joyful",
    bio: "Kreator stock media | Foto & video siap pakai untuk proyekmu",
    social: { instagram: "username", email: "halo@domainmu.com" },
    links: [
      link("instagram", "Preview Koleksi", "Cuplikan foto & video terbaru"),
      link("email", "Lisensi Khusus", "Untuk kebutuhan komersial skala besar"),
    ],
    blocks: [
      showcaseBlock({
        title: "Koleksi Terbaru",
        description: "Tuliskan tema koleksi, jumlah aset, dan resolusi yang tersedia.",
        badgeText: "STOCK MEDIA",
        ctaText: "Lihat Koleksi",
        url: PLATFORM_URL.instagram,
      }),
      faqBlock([
        { question: "Lisensinya untuk apa saja?", answer: "Jelaskan cakupan lisensi (personal/komersial) dan batasannya." },
        { question: "Format filenya apa?", answer: "Tulis format & resolusi file yang didapat pembeli." },
      ]),
    ],
    monetizationHint: "Produk digital dengan pengiriman file otomatis -- pembeli langsung dapat tautan unduhannya.",
  },
  {
    key: "font-seller",
    category: "digital",
    layoutVariant: "masthead",
    label: "Font & Typeface",
    description: "Jual font custom, lisensi, preview",
    theme: "joyful",
    bio: "Type designer | Font custom untuk brand & desainmu",
    social: { instagram: "username", email: "halo@domainmu.com" },
    links: [
      link("instagram", "Preview Font", "Contoh penggunaan font di berbagai desain"),
      link("email", "Lisensi Komersial", "Untuk penggunaan brand/produk berbayar"),
    ],
    blocks: [
      showcaseBlock({
        title: "Font Terbaru",
        description: "Tuliskan nama font, gaya (serif/sans/display), dan format file yang didapat pembeli.",
        badgeText: "FONT BARU",
        ctaText: "Lihat Detail",
        url: PLATFORM_URL.instagram,
      }),
      faqBlock([{ question: "Bisa dipakai untuk logo brand?", answer: "Jelaskan cakupan lisensi untuk penggunaan komersial seperti logo." }]),
    ],
    monetizationHint: "Produk digital dengan pengiriman file otomatis -- pembeli langsung dapat tautan unduhannya.",
  },

  // ---------- Marketing & Social (benchmark Linktree "Marketing" +
  // "Social Media", s.id "Marketing Teams"/"Agencies"). Template "Agency"
  // di kategori business fokus profil perusahaan; di sini fokus jasa
  // pemasaran per-spesialisasi.
  {
    key: "digital-marketing-agency",
    category: "marketing",
    layoutVariant: "banner",
    label: "Digital Marketing",
    description: "Jasa iklan, portofolio, konsultasi",
    theme: "surge",
    bio: "Digital marketing | Bantu brand tumbuh dengan data",
    social: { instagram: "username", linkedin: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Konsultasi Gratis", "Ceritakan target & anggaran kampanyemu"),
      link("linkedin", "Profil Perusahaan", "Tim, layanan, dan klien kami"),
    ],
    blocks: [
      { type: "text", title: "Layanan", text: "Tuliskan layanan yang kamu tawarkan (iklan berbayar, SEO, konten, email) beserta cakupannya." },
      showcaseBlock({
        title: "Studi Kasus",
        description: "Ceritakan satu kampanye: kondisi awal, yang kamu kerjakan, dan hasilnya dalam angka.",
        badgeText: "CASE STUDY",
        ctaText: "Lihat Hasil",
        url: PLATFORM_URL.linkedin,
      }),
      { type: "contact_form", title: "Minta Penawaran" },
    ],
    monetizationHint: "Produk Digital (paket audit awal) bisa jadi entry point sebelum klien berkomitmen.",
  },
  {
    key: "social-media-manager",
    category: "marketing",
    layoutVariant: "duo",
    label: "Social Media Manager",
    description: "Kelola akun, konten, laporan",
    theme: "blush",
    bio: "Social media manager | Akunmu aktif, terarah, dan tumbuh",
    social: { instagram: "username", tiktok: "username", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Diskusi Kebutuhan", "Bahas akun & target pertumbuhanmu"),
      link("instagram", "Contoh Kelolaan", "Feed & konten yang pernah kutangani"),
    ],
    blocks: [
      { type: "text", title: "Paket Pengelolaan", text: "Tuliskan isi paket (jumlah konten per bulan, platform, laporan) dan harganya di sini." },
      faqBlock([
        { question: "Apakah termasuk desain konten?", answer: "Jelaskan apa saja yang kamu kerjakan dan apa yang perlu klien siapkan." },
        { question: "Bagaimana pelaporannya?", answer: "Tulis format dan frekuensi laporan performa." },
      ]),
    ],
    monetizationHint: "Bundel bisa dipakai untuk paket bulanan; Voucher untuk klien pertama.",
  },
  {
    key: "copywriter",
    category: "marketing",
    layoutVariant: "headline",
    label: "Copywriter",
    description: "Naskah iklan, website, portofolio",
    theme: "ivory",
    bio: "Copywriter | Kata yang bikin orang bergerak",
    social: { instagram: "username", linkedin: "username", email: "halo@domainmu.com" },
    links: [
      link("email", "Diskusi Proyek", "Kirim brief & tenggat waktumu"),
      link("linkedin", "Portofolio Naskah", "Contoh tulisan & klien sebelumnya"),
    ],
    blocks: [
      { type: "text", title: "Jenis Naskah", text: "Tuliskan jenis naskah yang kamu kerjakan (iklan, landing page, email, skrip video) beserta tarifnya." },
      { type: "contact_form", title: "Kirim Brief" },
    ],
    monetizationHint: "Payment Link memudahkan menagih DP proyek sebelum pengerjaan dimulai.",
  },
  {
    key: "seo-specialist",
    category: "marketing",
    layoutVariant: "split",
    label: "SEO Specialist",
    description: "Audit, optimasi, laporan peringkat",
    theme: "atmos",
    bio: "SEO specialist | Bawa websitemu ke halaman pertama",
    social: { linkedin: "username", x: "username", email: "halo@domainmu.com" },
    links: [
      link("email", "Minta Audit", "Kirim alamat websitemu untuk ditinjau"),
      link("linkedin", "Rekam Jejak", "Proyek & hasil optimasi sebelumnya"),
    ],
    blocks: [
      showcaseBlock({
        title: "Audit SEO Gratis",
        description: "Jelaskan apa saja yang kamu periksa dalam audit awal dan bentuk laporan yang klien terima.",
        badgeText: "AUDIT",
        ctaText: "Ajukan Audit",
        url: PLATFORM_URL.email,
      }),
      faqBlock([
        { question: "Berapa lama hasilnya terlihat?", answer: "Jelaskan ekspektasi waktu yang realistis untuk kata kunci yang disasar." },
        { question: "Apakah termasuk penulisan konten?", answer: "Tulis batas cakupan pekerjaanmu." },
      ]),
    ],
    monetizationHint: "Produk digital untuk panduan SEO mandiri bisa jadi entry point sebelum sesi audit berbayar.",
  },
  {
    key: "brand-campaign",
    category: "marketing",
    layoutVariant: "ticket",
    label: "Kampanye Brand",
    description: "Landing kampanye, promo, CTA tunggal",
    theme: "ember",
    bio: "Halaman kampanye | Semua info promo ada di sini",
    social: { instagram: "username", tiktok: "username" },
    links: [
      link("website", "Ikut Kampanye", "Halaman pendaftaran & syarat lengkap"),
      link("instagram", "Update Kampanye", "Pengumuman pemenang & keseruan peserta"),
    ],
    blocks: [
      showcaseBlock({
        title: "Detail Kampanye",
        description: "Tuliskan mekanisme, periode, hadiah, dan syarat keikutsertaan supaya peserta tidak bertanya berulang.",
        badgeText: "PERIODE TERBATAS",
        ctaText: "Ikut Sekarang",
        url: PLATFORM_URL.website,
      }),
      faqBlock([
        { question: "Sampai kapan periodenya?", answer: "Tulis tanggal mulai dan berakhirnya kampanye." },
        { question: "Siapa yang boleh ikut?", answer: "Jelaskan syarat peserta dan wilayah yang dijangkau." },
      ]),
    ],
    monetizationHint: "Voucher paling pas untuk kampanye promo dengan kode khusus.",
  },
  // 2 template berikut ditambahkan 6 September 2026 (permintaan langsung
  // pengguna: "buatkan template quick setup sesuai tema website minimal 2
  // di tiap category, template tema joyfull") -- niche email marketing
  // specialist & influencer marketing manager belum terwakili di
  // kategori ini.
  {
    key: "email-marketing-specialist",
    category: "marketing",
    layoutVariant: "headline",
    label: "Email Marketing Specialist",
    description: "Jasa email campaign, funnel, laporan",
    theme: "joyful",
    bio: "Email marketing specialist | Email yang benar-benar dibuka & diklik",
    social: { linkedin: "username", email: "halo@domainmu.com" },
    links: [
      link("email", "Audit Email Gratis", "Kirim campaign emailmu untuk dicek dulu"),
      link("linkedin", "Studi Kasus", "Hasil open rate & konversi klien sebelumnya"),
    ],
    blocks: [
      { type: "text", title: "Layanan Email Marketing", text: "Tuliskan platform yang kamu kuasai (Mailchimp/Klaviyo/dll), jenis campaign (newsletter, funnel, promo), dan tarifnya di sini." },
      faqBlock([
        { question: "Perlu list email sendiri?", answer: "Jelaskan apakah klien harus punya list email dulu atau kamu bantu membangunnya." },
        { question: "Laporannya seperti apa?", answer: "Tulis metrik yang dilaporkan (open rate, klik, konversi) dan frekuensinya." },
      ]),
    ],
    monetizationHint: "Payment Link cocok untuk menagih fee bulanan pengelolaan email marketing.",
  },
  {
    key: "influencer-marketing-manager",
    category: "marketing",
    layoutVariant: "duo",
    label: "Influencer Marketing Manager",
    description: "Kelola kolaborasi brand-kreator, laporan",
    theme: "joyful",
    bio: "Influencer marketing manager | Jembatan brand & kreator yang tepat",
    social: { instagram: "username", linkedin: "username", email: "halo@domainmu.com" },
    links: [
      link("email", "Ajukan Campaign", "Untuk brand yang mau kolaborasi kreator"),
      link("linkedin", "Portofolio Campaign", "Hasil kolaborasi brand-kreator sebelumnya"),
    ],
    blocks: [
      { type: "text", title: "Layanan yang Ditawarkan", text: "Tuliskan cakupan layanan (cari kreator, negosiasi, kelola campaign, laporan performa) beserta model kerja sama di sini." },
      faqBlock([{ question: "Ada database kreator sendiri?", answer: "Jelaskan jaringan kreator yang kamu kelola dan nichenya." }]),
    ],
    monetizationHint: "Payment Link cocok untuk menagih fee manajemen per campaign.",
  },
  // 2 template berikut ditambahkan 6 September 2026 (permintaan langsung
  // pengguna: "saya mau buatkan 10 template yang sesuai dengan tema web
  // ini") -- mengisi celah jasa kreatif visual & iklan berbayar, beda dari
  // digital-marketing-agency (profil AGENSI) dan social-media-manager
  // (kelola akun) yang sudah ada -- dua ini fokus KEAHLIAN spesifik
  // freelancer perorangan.
  {
    key: "video-editor",
    category: "marketing",
    layoutVariant: "portrait",
    label: "Video Editor",
    description: "Jasa edit video, portofolio, harga",
    theme: "obsidian",
    bio: "Video editor | Bikin kontenmu enak ditonton",
    social: { instagram: "username", youtube: "@namachannel", whatsapp: "62812xxxxxxxx" },
    links: [
      link("whatsapp", "Diskusi Proyek", "Kirim raw footage & referensi gaya editing"),
      link("youtube", "Portofolio Edit", "Contoh hasil edit untuk berbagai klien"),
    ],
    blocks: [
      { type: "text", title: "Jenis Layanan Edit", text: "Tuliskan jenis video yang kamu tangani (reels, YouTube, iklan, dokumentasi acara) beserta tarif dan estimasi pengerjaannya." },
      faqBlock([
        { question: "Revisi berapa kali?", answer: "Tulis jumlah revisi yang termasuk dalam satu paket harga." },
        { question: "Berapa lama pengerjaannya?", answer: "Jelaskan estimasi waktu pengerjaan per jenis proyek." },
      ]),
    ],
    monetizationHint: "Payment Link memudahkan menagih DP proyek sebelum pengerjaan dimulai.",
  },
  {
    key: "ads-specialist",
    category: "marketing",
    layoutVariant: "minimal",
    label: "Ads Specialist",
    description: "Kelola iklan Meta/Google, laporan performa",
    theme: "ivory",
    bio: "Ads specialist | Iklan yang benar-benar menghasilkan penjualan",
    social: { instagram: "username", linkedin: "username", email: "halo@domainmu.com" },
    links: [
      link("email", "Audit Iklan Gratis", "Kirim akun iklanmu untuk dicek dulu"),
      link("linkedin", "Studi Kasus", "Hasil kampanye klien sebelumnya"),
    ],
    blocks: [
      { type: "text", title: "Layanan Iklan", text: "Tuliskan platform yang kamu kelola (Meta Ads/Google Ads/TikTok Ads), model kerja sama, dan tarifnya di sini." },
      faqBlock([
        { question: "Budget minimum berapa?", answer: "Tulis budget iklan minimum yang kamu sarankan untuk hasil optimal." },
        { question: "Laporannya seperti apa?", answer: "Jelaskan frekuensi dan format laporan performa iklan." },
      ]),
    ],
    monetizationHint: "Payment Link cocok untuk menagih fee bulanan pengelolaan iklan.",
  },
  // "custom-blank" -- satu-satunya template kategori "custom" (lihat
  // catatan di QUICK_SETUP_CATEGORIES). SENGAJA tanpa bio/links/blocks/
  // social/products -- applyTemplate (dashboard/quick-setup/page.tsx)
  // tetap menghapus link lama & menerapkan tema/layout seperti template
  // lain (perilaku "ganti total" yang sama, cuma hasil akhirnya kosong),
  // lalu kreator susun sendiri lewat editor Link Bio biasa sesudahnya.
  {
    key: "custom-blank",
    category: "custom",
    label: "Halaman Kosong",
    description: "Halaman kosong tanpa konten bawaan -- pilih tema dasarnya, sisanya susun sendiri sesuai keinginanmu.",
    theme: "default",
    bio: "",
    links: [],
  },
];
