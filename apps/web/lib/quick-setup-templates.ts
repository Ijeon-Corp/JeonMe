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
  emoji: string;
}

export const QUICK_SETUP_CATEGORIES: QuickSetupCategory[] = [
  { key: "creator", label: "Creator & Personal Brand", emoji: "✨" },
  { key: "business", label: "Business & Professional", emoji: "💼" },
  { key: "shop", label: "Online Shop", emoji: "🛍️" },
  { key: "education", label: "Education", emoji: "🎓" },
  { key: "entertainment", label: "Entertainment", emoji: "🎵" },
  { key: "local", label: "Local Business", emoji: "🍔" },
  { key: "lifestyle", label: "Lifestyle", emoji: "❤️" },
  { key: "special", label: "Special Purpose", emoji: "🚀" },
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
    label: "Creator Profile",
    description: "Foto profil, bio, media sosial, YouTube, TikTok",
    theme: "bloom",
    bio: "Content creator | Berbagi konten setiap hari ✨",
    links: [link("instagram"), link("tiktok"), link("youtube")],
  },
  {
    key: "influencer",
    category: "creator",
    label: "Influencer",
    description: "Media sosial + afiliasi + produk",
    theme: "blaze",
    bio: "Influencer & Content Creator",
    links: [link("instagram"), link("tiktok"), link("youtube")],
    monetizationHint: "Cocok dipasangkan dengan Afiliasi & Toko -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "personal-branding",
    category: "creator",
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
    label: "Public Figure",
    description: "Media sosial, event, merchandise",
    theme: "golden",
    bio: "Figur publik | Info kegiatan & kolaborasi",
    links: [link("instagram"), link("x"), link("youtube")],
    monetizationHint: "Cocok dipasangkan dengan Event -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "streamer",
    category: "creator",
    label: "Streamer",
    description: "Twitch, YouTube, Discord, donasi",
    theme: "cyber",
    bio: "Live streaming rutin -- mabar yuk!",
    links: [link("twitch"), link("youtube"), link("discord")],
    monetizationHint: "Cocok dipasangkan dengan Dukungan (Donasi) -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "gamer",
    category: "creator",
    label: "Gamer",
    description: "Profil game, Discord, YouTube, Twitch",
    theme: "cyber",
    bio: "Gamer | Main bareng di sini",
    links: [link("discord"), link("youtube"), link("twitch")],
  },

  // ---------- Business & Professional ----------
  {
    key: "business-profile",
    category: "business",
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
    label: "Affiliate Store",
    description: "Rekomendasi produk + tautan afiliasi",
    theme: "bloom",
    bio: "Rekomendasi produk pilihanku",
    links: [link("instagram"), link("tiktok")],
    monetizationHint: "Cocok dipasangkan dengan Afiliasi -- aktifkan di menu Produk & Monetisasi.",
  },

  // ---------- Education ----------
  {
    key: "teacher",
    category: "education",
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
    label: "Musician",
    description: "Spotify, YouTube, Apple Music, media sosial",
    theme: "midnight",
    bio: "Musisi | Dengerin lagu terbaruku",
    links: [link("spotify"), link("youtube"), link("appleMusic"), link("instagram")],
  },
  {
    key: "artist",
    category: "entertainment",
    label: "Artist",
    description: "Portofolio, commission, media sosial",
    theme: "lavender",
    bio: "Seniman | Open commission",
    links: [link("instagram")],
    blocks: [{ type: "text", title: "Open Commission", text: "Tuliskan info & harga commission di sini." }],
  },
  {
    key: "dj",
    category: "entertainment",
    label: "DJ",
    description: "Mix, event, booking",
    theme: "cyber",
    bio: "DJ | Booking untuk acara kamu",
    links: [link("spotify"), link("instagram")],
    monetizationHint: "Cocok dipasangkan dengan Booking dan Event -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "podcaster",
    category: "entertainment",
    label: "Podcaster",
    description: "Episode, platform, media sosial",
    theme: "noir",
    bio: "Podcast baru tiap minggu -- dengerin sekarang",
    links: [link("spotify"), link("applePodcasts"), link("youtube")],
  },
  {
    key: "content-creator",
    category: "entertainment",
    label: "Content Creator",
    description: "Konten terbaru + media sosial",
    theme: "bloom",
    bio: "Konten terbaru setiap hari",
    links: [link("instagram"), link("tiktok"), link("youtube")],
  },

  // ---------- Local Business ----------
  {
    key: "restaurant",
    category: "local",
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
    label: "Travel Blogger",
    description: "Destinasi, panduan perjalanan, media sosial",
    theme: "sunrise",
    bio: "Travel blogger | Cerita dari berbagai destinasi",
    links: [link("instagram"), link("youtube"), link("tiktok")],
  },
  {
    key: "fitness-coach",
    category: "lifestyle",
    label: "Fitness Coach",
    description: "Latihan, program, booking",
    theme: "blaze",
    bio: "Fitness coach | Program latihan bareng aku",
    links: [link("instagram"), link("whatsapp")],
    monetizationHint: "Cocok dipasangkan dengan Kelas & Kursus atau Booking -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "beauty-creator",
    category: "lifestyle",
    label: "Beauty Creator",
    description: "Tutorial, produk, media sosial",
    theme: "rose",
    bio: "Beauty creator | Tutorial makeup & skincare",
    links: [link("instagram"), link("tiktok"), link("youtube")],
  },
  {
    key: "lifestyle-creator",
    category: "lifestyle",
    label: "Lifestyle Creator",
    description: "Konten, rekomendasi, afiliasi",
    theme: "peach",
    bio: "Lifestyle creator | Rekomendasi favoritku",
    links: [link("instagram"), link("tiktok")],
    monetizationHint: "Cocok dipasangkan dengan Afiliasi -- aktifkan di menu Produk & Monetisasi.",
  },
  {
    key: "fashion-creator",
    category: "lifestyle",
    label: "Fashion Creator",
    description: "Outfit, tautan belanja, media sosial",
    theme: "rose",
    bio: "Fashion creator | Inspirasi outfit harian",
    links: [link("instagram"), link("tiktok")],
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
    monetizationHint: "Tambahkan produkmu di menu Toko supaya tampil di halaman ini. Aktifkan juga Social Proof di menu Audiens & Pemasaran.",
  },
];
