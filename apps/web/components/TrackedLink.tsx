"use client";

import { trackEvent, trackEventBySlug } from "@/lib/api-client";

// REQ-F-601: mencatat "click" saat pengunjung menekan tautan di halaman
// publik. Tidak preventDefault -- navigasi (target="_blank") tetap terjadi
// normal, tracking dikirim paralel (fire-and-forget).
// No.98 (Sprint 14): `pageSlug` diisi kalau ini halaman bio TAMBAHAN --
// lihat catatan di PageAnalytics soal kenapa tidak boleh lewat username.
export default function TrackedLink({
  username,
  pageSlug,
  linkId,
  href,
  children,
  className,
}: {
  username: string;
  pageSlug?: string;
  linkId: string;
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={() =>
        pageSlug
          ? trackEventBySlug(pageSlug, { event_type: "click", link_id: linkId })
          : trackEvent(username, { event_type: "click", link_id: linkId })
      }
    >
      {children}
    </a>
  );
}
