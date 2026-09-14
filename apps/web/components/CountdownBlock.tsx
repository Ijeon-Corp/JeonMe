"use client";

import { useEffect, useState } from "react";

// CountdownBlock -- Canvas Page Builder Fase 3 (kategori CONVERSION,
// permintaan langsung pengguna 8 September 2026): hitung mundur murni
// client-side (setInterval 1 detik) ke `targetAt`, TIDAK ada job/cron
// server sama sekali -- angka cuma dihitung ulang tiap render, bukan
// disimpan. Kalau `targetAt` sudah lewat, tampilkan pesan statis "Sudah
// berakhir" (pola fallback sama seperti VideoEmbedBlock's "Video tidak
// dapat ditampilkan").
function remaining(targetAt: number, now: number) {
  const diffMs = targetAt - now;
  if (diffMs <= 0) return null;
  const totalSeconds = Math.floor(diffMs / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

export default function CountdownBlock({
  title,
  targetAt,
  cardClassName,
  titleClassName,
  expiredLabel,
  unitLabels,
  icon,
  actionSlot,
}: {
  title: string;
  targetAt?: string;
  cardClassName: string;
  titleClassName: string;
  expiredLabel: string;
  unitLabels: { days: string; hours: string; minutes: string; seconds: string };
  // icon -- permintaan langsung pengguna, 14 Agustus 2026: ikon kustom/galeri
  // yang dipilih dari dashboard (lihat resolveBlockIcon di PagePreview.tsx).
  icon?: React.ReactNode;
  // actionSlot -- susulan 14 September 2026 (permintaan langsung pengguna:
  // "Countdown yang bisa nge-trigger tombol Beli langsung itu levernya
  // besar untuk flash sale"). CountdownBlock sendiri TETAP checkout-agnostic
  // (tidak import BuyProductButton/logika produk apa pun) -- pemanggil
  // (PagePreview.tsx) yang memutuskan render CTA generik atau tombol Beli
  // sungguhan, lalu mengoper hasilnya sebagai node siap-pakai di sini.
  // Sengaja dirender TERLEPAS dari status expired (aktif kapan saja,
  // BUKAN cuma saat hitung mundur masih berjalan) -- CTA tetap relevan
  // walau promonya sudah lewat (mis. arahkan ke halaman lain).
  actionSlot?: React.ReactNode;
}) {
  const targetMs = targetAt ? Date.parse(targetAt) : NaN;
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (Number.isNaN(targetMs)) return;
    // queueMicrotask -- kick-off pertama TIDAK dipanggil langsung di badan
    // efek (react-hooks/set-state-in-effect, eslint-plugin-react-hooks v7
    // bundel Next.js 16, lihat CLAUDE.md) -- dibungkus jadi callback async
    // pola yang sama dgn setInterval di bawah (keduanya "berlangganan
    // pembaruan dari sistem eksternal", pola yang diizinkan aturan itu).
    const tick = () => setNow(Date.now());
    queueMicrotask(tick);
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetMs]);

  const parts = now !== null && !Number.isNaN(targetMs) ? remaining(targetMs, now) : undefined;

  return (
    <div className={cardClassName}>
      {title && (
        <p className={`mb-2 flex items-center gap-1.5 truncate text-sm font-semibold ${titleClassName}`}>
          {icon}
          <span className="truncate">{title}</span>
        </p>
      )}
      {Number.isNaN(targetMs) ? (
        <p className="text-xs text-red-500">{expiredLabel}</p>
      ) : parts === undefined ? (
        // now === null -- render pertama sebelum useEffect jalan (hindari
        // hydration mismatch dari Date.now() server vs klien).
        <div className="grid grid-cols-4 gap-2 text-center" aria-hidden="true">
          {[0, 0, 0, 0].map((_, i) => (
            <div key={i} className="rounded-lg bg-black/10 py-2 text-lg font-bold tabular-nums">
              --
            </div>
          ))}
        </div>
      ) : parts === null ? (
        <p className="text-xs opacity-80">{expiredLabel}</p>
      ) : (
        <div className="grid grid-cols-4 gap-2 text-center">
          {(
            [
              [parts.days, unitLabels.days],
              [parts.hours, unitLabels.hours],
              [parts.minutes, unitLabels.minutes],
              [parts.seconds, unitLabels.seconds],
            ] as const
          ).map(([value, label]) => (
            <div key={label} className="rounded-lg bg-black/10 py-2">
              <p className="text-lg font-bold tabular-nums">{value}</p>
              <p className="text-[10px] uppercase tracking-wide opacity-70">{label}</p>
            </div>
          ))}
        </div>
      )}
      {actionSlot && <div className="mt-2.5">{actionSlot}</div>}
    </div>
  );
}
