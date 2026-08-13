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

export interface QuickSetupCategory {
  key: string;
  label: string;
}

export const QUICK_SETUP_CATEGORIES: QuickSetupCategory[] = [
  { key: "creator", label: "Creator & Personal Brand" },
  { key: "business", label: "Business & Professional" },
  { key: "shop", label: "Online Shop" },
  { key: "education", label: "Education" },
  { key: "entertainment", label: "Entertainment" },
  { key: "local", label: "Local Business" },
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

export interface QuickSetupTemplate {
  key: string;
  category: string;
  label: string;
  description: string;
  theme: string;
  bio: string;
  links: QuickSetupTemplateLink[];
  blocks?: QuickSetupTemplateBlock[];
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
  // sama-sama jatuh ke default "centered" (2 tabrakan). Sekarang KEDELAPAN
  // kategori dapat varian STRUKTUR unik masing-masing (tidak ada dua
  // kategori yang sama), varian ke-8 "polaroid" ditambah khusus supaya
  // muat. SATU varian per kategori (bukan campur dalam satu kategori)
  // supaya tiap kategori punya "signature look" sendiri:
  //   - creator      -> "hero" (avatar penuh edge-to-edge -- ref: Linktree
  //                      Hero / bio Instagram, personal brand tampil besar)
  //   - business     -> "banner" (avatar kecil rata kiri sebaris nama+bio
  //                      -- ref: header profil LinkedIn / kartu nama digital)
  //   - shop         -> "card" (identitas dibungkus kartu bertema, avatar
  //                      menonjol -- ref: header toko Shopify, kesan "kartu
  //                      resmi/etalase brand")
  //   - education    -> "minimal" (avatar kecil sebaris nama, konten jadi
  //                      pusat perhatian -- ref: header dokumen Notion /
  //                      halaman instruktur Coursera, daftar kelas > foto)
  //   - entertainment -> "spotlight" (avatar besar dalam badge bulat --
  //                      ref: artwork bulat artis Spotify / cover circle
  //                      podcast Apple Podcasts)
  //   - local        -> "cover" (pita warna ala foto sampul, avatar
  //                      menindih tepi bawahnya -- ref: cover photo halaman
  //                      Facebook Page / Google Business Profile toko lokal)
  //   - lifestyle    -> "polaroid" (avatar KOTAK dibingkai putih & sedikit
  //                      dimiringkan ala foto polaroid -- ref: cover board
  //                      Pinterest / estetika feed VSCO, cocok utk konten
  //                      visual travel/fashion/beauty)
  //   - special      -> "centered" (bawaan, gaya Linktree klasik -- ref:
  //                      Linktree default, paling pas utk kategori hub/
  //                      serba-guna seperti "Link Hub"/"Coming Soon" yang
  //                      memang tidak butuh identitas visual berat)
  // Kosong/undefined = "centered".
  layoutVariant?: "centered" | "banner" | "card" | "spotlight" | "cover" | "minimal" | "hero" | "polaroid";
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
      faqBlock([{ question: "Terbuka untuk kerja sama brand?", answer: "Terbuka banget! DM lewat Instagram untuk diskusi kolaborasi & rate card." }]),
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
      faqBlock([{ question: "Bagaimana cara mengundang untuk acara/kolaborasi?", answer: "Kirim detail acara & undangan lewat DM Instagram, tim kami akan meninjau & menghubungi balik." }]),
    ],
    monetizationHint: "Cocok dipasangkan dengan Event -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "streamer",
    category: "creator",
    layoutVariant: "hero",
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
    layoutVariant: "hero",
    label: "Gamer",
    description: "Profil game, Discord, YouTube, Twitch",
    theme: "cyber",
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
    layoutVariant: "banner",
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
    layoutVariant: "banner",
    label: "Agency",
    description: "Layanan, portofolio, daftar klien",
    theme: "midnight",
    bio: "Agency kreatif | Lihat portofolio kami",
    links: [link("website"), link("instagram"), link("linkedin")],
    blocks: [
      { type: "text", title: "Klien Kami", text: "Tuliskan daftar klien/mitra di sini." },
      faqBlock([{ question: "Bagaimana memulai proyek dengan agency ini?", answer: "Hubungi kami lewat website atau LinkedIn di atas, kita mulai dari sesi diskusi kebutuhanmu." }]),
    ],
  },
  {
    key: "professional-cv",
    category: "business",
    layoutVariant: "banner",
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
  {
    key: "online-store",
    category: "shop",
    layoutVariant: "card",
    label: "Online Store",
    description: "Produk, marketplace, promosi",
    theme: "peach",
    bio: "Toko online -- produk terbaik untukmu",
    links: [link("shopee", "Belanja di Shopee Kami"), link("tokopedia", "Belanja di Tokopedia Kami"), link("whatsapp", "Chat Admin Kami")],
    blocks: [faqBlock([{ question: "Bagaimana cara pembayaran?", answer: "Kami terima transfer bank & e-wallet, konfirmasi pesanan lewat WhatsApp." }])],
    monetizationHint: "Tambahkan produkmu di menu Toko supaya tampil di halaman ini.",
  },
  {
    key: "fashion-store",
    category: "shop",
    layoutVariant: "card",
    label: "Fashion Store",
    description: "Katalog, Instagram, Shopee/Tokopedia",
    theme: "rose",
    bio: "Fashion store | Koleksi terbaru tiap minggu",
    links: [link("instagram", "Lihat Koleksi Terbaru"), link("shopee"), link("tokopedia")],
    blocks: [faqBlock([{ question: "Apakah bisa tukar ukuran?", answer: "Bisa, selama barang belum dipakai & masih dalam 3 hari sejak diterima. Hubungi kami via WhatsApp." }])],
  },
  {
    key: "beauty-store",
    category: "shop",
    layoutVariant: "card",
    label: "Beauty Store",
    description: "Produk, katalog, booking",
    theme: "peach",
    bio: "Beauty store | Produk kecantikan pilihan",
    links: [link("instagram", "Lihat Produk Kami"), link("whatsapp", "Tanya-Tanya Produk")],
    blocks: [
      mapsBlock(),
      faqBlock([{ question: "Produk ini aman untuk kulit sensitif?", answer: "Sebagian besar produk kami cocok semua jenis kulit -- tanya detail dulu lewat WhatsApp sebelum order." }]),
    ],
    monetizationHint: "Cocok dipasangkan dengan Booking -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "food-beverage",
    category: "shop",
    layoutVariant: "card",
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
  },
  {
    key: "affiliate-store",
    category: "shop",
    layoutVariant: "card",
    label: "Affiliate Store",
    description: "Rekomendasi produk + tautan afiliasi",
    theme: "bloom",
    bio: "Rekomendasi produk pilihanku",
    links: [link("instagram"), link("tiktok")],
    blocks: [
      { type: "text", title: "Rekomendasi Produk", text: "Tuliskan kategori produk yang kamu rekomendasikan & kenapa kamu pakai/suka di sini." },
      faqBlock([{ question: "Apakah ada kode diskon?", answer: "Cek deskripsi tautan produk di atas -- kode diskon (kalau ada) selalu aku cantumkan di sana." }]),
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
    theme: "forest",
    bio: "Tutor privat | Booking jadwal belajar",
    links: [link("whatsapp", "Booking via WhatsApp")],
    blocks: [faqBlock([{ question: "Bagaimana jadwal lesnya?", answer: "Fleksibel sesuai kesepakatan -- chat dulu buat atur jadwal yang cocok." }])],
    monetizationHint: "Cocok dipasangkan dengan Booking -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "course-creator",
    category: "education",
    layoutVariant: "minimal",
    label: "Course Creator",
    description: "Kelas, testimoni, pendaftaran",
    theme: "golden",
    bio: "Kelas online -- belajar bareng aku",
    links: [link("instagram"), link("youtube")],
    blocks: [faqBlock([{ question: "Apakah ada sertifikat setelah selesai?", answer: "Ada, kamu dapat sertifikat digital setelah menyelesaikan semua modul kelas." }])],
    monetizationHint: "Cocok dipasangkan dengan Kelas & Kursus -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "student",
    category: "education",
    layoutVariant: "minimal",
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
    layoutVariant: "minimal",
    label: "Education Brand",
    description: "Kelas, event, komunitas",
    theme: "ocean",
    bio: "Belajar bareng komunitas kami",
    links: [link("instagram"), link("whatsapp", "Gabung Grup WhatsApp")],
    blocks: [faqBlock([{ question: "Bagaimana cara bergabung?", answer: "Klik salah satu tautan di atas untuk gabung WhatsApp/Instagram, info kelas & event rutin kami bagikan di sana." }])],
    monetizationHint: "Cocok dipasangkan dengan Kelas & Kursus dan Event -- aktifkan di menu Produk & Monetisasi.",
  },

  // ---------- Entertainment ----------
  {
    key: "musician",
    category: "entertainment",
    layoutVariant: "spotlight",
    label: "Musician",
    description: "Spotify, YouTube, Apple Music, media sosial",
    theme: "midnight",
    bio: "Musisi | Dengerin lagu terbaruku",
    links: [link("spotify"), link("youtube"), link("appleMusic"), link("instagram")],
    blocks: [
      { type: "text", title: "Rilisan Terbaru", text: "Tuliskan single/album terbarumu, plus jadwal tur/manggung kalau ada, di sini." },
      faqBlock([{ question: "Bisa booking untuk manggung?", answer: "Bisa, DM lewat Instagram untuk diskusi jadwal & rate manggung." }]),
    ],
  },
  {
    key: "artist",
    category: "entertainment",
    layoutVariant: "spotlight",
    label: "Artist",
    description: "Portofolio, commission, media sosial",
    theme: "lavender",
    bio: "Seniman | Open commission",
    links: [link("instagram")],
    blocks: [
      { type: "text", title: "Open Commission", text: "Tuliskan info & harga commission di sini." },
      faqBlock([{ question: "Berapa lama proses pengerjaan commission?", answer: "Tergantung kompleksitas, biasanya 3-10 hari kerja. DM dulu buat estimasi lebih pasti." }]),
    ],
  },
  {
    key: "dj",
    category: "entertainment",
    layoutVariant: "spotlight",
    label: "DJ",
    description: "Mix, event, booking",
    theme: "cyber",
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
      faqBlock([{ question: "Bagaimana cara jadi bintang tamu?", answer: "Kirim DM lewat salah satu kanal di atas dengan topik yang ingin kamu bahas." }]),
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
      faqBlock([{ question: "Terbuka untuk kolaborasi/sponsorship?", answer: "Terbuka! DM lewat Instagram untuk diskusi kolaborasi & rate kerja sama." }]),
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
    theme: "peach",
    bio: "Cafe | Ngopi santai di sini",
    links: [link("instagram", "Ikuti Update Kami")],
    blocks: [mapsBlock(), { type: "text", title: "Menu", text: "Tuliskan menu andalan cafemu di sini." }],
  },
  {
    key: "barbershop",
    category: "local",
    layoutVariant: "cover",
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
    layoutVariant: "cover",
    label: "Salon",
    description: "Layanan, portofolio, booking",
    theme: "rose",
    bio: "Salon kecantikan | Booking treatment",
    links: [link("instagram", "Lihat Hasil Treatment"), link("whatsapp", "Booking via WhatsApp")],
    blocks: [mapsBlock()],
    monetizationHint: "Cocok dipasangkan dengan Booking -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "photographer",
    category: "local",
    layoutVariant: "cover",
    label: "Photographer",
    description: "Portofolio, harga, booking",
    theme: "noir",
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

  // ---------- Lifestyle ----------
  {
    key: "travel-blogger",
    category: "lifestyle",
    layoutVariant: "polaroid",
    label: "Travel Blogger",
    description: "Destinasi, panduan perjalanan, media sosial",
    theme: "sunrise",
    bio: "Travel blogger | Cerita dari berbagai destinasi",
    links: [link("instagram"), link("youtube"), link("tiktok")],
    blocks: [
      { type: "text", title: "Destinasi Terbaru", text: "Tuliskan destinasi yang baru kamu kunjungi & tips perjalanannya di sini." },
      faqBlock([{ question: "Bisa minta rekomendasi itinerary?", answer: "Bisa, DM lewat Instagram sebutkan destinasi & budgetmu, aku bantu kasih rekomendasi." }]),
    ],
  },
  {
    key: "fitness-coach",
    category: "lifestyle",
    layoutVariant: "polaroid",
    label: "Fitness Coach",
    description: "Latihan, program, booking",
    theme: "blaze",
    bio: "Fitness coach | Program latihan bareng aku",
    links: [link("instagram"), link("whatsapp")],
    blocks: [
      { type: "text", title: "Program Latihan", text: "Tuliskan jenis program latihan yang kamu tawarkan (durasi, target, harga) di sini." },
      faqBlock([{ question: "Program cocok untuk pemula?", answer: "Cocok banget, program disesuaikan dengan level & tujuanmu -- chat WhatsApp dulu buat konsultasi." }]),
    ],
    monetizationHint: "Cocok dipasangkan dengan Kelas & Kursus atau Booking -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "beauty-creator",
    category: "lifestyle",
    layoutVariant: "polaroid",
    label: "Beauty Creator",
    description: "Tutorial, produk, media sosial",
    theme: "rose",
    bio: "Beauty creator | Tutorial makeup & skincare",
    links: [link("instagram"), link("tiktok"), link("youtube")],
    blocks: [
      { type: "text", title: "Produk Favorit", text: "Tuliskan produk makeup/skincare favoritmu yang sering direkomendasikan di sini." },
      faqBlock([{ question: "Bisa minta rekomendasi sesuai jenis kulit?", answer: "Bisa, DM lewat Instagram sebutkan jenis kulit & masalahmu, aku bantu rekomendasikan." }]),
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
    blocks: [
      { type: "text", title: "Rekomendasi Favorit", text: "Tuliskan produk, tempat, atau kebiasaan favorit yang sering kamu bagikan di sini." },
      faqBlock([{ question: "Terbuka untuk kolaborasi brand?", answer: "Terbuka! DM lewat Instagram untuk diskusi kolaborasi & rate kerja sama." }]),
    ],
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
    label: "Event",
    description: "Info acara + tiket + lokasi",
    theme: "golden",
    bio: "Info acara -- jangan sampai ketinggalan!",
    links: [link("instagram")],
    blocks: [{ type: "text", title: "Info Acara", text: "Tuliskan tanggal, lokasi, dan info acara di sini." }],
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
    key: "coming-soon",
    category: "special",
    label: "Coming Soon",
    description: "Teaser + email/WhatsApp",
    theme: "midnight",
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
    monetizationHint: "Tambahkan produkmu di menu Toko supaya tampil di halaman ini. Aktifkan juga Social Proof di menu Audiens & Pemasaran.",
  },
];
