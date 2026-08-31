"use client";

import { Skeleton } from "@/components/Skeleton";

// Skeleton varian per-layout (JEONID-DASHBOARD-REDESIGN-SPEC.md §23.2,
// Phase 1). Masalah yang diperbaiki (audit §2.3): PageSkeleton generik tidak
// meniru layout akhir sehingga terasa layout-shift. Varian di sini meniru
// bentuk kasar tiap template; halaman baru memilih yang sesuai isinya.
// Basis shimmer reuse `Skeleton` lama (animate-pulse + token surface).

export function KpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-2xl border border-dash-border bg-dash-surface p-4">
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="mt-3 h-7 w-24" />
          <Skeleton className="mt-2 h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-dash-border bg-dash-surface" aria-hidden="true">
      <div className="flex gap-4 border-b border-dash-border px-4 py-3">
        {Array.from({ length: cols }, (_, i) => (
          <Skeleton key={i} className="h-3.5 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-4 border-b border-dash-border px-4 py-3.5 last:border-0">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ heightClass = "h-40" }: { heightClass?: string }) {
  return (
    <div className="rounded-2xl border border-dash-border bg-dash-surface p-4" aria-hidden="true">
      <Skeleton className="h-4 w-32" />
      <div className={`mt-4 flex items-end gap-2 ${heightClass}`}>
        {[55, 80, 40, 95, 65, 75, 50].map((h, i) => (
          <Skeleton key={i} className="flex-1" />
        ))}
      </div>
    </div>
  );
}

export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-dash-border bg-dash-surface p-5" aria-hidden="true">
      {Array.from({ length: fields }, (_, i) => (
        <div key={i}>
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="mt-1.5 h-10 w-full" />
        </div>
      ))}
      <Skeleton className="mt-1 h-10 w-full" />
    </div>
  );
}

export function EditorBlockSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl border border-dash-border bg-dash-surface p-3.5">
          <Skeleton className="h-8 w-8 flex-shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="mt-1.5 h-3 w-3/4" />
          </div>
          <Skeleton className="h-6 w-11 flex-shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}

// Skeleton halaman Settings template (PageHeader + section form) -- dipakai
// halaman kecil hasil migrasi Phase 1 (mis. social-proof).
export function SettingsPageSkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="mt-2 h-4 w-72" />
      <div className="mt-6 flex flex-col gap-4">
        <FormSkeleton fields={2} />
        <FormSkeleton fields={3} />
      </div>
    </div>
  );
}
