"use client";

import { trackEvent } from "@/lib/api-client";

// REQ-F-601: mencatat "click" saat pengunjung menekan tautan di halaman
// publik. Tidak preventDefault -- navigasi (target="_blank") tetap terjadi
// normal, tracking dikirim paralel (fire-and-forget).
export default function TrackedLink({
  username,
  linkId,
  href,
  children,
  className,
}: {
  username: string;
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
      onClick={() => trackEvent(username, { event_type: "click", link_id: linkId })}
    >
      {children}
    </a>
  );
}
