"use client";

import Link from "next/link";
import Logo from "./Logo";
import { useLocale } from "@/lib/locale-context";

// Footer -- perbaikan link ditemukan langsung pengguna, 23 Agustus 2026:
// "perbaiki semua link yang ada di footer karna ada beberapa yang diklik
// tidak terjadi apapun dan juga ada yang diklik masih salah link nya".
// SEBELUMNYA lebih dari separuh link di sini href="#" (ikon sosial media,
// "Dokumentasi", "Tentang Kami", "Blog", "Karier", "Kebijakan Privasi",
// "Ketentuan Layanan", "Cookies") -- TIDAK ke mana-mana sama sekali --
// plus form newsletter yang cuma preventDefault() tanpa backend
// sungguhan. Ditulis ulang supaya SETIAP link di sini benar-benar
// menuju sesuatu yang nyata:
//   - Ikon sosial media & form newsletter DIHAPUS -- Jeon.id belum punya
//     akun media sosial resmi atau backend newsletter perusahaan
//     (subscribeLead di api-client.ts itu untuk audiens KREATOR per
//     halaman, bukan newsletter Jeon.id sendiri), jadi menyisakan link
//     mati/form palsu lebih buruk daripada tidak ada sama sekali --
//     pola sama seperti penghapusan section "TrustedBy" (logo Google/
//     Microsoft/dst) sebelumnya di homepage, jangan klaim yang tidak ada.
//   - "Dokumentasi"/"Tentang Kami"/"Blog"/"Karier" DIHAPUS -- tidak ada
//     halaman itu di aplikasi ini.
//
// Kolom "Legal" -- permintaan langsung pengguna, 24 Agustus 2026:
// "tambahkan di footer menu menu untuk page tersebut" (untuk app/privacy,
// app/terms, app/cookies yang baru diperluas isinya). SEBELUMNYA link ke
// 3 halaman itu cuma teks kecil abu-abu di bilah bawah (kurang kelihatan
// sebagai menu navigasi sungguhan, gampang terlewat) -- sekarang jadi
// kolom menu sendiri, konsisten dengan "Produk"/"Bantuan". Grid diubah
// lg:grid-cols-4 -> lg:grid-cols-5 supaya kolom baru ini tidak
// mengorbankan lebar kolom Logo (tetap col-span-2). Link di bilah bawah
// dihapus (dipindah ke kolom ini) supaya tidak dobel.
//
// Halaman /privacy /terms /cookies SENGAJA TIDAK ikut diterjemahkan EN
// (lihat catatan lingkup lengkap di lib/i18n/dictionaries.ts) -- link
// di kolom Legal cuma labelnya yang ikut locale, isi halamannya sendiri
// tetap Bahasa Indonesia apa pun locale aktif.
export default function Footer() {
  const { t, dict } = useLocale();

  return (
    <footer className="border-t border-app-border bg-app-surface" aria-label="Footer">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Logo className="mb-4" />
            <p className="max-w-xs text-sm leading-relaxed text-app-muted">{dict.footer.tagline}</p>
          </div>

          <div>
            <h3 className="mb-4 font-heading text-sm font-bold text-app-ink">{dict.footer.columns.product}</h3>
            <ul className="space-y-2.5">
              {/* Fitur & Harga -- perbaikan SEO (temuan audit, 15 Agustus
                  2026): halaman terpisah, bukan anchor scroll lagi (lihat
                  komentar Navbar.tsx). Footer ini juga dipakai ulang di
                  /features & /pricing sendiri, jadi anchor polos tidak
                  akan berfungsi benar dari sana. */}
              <li><Link href="/features" className="cursor-pointer text-sm text-app-muted transition-colors hover:text-primary">{t("footer.links.features")}</Link></li>
              <li><Link href="/pricing" className="cursor-pointer text-sm text-app-muted transition-colors hover:text-primary">{t("footer.links.pricing")}</Link></li>
              <li><Link href="/#templates" className="cursor-pointer text-sm text-app-muted transition-colors hover:text-primary">{t("footer.links.templates")}</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 font-heading text-sm font-bold text-app-ink">{dict.footer.columns.help}</h3>
            <ul className="space-y-2.5">
              <li><Link href="/#faq" className="cursor-pointer text-sm text-app-muted transition-colors hover:text-primary">{t("footer.links.faq")}</Link></li>
              <li><Link href="/register" className="cursor-pointer text-sm text-app-muted transition-colors hover:text-primary">{t("footer.links.getStarted")}</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 font-heading text-sm font-bold text-app-ink">{dict.footer.columns.legal}</h3>
            <ul className="space-y-2.5">
              <li><Link href="/privacy" className="cursor-pointer text-sm text-app-muted transition-colors hover:text-primary">{t("footer.links.privacy")}</Link></li>
              <li><Link href="/terms" className="cursor-pointer text-sm text-app-muted transition-colors hover:text-primary">{t("footer.links.terms")}</Link></li>
              <li><Link href="/cookies" className="cursor-pointer text-sm text-app-muted transition-colors hover:text-primary">{t("footer.links.cookies")}</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-app-border py-6 text-center">
          <p className="text-sm text-app-muted">{dict.footer.copyright}</p>
        </div>
      </div>
    </footer>
  );
}
