// Quick Setup -- permintaan langsung pengguna, 11 Agustus 2026: "buatkan 1
// menu saja seperti quick setup dan user disuruh pilih jenis template...
// template ini bukan hanya visual tapi juga blok layout dll". Beda dari
// Tema (60+ preset warna/gradien murni visual, lihat page-themes.ts) --
// template di sini = KOMBINASI tema + bio + tautan starter + (opsional)
// blok konten, dipasang sekaligus lewat satu klik di /dashboard/quick-setup.
//
// Keputusan cakupan (dikonfirmasi langsung ke pengguna): fitur monetisasi
// yang perlu data nyata (harga/durasi/dll) -- Donasi/Booking/Event/Kelas/
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

export interface QuickSetupCategory {
  key: string;
  label: string;
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
  { key: "creator", label: "Creator & Personal Brand" },
  { key: "business", label: "Business & Professional" },
  { key: "shop", label: "Online Shop" },
  { key: "education", label: "Education" },
  { key: "entertainment", label: "Entertainment" },
  { key: "local", label: "Local Business" },
  { key: "tourism", label: "Tourism & Travel" },
  { key: "lifestyle", label: "Lifestyle" },
  { key: "special", label: "Special Purpose" },
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
  type: "text" | "contact_form" | "maps" | "faq";
  title: string;
  text?: string;
  url?: string;
  faqItems?: QuickSetupTemplateFaqItem[];
}

// QuickSetupTemplateProduct -- permintaan langsung pengguna, 17 Agustus
// 2026: "tambahkan template untuk produk yang siap pakai juga". BEDA dari
// Donasi/Booking/Event/Kelas/Afiliasi (SENGAJA tetap tidak dibuat otomatis,
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
    | "portrait";
}

// Judul default per platform -- permintaan langsung pengguna (referensi
// tangkapan layar halaman Linktree sungguhan): "MAKSUDNYA LANGSUNG DATA
// SEPERTI INI SAJAA BENTUKNYAA LANGSUNG JADI GITU" -- judul platform
// polos ("Instagram", "WhatsApp") diganti frasa ajakan (CTA) natural ala
// referensi ("Ikuti Update Kami", "Chat via WhatsApp"), bukan cuma nama
// platform. Template masih bisa override lewat argumen kedua `link()`
// untuk konteks yang lebih spesifik per template (mis. "Pesan Menu" utk
// F&B, bukan "Chat via WhatsApp" generik).
function link(platform: PlatformKey, title?: string): QuickSetupTemplateLink {
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
  return { title: title ?? labels[platform], url: PLATFORM_URL[platform] };
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

// OrderedTemplateItem -- bentuk SIAP RENDER (dipakai LANGSUNG oleh
// quick-setup/page.tsx untuk membangun PagePreviewData/payload createLink/
// createBlock, tidak perlu logika pemetaan block_data terpisah lagi di
// sana) supaya urutan & isi yang terlihat di pratinjau SELALU sama persis
// dengan yang benar-benar dibuat applyTemplate.
export interface OrderedTemplateItem {
  title: string;
  blockType: "link" | "text" | "contact_form" | "maps" | "faq";
  url: string;
  text?: string;
  faqItems?: QuickSetupTemplateFaqItem[];
}

// orderedTemplateItems -- SATU sumber kebenaran urutan tampil: blok
// "maps" ("Lokasi Kami") PALING ATAS, lalu tautan biasa, lalu blok lain
// (text/faq/contact_form) PALING BAWAH -- pola yang sama persis dengan
// referensi Linktree sungguhan yang diberikan pengguna (lokasi di atas,
// kontak/sosial di tengah, formulir "Kritik dan Saran" di bawah).
export function orderedTemplateItems(t: QuickSetupTemplate): OrderedTemplateItem[] {
  const mapsBlocks = (t.blocks ?? []).filter((b) => b.type === "maps");
  const otherBlocks = (t.blocks ?? []).filter((b) => b.type !== "maps");
  return [
    ...mapsBlocks.map((b) => ({ title: b.title, blockType: "maps" as const, url: b.url ?? "" })),
    ...t.links.map((l) => ({ title: l.title, blockType: "link" as const, url: l.url })),
    ...otherBlocks.map((b) => ({ title: b.title, blockType: b.type, url: "", text: b.text, faqItems: b.faqItems })),
  ];
}

export const QUICK_SETUP_TEMPLATES: QuickSetupTemplate[] = [
  // ---------- Creator & Personal Brand ----------
  {
    key: "creator-profile",
    category: "creator",
    layoutVariant: "hero",
    label: "Creator Profile",
    description: "Foto profil, bio, media sosial, YouTube, TikTok",
    theme: "bloom",
    bio: "Content creator | Berbagi konten setiap hari ✨",
    links: [link("instagram"), link("tiktok"), link("youtube")],
    blocks: [
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
    links: [link("instagram"), link("tiktok"), link("youtube")],
    blocks: [
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
    links: [link("linkedin"), link("instagram")],
    blocks: [
      { type: "text", title: "Pencapaian", text: "Tuliskan pencapaian & penghargaanmu di sini." },
      { type: "contact_form", title: "Hubungi Saya" },
    ],
  },
  {
    key: "public-figure",
    category: "creator",
    layoutVariant: "hero",
    label: "Public Figure",
    description: "Media sosial, event, merchandise",
    theme: "golden",
    bio: "Figur publik | Info kegiatan & kolaborasi",
    links: [link("instagram"), link("x"), link("youtube")],
    blocks: [
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
    layoutVariant: "portrait",
    label: "Streamer",
    description: "Twitch, YouTube, Discord, donasi",
    theme: "cyber",
    bio: "Live streaming rutin -- mabar yuk!",
    links: [link("twitch"), link("youtube"), link("discord")],
    blocks: [
      { type: "text", title: "Jadwal Live", text: "Tuliskan jadwal live streaming mingguanmu di sini." },
      faqBlock([{ question: "Ada perk khusus buat subscriber/donatur?", answer: "Ada! Emote khusus, shoutout, dan akses channel Discord eksklusif -- info lengkap ada di stream." }]),
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
    links: [link("discord"), link("youtube"), link("twitch")],
    blocks: [{ type: "text", title: "Game yang Dimainkan", text: "Tuliskan game favorit yang sering kamu mainkan & rank/level saat ini di sini." }],
  },

  // ---------- Business & Professional ----------
  {
    key: "business-profile",
    category: "business",
    layoutVariant: "banner",
    label: "Business Profile",
    description: "Website, WhatsApp, lokasi, kontak",
    theme: "ocean",
    bio: "Profil bisnis resmi kami.",
    links: [link("website", "Kunjungi Website Kami"), link("whatsapp", "Chat Admin Kami")],
    blocks: [
      mapsBlock(),
      faqBlock([{ question: "Bagaimana cara menghubungi kami?", answer: "Chat lewat WhatsApp atau isi formulir di bawah, tim kami akan segera merespons." }]),
      { type: "contact_form", title: "Kritik dan Saran" },
    ],
  },
  {
    key: "company",
    category: "business",
    layoutVariant: "banner",
    label: "Company",
    description: "Tentang, layanan, portofolio, kontak",
    theme: "minimal",
    bio: "Tentang perusahaan kami.",
    links: [link("website", "Kunjungi Website Kami"), link("linkedin")],
    blocks: [
      mapsBlock("Kantor Kami"),
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
    links: [link("linkedin"), link("instagram", "Lihat Portofolio")],
    blocks: [
      { type: "text", title: "Layanan & Harga", text: "Tuliskan daftar layanan dan harga di sini." },
      faqBlock([{ question: "Berapa lama waktu pengerjaan?", answer: "Tergantung kompleksitas proyek, biasanya 3-14 hari kerja. Chat dulu buat estimasi lebih pasti." }]),
      { type: "contact_form", title: "Hubungi Saya" },
    ],
  },
  {
    key: "consultant",
    category: "business",
    layoutVariant: "split",
    label: "Consultant",
    description: "Layanan, booking, testimoni",
    theme: "noir",
    bio: "Konsultan | Booking sesi konsultasi",
    links: [link("linkedin")],
    blocks: [
      faqBlock([{ question: "Bagaimana proses konsultasinya?", answer: "Booking slot yang tersedia, lalu kita diskusi via video call sesuai kebutuhanmu." }]),
      { type: "contact_form", title: "Hubungi Saya" },
    ],
    monetizationHint: "Cocok dipasangkan dengan Booking Konsultasi -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "agency",
    category: "business",
    layoutVariant: "split",
    label: "Agency",
    description: "Layanan, portofolio, daftar klien",
    theme: "midnight",
    bio: "Agency kreatif | Lihat portofolio kami",
    links: [link("website"), link("instagram"), link("linkedin")],
    blocks: [
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
    label: "Professional CV",
    description: "Pengalaman, keahlian, pendidikan, kontak",
    theme: "minimal",
    bio: "CV digital -- pengalaman, keahlian, & kontak.",
    links: [link("linkedin")],
    blocks: [
      { type: "text", title: "Pengalaman & Keahlian", text: "Tuliskan pengalaman kerja dan keahlianmu di sini." },
      { type: "contact_form", title: "Hubungi Saya" },
    ],
  },

  // ---------- Online Shop ----------
  // Susulan permintaan pengguna, 17 Agustus 2026: "coba tambahkan template
  // untuk produk yang siap pakai juga" -- lihat catatan lengkap di
  // QuickSetupTemplateProduct kenapa ini aman dibuat otomatis (beda dari
  // Booking/Event/Kelas). 5 dari 6 template di kategori ini dapat SATU
  // produk contoh (affiliate-store SENGAJA tidak -- intinya justru
  // mempromosikan produk ORANG LAIN, bukan produk sendiri). Blok konten
  // juga dirapikan supaya tidak semua template berbentuk sama (jumlah item
  // FAQ & kombinasi blok bervariasi, bukan selalu "1 text + 1 FAQ").
  {
    key: "online-store",
    category: "shop",
    layoutVariant: "card",
    label: "Online Store",
    description: "Produk, marketplace, promosi",
    theme: "peach",
    bio: "Toko online -- produk terbaik untukmu",
    links: [link("shopee", "Belanja di Shopee Kami"), link("tokopedia", "Belanja di Tokopedia Kami"), link("whatsapp", "Chat Admin Kami")],
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
    label: "Fashion Store",
    description: "Katalog, Instagram, Shopee/Tokopedia",
    theme: "rose",
    bio: "Fashion store | Koleksi terbaru tiap minggu",
    links: [link("instagram", "Lihat Koleksi Terbaru"), link("shopee"), link("tokopedia")],
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
    label: "Beauty Store",
    description: "Produk, katalog, booking",
    theme: "peach",
    bio: "Beauty store | Produk kecantikan pilihan",
    links: [link("instagram", "Lihat Produk Kami"), link("whatsapp", "Tanya-Tanya Produk")],
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
    monetizationHint: "Cocok dipasangkan dengan Booking -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "food-beverage",
    category: "shop",
    layoutVariant: "masthead",
    label: "Food & Beverage",
    description: "Menu, pemesanan, lokasi",
    theme: "amber",
    bio: "Food & beverage | Order sekarang",
    links: [link("whatsapp", "Pesan via WhatsApp"), link("instagram", "Ikuti Update Kami")],
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
    label: "Small Business",
    description: "Produk, WhatsApp, marketplace",
    theme: "mint",
    bio: "Usaha kecil, kualitas besar.",
    links: [link("whatsapp", "Pesan via WhatsApp"), link("shopee")],
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
    label: "Affiliate Store",
    description: "Rekomendasi produk + tautan afiliasi",
    theme: "bloom",
    bio: "Rekomendasi produk pilihanku",
    links: [link("instagram"), link("tiktok")],
    blocks: [
      { type: "text", title: "Rekomendasi Produk", text: "Tuliskan kategori produk yang kamu rekomendasikan & kenapa kamu pakai/suka di sini." },
      faqBlock([
        { question: "Apakah ada kode diskon?", answer: "Cek deskripsi tautan produk di atas -- kode diskon (kalau ada) selalu aku cantumkan di sana." },
        { question: "Kenapa harus beli lewat link kamu?", answer: "Harganya sama saja -- cuma bantu aku dapat komisi kecil dari toko, tanpa nambah biaya buat kamu." },
      ]),
    ],
    monetizationHint: "Cocok dipasangkan dengan Afiliasi -- aktifkan di menu Produk & Monetisasi.",
  },

  // ---------- Education ----------
  {
    key: "teacher",
    category: "education",
    layoutVariant: "minimal",
    label: "Teacher",
    description: "Info kelas, materi, kontak",
    theme: "ocean",
    bio: "Guru | Info kelas & materi belajar",
    links: [link("whatsapp")],
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
    links: [link("whatsapp", "Booking via WhatsApp")],
    blocks: [faqBlock([{ question: "Bagaimana jadwal lesnya?", answer: "Fleksibel sesuai kesepakatan -- chat dulu buat atur jadwal yang cocok." }])],
    monetizationHint: "Cocok dipasangkan dengan Booking -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "course-creator",
    category: "education",
    layoutVariant: "headline",
    label: "Course Creator",
    description: "Kelas, testimoni, pendaftaran",
    theme: "golden",
    bio: "Kelas online -- belajar bareng aku",
    links: [link("instagram"), link("youtube")],
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
    label: "Student",
    description: "Portofolio, proyek, media sosial",
    theme: "minimal",
    bio: "Mahasiswa/pelajar | Kumpulan proyekku",
    links: [link("instagram"), link("linkedin")],
    blocks: [{ type: "text", title: "Proyek", text: "Tuliskan proyek-proyek yang pernah kamu kerjakan di sini." }],
  },
  {
    key: "education-brand",
    category: "education",
    layoutVariant: "headline",
    label: "Education Brand",
    description: "Kelas, event, komunitas",
    theme: "atmos",
    bio: "Belajar bareng komunitas kami",
    links: [link("instagram"), link("whatsapp", "Gabung Grup WhatsApp")],
    blocks: [
      faqBlock([{ question: "Bagaimana cara bergabung?", answer: "Klik salah satu tautan di atas untuk gabung WhatsApp/Instagram, info kelas & event rutin kami bagikan di sana." }]),
      { type: "contact_form", title: "Daftar Kelas" },
    ],
    monetizationHint: "Cocok dipasangkan dengan Kelas & Kursus dan Event -- aktifkan di menu Produk & Monetisasi.",
  },

  // ---------- Entertainment ----------
  {
    key: "musician",
    category: "entertainment",
    layoutVariant: "portrait",
    label: "Musician",
    description: "Spotify, YouTube, Apple Music, media sosial",
    theme: "ember",
    bio: "Musisi | Dengerin lagu terbaruku",
    links: [link("spotify"), link("youtube"), link("appleMusic"), link("instagram")],
    blocks: [
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
    label: "Artist",
    description: "Portofolio, commission, media sosial",
    theme: "sakura",
    bio: "Seniman | Open commission",
    links: [link("instagram")],
    blocks: [
      { type: "text", title: "Open Commission", text: "Tuliskan info & harga commission di sini." },
      faqBlock([{ question: "Berapa lama proses pengerjaan commission?", answer: "Tergantung kompleksitas, biasanya 3-10 hari kerja. DM dulu buat estimasi lebih pasti." }]),
      { type: "contact_form", title: "Request Commission" },
    ],
  },
  {
    key: "dj",
    category: "entertainment",
    layoutVariant: "portrait",
    label: "DJ",
    description: "Mix, event, booking",
    theme: "downtown",
    bio: "DJ | Booking untuk acara kamu",
    links: [link("spotify"), link("instagram")],
    blocks: [faqBlock([{ question: "Bisa booking untuk acara apa saja?", answer: "Wedding, corporate event, club, sampai acara privat -- DM lewat Instagram buat cek jadwal & rate." }])],
    monetizationHint: "Cocok dipasangkan dengan Booking dan Event -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "podcaster",
    category: "entertainment",
    layoutVariant: "spotlight",
    label: "Podcaster",
    description: "Episode, platform, media sosial",
    theme: "noir",
    bio: "Podcast baru tiap minggu -- dengerin sekarang",
    links: [link("spotify"), link("applePodcasts"), link("youtube")],
    blocks: [
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
    label: "Content Creator",
    description: "Konten terbaru + media sosial",
    theme: "bloom",
    bio: "Konten terbaru setiap hari",
    links: [link("instagram"), link("tiktok"), link("youtube")],
    blocks: [
      { type: "text", title: "Konten Terbaru", text: "Tuliskan konten atau series terbarumu di sini." },
      { type: "contact_form", title: "Ajak Kolaborasi" },
    ],
  },

  // ---------- Local Business ----------
  {
    key: "restaurant",
    category: "local",
    layoutVariant: "cover",
    label: "Restaurant",
    description: "Menu, reservasi, lokasi, WhatsApp",
    theme: "amber",
    bio: "Restoran | Reservasi sekarang",
    links: [link("whatsapp", "Reservasi via WhatsApp"), link("instagram", "Ikuti Update Kami")],
    blocks: [
      mapsBlock(),
      { type: "text", title: "Menu", text: "Tuliskan menu andalan restoranmu di sini." },
      { type: "contact_form", title: "Kritik dan Saran" },
    ],
  },
  {
    key: "cafe",
    category: "local",
    layoutVariant: "cover",
    label: "Cafe",
    description: "Menu, Instagram, Google Maps",
    theme: "brew",
    bio: "Cafe | Ngopi santai di sini",
    links: [link("instagram", "Ikuti Update Kami")],
    blocks: [mapsBlock(), { type: "text", title: "Menu", text: "Tuliskan menu andalan cafemu di sini." }],
  },
  {
    key: "barbershop",
    category: "local",
    layoutVariant: "masthead",
    label: "Barbershop",
    description: "Layanan, daftar harga, booking",
    theme: "noir",
    bio: "Barbershop | Booking potong rambut",
    links: [link("whatsapp", "Booking via WhatsApp")],
    blocks: [
      mapsBlock(),
      { type: "text", title: "Daftar Harga", text: "Tuliskan layanan & harga di sini." },
      faqBlock([{ question: "Perlu booking dulu atau bisa walk-in?", answer: "Bisa walk-in, tapi disarankan booking dulu via WhatsApp supaya tidak antre lama." }]),
    ],
    monetizationHint: "Cocok dipasangkan dengan Booking -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "salon",
    category: "local",
    layoutVariant: "masthead",
    label: "Salon",
    description: "Layanan, portofolio, booking",
    theme: "surge",
    bio: "Salon kecantikan | Booking treatment",
    links: [link("instagram", "Lihat Hasil Treatment"), link("whatsapp", "Booking via WhatsApp")],
    blocks: [mapsBlock(), { type: "text", title: "Layanan & Treatment", text: "Tuliskan daftar treatment & harga yang kamu tawarkan di sini." }],
    monetizationHint: "Cocok dipasangkan dengan Booking -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "photographer",
    category: "local",
    layoutVariant: "masthead",
    label: "Photographer",
    description: "Portofolio, harga, booking",
    theme: "nova",
    bio: "Fotografer | Booking sesi foto",
    links: [link("instagram", "Lihat Portofolio")],
    blocks: [
      mapsBlock("Lokasi Studio"),
      { type: "text", title: "Paket & Harga", text: "Tuliskan paket foto & harga di sini." },
      faqBlock([{ question: "Apakah harga sudah termasuk edit foto?", answer: "Ya, semua paket sudah termasuk edit dasar. Edit lanjutan tersedia dengan biaya tambahan." }]),
    ],
    monetizationHint: "Cocok dipasangkan dengan Booking -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "event-organizer",
    category: "local",
    layoutVariant: "cover",
    label: "Event Organizer",
    description: "Event, portofolio, kontak",
    theme: "golden",
    bio: "Event organizer | Wujudkan acaramu",
    links: [link("instagram", "Lihat Portofolio Acara"), link("whatsapp", "Konsultasi via WhatsApp")],
    blocks: [{ type: "contact_form", title: "Hubungi Kami" }],
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
    label: "Sports Facility",
    description: "Sewa lapangan, jadwal, booking",
    theme: "forest",
    bio: "Sewa lapangan -- booking jadwal main sekarang",
    links: [link("whatsapp", "Booking Lapangan")],
    blocks: [
      mapsBlock("Lokasi Lapangan"),
      { type: "text", title: "Jadwal & Harga Sewa", text: "Tuliskan jam operasional & harga sewa per jam di sini." },
      faqBlock([{ question: "Apakah bisa booking harian atau harus langganan?", answer: "Bisa booking harian atau paket langganan bulanan -- chat WhatsApp buat cek slot kosong." }]),
    ],
    monetizationHint: "Cocok dipasangkan dengan Booking -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "nightlife-venue",
    category: "local",
    layoutVariant: "spotlight",
    label: "Nightlife Venue",
    description: "Event, reservasi meja, lokasi",
    theme: "noir",
    bio: "Tempat nongkrong malam -- reservasi meja sekarang",
    links: [link("whatsapp", "Reservasi Meja"), link("instagram", "Lihat Event Kami")],
    blocks: [
      mapsBlock(),
      { type: "text", title: "Event Malam Ini", text: "Tuliskan jadwal DJ/live music/tema malam mingguan di sini." },
      { type: "contact_form", title: "Reservasi Meja" },
    ],
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
    label: "Travel Agency",
    description: "Paket wisata, booking, lokasi",
    theme: "lagoon",
    bio: "Agen wisata -- wujudkan liburan impianmu",
    links: [link("whatsapp", "Booking Paket Wisata"), link("instagram", "Lihat Destinasi Kami")],
    blocks: [
      { type: "text", title: "Paket Wisata", text: "Tuliskan paket wisata & harga yang kamu tawarkan di sini." },
      mapsBlock("Kantor Kami"),
      faqBlock([{ question: "Apakah harga sudah termasuk penginapan?", answer: "Tergantung paket -- detail sudah dicantumkan di masing-masing paket, atau tanya langsung via WhatsApp." }]),
    ],
  },
  {
    key: "tour-guide",
    category: "tourism",
    layoutVariant: "polaroid",
    label: "Tour Guide",
    description: "Rute wisata, cerita perjalanan, booking",
    theme: "dune",
    bio: "Pemandu wisata lokal -- jelajahi bareng aku",
    links: [link("whatsapp", "Booking Tur"), link("instagram", "Lihat Cerita Perjalanan")],
    blocks: [
      { type: "text", title: "Rute & Destinasi", text: "Tuliskan rute/destinasi favorit yang biasa kamu pandu di sini." },
      faqBlock([{ question: "Berapa orang maksimal per grup tur?", answer: "Fleksibel sesuai permintaan -- chat WhatsApp buat diskusi jumlah peserta & jadwal." }]),
    ],
  },

  // ---------- Lifestyle ----------
  {
    key: "travel-blogger",
    category: "lifestyle",
    layoutVariant: "polaroid",
    label: "Travel Blogger",
    description: "Destinasi, panduan perjalanan, media sosial",
    theme: "lagoon",
    bio: "Travel blogger | Cerita dari berbagai destinasi",
    links: [link("instagram"), link("youtube"), link("tiktok")],
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
    label: "Fitness Coach",
    description: "Latihan, program, booking",
    theme: "dune",
    bio: "Fitness coach | Program latihan bareng aku",
    links: [link("instagram"), link("whatsapp")],
    blocks: [
      { type: "text", title: "Program Latihan", text: "Tuliskan jenis program latihan yang kamu tawarkan (durasi, target, harga) di sini." },
      { type: "contact_form", title: "Konsultasi Gratis" },
    ],
    monetizationHint: "Cocok dipasangkan dengan Kelas & Kursus atau Booking -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "beauty-creator",
    category: "lifestyle",
    layoutVariant: "duo",
    label: "Beauty Creator",
    description: "Tutorial, produk, media sosial",
    theme: "rose",
    bio: "Beauty creator | Tutorial makeup & skincare",
    links: [link("instagram"), link("tiktok"), link("youtube")],
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
    label: "Lifestyle Creator",
    description: "Konten, rekomendasi, afiliasi",
    theme: "peach",
    bio: "Lifestyle creator | Rekomendasi favoritku",
    links: [link("instagram"), link("tiktok")],
    blocks: [{ type: "text", title: "Rekomendasi Favorit", text: "Tuliskan produk, tempat, atau kebiasaan favorit yang sering kamu bagikan di sini." }],
    monetizationHint: "Cocok dipasangkan dengan Afiliasi -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "fashion-creator",
    category: "lifestyle",
    layoutVariant: "polaroid",
    label: "Fashion Creator",
    description: "Outfit, tautan belanja, media sosial",
    theme: "rose",
    bio: "Fashion creator | Inspirasi outfit harian",
    links: [link("instagram"), link("tiktok")],
    blocks: [
      { type: "text", title: "Outfit Guide", text: "Tuliskan gaya/kategori outfit yang sering kamu bagikan (kasual, kerja, formal, dst) di sini." },
      faqBlock([{ question: "Baju di outfit kamu beli di mana?", answer: "Cek deskripsi tautan produk di atas -- link belanja selalu aku cantumkan di sana." }]),
      { type: "contact_form", title: "Ajak Kolaborasi" },
    ],
    monetizationHint: "Cocok dipasangkan dengan Afiliasi -- aktifkan di menu Produk & Monetisasi.",
  },

  // ---------- Special Purpose ----------
  {
    key: "portfolio",
    category: "special",
    label: "Portfolio",
    description: "Proyek + keahlian + kontak",
    theme: "minimal",
    bio: "Portofolio -- proyek & keahlianku",
    links: [link("linkedin")],
    blocks: [
      { type: "text", title: "Proyek", text: "Tuliskan proyek-proyekmu di sini." },
      faqBlock([{ question: "Proyek seperti apa yang bisa kamu kerjakan?", answer: "Lihat pengalaman & keahlian di atas, atau hubungi saya langsung untuk diskusi proyekmu." }]),
      { type: "contact_form", title: "Hubungi Saya" },
    ],
  },
  {
    key: "link-hub",
    category: "special",
    label: "Link Hub",
    description: "Kumpulan semua tautanmu",
    theme: "default",
    bio: "Semua link pentingku, di satu tempat.",
    links: [link("instagram"), link("tiktok"), link("youtube"), link("whatsapp")],
  },
  {
    key: "event",
    category: "special",
    layoutVariant: "ticket",
    label: "Event",
    description: "Info acara + tiket + lokasi",
    theme: "golden",
    bio: "Info acara -- jangan sampai ketinggalan!",
    links: [link("instagram")],
    blocks: [
      { type: "text", title: "Info Acara", text: "Tuliskan tanggal, lokasi, dan info acara di sini." },
      faqBlock([{ question: "Bagaimana cara beli tiket?", answer: "Info tiket & harga akan diumumkan lewat Instagram -- pantau terus supaya tidak ketinggalan." }]),
    ],
    monetizationHint: "Cocok dipasangkan dengan Event -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "community",
    category: "special",
    label: "Community",
    description: "WhatsApp, Discord, Telegram, pendaftaran",
    theme: "ocean",
    bio: "Gabung komunitas kami",
    links: [link("whatsapp", "Gabung Grup WhatsApp"), link("discord"), link("telegram")],
    blocks: [
      faqBlock([{ question: "Gratis atau berbayar gabung komunitasnya?", answer: "Gratis! Klik salah satu tautan di atas untuk langsung gabung." }]),
      { type: "contact_form", title: "Daftar Sekarang" },
    ],
  },
  {
    key: "donation",
    category: "special",
    label: "Donation",
    description: "Platform donasi + media sosial",
    theme: "mint",
    bio: "Dukung perjuanganku",
    links: [link("instagram")],
    blocks: [
      { type: "text", title: "Tentang Perjuangan Ini", text: "Ceritakan kenapa kamu butuh dukungan & untuk apa dana yang terkumpul dipakai di sini." },
      faqBlock([{ question: "Dana yang terkumpul dipakai untuk apa?", answer: "Lihat cerita di atas untuk rinciannya -- setiap dukungan sangat berarti, terima kasih!" }]),
    ],
    monetizationHint: "Cocok dipasangkan dengan Dukungan (Donasi) -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "seasonal-greeting",
    category: "special",
    label: "Seasonal Greeting",
    description: "Ucapan musiman + media sosial",
    // theme "xmas" -- salah satu dari 5 tema baru hasil analisa galeri tema
    // kompetitor (17 Agustus 2026, folder theme/) yang ditambahkan
    // sebelumnya (xmas/pride/retro/kraft/monsoon) -- template ini sengaja
    // dibuat supaya kreator langsung punya jalan pakai temanya, bukan cuma
    // preset yang nongkrong di galeri tanpa konteks pemakaian.
    theme: "xmas",
    bio: "Selamat merayakan! Semoga hari-harimu penuh kehangatan.",
    links: [link("instagram"), link("whatsapp")],
    blocks: [{ type: "text", title: "Ucapan Untukmu", text: "Tuliskan ucapan hangat musim ini untuk pengunjung halamanmu di sini." }],
  },
  {
    key: "coming-soon",
    category: "special",
    label: "Coming Soon",
    description: "Teaser + email/WhatsApp",
    theme: "polaris",
    bio: "Sesuatu yang seru segera hadir. Nantikan!",
    links: [link("whatsapp")],
    blocks: [{ type: "contact_form", title: "Beri Tahu Aku" }],
  },
  {
    key: "product-launch",
    category: "special",
    label: "Product Launch",
    description: "Produk + CTA + social proof",
    theme: "blaze",
    bio: "Produk baru sudah hadir!",
    links: [link("instagram")],
    blocks: [
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
];
