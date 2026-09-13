"use client";

import PageSkeleton from "@/components/Skeleton";
import { useEffect, useState } from "react";
import { ApiError, WebhookEventItem, listWebhookEvents } from "@/lib/api-client";
import { IconInbox } from "@/components/icons";
import { useLocale } from "@/lib/locale-context";
import { useErrorToast } from "@/lib/use-error-toast";

// Modul Toko (Fase E4): tab Webhook Events -- log pengiriman webhook dari
// produk dengan metode penyerahan "webhook" (lihat worker.HandleProductWebhookDelivery).
// Hanya tampilan baca; tidak ada aksi retry manual (di luar cakupan).
export default function WebhookEventsPanel() {
  const { t } = useLocale();
  const [events, setEvents] = useState<WebhookEventItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);

  useEffect(() => {
    listWebhookEvents()
      .then(setEvents)
      .catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.components.webhookEventsPanel.loadError")));
    // Sama seperti ReviewsPanel/TransactionPanel dkk (bug 13 September
    // 2026, "diseluruh menu sales" fetch dobel) -- `t` cuma format pesan
    // error, bukan penentu data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (events === null) {
    return <PageSkeleton />;
  }

  return (
    <div className="mt-4">

      <div className="glass overflow-x-auto rounded-jmd shadow-card">
        <table aria-label={t("dashboard.components.webhookEventsPanel.tableAriaLabel")} className="w-full min-w-[720px] text-left text-xs">
          <thead>
            <tr className="border-b-2 border-jeon-ink text-[11px] font-semibold uppercase tracking-wide text-app-muted">
              <th className="px-4 py-3">{t("dashboard.components.webhookEventsPanel.columnProduct")}</th>
              <th className="px-4 py-3">{t("dashboard.components.webhookEventsPanel.columnUrl")}</th>
              <th className="px-4 py-3">{t("dashboard.components.webhookEventsPanel.columnStatus")}</th>
              <th className="px-4 py-3">{t("dashboard.components.webhookEventsPanel.columnResponseCode")}</th>
              <th className="px-4 py-3">{t("dashboard.components.webhookEventsPanel.columnAttempt")}</th>
              <th className="px-4 py-3">{t("dashboard.components.webhookEventsPanel.columnTime")}</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="border-b border-app-border last:border-0">
                <td className="px-4 py-3 font-semibold text-app-ink">{e.product_name}</td>
                <td className="max-w-[220px] truncate px-4 py-3 text-app-ink" title={e.url}>
                  {e.url}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      e.status === "success" ? "border-2 border-[#111111] bg-jeon-lavender text-[#111111]" : "border-2 border-[#111111] bg-jeon-coral text-[#111111]"
                    }`}
                  >
                    {e.status === "success"
                      ? t("dashboard.components.webhookEventsPanel.statusSuccess")
                      : t("dashboard.components.webhookEventsPanel.statusFailed")}
                  </span>
                  {e.status === "failed" && e.error_message && (
                    <p className="mt-1 max-w-[220px] truncate text-[10px] text-red-500" title={e.error_message}>
                      {e.error_message}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-app-ink">{e.response_code ?? "-"}</td>
                <td className="px-4 py-3 text-app-ink">{e.attempt}</td>
                <td className="px-4 py-3 text-app-muted">
                  {new Date(e.created_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {events.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-6 text-center">
            <IconInbox className="h-5 w-5 text-app-muted" />
            <p className="text-xs text-app-muted">{t("dashboard.components.webhookEventsPanel.emptyState")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
