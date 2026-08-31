"use client";

import Link from "next/link";
import { IconInbox, IconSearch, IconLock, IconClose } from "@/components/icons";

// EmptyState varian (JEONID-DASHBOARD-REDESIGN-SPEC.md §8.6, Phase 1).
// Beda dari components/EmptyState.tsx lama (satu bentuk generik): varian di
// sini membedakan SEBAB kosong -- first-use (belum pernah ada data, dorong
// aksi pertama), no-results (filter/pencarian tak cocok, dorong reset),
// no-data (kosong biasa), permission ("kamu tidak punya akses" -- aturan
// §23.5: penolakan izin TIDAK menyamar jadi empty biasa), error (gagal
// muat + retry). Komponen lama tetap dipakai halaman lama sampai fasenya.
export type EmptyStateVariant = "first-use" | "no-results" | "no-data" | "permission" | "error";

const VARIANT_DEFAULT_ICON: Record<EmptyStateVariant, (p: { className?: string }) => React.ReactElement> = {
  "first-use": IconInbox,
  "no-results": IconSearch,
  "no-data": IconInbox,
  permission: IconLock,
  error: IconClose,
};

const VARIANT_BADGE: Record<EmptyStateVariant, string> = {
  "first-use": "bg-brand-soft text-brand-600",
  "no-results": "bg-dash-surface-subtle text-dash-muted",
  "no-data": "bg-dash-surface-subtle text-dash-muted",
  permission: "bg-warning-soft text-warning",
  error: "bg-danger-soft text-danger",
};

export default function EmptyState({
  variant = "no-data",
  icon,
  title,
  cause,
  primaryAction,
  secondaryLink,
  as: Tag = "div",
  className = "",
}: {
  variant?: EmptyStateVariant;
  icon?: (p: { className?: string }) => React.ReactElement;
  title: string;
  // Satu kalimat penyebab (§8.6) -- kenapa kosong / apa yang terjadi.
  cause?: string;
  primaryAction?: { label: string; onClick?: () => void; href?: string };
  secondaryLink?: { label: string; href: string };
  as?: "div" | "li" | "td";
  className?: string;
}) {
  const Icon = icon ?? VARIANT_DEFAULT_ICON[variant];
  return (
    <Tag
      className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-dash-border bg-dash-surface px-4 py-10 text-center ${className}`}
    >
      <span className={`flex h-12 w-12 items-center justify-center rounded-full ${VARIANT_BADGE[variant]}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-sm font-bold text-dash-ink">{title}</p>
        {cause && <p className="mt-1 max-w-sm text-xs text-dash-muted">{cause}</p>}
      </div>
      {primaryAction &&
        (primaryAction.href ? (
          <Link href={primaryAction.href} className="btn-primary rounded-full px-4 py-2 text-xs font-bold text-white">
            {primaryAction.label}
          </Link>
        ) : (
          <button
            type="button"
            onClick={primaryAction.onClick}
            className="btn-primary rounded-full px-4 py-2 text-xs font-bold text-white"
          >
            {primaryAction.label}
          </button>
        ))}
      {secondaryLink && (
        <Link href={secondaryLink.href} className="text-xs font-semibold text-brand-600 hover:underline">
          {secondaryLink.label}
        </Link>
      )}
    </Tag>
  );
}
