"use client";

import { useEffect, useState } from "react";
import { AdminReport, ApiError, listAdminReports, resolveReport } from "@/lib/api-client";
import { IconFlag, IconInbox } from "@/components/icons";

export default function AdminReportsPage() {
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function reload() {
    return listAdminReports("pending").then(setReports);
  }

  useEffect(() => {
    reload()
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat laporan."))
      .finally(() => setLoading(false));
  }, []);

  async function handleResolve(id: string, action: "takedown" | "dismiss") {
    setError(null);
    try {
      await resolveReport(id, action);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memproses laporan.");
    }
  }

  if (loading) return <p className="text-sm text-muted">Memuat...</p>;

  return (
    <div className="max-w-3xl">
      <h1 className="font-heading text-2xl font-bold text-ink">Laporan Konten</h1>
      <p className="mt-1 text-sm text-muted">Laporan yang masih menunggu tinjauan.</p>

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex flex-col gap-2">
        {reports.map((r) => (
          <div key={r.id} className="rounded-xl border border-border bg-white p-4 shadow-card">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
              <IconFlag className="h-3.5 w-3.5 text-red-500" />
              {r.target_type} · {r.target_id}
            </div>
            <p className="mt-1.5 text-sm text-ink">{r.reason}</p>
            {r.reporter_email && <p className="mt-1 text-xs text-muted">Pelapor: {r.reporter_email}</p>}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => handleResolve(r.id, "takedown")}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700"
              >
                Takedown
              </button>
              <button
                type="button"
                onClick={() => handleResolve(r.id, "dismiss")}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-ink hover:border-primary"
              >
                Abaikan
              </button>
            </div>
          </div>
        ))}
        {reports.length === 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-white/60 px-4 py-6 text-sm text-muted">
            <IconInbox className="h-4 w-4 flex-shrink-0" />
            Tidak ada laporan tertunda.
          </div>
        )}
      </div>
    </div>
  );
}
