import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import ScrollReveal from "@/components/landing/ScrollReveal";

// Kebijakan Cookie -- lihat catatan lengkap kenapa halaman ini dibuat (bug
// link footer) di app/privacy/page.tsx. Diperluas 24 Agustus 2026, keluhan
// susulan pengguna: "buatkan saja page nya dan ikuti benchmark dari yang
// lain isinya" -- dipecah jadi kategori esensial vs pihak-ketiga (pola umum
// kebijakan cookie SaaS, lihat juga Cookie Notice Linktree yang membedakan
// strictly-necessary vs functional/analytics) supaya lebih mudah dipindai,
// tapi TETAP jujur mengikuti apa yang SUNGGUHAN dipakai di kode (localStorage
// token sesi login, preferensi tampilan) -- BUKAN mengklaim ada pengaturan
// consent granular yang belum ada (sama seperti modal "Preferensi Cookie" di
// PageFooterLinks.tsx).
export const metadata: Metadata = {
  title: "Kebijakan Cookie Jeon.id",
  description: "Cookie & local storage apa saja yang dipakai Jeon.id, dibagi esensial vs pihak ketiga, dan cara mengontrolnya.",
  alternates: { canonical: "/cookies" },
};

export default function CookiesPage() {
  return (
    <>
      <ScrollReveal />
      <Navbar />
      <main>
        <section className="relative overflow-hidden bg-white pb-16 pt-36 md:pt-44">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <span className="mb-4 inline-block rounded-full border border-primary/15 bg-primary-subtle px-3 py-1.5 text-xs font-semibold text-primary">
              Cookie
            </span>
            <h1 className="mb-3 font-heading text-3xl font-bold leading-tight text-ink sm:text-4xl">Kebijakan Cookie</h1>
            <p className="mb-3 text-sm text-muted">Terakhir diperbarui 24 Agustus 2026.</p>
            <p className="mb-10 text-sm leading-relaxed text-muted">
              Halaman ini melengkapi <Link href="/privacy" className="font-semibold text-primary hover:underline">Kebijakan Privasi</Link>,
              khusus menjelaskan cookie &amp; penyimpanan lokal browser yang dipakai Jeon.id.
            </p>

            <div className="space-y-8 text-sm leading-relaxed text-ink">
              <div>
                <h2 className="mb-2 font-heading text-lg font-bold text-ink">1. Cookie esensial (selalu aktif)</h2>
                <p className="text-muted">
                  Jeon.id memakai <span className="font-semibold text-ink">local storage browser</span> (bukan cookie pelacak
                  pihak ketiga) untuk dua hal: menyimpan token sesi login supaya kamu tidak perlu login ulang tiap buka halaman
                  dashboard, dan menyimpan preferensi tampilan (mis. tab galeri tema terakhir yang kamu buka). Ini bersifat
                  esensial -- tanpa ini, dashboard tidak bisa mengingat kamu sedang login.
                </p>
              </div>

              <div>
                <h2 className="mb-2 font-heading text-lg font-bold text-ink">2. Cookie/pelacak pihak ketiga (opsional, atas kendali kreator)</h2>
                <p className="text-muted">
                  Kami tidak memasang cookie iklan atau pelacak pihak ketiga (mis. Google Analytics/Meta Pixel) di halaman
                  publik kreator secara default. Kalau kreator mengaktifkan sendiri integrasi Google Analytics/UTM atau Meta
                  Conversions API (fitur Premium) di halamannya, itu dikelola langsung lewat kredensial yang dimasukkan
                  kreator itu sendiri -- bukan dipasang otomatis oleh Jeon.id, dan hanya berjalan di halaman kreator yang
                  memang mengaktifkannya.
                </p>
              </div>

              <div>
                <h2 className="mb-2 font-heading text-lg font-bold text-ink">3. Pihak pemroses pembayaran</h2>
                <p className="text-muted">
                  Saat kamu checkout produk digital, Midtrans (penyedia pembayaran kami) bisa memasang cookie/session
                  storage-nya sendiri di halaman pembayaran untuk memproses transaksi &amp; mencegah penipuan -- ini di luar
                  kendali langsung Jeon.id, diatur oleh kebijakan privasi Midtrans sendiri.
                </p>
              </div>

              <div>
                <h2 className="mb-2 font-heading text-lg font-bold text-ink">4. Cara mengontrol</h2>
                <p className="text-muted">
                  Karena kami tidak memakai cookie pelacak pihak ketiga milik Jeon.id sendiri, belum ada pengaturan consent
                  granular per kategori cookie di halaman ini. Kamu tetap bisa menghapus local storage/cookie situs lewat
                  pengaturan browsermu kapan saja -- perlu diingat ini akan otomatis mengeluarkanmu dari sesi login.
                </p>
              </div>

              <div>
                <h2 className="mb-2 font-heading text-lg font-bold text-ink">5. Perubahan kebijakan ini</h2>
                <p className="text-muted">
                  Kalau ada perubahan berarti (mis. kami mulai memasang cookie pelacak baru), tanggal &quot;Terakhir
                  diperbarui&quot; di atas akan diperbarui dan perubahan signifikan akan kami infokan lewat email ke alamat
                  akunmu.
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
