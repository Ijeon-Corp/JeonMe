// Domain produksi kanonik -- migrasi dari jeonme.com ke jeon.id, 18 Agustus
// 2026 (jeonme.com tetap aktif & redirect 301 ke sini, bukan didekomisi).
// Satu sumber kebenaran untuk sitemap/robots/JSON-LD supaya tidak ada lagi
// literal domain tersebar yang lupa ikut diganti saat migrasi berikutnya.
export const SITE_URL = "https://jeon.id";

// Kontak dukungan (Pusat Bantuan, benchmark Linktree "More > Support", 3
// September 2026). Diambil dari env supaya alamat sungguhan diatur di
// deployment, bukan ditulis mati di kode. FALLBACK support@jeon.id adalah
// PLACEHOLDER -- pastikan kotak masuk itu benar-benar ada, atau set
// NEXT_PUBLIC_SUPPORT_EMAIL ke alamat yang dipakai. WhatsApp opsional:
// hanya tampil kalau NEXT_PUBLIC_SUPPORT_WHATSAPP diisi (format 62812...).
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@jeon.id";
export const SUPPORT_WHATSAPP = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? "";
