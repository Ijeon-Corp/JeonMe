// faq-data.ts -- perbaikan SEO (temuan audit, 15 Agustus 2026): data FAQ
// dipisah dari components/landing/FAQ.tsx (yang "use client") ke modul
// NETRAL ini -- mengimpor sebuah nilai data polos dari modul "use client"
// ke kode server (app/page.tsx, lib/structured-data.ts) TIDAK berfungsi
// normal di Next.js App Router (batas client boundary dirancang utk
// komponen/fungsi, bukan re-export nilai data apa adanya -- terbukti
// langsung lewat error build "a.map is not a function" saat prerender
// sebelum modul ini dipisah). FAQ.tsx sekarang mengimpor `faqs` dari SINI,
// bukan sebaliknya -- satu sumber data yang bisa dipakai aman dari kedua
// sisi (server & client).
export interface FaqItem {
  q: string;
  a: string;
}

// Jawaban di bawah sebelumnya merujuk paket "Pro" yang tidak pernah ada di
// backend (lihat komentar components/landing/Pricing.tsx) DAN salah soal
// fitur mana yang sungguhan Premium-only -- ditelusuri ulang dari kode:
// analitik pendapatan tidak digerbang (cuma integrasi Meta Conversions API
// yang Premium-only, analytics.go).
export const faqs: FaqItem[] = [
  {
    q: "Apa itu Jeon.id?",
    a: "Jeon.id adalah platform link-in-bio all-in-one yang memungkinkan kreator, freelancer, dan bisnis menggabungkan tautan, konten, dan tools monetisasi mereka menjadi satu halaman yang indah dan bisa disesuaikan.",
  },
  {
    q: "Apakah ada paket gratis?",
    a: "Tentu saja. Paket Gratis mencakup tautan & blok konten tanpa batas, semua tema (termasuk wallpaper dan video), 1 Halaman Toko, serta statistik kunjungan dan klik, tanpa perlu kartu kredit untuk memulai.",
  },
  {
    q: "Bagaimana cara menjual produk digital?",
    a: "Tambahkan blok produk ke halamanmu, upload ebook, template, atau file kelas, atur harga, dan Jeon.id akan mengurus checkout serta pengiriman file secara otomatis dan aman.",
  },
  {
    q: "Bisakah saya melacak analitik?",
    a: "Ya, setiap paket (termasuk Gratis) sudah punya dashboard analitik lengkap: pengunjung, klik per tautan, produk terlaris, dan pendapatan. Paket Premium menambahkan integrasi Meta Conversions API untuk melacak konversi iklan Facebook/Instagram.",
  },
];
