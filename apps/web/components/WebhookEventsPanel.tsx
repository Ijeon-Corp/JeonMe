"use client";

import { useEffect, useState } from "react";
import { ApiError, WebhookEventItem, listWebhookEvents } from "@/lib/api-client";
import { IconInbox } from "@/components/icons";

// Modul Toko (Fase E4): tab Webhook Events -- log pengiriman webhook dari
// produk dengan metode penyerahan "webhook" (lihat worker.HandleProductWebhookDelivery).
// Hanya tampilan baca; tidak ada aksi retry manual (di luar cakupan).
export default function WebhookEventsPanel() {
  const [events, setEvents] = useState<WebhookEventItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listWebhookEvents()
      .then(setEvents)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat riwayat webhook."));
  }, []);

  if (events === null) {
    return <p className="mt-4 text-sm text-muted">Memuat...</p>;
  }

  return (
    <div className="mt-4">
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-2xl border border-border bg-white shadow-card">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead>
            <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
              <th className="px-4 py-3">Produk</th>
              <th className="px-4 py-3">URL</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Kode Respons</th>
              <th className="px-4 py-3">Percobaan</th>
              <th className="px-4 py-3">Waktu</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-semibold text-ink">{e.product_name}</td>
                <td className="max-w-[220px] truncate px-4 py-3 text-ink" title={e.url}>
                  {e.url}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      e.status === "success" ? "bg-secondary-subtle text-secondary-dark" : "bg-red-50 text-red-600"
                    }`}
                  >
                    {e.status === "success" ? "Berhasil" : "Gagal"}
                  </span>
                  {e.status === "failed" && e.error_message && (
                    <p className="mt-1 max-w-[220px] truncate text-[10px] text-red-500" title={e.error_message}>
                      {e.error_message}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-ink">{e.response_code ?? "-"}</td>
                <td className="px-4 py-3 text-ink">{e.attempt}</td>
                <td className="px-4 py-3 text-muted">
                  {new Date(e.created_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {events.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-6 text-center">
            <IconInbox className="h-5 w-5 text-muted" />
            <p className="text-xs text-muted">Belum ada pengiriman webhook.</p>
          </div>
        )}
      </div>
    </div>
  );
}
