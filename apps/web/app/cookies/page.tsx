import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import ScrollReveal from "@/components/landing/ScrollReveal";

// Kebijakan Cookie -- lihat catatan lengkap kenapa halaman ini dibuat (bug
// link footer) di app/privacy/page.tsx. Isinya jujur mengikuti apa yang
// SUNGGUHAN dipakai di kode (localStorage token sesi login, preferensi
// tampilan) -- BUKAN mengklaim ada pengaturan consent granular yang belum
// ada (sama seperti modal "Preferensi Cookie" di PageFooterLinks.tsx).
export const metadata: Metadata = {
  title: "Kebijakan Cookie Jeon.id",
  description: "Cookie & local storage apa saja yang dipakai Jeon.id, dan untuk apa.",
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
            <p className="mb-10 text-sm text-muted">Terakhir diperbarui 23 Agustus 2026.</p>

            <div className="space-y-8 text-sm leading-relaxed text-ink">
              <div>
                <h2 className="mb-2 font-heading text-lg font-bold text-ink">Yang kami pakai</h2>
                <p className="text-muted">
                  Jeon.id memakai <span className="font-semibold text-ink">local storage browser</span> (bukan cookie pelacak
                  pihak ketiga) untuk dua hal: menyimpan token sesi login supaya kamu tidak perlu login ulang tiap buka halaman
                  dashboard, dan menyimpan preferensi tampilan (mis. tab galeri tema terakhir yang kamu buka).
                </p>
              </div>

              <div>
                <h2 className="mb-2 font-heading text-lg font-bold text-ink">Yang TIDAK kami pakai</h2>
                <p className="text-muted">
                  Kami tidak memasang cookie iklan atau pelacak pihak ketiga (mis. Google Analytics/Facebook Pixel) di halaman
                  publik kreator secara default. Kalau kreator mengaktifkan sendiri integrasi Meta Conversions API (fitur
                  Premium) di halamannya, itu dikelola langsung lewat token yang dimasukkan kreator itu sendiri, bukan dipasang
                  otomatis oleh Jeon.id.
                </p>
              </div>

              <div>
                <h2 className="mb-2 font-heading text-lg font-bold text-ink">Kontrol</h2>
                <p className="text-muted">
                  Karena kami tidak memakai cookie pelacak pihak ketiga, belum ada pengaturan consent granular per kategori
                  cookie di halaman ini -- menghapus local storage/cookie situs lewat pengaturan browsermu akan otomatis
                  mengeluarkanmu dari sesi login.
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
