import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import ScrollReveal from "@/components/landing/ScrollReveal";

// Kebijakan Privasi -- permintaan langsung pengguna, 23 Agustus 2026:
// "perbaiki semua link yang ada di footer karna ada beberapa yang diklik
// tidak terjadi apapun" -- link "Kebijakan Privasi" di footer SEBELUMNYA
// href="#" (tidak ke mana-mana sama sekali). Halaman ini SENGAJA singkat &
// faktual (bukan dokumen legal formal hasil review pengacara) -- mengikuti
// pola yang SUDAH ADA di modal "Privasi" milik halaman publik kreator
// (PageFooterLinks.tsx), diperluas sedikit utk cakupan level platform.
// Kalau butuh kekuatan hukum penuh nanti, ini titik awal yang jujur, bukan
// pengganti review hukum sungguhan.
export const metadata: Metadata = {
  title: "Kebijakan Privasi Jeon.id",
  description: "Data apa yang dikumpulkan Jeon.id, untuk apa dipakai, dan pihak ketiga mana saja yang terlibat.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <>
      <ScrollReveal />
      <Navbar />
      <main>
        <section className="relative overflow-hidden bg-white pb-16 pt-36 md:pt-44">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <span className="mb-4 inline-block rounded-full border border-primary/15 bg-primary-subtle px-3 py-1.5 text-xs font-semibold text-primary">
              Privasi
            </span>
            <h1 className="mb-3 font-heading text-3xl font-bold leading-tight text-ink sm:text-4xl">Kebijakan Privasi</h1>
            <p className="mb-10 text-sm text-muted">Terakhir diperbarui 23 Agustus 2026.</p>

            <div className="space-y-8 text-sm leading-relaxed text-ink">
              <div>
                <h2 className="mb-2 font-heading text-lg font-bold text-ink">Data yang kami kumpulkan</h2>
                <p className="text-muted">
                  Saat kamu mendaftar sebagai kreator, kami menyimpan nama, alamat email, username, dan konten yang kamu buat sendiri
                  (bio, tautan, produk, dsb). Kalau kamu mengunjungi halaman publik seorang kreator, kami mencatat statistik
                  kunjungan &amp; klik anonim untuk keperluan analitik kreator tersebut, bukan untuk mengidentifikasi kamu secara pribadi.
                </p>
              </div>

              <div>
                <h2 className="mb-2 font-heading text-lg font-bold text-ink">Bagaimana data dipakai</h2>
                <p className="text-muted">
                  Data dipakai untuk menjalankan layanan: autentikasi akun, menampilkan halamanmu ke publik, memproses pesanan
                  produk digital, dan mengirim notifikasi terkait transaksi (email, dan WhatsApp kalau kamu mengaktifkannya). Kami
                  tidak menjual data pengunjung atau kreator ke pihak lain.
                </p>
              </div>

              <div>
                <h2 className="mb-2 font-heading text-lg font-bold text-ink">Pihak ketiga yang terlibat</h2>
                <ul className="list-disc space-y-1.5 pl-5 text-muted">
                  <li>
                    <span className="font-semibold text-ink">Midtrans</span> -- memproses pembayaran. Detail kartu/metode
                    pembayaranmu ditangani langsung oleh Midtrans, tidak pernah disimpan di server Jeon.id.
                  </li>
                  <li>
                    <span className="font-semibold text-ink">Penyedia email &amp; WhatsApp</span> -- mengirim notifikasi transaksi
                    (konfirmasi pesanan, kode verifikasi) atas nama Jeon.id.
                  </li>
                  <li>
                    <span className="font-semibold text-ink">Penyimpanan objek (object storage)</span> -- menyimpan file produk
                    digital &amp; gambar yang kamu unggah.
                  </li>
                </ul>
              </div>

              <div>
                <h2 className="mb-2 font-heading text-lg font-bold text-ink">Cookie &amp; penyimpanan lokal</h2>
                <p className="text-muted">
                  Lihat <Link href="/cookies" className="font-semibold text-primary hover:underline">Kebijakan Cookie</Link> untuk detail
                  lengkap. Singkatnya: kami memakai cookie/local storage seperlunya untuk menjaga sesi login &amp; preferensi
                  tampilan, bukan untuk melacak iklan pihak ketiga.
                </p>
              </div>

              <div>
                <h2 className="mb-2 font-heading text-lg font-bold text-ink">Kontrol atas datamu</h2>
                <p className="text-muted">
                  Kamu bisa mengubah atau menghapus sebagian besar datamu langsung dari dashboard (Pengaturan). Untuk penghapusan
                  akun penuh, gunakan menu Pengaturan &gt; Zona Berbahaya.
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
