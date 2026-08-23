import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import ScrollReveal from "@/components/landing/ScrollReveal";

// Ketentuan Layanan -- lihat catatan lengkap kenapa halaman ini dibuat
// (bug link footer) di app/privacy/page.tsx, pola & tingkat kedetailan
// yang SAMA (singkat & faktual, bukan dokumen legal formal).
export const metadata: Metadata = {
  title: "Ketentuan Layanan Jeon.id",
  description: "Syarat menggunakan akun Jeon.id, aturan konten, dan ketentuan pembayaran/langganan.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <>
      <ScrollReveal />
      <Navbar />
      <main>
        <section className="relative overflow-hidden bg-white pb-16 pt-36 md:pt-44">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <span className="mb-4 inline-block rounded-full border border-primary/15 bg-primary-subtle px-3 py-1.5 text-xs font-semibold text-primary">
              Ketentuan
            </span>
            <h1 className="mb-3 font-heading text-3xl font-bold leading-tight text-ink sm:text-4xl">Ketentuan Layanan</h1>
            <p className="mb-10 text-sm text-muted">Terakhir diperbarui 23 Agustus 2026.</p>

            <div className="space-y-8 text-sm leading-relaxed text-ink">
              <div>
                <h2 className="mb-2 font-heading text-lg font-bold text-ink">Akunmu</h2>
                <p className="text-muted">
                  Kamu bertanggung jawab menjaga kerahasiaan kredensial login akunmu (password, sesi aktif) dan atas seluruh
                  aktivitas yang terjadi lewat akunmu. Satu orang/bisnis disarankan hanya punya satu akun kreator.
                </p>
              </div>

              <div>
                <h2 className="mb-2 font-heading text-lg font-bold text-ink">Konten yang boleh & tidak boleh</h2>
                <p className="text-muted">
                  Kamu bertanggung jawab penuh atas konten (tautan, bio, produk) yang kamu unggah. Tautan yang mengarah ke judi
                  online, konten dewasa/pornografi, atau konten ilegal lain diblokir sistem &amp; dilarang -- akun yang berulang
                  kali melanggar bisa disuspend. Kami juga menerima laporan pengunjung lewat tombol Laporkan di tiap halaman
                  publik dan meninjaunya lewat panel admin.
                </p>
              </div>

              <div>
                <h2 className="mb-2 font-heading text-lg font-bold text-ink">Pembayaran & produk digital</h2>
                <p className="text-muted">
                  Pembayaran dari pembeli produkmu diproses lewat Midtrans. Jeon.id mengambil biaya platform dari setiap transaksi
                  sukses sebelum dana masuk ke saldomu; sisanya bisa ditarik lewat menu Penarikan Dana setelah melewati periode
                  penahanan (holding period) yang berlaku. Kamu bertanggung jawab memastikan produk digital yang dijual sesuai
                  deskripsi dan bisa diakses pembeli.
                </p>
              </div>

              <div>
                <h2 className="mb-2 font-heading text-lg font-bold text-ink">Langganan Premium</h2>
                <p className="text-muted">
                  Paket Premium ditagih bulanan atau tahunan sesuai pilihanmu, dan bisa dibatalkan kapan saja lewat Pengaturan &gt;
                  Langganan -- fitur Premium tetap aktif sampai akhir periode yang sudah dibayar, tanpa pengembalian dana prorata
                  untuk sisa periode berjalan.
                </p>
              </div>

              <div>
                <h2 className="mb-2 font-heading text-lg font-bold text-ink">Penghentian akun</h2>
                <p className="text-muted">
                  Kamu bisa menghapus akunmu sendiri kapan saja lewat Pengaturan &gt; Zona Berbahaya. Kami berhak menonaktifkan
                  akun yang melanggar ketentuan konten di atas.
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
