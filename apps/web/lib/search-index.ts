import {
  IconBell,
  IconBook,
  IconBox,
  IconCalendar,
  IconCamera,
  IconChart,
  IconClock,
  IconGift,
  IconGlobe,
  IconHeart,
  IconInbox,
  IconLink,
  IconPaintbrush,
  IconPencil,
  IconPhone,
  IconPlayCircle,
  IconSettings,
  IconShield,
  IconSparkle,
  IconStar,
  IconTag,
  IconTrash,
  IconUsers,
  IconWallet,
} from "@/components/icons";

export type SearchEntry = {
  label: string;
  href: string;
  description: string;
  icon: typeof IconChart;
  // keywords -- istilah lain/lama yang mungkin masih diketik pengguna
  // (mis. label nav "Tautan"/"Produk" diganti "Link Bio"/"Toko" -- kata
  // lama tetap harus bisa ditemukan supaya kebiasaan lama tidak "hilang").
  keywords?: string[];
};

// SEARCH_INDEX -- permintaan langsung pengguna: "saya mau tambahkan search
// global jadi bisa mencari semua fitur yang ada di menu menu berdasarkan
// keyword". Daftar statis SEMUA halaman yang bisa dituju dari dashboard --
// NAV_ITEMS (layout.tsx) untuk item level atas, ditambah sub-halaman Desain
// & Pengaturan yang TIDAK muncul di sidebar (cuma bisa dicapai lewat hub
// masing-masing) supaya benar-benar "semua fitur", bukan cuma yang ada di
// sidebar. SENGAJA daftar statis terpisah (bukan menurunkan dari NAV_ITEMS
// secara otomatis) -- NAV_ITEMS cuma tahu item levelnya sendiri, tidak tahu
// sub-halaman Desain/Pengaturan, dan description di sini butuh teks lebih
// panjang dari label singkat sidebar.
export const SEARCH_INDEX: SearchEntry[] = [
  { label: "Ringkasan", href: "/dashboard", description: "Statistik kunjungan, klik, pesanan, dan penjualan.", icon: IconChart, keywords: ["dashboard", "statistik", "analitik"] },
  { label: "Tutorial", href: "/dashboard/tutorial", description: "Panduan membuat link bio dan produk pertamamu.", icon: IconPlayCircle, keywords: ["tutorial", "panduan", "bantuan", "onboarding", "cara"] },
  { label: "Statistik", href: "/dashboard/statistik", description: "Jumlah klik tautan dan performa penjualan produk.", icon: IconChart, keywords: ["statistik", "klik", "analitik", "penjualan", "transaksi"] },
  { label: "Link Bio", href: "/dashboard/links", description: "Kelola tautan & blok konten halaman utamamu.", icon: IconLink, keywords: ["tautan", "link", "bio"] },
  { label: "Toko", href: "/dashboard/products", description: "Kelola produk digital yang kamu jual.", icon: IconBox, keywords: ["produk", "toko", "jual"] },
  { label: "Desain", href: "/dashboard/design", description: "Foto profil, bio, tema, dan status terbit halaman publikmu.", icon: IconSparkle, keywords: ["desain", "tampilan"] },
  { label: "Tema", href: "/dashboard/design/theme", description: "Pilih preset warna, gradien, wallpaper, atau 3D.", icon: IconPaintbrush, keywords: ["tema", "warna", "wallpaper", "3d", "gradien", "background", "latar"] },
  { label: "Header", href: "/dashboard/design/header", description: "Foto profil & gambar latar halaman.", icon: IconCamera, keywords: ["header", "foto", "avatar", "sampul", "cover"] },
  { label: "Tombol", href: "/dashboard/design/tombol", description: "Gaya, kelengkungan, dan warna tombol.", icon: IconSparkle, keywords: ["tombol", "button"] },
  { label: "Font", href: "/dashboard/design/font", description: "Font halaman & font judul.", icon: IconBook, keywords: ["font", "huruf", "tipografi"] },
  { label: "Domain Kustom", href: "/dashboard/custom-domain", description: "Arahkan domainmu sendiri ke halaman Jeon.id.", icon: IconGlobe, keywords: ["domain", "cname"] },
  { label: "Halaman Tambahan", href: "/dashboard/pages", description: "Halaman bio/landing tambahan di luar halaman utama.", icon: IconGlobe, keywords: ["halaman", "landing", "bio tambahan"] },
  { label: "Voucher", href: "/dashboard/vouchers", description: "Kode diskon untuk produkmu.", icon: IconTag, keywords: ["voucher", "diskon", "kode"] },
  { label: "Bundel", href: "/dashboard/bundles", description: "Gabungkan beberapa produk jadi satu paket.", icon: IconGift, keywords: ["bundel", "paket"] },
  { label: "Dukungan", href: "/dashboard/donation", description: "Blok dukungan/donasi nominal bebas.", icon: IconHeart, keywords: ["donasi", "dukungan", "support"] },
  { label: "Afiliasi", href: "/dashboard/affiliates", description: "Program afiliasi privat dengan komisi custom.", icon: IconUsers, keywords: ["afiliasi", "komisi", "referral"] },
  { label: "Loyalitas", href: "/dashboard/loyalty", description: "Poin & reward untuk pembeli berulang.", icon: IconStar, keywords: ["loyalitas", "poin", "reward"] },
  { label: "Event", href: "/dashboard/events", description: "Jual tiket event online/offline.", icon: IconCalendar, keywords: ["event", "acara", "tiket"] },
  { label: "Kelas & Kursus", href: "/dashboard/courses", description: "Kursus video terstruktur per-bab.", icon: IconBook, keywords: ["kelas", "kursus", "course"] },
  { label: "Booking Konsultasi", href: "/dashboard/bookings", description: "Jual sesi konsultasi dengan slot waktu.", icon: IconClock, keywords: ["booking", "konsultasi", "jadwal"] },
  { label: "Audiens", href: "/dashboard/audience", description: "Kontak subscriber & pembeli, lead capture.", icon: IconInbox, keywords: ["audiens", "subscriber", "lead"] },
  { label: "Social Proof", href: "/dashboard/social-proof", description: "Notifikasi \"X baru saja membeli\" di halaman publik.", icon: IconBell, keywords: ["social proof", "notifikasi pembelian"] },
  { label: "Kartu Kontak", href: "/dashboard/business-card", description: "Kartu kontak digital, bisa dibagikan lewat kode QR.", icon: IconPhone, keywords: ["kartu kontak", "vcard", "qr"] },
  { label: "Saldo & Penarikan", href: "/dashboard/balance", description: "Saldo tersedia/tertahan & riwayat penarikan.", icon: IconWallet, keywords: ["saldo", "penarikan", "withdraw", "payout"] },
  { label: "Verifikasi KYC", href: "/dashboard/kyc", description: "Verifikasi identitas & rekening.", icon: IconShield, keywords: ["kyc", "verifikasi"] },
  { label: "Tim & Kolaborator", href: "/dashboard/team", description: "Undang admin dengan akses terbatas.", icon: IconUsers, keywords: ["tim", "kolaborator", "admin"] },
  { label: "Pengaturan", href: "/dashboard/settings", description: "Kelola akun, pembayaran, tim, dan keamananmu.", icon: IconSettings, keywords: ["pengaturan", "settings"] },
  { label: "Profil & Akun", href: "/dashboard/settings/profile", description: "Nama tampilan, bio, username, kategori kreator.", icon: IconPencil, keywords: ["profil", "username", "akun"] },
  { label: "Keamanan", href: "/dashboard/settings/security", description: "Ganti password, verifikasi dua langkah (2FA), sesi aktif.", icon: IconShield, keywords: ["keamanan", "password", "2fa", "sesi"] },
  { label: "Pembayaran & Penarikan", href: "/dashboard/settings/payment", description: "Rekening/e-wallet, verifikasi, jadwal auto-withdraw.", icon: IconWallet, keywords: ["rekening", "e-wallet", "auto-withdraw"] },
  { label: "Langganan Premium", href: "/dashboard/settings/subscription", description: "Hilangkan watermark, latar belakang kustom.", icon: IconStar, keywords: ["premium", "langganan", "upgrade", "watermark", "subscription"] },
  { label: "Zona Berbahaya", href: "/dashboard/settings/danger-zone", description: "Nonaktifkan atau hapus akun.", icon: IconTrash, keywords: ["hapus akun", "nonaktifkan", "danger zone"] },
];
