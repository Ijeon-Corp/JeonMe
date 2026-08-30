"use client";

import PageSkeleton from "@/components/Skeleton";
import { useEffect, useState } from "react";
import { ApiError, ProductReview, deleteReview, listReviews, setReviewHidden } from "@/lib/api-client";
import { IconInbox, IconStar, IconTrash } from "@/components/icons";
import { confirmDelete } from "@/lib/confirm";
import { useLocale } from "@/lib/locale-context";

// Modul Toko (Fase E1): tab Reviews -- semua ulasan lintas produk milik
// kreator, dengan aksi sembunyikan (reversibel) / hapus (permanen).
function StarRow({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <IconStar key={n} className={`h-3.5 w-3.5 ${n <= rating ? "text-amber-500" : "text-border"}`} />
      ))}
    </div>
  );
}

export default function ReviewsPanel() {
  const { t } = useLocale();
  const [reviews, setReviews] = useState<ProductReview[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listReviews()
      .then(setReviews)
      .catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.components.reviewsPanel.loadError")));
  }, [t]);

  async function handleToggleHidden(review: ProductReview) {
    const next = !review.is_hidden;
    setReviews((prev) => prev?.map((r) => (r.id === review.id ? { ...r, is_hidden: next } : r)) ?? prev);
    try {
      await setReviewHidden(review.id, next);
    } catch (err) {
      setReviews((prev) => prev?.map((r) => (r.id === review.id ? { ...r, is_hidden: review.is_hidden } : r)) ?? prev);
      setError(err instanceof ApiError ? err.message : t("dashboard.components.reviewsPanel.updateError"));
    }
  }

  async function handleDelete(review: ProductReview) {
    if (!(await confirmDelete(t("dashboard.components.reviewsPanel.confirmDeleteText")))) return;
    const previous = reviews;
    setReviews((prev) => prev?.filter((r) => r.id !== review.id) ?? prev);
    try {
      await deleteReview(review.id);
    } catch (err) {
      setReviews(previous);
      setError(err instanceof ApiError ? err.message : t("dashboard.components.reviewsPanel.deleteError"));
    }
  }

  if (reviews === null) {
    return <PageSkeleton />;
  }

  const avgRating = reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : null;

  return (
    <div className="mt-4">
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {avgRating !== null && (
        <div className="glass mb-3 flex items-center gap-2 rounded-jmd p-4 shadow-card">
          <StarRow rating={Math.round(avgRating)} />
          <span className="text-sm font-bold text-app-ink">{avgRating.toFixed(1)}</span>
          <span className="text-xs text-app-muted">
            {t("dashboard.components.reviewsPanel.reviewCountLabel").replace("{count}", String(reviews.length))}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {reviews.map((r) => (
          <div key={r.id} className={`rounded-jmd border border-app-border bg-app-surface p-4 shadow-card ${r.is_hidden ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <StarRow rating={r.rating} />
                <p className="mt-1 truncate text-xs font-semibold text-app-ink">{r.product_name}</p>
                <p className="text-[11px] text-app-muted">
                  {r.buyer_email} &middot; {new Date(r.created_at).toLocaleDateString("id-ID", { dateStyle: "medium" })}
                </p>
              </div>
              <div className="flex flex-shrink-0 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleToggleHidden(r)}
                  className="rounded-lg border border-app-border px-2.5 py-1 text-[11px] font-semibold text-app-ink hover:border-jeon-purple"
                >
                  {r.is_hidden
                    ? t("dashboard.components.reviewsPanel.showButton")
                    : t("dashboard.components.reviewsPanel.hideButton")}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(r)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"
                  title={t("dashboard.components.reviewsPanel.deleteTitle")}
                >
                  <IconTrash className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {r.comment && <p className="mt-2 text-sm text-app-ink">{r.comment}</p>}
          </div>
        ))}
        {reviews.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-jmd border border-dashed border-app-border bg-app-surface/60 p-6 text-center">
            <IconInbox className="h-5 w-5 text-app-muted" />
            <p className="text-xs text-app-muted">{t("dashboard.components.reviewsPanel.emptyState")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
