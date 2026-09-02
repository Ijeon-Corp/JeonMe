"use client";

// SectionCard (JEONID-DASHBOARD-REDESIGN-SPEC.md §8.2, Phase 1 Foundation).
// Kartu section standar Settings/Editor template: varian default/subtle/
// highlighted/danger; slot icon/title/description/action/content/footer.
// Radius 16px (spec §4.3 standard card), border lebih dominan dari shadow
// (prinsip §3.3.4). Judul = H2 (section title) supaya outline heading halaman
// tetap semantik di bawah H1 PageHeader.
// Garis semua varian = jeon-ink (ikut flip tema) supaya seragam dengan kartu
// .glass -- permintaan pengguna 3 September 2026 soal kartu Beranda yang
// belum bertema. Latar per varian dipertahankan (semuanya token yang flip).
const VARIANT_CLASSES = {
  default: "border-jeon-ink bg-app-surface",
  subtle: "border-jeon-ink bg-dash-surface-subtle",
  highlighted: "border-jeon-ink bg-brand-soft",
  danger: "border-jeon-ink bg-danger-soft",
} as const;

export default function SectionCard({
  variant = "default",
  icon,
  title,
  description,
  action,
  footer,
  children,
  className = "",
}: {
  variant?: keyof typeof VARIANT_CLASSES;
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const hasHeader = icon || title || description || action;
  return (
    <section className={`rounded-jmd border-2 p-5 shadow-card ${VARIANT_CLASSES[variant]} ${className}`}>
      {hasHeader && (
        <div className={`flex items-start justify-between gap-3 ${children ? "mb-4" : ""}`}>
          <div className="flex min-w-0 items-start gap-2.5">
            {icon && (
              <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-jsm border-2 border-[#111111] bg-jeon-lavender text-[#111111]">
                {icon}
              </span>
            )}
            <div className="min-w-0">
              {title && <h2 className="font-heading text-sm font-semibold text-dash-ink">{title}</h2>}
              {description && <p className="mt-0.5 text-xs text-dash-muted">{description}</p>}
            </div>
          </div>
          {action && <div className="flex-shrink-0">{action}</div>}
        </div>
      )}
      {children}
      {footer && <div className="mt-4 border-t border-dash-border pt-3">{footer}</div>}
    </section>
  );
}
