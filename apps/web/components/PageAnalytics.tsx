"use client";

import { useEffect } from "react";
import { trackEvent, trackEventBySlug } from "@/lib/api-client";

// REQ-F-601: mencatat satu "view" tiap halaman publik dimuat. Fire-and-forget
// (lihat trackEvent) supaya tidak pernah memperlambat/mengganggu pengunjung.
// No.98 (Sprint 14): kalau `slug` diisi, ini halaman bio TAMBAHAN -- tracking
// lewat TrackBySlug, BUKAN lewat username (yang akan salah tercatat ke
// halaman utama kreator yang sama, karena keduanya berbagi users.username).
export default function PageAnalytics({ username, slug }: { username: string; slug?: string }) {
  useEffect(() => {
    if (slug) {
      trackEventBySlug(slug, { event_type: "view", referrer: document.referrer });
    } else {
      trackEvent(username, { event_type: "view", referrer: document.referrer });
    }
  }, [username, slug]);

  return null;
}
