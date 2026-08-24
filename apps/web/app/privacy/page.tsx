import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import ScrollReveal from "@/components/landing/ScrollReveal";

// Kebijakan Privasi -- permintaan langsung pengguna, 23 Agustus 2026:
// "perbaiki semua link yang ada di footer karna ada beberapa yang diklik
// tidak terjadi apapun" -- link "Kebijakan Privasi" di footer SEBELUMNYA
// href="#" (tidak ke mana-mana sama sekali). Diperluas 24 Agustus 2026,
// keluhan susulan pengguna: "buatkan saja page nya dan ikuti benchmark
// dari yang lain isinya" -- struktur bagian di bawah dibenchmark dari
// pola umum kebijakan privasi SaaS (opening statement, cakupan data,
// dasar/tujuan pengumpulan, RETENSI data, pihak ketiga, KEAMANAN, HAK
// pengguna, perubahan kebijakan, kontak -- riset checklist 24 Agustus
// 2026) DAN halaman resmi Linktree (Privacy Notice + Cookie Notice
// terpisah, pola yang sama dipakai di sini: /privacy vs /cookies).
// TETAP SENGAJA singkat & faktual (bukan dokumen legal formal hasil
// review pengacara) -- SETIAP klaim di bawah diverifikasi ke kode
// sungguhan (internal/crypto AES-256-GCM, hashing password, dashboard
// Zona Berbahaya, dst), bukan boilerplate generik yang asal ditempel.
// Kerangka hukum yang jadi acuan: UU No. 27/2022 (UU Pelindungan Data
// Pribadi) -- Jeon.id beroperasi di Indonesia, bukan GDPR (Uni Eropa)
// yang istilah/haknya berbeda, supaya tidak mengklaim kepatuhan ke aturan
// yang sebenarnya tidak berlaku ke platform ini.
export const metadata: Metadata = {
  title: "Kebijakan Privasi Jeon.id",
  description: "Data apa yang dikumpulkan Jeon.id, berapa lama disimpan, bagaimana diamankan, dan hakmu atas data tersebut.",
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
            <p className="mb-3 text-sm text-muted">Terakhir diperbarui 24 Agustus 2026.</p>
            <p className="mb-10 text-sm leading-relaxed text-muted">
              Jeon.id (&quot;kami&quot;) mengoperasikan platform link-in-bio &amp; monetisasi produk digital di jeon.id. Kebijakan ini
              menjelaskan data apa yang kami kumpulkan dari kreator dan pengunjung halaman publik, kenapa, berapa lama disimpan,
              dan hak yang kamu punya atas data itu. Ditulis mengacu pada prinsip UU No. 27 Tahun 2022 tentang Pelindungan Data
              Pribadi (UU PDP) yang berlaku di Indonesia.
            </p>

            <div className="space-y-8 text-sm leading-relaxed text-ink">
              <div>
                <h2 className="mb-2 font-heading text-lg font-bold text-ink">1. Data yang kami kumpulkan</h2>
                <p className="text-muted">
                  Saat kamu mendaftar sebagai kreator, kami menyimpan nama, alamat email, nomor WhatsApp (kalau kamu mengisinya),
                  username, dan konten yang kamu buat sendiri (bio, tautan, produk, tema). Kalau kamu mengajukan verifikasi KYC
                  untuk penarikan dana, kami juga menyimpan dokumen identitas &amp; data rekening yang kamu unggah. Kalau kamu
                  mengunjungi halaman publik seorang kreator, kami mencatat statistik kunjungan &amp; klik untuk keperluan
                  analitik kreator tersebut -- data ini agregat, bukan untuk mengidentifikasi kamu secara pribadi.
                </p>
              </div>

              <div>
                <h2 className="mb-2 font-heading text-lg font-bold text-ink">2. Kenapa data ini dikumpulkan</h2>
                <p className="text-muted">
                  Sebagian besar data dikumpulkan karena memang dibutuhkan untuk menjalankan layanan yang kamu minta sendiri saat
                  mendaftar (dasar kontraktual): autentikasi akun, menampilkan halamanmu ke publik, memproses pesanan produk
                  digital, dan mengirim notifikasi transaksi. Data KYC dikumpulkan untuk memenuhi kewajiban verifikasi identitas
                  sebelum pencairan dana (dasar kepatuhan hukum). Statistik kunjungan/klik dikumpulkan atas dasar kepentingan sah
                  (legitimate interest) kreator untuk memahami audiensnya sendiri.
                </p>
              </div>

              <div>
                <h2 className="mb-2 font-heading text-lg font-bold text-ink">3. Berapa lama data disimpan</h2>
                <p className="text-muted">
                  Data akunmu disimpan selama akunmu aktif. Kalau kamu menghapus akun lewat Pengaturan &gt; Zona Berbahaya, data
                  profil &amp; kontenmu dihapus dari sistem produksi -- catatan transaksi (pesanan, pencairan dana) tetap kami
                  simpan sesuai kewajiban pembukuan/pajak yang berlaku, terlepas dari status akunnya. Dokumen KYC disimpan
                  selama diperlukan untuk keperluan verifikasi &amp; kepatuhan, bukan selamanya tanpa alasan.
                </p>
              </div>

              <div>
                <h2 className="mb-2 font-heading text-lg font-bold text-ink">4. Bagaimana data diamankan</h2>
                <p className="text-muted">
                  Password akunmu disimpan dalam bentuk ter-hash, bukan teks polos -- kami sendiri tidak bisa membaca password
                  aslimu. Data sensitif tertentu (mis. nomor rekening/e-wallet penarikan dana, token integrasi media sosial)
                  dienkripsi saat disimpan (AES-256). Seluruh komunikasi antara browsermu dan server Jeon.id dienkripsi lewat
                  HTTPS/TLS. Detail kartu/metode pembayaran tidak pernah menyentuh server kami sama sekali -- lihat bagian pihak
                  ketiga di bawah.
                </p>
              </div>

              <div>
                <h2 className="mb-2 font-heading text-lg font-bold text-ink">5. Pihak ketiga yang terlibat</h2>
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
                <p className="mt-2 text-muted">
                  Kami tidak menjual data pengunjung atau kreator ke pihak lain. Kalau kamu sendiri mengaktifkan integrasi
                  opsional (mis. Meta Conversions API/Google Analytics di halamanmu, khusus paket Premium), data kunjungan
                  halamanmu juga mengalir ke akun Meta/Google milikmu sendiri sesuai kredensial yang kamu masukkan -- itu
                  hubungan langsung antara kamu &amp; penyedia itu, di luar kendali kami.
                </p>
              </div>

              <div>
                <h2 className="mb-2 font-heading text-lg font-bold text-ink">6. Cookie &amp; penyimpanan lokal</h2>
                <p className="text-muted">
                  Lihat <Link href="/cookies" className="font-semibold text-primary hover:underline">Kebijakan Cookie</Link> untuk detail
                  lengkap. Singkatnya: kami memakai cookie/local storage seperlunya untuk menjaga sesi login &amp; preferensi
                  tampilan, bukan untuk melacak iklan pihak ketiga.
                </p>
              </div>

              <div>
                <h2 className="mb-2 font-heading text-lg font-bold text-ink">7. Hakmu atas data</h2>
                <ul className="list-disc space-y-1.5 pl-5 text-muted">
                  <li>Melihat &amp; mengubah sebagian besar datamu langsung dari dashboard (Pengaturan).</li>
                  <li>Menghapus akun beserta datanya lewat Pengaturan &gt; Zona Berbahaya, kapan saja.</li>
                  <li>Meminta salinan datamu atau mengajukan keberatan atas pemrosesan tertentu -- lewat channel dukungan yang tersedia di akunmu, sambil kami menyiapkan jalur permintaan formal khusus untuk ini.</li>
                </ul>
              </div>

              <div>
                <h2 className="mb-2 font-heading text-lg font-bold text-ink">8. Perubahan kebijakan ini</h2>
                <p className="text-muted">
                  Kalau ada perubahan berarti pada kebijakan ini, tanggal &quot;Terakhir diperbarui&quot; di atas akan
                  diperbarui. Perubahan signifikan (mis. jenis data baru yang dikumpulkan) akan kami infokan lewat email ke
                  alamat akunmu.
                </p>
              </div>

              <div>
                <h2 className="mb-2 font-heading text-lg font-bold text-ink">9. Kontak</h2>
                <p className="text-muted">
                  Untuk laporan konten spesifik di suatu halaman publik, pakai tombol <span className="font-semibold text-ink">Laporkan</span> yang
                  tersedia di tiap halaman. Untuk pertanyaan lain seputar kebijakan ini, kami masih menyiapkan kanal dukungan
                  resmi -- pantau halaman ini untuk pembaruannya.
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
