"use client";

import Link from "next/link";
import { IconChevronRight } from "@/components/icons";

// PageHeader (JEONID-DASHBOARD-REDESIGN-SPEC.md §8.1, Phase 1 Foundation).
// SATU H1 per halaman; primary action paling kanan di desktop; maksimal dua
// secondary terlihat (sisanya tanggung jawab pemanggil untuk melipat --
// overflow menu generik menyusul saat ada pemakai >2). Header TIDAK berada
// dalam kartu (aturan §8.1). Semua teks dioper dari pemanggil (sudah
// di-t() -- komponen ini locale-agnostic).
export type PageHeaderAction = {
  label: string;
  onClick?: () => void;
  href?: string;
  icon?: React.ReactNode;
  variant?: "primary" | "secondary";
  disabled?: boolean;
};

export type BreadcrumbItem = { label: string; href?: string };

function ActionButton({ action, primary }: { action: PageHeaderAction; primary: boolean }) {
  const cls = primary
    ? "btn-primary inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
    : "inline-flex items-center gap-1.5 rounded-xl border border-dash-border bg-dash-surface px-3.5 py-2 text-sm font-semibold text-dash-ink hover:border-brand-500 hover:text-brand-600 disabled:opacity-60";
  if (action.href && !action.disabled) {
    return (
      <Link href={action.href} className={cls}>
        {action.icon}
        {action.label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={action.onClick} disabled={action.disabled} className={cls}>
      {action.icon}
      {action.label}
    </button>
  );
}

export default function PageHeader({
  eyebrow,
  title,
  description,
  breadcrumb,
  status,
  primaryAction,
  secondaryActions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  breadcrumb?: BreadcrumbItem[];
  status?: React.ReactNode;
  primaryAction?: PageHeaderAction;
  secondaryActions?: PageHeaderAction[];
}) {
  return (
    <header className="mb-6">
      {breadcrumb && breadcrumb.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-2">
          <ol className="flex flex-wrap items-center gap-1 text-xs font-semibold text-dash-muted">
            {breadcrumb.map((item, i) => (
              <li key={`${item.label}-${i}`} className="flex items-center gap-1">
                {i > 0 && <IconChevronRight className="h-3 w-3" aria-hidden="true" />}
                {item.href ? (
                  <Link href={item.href} className="hover:text-brand-600">
                    {item.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="text-dash-ink-soft">
                    {item.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-dash-muted">{eyebrow}</p>
          )}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* break-words + min-w-0 -- audit UI/UX 20 September 2026: title
                dinamis (mis. "Selamat pagi, {username}" di Beranda) bisa
                berupa satu "kata" panjang tanpa spasi (username), yang TIDAK
                wrap sama sekali secara default. break-words SAJA TIDAK CUKUP
                -- h1 ini flex item di dalam "flex flex-wrap items-center"
                (bersama `status`), dan flex item defaultnya min-width:auto
                (pola berulang di repo ini, lihat CLAUDE.md) -- menolak
                menyusut di bawah lebar intrinsik kontennya, jadi
                overflow-wrap tidak pernah sempat berlaku sebelum flow
                melebar duluan. min-w-0 memaksa item ini benar2 boleh
                menyusut, baru break-words bisa memutus kata panjangnya. */}
            <h1 className="min-w-0 break-words font-heading text-2xl font-bold leading-tight text-dash-ink">{title}</h1>
            {status}
          </div>
          {description && <p className="mt-1 max-w-2xl text-sm text-dash-muted">{description}</p>}
        </div>

        {(primaryAction || (secondaryActions && secondaryActions.length > 0)) && (
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
            {secondaryActions?.slice(0, 2).map((a) => (
              <ActionButton key={a.label} action={a} primary={false} />
            ))}
            {primaryAction && <ActionButton action={primaryAction} primary />}
          </div>
        )}
      </div>
    </header>
  );
}
