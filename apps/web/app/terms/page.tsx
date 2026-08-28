import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import ScrollReveal from "@/components/landing/ScrollReveal";

// Ketentuan Layanan -- lihat catatan lengkap kenapa halaman ini dibuat
// (bug link footer) di app/privacy/page.tsx. Diperluas 24 Agustus 2026,
// keluhan susulan pengguna: "buatkan saja page nya dan ikuti benchmark
// dari yang lain isinya" -- ditambah bagian standar yang lazim ada di
// ketentuan layanan SaaS mana pun (kelayakan usia, kekayaan intelektual,
// batasan tanggung jawab, penafian jaminan, hukum yang berlaku, perubahan
// ketentuan) yang SEBELUMNYA belum ada -- tetap singkat & faktual, bukan
// dokumen legal formal hasil review pengacara.
export const metadata: Metadata = {
  title: "Ketentuan Layanan Jeon.id",
  description: "Syarat menggunakan akun Jeon.id, aturan konten, ketentuan pembayaran/langganan, dan hukum yang berlaku.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <>
      <ScrollReveal />
      <Navbar />
      <main>
        <section className="relative overflow-hidden bg-app-surface pb-16 pt-36 md:pt-44">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <span className="mb-4 inline-block rounded-full border border-primary/15 bg-primary-subtle px-3 py-1.5 text-xs font-semibold text-primary">
              Ketentuan
            </span>
            <h1 className="mb-3 font-heading text-3xl font-bold leading-tight text-app-ink sm:text-4xl">Ketentuan Layanan</h1>
            <p className="mb-3 text-sm text-app-muted">Terakhir diperbarui 24 Agustus 2026.</p>
            <p className="mb-10 text-sm leading-relaxed text-app-muted">
              Dengan mendaftar &amp; memakai Jeon.id, kamu setuju dengan ketentuan di bawah ini. Kalau kamu tidak setuju,
              mohon tidak menggunakan layanan kami.
            </p>

            <div className="space-y-8 text-sm leading-relaxed text-app-ink">
              <div>
                <h2 className="mb-2 font-heading text-lg font-bold text-app-ink">1. Kelayakan</h2>
                <p className="text-app-muted">
                  Kamu harus berusia minimal 17 tahun (atau usia dewasa sah menurut hukum di negaramu, mana yang lebih tinggi)
                  untuk mendaftar akun kreator Jeon.id. Kalau kamu mendaftar atas nama bisnis/organisasi, kamu menyatakan
                  berwenang mengikat entitas itu ke ketentuan ini.
                </p>
              </div>

              <div>
                <h2 className="mb-2 font-heading text-lg font-bold text-app-ink">2. Akunmu</h2>
                <p className="text-app-muted">
                  Kamu bertanggung jawab menjaga kerahasiaan kredensial login akunmu (password, sesi aktif) dan atas seluruh
                  aktivitas yang terjadi lewat akunmu. Satu orang/bisnis disarankan hanya punya satu akun kreator.
                </p>
              </div>

              <div>
                <h2 className="mb-2 font-heading text-lg font-bold text-app-ink">3. Konten yang boleh &amp; tidak boleh</h2>
                <p className="text-app-muted">
                  Kamu bertanggung jawab penuh atas konten (tautan, bio, produk) yang kamu unggah. Tautan yang mengarah ke judi
                  online, konten dewasa/pornografi, atau konten ilegal lain diblokir sistem &amp; dilarang -- akun yang berulang
                  kali melanggar bisa disuspend. Kami juga menerima laporan pengunjung lewat tombol Laporkan di tiap halaman
                  publik dan meninjaunya lewat panel admin.
                </p>
              </div>

              <div>
                <h2 className="mb-2 font-heading text-lg font-bold text-app-ink">4. Kepemilikan konten &amp; kekayaan intelektual</h2>
                <p className="text-app-muted">
                  Konten yang kamu unggah (bio, produk, gambar, file) tetap sepenuhnya milikmu -- kami hanya menyimpan &amp;
                  menampilkannya sebagai bagian dari layanan, tanpa mengklaim kepemilikan. Sebaliknya, nama Jeon.id, logo,
                  desain platform, dan kode aplikasi adalah milik kami -- kamu tidak boleh menyalin atau meniru platform ini
                  untuk layanan pesaing.
                </p>
              </div>

              <div>
                <h2 className="mb-2 font-heading text-lg font-bold text-app-ink">5. Pembayaran &amp; produk digital</h2>
                <p className="text-app-muted">
                  Pembayaran dari pembeli produkmu diproses lewat Midtrans. Jeon.id mengambil biaya platform dari setiap transaksi
                  sukses sebelum dana masuk ke saldomu; sisanya bisa ditarik lewat menu Penarikan Dana setelah melewati periode
                  penahanan (holding period) yang berlaku. Kamu bertanggung jawab memastikan produk digital yang dijual sesuai
                  deskripsi dan bisa diakses pembeli.
                </p>
              </div>

              <div>
                <h2 className="mb-2 font-heading text-lg font-bold text-app-ink">6. Langganan Premium</h2>
                <p className="text-app-muted">
                  Paket Premium ditagih bulanan atau tahunan sesuai pilihanmu, dan bisa dibatalkan kapan saja lewat Pengaturan &gt;
                  Langganan -- fitur Premium tetap aktif sampai akhir periode yang sudah dibayar, tanpa pengembalian dana prorata
                  untuk sisa periode berjalan.
                </p>
              </div>

              <div>
                <h2 className="mb-2 font-heading text-lg font-bold text-app-ink">7. Penafian jaminan</h2>
                <p className="text-app-muted">
                  Jeon.id disediakan &quot;sebagaimana adanya&quot;. Kami berusaha menjaga layanan tetap berjalan lancar &amp;
                  aman, tapi tidak menjamin layanan akan selalu bebas gangguan, bebas kesalahan, atau tersedia tanpa henti --
                  termasuk pihak ketiga di luar kendali kami (mis. gangguan pada Midtrans atau penyedia hosting).
                </p>
              </div>

              <div>
                <h2 className="mb-2 font-heading text-lg font-bold text-app-ink">8. Batasan tanggung jawab</h2>
                <p className="text-app-muted">
                  Sepanjang diizinkan hukum yang berlaku, Jeon.id tidak bertanggung jawab atas kerugian tidak langsung (mis.
                  kehilangan potensi penjualan) akibat gangguan layanan. Kami tidak bertanggung jawab atas transaksi atau
                  perselisihan antara kreator dan pembeli produknya -- tanggung jawab atas kualitas &amp; pengiriman produk ada
                  di kreator masing-masing.
                </p>
              </div>

              <div>
                <h2 className="mb-2 font-heading text-lg font-bold text-app-ink">9. Penghentian akun</h2>
                <p className="text-app-muted">
                  Kamu bisa menghapus akunmu sendiri kapan saja lewat Pengaturan &gt; Zona Berbahaya. Kami berhak menonaktifkan
                  akun yang melanggar ketentuan konten di atas.
                </p>
              </div>

              <div>
                <h2 className="mb-2 font-heading text-lg font-bold text-app-ink">10. Hukum yang berlaku</h2>
                <p className="text-app-muted">
                  Ketentuan ini diatur &amp; ditafsirkan berdasarkan hukum Republik Indonesia, terlepas dari lokasi kamu
                  mengakses layanan.
                </p>
              </div>

              <div>
                <h2 className="mb-2 font-heading text-lg font-bold text-app-ink">11. Perubahan ketentuan</h2>
                <p className="text-app-muted">
                  Kami bisa memperbarui ketentuan ini dari waktu ke waktu. Perubahan signifikan akan kami infokan lewat email
                  ke alamat akunmu -- pemakaian layanan setelah perubahan berlaku dianggap sebagai persetujuanmu terhadap
                  ketentuan yang baru.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
