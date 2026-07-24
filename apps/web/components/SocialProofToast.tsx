"use client";

import { useEffect, useState } from "react";
import { RecentPurchase } from "@/lib/api-client";
import { IconCheck } from "@/components/icons";

// No.76 (Sprint 8): notifikasi "X baru saja membeli produk ini". Siklus
// tampil/sembunyi murni di sisi klien (recent purchases sudah dikirim
// sekali oleh backend, tidak ada polling) -- durasi tampil & interval
// jeda diatur kreator lewat pengaturan notifikasi.
export default function SocialProofToast({
  recent,
  displaySeconds,
  intervalSeconds,
}: {
  recent: RecentPurchase[];
  displaySeconds: number;
  intervalSeconds: number;
}) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (recent.length === 0) return;

    let showTimeout: ReturnType<typeof setTimeout>;
    let hideTimeout: ReturnType<typeof setTimeout>;
    let cancelled = false;

    function cycle() {
      setVisible(true);
      hideTimeout = setTimeout(() => {
        if (cancelled) return;
        setVisible(false);
        showTimeout = setTimeout(() => {
          if (cancelled) return;
          setIndex((i) => (i + 1) % recent.length);
          cycle();
        }, intervalSeconds * 1000);
      }, displaySeconds * 1000);
    }

    cycle();
    return () => {
      cancelled = true;
      clearTimeout(showTimeout);
      clearTimeout(hideTimeout);
    };
  }, [recent.length, displaySeconds, intervalSeconds]);

  if (recent.length === 0) return null;
  const current = recent[index];

  return (
    <div
      className={`fixed bottom-4 left-4 z-50 flex max-w-xs items-center gap-2.5 rounded-2xl border border-border bg-white px-4 py-3 shadow-hero transition-all duration-500 ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
      }`}
    >
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600">
        <IconCheck className="h-4 w-4" />
      </div>
      <p className="text-xs text-ink">
        <span className="font-bold">{current.masked_email}</span> baru saja membeli{" "}
        <span className="font-bold">{current.product_name}</span>
      </p>
    </div>
  );
}
