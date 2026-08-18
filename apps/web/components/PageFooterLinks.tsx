"use client";

import { useState } from "react";
import ReportButton from "@/components/ReportButton";
import { IconBadgeCheck, IconClose } from "@/components/icons";
import { SITE_URL } from "@/lib/site";

// Baris footer utilitas ala Linktree ("Cookie Preferences · Report ·
// Privacy · Explore · About this account · More from Linktree"), permintaan
// langsung pengguna: "tambahkan semua ini di footer dan ketika diklik
// tampilkan popup untuk isinya". Setiap item membuka popup berisi konten
// JUJUR sesuai kapasitas Jeonme sungguhan -- BUKAN halaman terpisah (item
// ini bukan fitur nyata seperti "Explore" karena Jeonme belum punya
// jelajahi-kreator-lain, popup-nya SENGAJA bilang begitu apa adanya alih-
// alih pura-pura ada) kecuali "Report" yang MEMANG fitur nyata (memakai
// ulang ReportButton yang sudah ada, cuma dibungkus popup yang sama).
type FooterModalKey = "cookie" | "report" | "privacy" | "explore" | "about" | "more";

const FOOTER_ITEMS: { key: FooterModalKey; label: string }[] = [
  { key: "cookie", label: "Preferensi Cookie" },
  { key: "report", label: "Laporkan" },
  { key: "privacy", label: "Privasi" },
  { key: "explore", label: "Jelajahi" },
  { key: "about", label: "Tentang Akun Ini" },
  { key: "more", label: "Lainnya dari Jeonme" },
];

const MODAL_TITLES: Record<FooterModalKey, string> = {
  cookie: "Preferensi Cookie",
  report: "Laporkan Halaman Ini",
  privacy: "Privasi",
  explore: "Jelajahi",
  about: "Tentang Akun Ini",
  more: "Lainnya dari Jeonme",
};

export default function PageFooterLinks({
  pageId,
  username,
  bio,
  isVerified,
  footerClassName,
}: {
  pageId?: string;
  username: string;
  bio?: string;
  isVerified?: boolean;
  footerClassName: string;
}) {
  const [active, setActive] = useState<FooterModalKey | null>(null);

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-center text-[11px]">
        {FOOTER_ITEMS.map((item, i) => (
          <span key={item.key} className="flex items-center gap-1.5">
            {i > 0 && <span className={footerClassName}>·</span>}
            <button type="button" onClick={() => setActive(item.key)} className={`transition-colors hover:underline ${footerClassName}`}>
              {item.label}
            </button>
          </span>
        ))}
      </div>

      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setActive(null)}>
          <div
            className="max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-5 text-left shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-heading text-base font-bold text-ink">{MODAL_TITLES[active]}</h3>
              <button type="button" onClick={() => setActive(null)} className="text-muted hover:text-ink">
                <IconClose className="h-5 w-5" />
              </button>
            </div>

            {active === "cookie" && (
              <p className="text-sm leading-relaxed text-muted">
                Jeonme memakai cookie/local storage seperlunya untuk menjaga sesi masuk & preferensi tampilan. Belum ada
                pengaturan cookie granular yang bisa diubah pengunjung dari halaman ini.
              </p>
            )}

            {active === "report" &&
              (pageId ? (
                <ReportButton pageId={pageId} className="text-ink" autoOpen />
              ) : (
                <p className="text-sm text-muted">Pelaporan tidak tersedia untuk halaman ini.</p>
              ))}

            {active === "privacy" && (
              <p className="text-sm leading-relaxed text-muted">
                Jeonme menyimpan data yang kamu berikan (nama, email, produk) untuk menjalankan layanan bagi kreator.
                Pembayaran diproses pihak ketiga (Midtrans) dan tidak disimpan Jeonme. Statistik kunjungan/klik dicatat
                untuk kreator, bukan untuk dijual ke pihak lain.
              </p>
            )}

            {active === "explore" && <p className="text-sm leading-relaxed text-muted">Jelajahi kreator lain belum tersedia di Jeonme saat ini.</p>}

            {active === "about" && (
              <div className="flex flex-col gap-1.5 text-sm text-muted">
                <p>
                  <span className="font-semibold text-ink">Username:</span> @{username}
                </p>
                <p className="flex items-center gap-1">
                  <span className="font-semibold text-ink">Status:</span>
                  {isVerified ? (
                    <>
                      <IconBadgeCheck className="h-4 w-4 text-primary" /> Terverifikasi
                    </>
                  ) : (
                    "Belum terverifikasi"
                  )}
                </p>
                {bio && (
                  <p>
                    <span className="font-semibold text-ink">Bio:</span> {bio}
                  </p>
                )}
              </div>
            )}

            {active === "more" && (
              <div className="flex flex-col gap-3">
                <p className="text-sm leading-relaxed text-muted">
                  Jeonme adalah platform link-in-bio & monetisasi produk digital untuk kreator Indonesia.
                </p>
                <a
                  href={`${SITE_URL}/register`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary rounded-lg py-2 text-center text-sm font-bold text-white"
                >
                  Buat halamanmu sendiri
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
