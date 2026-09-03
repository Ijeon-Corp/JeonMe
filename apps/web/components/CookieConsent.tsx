"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconClose } from "@/components/icons";
import { onOpenCookiePreferences, readCookieConsent, writeCookieConsent, type CookieConsent as Consent } from "@/lib/cookie-consent";

// Banner + modal preferensi cookie untuk HALAMAN PUBLIK kreator (lihat catatan
// di lib/cookie-consent.ts). Banner hanya muncul kalau halaman ini memang
// memasang pelacak (hasAnalytics/hasMarketing) DAN pengunjung belum memilih;
// modal bisa dibuka kapan saja dari tautan footer "Preferensi Cookie".
//
// Warna literal (putih/#111111/aksen), bukan token dark mode: komponen ini
// duduk di atas halaman kreator yang temanya bebas, harus tetap terbaca.
export default function CookieConsent({ hasAnalytics, hasMarketing }: { hasAnalytics: boolean; hasMarketing: boolean }) {
  const [consent, setConsent] = useState<Consent | null | undefined>(undefined); // undefined = belum dibaca
  const [open, setOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    window.__jeonCookieConsentMounted = true;
    const stored = readCookieConsent();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- membaca localStorage hanya bisa di klien setelah mount
    setConsent(stored);
    setAnalytics(stored?.analytics ?? false);
    setMarketing(stored?.marketing ?? false);
    const off = onOpenCookiePreferences(() => {
      const cur = readCookieConsent();
      setAnalytics(cur?.analytics ?? false);
      setMarketing(cur?.marketing ?? false);
      setOpen(true);
    });
    return () => {
      off();
      window.__jeonCookieConsentMounted = false;
    };
  }, []);

  function save(choice: { analytics: boolean; marketing: boolean }) {
    setConsent(writeCookieConsent(choice));
    setOpen(false);
  }

  const hasTrackers = hasAnalytics || hasMarketing;
  const showBanner = consent === null && hasTrackers && !open;

  return (
    <>
      {showBanner && (
        <div role="region" aria-label="Preferensi cookie" className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-lg rounded-jmd border-2 border-[#111111] bg-white p-4 text-[#111111] shadow-brutal">
          <p className="text-sm font-bold">Halaman ini memakai cookie pihak ketiga</p>
          <p className="mt-1 text-xs text-[#111111]/70">
            Selain yang diperlukan untuk menjalankan halaman, kreator memasang alat {hasAnalytics && "statistik (Google Analytics)"}
            {hasAnalytics && hasMarketing && " dan "}
            {hasMarketing && "pemasaran (Meta Pixel)"}. Kamu memilih mana yang boleh aktif.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => save({ analytics: hasAnalytics, marketing: hasMarketing })} className="rounded-lg border-2 border-[#111111] bg-jeon-purple px-3.5 py-2 text-xs font-bold text-white">
              Terima semua
            </button>
            <button type="button" onClick={() => save({ analytics: false, marketing: false })} className="rounded-lg border-2 border-[#111111] bg-white px-3.5 py-2 text-xs font-bold text-[#111111]">
              Hanya yang diperlukan
            </button>
            <button type="button" onClick={() => setOpen(true)} className="px-2 py-2 text-xs font-semibold text-[#111111]/70 underline-offset-2 hover:underline">
              Atur
            </button>
          </div>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Preferensi Cookie" className="w-full max-w-sm rounded-jmd border-2 border-[#111111] bg-white p-5 text-left text-[#111111] shadow-brutal" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-base font-bold">Preferensi Cookie</h3>
              <button type="button" onClick={() => setOpen(false)} className="text-[#111111]/60 hover:text-[#111111]" aria-label="Tutup">
                <IconClose className="h-5 w-5" />
              </button>
            </div>
            <p className="text-xs text-[#111111]/70">Pilihanmu berlaku untuk semua halaman di jeon.id dan disimpan di browser ini.</p>
            <ul className="mt-3 flex flex-col gap-2">
              <li className="flex items-start justify-between gap-3 rounded-lg border border-[#111111]/15 px-3 py-2.5">
                <div>
                  <p className="text-sm font-semibold">Diperlukan</p>
                  <p className="text-xs text-[#111111]/65">Sesi masuk & preferensi tampilan. Tanpa ini halaman tidak berfungsi.</p>
                </div>
                <span className="mt-0.5 flex-shrink-0 rounded-full bg-jeon-lime px-2 py-0.5 text-[10px] font-bold">Selalu aktif</span>
              </li>
              <li className="flex items-start justify-between gap-3 rounded-lg border border-[#111111]/15 px-3 py-2.5">
                <div>
                  <p className="text-sm font-semibold">Analitik</p>
                  <p className="text-xs text-[#111111]/65">Google Analytics milik kreator: kunjungan & klik.{!hasAnalytics && " Tidak dipakai di halaman ini."}</p>
                </div>
                <input type="checkbox" checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} aria-label="Analitik" className="mt-1 h-4 w-4 flex-shrink-0 accent-jeon-purple" />
              </li>
              <li className="flex items-start justify-between gap-3 rounded-lg border border-[#111111]/15 px-3 py-2.5">
                <div>
                  <p className="text-sm font-semibold">Pemasaran</p>
                  <p className="text-xs text-[#111111]/65">Meta Pixel milik kreator: mengukur iklan.{!hasMarketing && " Tidak dipakai di halaman ini."}</p>
                </div>
                <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} aria-label="Pemasaran" className="mt-1 h-4 w-4 flex-shrink-0 accent-jeon-purple" />
              </li>
            </ul>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => save({ analytics, marketing })} className="flex-1 rounded-lg border-2 border-[#111111] bg-jeon-purple py-2 text-sm font-bold text-white">
                Simpan pilihan
              </button>
              <button type="button" onClick={() => save({ analytics: hasAnalytics, marketing: hasMarketing })} className="rounded-lg border-2 border-[#111111] bg-white px-3 py-2 text-sm font-bold">
                Terima semua
              </button>
            </div>
            <p className="mt-3 text-[11px] text-[#111111]/55">
              Selengkapnya di <Link href="/cookies" className="underline">Kebijakan Cookie</Link>.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
