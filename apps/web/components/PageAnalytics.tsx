"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/api-client";

// REQ-F-601: mencatat satu "view" tiap halaman publik dimuat. Fire-and-forget
// (lihat trackEvent) supaya tidak pernah memperlambat/mengganggu pengunjung.
export default function PageAnalytics({ username }: { username: string }) {
  useEffect(() => {
    trackEvent(username, { event_type: "view", referrer: document.referrer });
  }, [username]);

  return null;
}
