"use client";

import Image from "next/image";

import { useRef } from "react";
import {
  IconBox,
  IconCamera,
  IconChart,
  IconCheck,
  IconClock,
  IconClose,
  IconExternal,
  IconShield,
  IconSparkle,
  IconTextLines,
  IconTrash,
  IconUpload,
  IconUsers,
  IconWallet,
  IconWhatsapp,
} from "@/components/icons";
import DeliveryMethodPanel from "@/components/DeliveryMethodPanel";
import { CollaboratorSplit, DashboardCollaborator, DashboardProduct } from "@/lib/api-client";
import { useLocale } from "@/lib/locale-context";

// ManageProductModal -- diangkat keluar dari products/page.tsx (laporan
// pengguna 3 September 2026: "sudah muncul tapi ke reload lagi... seperti
// dua kali muncul" di halaman Produk). Akar masalah SEBENARNYA bukan bug
// skeleton (itu sudah diperbaiki commit af129cd), tapi race hydration
// <Link> Next.js: sidebar HTML sudah "terlihat" siap dari server sebelum
// listener klik React benar-benar terpasang, klik di jendela itu jatuh ke
// navigasi native browser (hard reload sungguhan) -- lihat catatan panjang
// di app/dashboard/layout.tsx dekat EXPANDED_GROUPS_STORAGE_KEY. Race itu
// sendiri di luar kendali kode (perlu hydration React selesai lebih cepat),
// tapi produk salah satu halaman TERBERAT di dashboard (bareng links/
// page.tsx) yang melebarkan jendela race itu -- modal Kelola ini (flash
// sale/PWYW/split kolaborator/upload file&sampul/hapus) SEBELUMNYA inline
// di page.tsx (~460 baris) dan dimuat EAGER meski cuma perlu tampil saat
// user klik "Kelola" satu produk, beda dari 8 panel tab lain di halaman
// yang sudah lama lewat next/dynamic. Memecahnya ke sini + next/dynamic di
// pemanggil mengecilkan bundle JS awal halaman Produk supaya hydration
// selesai lebih cepat -- MENGURANGI peluang race, bukan menjamin hilang
// total (batasan arsitektur Next.js, bukan sesuatu yang bisa "diperbaiki"
// penuh lewat kode di sini).
export default function ManageProductModal({
  product,
  onClose,
  categoryEditId,
  categoryDraft,
  savingCategory,
  onCategoryDraftChange,
  onCancelCategoryEdit,
  onSaveCategory,
  onOpenCategoryForm,
  coverBusyId,
  onUploadCover,
  busyId,
  onUpload,
  onGetDownloadLink,
  onToggleWatermark,
  flashSaleEditId,
  flashPrice,
  flashStart,
  flashEnd,
  savingFlashSale,
  onFlashPriceChange,
  onFlashStartChange,
  onFlashEndChange,
  onCancelFlashSaleEdit,
  onSaveFlashSale,
  onClearFlashSale,
  onOpenFlashSaleForm,
  pwywEditId,
  pwywMinPrice,
  savingPwyw,
  onPwywMinPriceChange,
  onCancelPwywEdit,
  onSavePwyw,
  onClearPwyw,
  onOpenPwywForm,
  activeCollaborators,
  splitsEditId,
  splitRows,
  savingSplits,
  onUpdateSplitRow,
  onRemoveSplitRow,
  onAddSplitRow,
  onCancelSplitsEdit,
  onSaveSplits,
  onOpenSplitsForm,
  externalUrlEditId,
  externalUrlDraft,
  savingExternalUrl,
  onExternalUrlDraftChange,
  onStartExternalUrlEdit,
  onCancelExternalUrlEdit,
  onSaveExternalUrl,
  onProductPatch,
  onError,
  onDelete,
  releaseAtEditId,
  releaseAtDraft,
  savingReleaseAt,
  onReleaseAtDraftChange,
  onCancelReleaseAtEdit,
  onSaveReleaseAt,
  onClearReleaseAt,
  onOpenReleaseAtForm,
  onToggleTransactionFee,
  notifyWhatsappEditId,
  notifyWhatsappEnabledDraft,
  notifyWhatsappMessageDraft,
  savingNotifyWhatsapp,
  onNotifyWhatsappEnabledDraftChange,
  onNotifyWhatsappMessageDraftChange,
  onCancelNotifyWhatsappEdit,
  onSaveNotifyWhatsapp,
  onOpenNotifyWhatsappForm,
  successMessageEditId,
  successMessageDraft,
  savingSuccessMessage,
  onSuccessMessageDraftChange,
  onCancelSuccessMessageEdit,
  onSaveSuccessMessage,
  onOpenSuccessMessageForm,
  onToggleShowSoldCount,
}: {
  product: DashboardProduct;
  onClose: () => void;
  categoryEditId: string | null;
  categoryDraft: string;
  savingCategory: boolean;
  onCategoryDraftChange: (value: string) => void;
  onCancelCategoryEdit: () => void;
  onSaveCategory: (product: DashboardProduct) => void;
  onOpenCategoryForm: (product: DashboardProduct) => void;
  coverBusyId: string | null;
  onUploadCover: (product: DashboardProduct, file: File) => void;
  busyId: string | null;
  onUpload: (product: DashboardProduct, file: File) => void;
  onGetDownloadLink: (id: string) => void;
  onToggleWatermark: (product: DashboardProduct) => void;
  flashSaleEditId: string | null;
  flashPrice: string;
  flashStart: string;
  flashEnd: string;
  savingFlashSale: boolean;
  onFlashPriceChange: (value: string) => void;
  onFlashStartChange: (value: string) => void;
  onFlashEndChange: (value: string) => void;
  onCancelFlashSaleEdit: () => void;
  onSaveFlashSale: (product: DashboardProduct) => void;
  onClearFlashSale: (product: DashboardProduct) => void;
  onOpenFlashSaleForm: (product: DashboardProduct) => void;
  pwywEditId: string | null;
  pwywMinPrice: string;
  savingPwyw: boolean;
  onPwywMinPriceChange: (value: string) => void;
  onCancelPwywEdit: () => void;
  onSavePwyw: (product: DashboardProduct) => void;
  onClearPwyw: (product: DashboardProduct) => void;
  onOpenPwywForm: (product: DashboardProduct) => void;
  activeCollaborators: DashboardCollaborator[];
  splitsEditId: string | null;
  splitRows: CollaboratorSplit[];
  savingSplits: boolean;
  onUpdateSplitRow: (index: number, patch: Partial<CollaboratorSplit>) => void;
  onRemoveSplitRow: (index: number) => void;
  onAddSplitRow: () => void;
  onCancelSplitsEdit: () => void;
  onSaveSplits: (product: DashboardProduct) => void;
  onOpenSplitsForm: (product: DashboardProduct) => void;
  externalUrlEditId: string | null;
  externalUrlDraft: string;
  savingExternalUrl: boolean;
  onExternalUrlDraftChange: (value: string) => void;
  onStartExternalUrlEdit: (product: DashboardProduct) => void;
  onCancelExternalUrlEdit: () => void;
  onSaveExternalUrl: (product: DashboardProduct) => void;
  onProductPatch: (patch: Partial<DashboardProduct>) => void;
  onError: (message: string) => void;
  onDelete: (product: DashboardProduct) => void;
  releaseAtEditId: string | null;
  releaseAtDraft: string;
  savingReleaseAt: boolean;
  onReleaseAtDraftChange: (value: string) => void;
  onCancelReleaseAtEdit: () => void;
  onSaveReleaseAt: (product: DashboardProduct) => void;
  onClearReleaseAt: (product: DashboardProduct) => void;
  onOpenReleaseAtForm: (product: DashboardProduct) => void;
  onToggleTransactionFee: (product: DashboardProduct) => void;
  notifyWhatsappEditId: string | null;
  notifyWhatsappEnabledDraft: boolean;
  notifyWhatsappMessageDraft: string;
  savingNotifyWhatsapp: boolean;
  onNotifyWhatsappEnabledDraftChange: (value: boolean) => void;
  onNotifyWhatsappMessageDraftChange: (value: string) => void;
  onCancelNotifyWhatsappEdit: () => void;
  onSaveNotifyWhatsapp: (product: DashboardProduct) => void;
  onOpenNotifyWhatsappForm: (product: DashboardProduct) => void;
  successMessageEditId: string | null;
  successMessageDraft: string;
  savingSuccessMessage: boolean;
  onSuccessMessageDraftChange: (value: string) => void;
  onCancelSuccessMessageEdit: () => void;
  onSaveSuccessMessage: (product: DashboardProduct) => void;
  onOpenSuccessMessageForm: (product: DashboardProduct) => void;
  onToggleShowSoldCount: (product: DashboardProduct) => void;
}) {
  const { t } = useLocale();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-jlg border-2 border-jeon-ink bg-app-surface p-5 shadow-brutal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-display text-sm font-bold text-app-ink">
            {t("dashboard.pages.products.manageModal.title").replace("{name}", product.name)}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-app-muted hover:bg-jeon-purple/10"
            aria-label={t("dashboard.pages.products.manageModal.close")}
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        {categoryEditId === product.id ? (
          <div className="mt-2 flex gap-1.5">
            <input
              type="text"
              autoFocus
              placeholder={t("dashboard.pages.products.manageModal.categoryPlaceholder")}
              value={categoryDraft}
              onChange={(e) => onCategoryDraftChange(e.target.value)}
              className="flex-1 rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
            />
            <button type="button" onClick={onCancelCategoryEdit} className="rounded-md border-2 border-jeon-ink px-2.5 py-1.5 text-[11px] font-bold text-app-muted">
              {t("dashboard.pages.products.manageModal.cancel")}
            </button>
            <button
              type="button"
              disabled={savingCategory}
              onClick={() => onSaveCategory(product)}
              className="btn-primary rounded-md px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
            >
              {savingCategory ? "..." : t("dashboard.pages.products.manageModal.save")}
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => onOpenCategoryForm(product)} className="mt-2 text-[11px] font-semibold text-jeon-purple hover:underline">
            {product.category
              ? t("dashboard.pages.products.manageModal.setCategoryPrefix").replace("{category}", product.category)
              : t("dashboard.pages.products.manageModal.setCategoryButton")}
          </button>
        )}

        {/* Permintaan langsung pengguna, 14 Agustus 2026: "saat kelola
            produk ada 2 yang perlu diunggah yaitu icon dan produk nya,
            sebagai user saya bingung dengan ui dan ux nya" -- akar
            masalahnya BUKAN bug (toggle Aktifkan memang bekerja benar),
            tapi tombol sampul sebelumnya cuma ikon kamera kecil TANPA
            label teks sama sekali, duduk bersebelahan dengan tombol
            "Unggah file" yang justru WAJIB utk mengaktifkan produk --
            gampang tertukar. Sekarang keduanya diberi label & keterangan
            wajib/opsional yang eksplisit, langsung di dalam modal ini
            (bukan cuma di atas tabel, yang sudah tidak terlihat lagi
            begitu modal Kelola terbuka).
            Diperbarui 19 Agustus 2026 (permintaan langsung pengguna:
            "sampul jangan dijadikan opsional"): Sampul SEKARANG JUGA
            wajib untuk semua jenis produk (termasuk Payment Link/Link
            Eksternal yang tidak punya File Produk sama sekali) --
            gerbang aktivasi backend (product.go) menolak keduanya kalau
            salah satu kosong. */}
        <p className="mt-5 border-t border-app-border pt-3 text-[10px] font-extrabold uppercase tracking-wider text-app-muted">
          {t("dashboard.pages.products.manageModal.sectionMedia")}
        </p>
        <p className="mt-4 text-[11px] leading-relaxed text-app-muted">
          <strong className="text-app-ink">{t("dashboard.pages.products.manageModal.fileHintProductFile")}</strong>{" "}
          {t("dashboard.pages.products.manageModal.fileHintMiddle")}{" "}
          <strong className="text-app-ink">{t("dashboard.pages.products.manageModal.fileHintCover")}</strong>{" "}
          {t("dashboard.pages.products.manageModal.fileHintEnd")}
        </p>
        <div className="mt-2.5 flex items-end gap-3">
          <div className="flex flex-shrink-0 flex-col items-center gap-1">
            <button
              type="button"
              disabled={coverBusyId === product.id}
              onClick={() => coverInputRef.current?.click()}
              title={
                product.cover_image_url
                  ? t("dashboard.pages.products.manageModal.changeCoverTitle")
                  : t("dashboard.pages.products.manageModal.addCoverTitle")
              }
              className="relative h-14 w-14 overflow-hidden rounded-xl bg-jeon-purple/10 disabled:opacity-60"
            >
              {product.cover_image_url ? (
                // Ukuran TETAP 56px -- tombol pembungkusnya h-14 w-14.
                <Image src={product.cover_image_url} alt={product.name} width={56} height={56} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-jeon-purple/40">
                  <IconBox className="h-6 w-6" />
                </div>
              )}
              <span className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-tl-lg bg-ink/70 text-white">
                <IconCamera className="h-2.5 w-2.5" />
              </span>
            </button>
            <span className="text-[10px] font-semibold text-app-muted">{t("dashboard.pages.products.manageModal.coverRequiredLabel")}</span>
          </div>
          <input
            ref={coverInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUploadCover(product, file);
              e.target.value = "";
            }}
          />

          {product.product_kind !== "payment_link" && product.product_kind !== "external_link" && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onUpload(product, file);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                disabled={busyId === product.id}
                onClick={() => fileInputRef.current?.click()}
                className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold disabled:opacity-60 ${
                  product.has_file ? "bg-jeon-purple/10 text-jeon-purple" : "bg-jeon-purple/10 text-jeon-purple"
                }`}
              >
                {product.has_file ? <IconCheck className="h-3.5 w-3.5" /> : <IconUpload className="h-3.5 w-3.5" />}
                {product.has_file
                  ? t("dashboard.pages.products.manageModal.fileUploaded")
                  : t("dashboard.pages.products.manageModal.uploadFileRequired")}
              </button>
              {product.has_file && (
                <button
                  type="button"
                  onClick={() => onGetDownloadLink(product.id)}
                  title={t("dashboard.pages.products.manageModal.viewFileTitle")}
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-app-muted hover:bg-jeon-purple/10"
                >
                  <IconExternal className="h-4 w-4" />
                </button>
              )}
              {product.is_pdf && (
                <button
                  type="button"
                  onClick={() => onToggleWatermark(product)}
                  title={t("dashboard.pages.products.manageModal.watermarkTitle")}
                  className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg hover:bg-jeon-purple/10 ${
                    product.watermark_enabled ? "text-jeon-purple" : "text-app-muted"
                  }`}
                >
                  <IconShield className="h-4 w-4" />
                </button>
              )}
            </>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-2.5">
          <p className="mt-5 border-t border-app-border pt-3 text-[10px] font-extrabold uppercase tracking-wider text-app-muted">
            {t("dashboard.pages.products.manageModal.sectionPricing")}
          </p>
          {flashSaleEditId === product.id ? (
            <div className="flex flex-col gap-2 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-app-ink">
                <IconSparkle className="h-3.5 w-3.5" /> {t("dashboard.pages.products.manageModal.flashSaleLabel")}
              </p>
              <input
                type="number"
                placeholder={t("dashboard.pages.products.manageModal.flashPricePlaceholder")}
                value={flashPrice}
                onChange={(e) => onFlashPriceChange(e.target.value)}
                className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
              />
              <div className="flex gap-1.5">
                <input
                  type="datetime-local"
                  value={flashStart}
                  onChange={(e) => onFlashStartChange(e.target.value)}
                  className="w-full rounded-md border border-app-border px-2 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                />
                <input
                  type="datetime-local"
                  value={flashEnd}
                  onChange={(e) => onFlashEndChange(e.target.value)}
                  className="w-full rounded-md border border-app-border px-2 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                />
              </div>
              <div className="flex gap-1.5">
                <button type="button" onClick={onCancelFlashSaleEdit} className="flex-1 rounded-md border-2 border-jeon-ink py-1.5 text-[11px] font-bold text-app-muted">
                  {t("dashboard.pages.products.manageModal.cancel")}
                </button>
                <button
                  type="button"
                  disabled={savingFlashSale}
                  onClick={() => onSaveFlashSale(product)}
                  className="btn-primary flex-1 rounded-md py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
                >
                  {savingFlashSale ? t("dashboard.pages.products.manageModal.savingEllipsis") : t("dashboard.pages.products.manageModal.save")}
                </button>
              </div>
            </div>
          ) : product.is_flash_sale_active ? (
            <div className="flex items-center justify-between rounded-lg bg-jeon-warning/15 px-2.5 py-1.5">
              <span className="text-[11px] font-semibold text-jeon-warning">
                {t("dashboard.pages.products.manageModal.flashSaleUntil").replace(
                  "{date}",
                  product.flash_sale_ends_at ? new Date(product.flash_sale_ends_at).toLocaleString("id-ID") : ""
                )}
              </span>
              <button type="button" onClick={() => onClearFlashSale(product)} className="text-[11px] font-bold text-red-600 hover:underline">
                {t("dashboard.pages.products.manageModal.cancelAction")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onOpenFlashSaleForm(product)}
              className="flex items-center gap-1.5 rounded-lg border border-dashed border-app-border px-3 py-2 text-[11px] font-semibold text-app-muted hover:border-jeon-purple hover:text-jeon-purple"
            >
              <IconSparkle className="h-3.5 w-3.5" /> {t("dashboard.pages.products.manageModal.scheduleFlashSale")}
            </button>
          )}

          {pwywEditId === product.id ? (
            <div className="flex flex-col gap-2 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-app-ink">
                <IconWallet className="h-3.5 w-3.5" /> {t("dashboard.pages.products.manageModal.pwywLabel")}
              </p>
              <input
                type="number"
                placeholder={t("dashboard.pages.products.manageModal.pwywMinPricePlaceholder")}
                value={pwywMinPrice}
                onChange={(e) => onPwywMinPriceChange(e.target.value)}
                className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
              />
              <div className="flex gap-1.5">
                <button type="button" onClick={onCancelPwywEdit} className="flex-1 rounded-md border-2 border-jeon-ink py-1.5 text-[11px] font-bold text-app-muted">
                  {t("dashboard.pages.products.manageModal.cancel")}
                </button>
                <button
                  type="button"
                  disabled={savingPwyw}
                  onClick={() => onSavePwyw(product)}
                  className="btn-primary flex-1 rounded-md py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
                >
                  {savingPwyw ? t("dashboard.pages.products.manageModal.savingEllipsis") : t("dashboard.pages.products.manageModal.save")}
                </button>
              </div>
            </div>
          ) : product.pwyw_enabled ? (
            <div className="flex items-center justify-between rounded-lg bg-jeon-purple/10 px-2.5 py-1.5">
              <span className="text-[11px] font-semibold text-jeon-purple">
                {t("dashboard.pages.products.manageModal.pwywActiveMin").replace(
                  "{amount}",
                  (product.pwyw_min_price_idr ?? 0).toLocaleString("id-ID")
                )}
              </span>
              <button type="button" onClick={() => onClearPwyw(product)} className="text-[11px] font-bold text-red-600 hover:underline">
                {t("dashboard.pages.products.manageModal.cancelAction")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onOpenPwywForm(product)}
              className="flex items-center gap-1.5 rounded-lg border border-dashed border-app-border px-3 py-2 text-[11px] font-semibold text-app-muted hover:border-jeon-purple hover:text-jeon-purple"
            >
              <IconWallet className="h-3.5 w-3.5" /> {t("dashboard.pages.products.manageModal.activatePwyw")}
            </button>
          )}

          {activeCollaborators.length > 0 && (
          <p className="mt-5 border-t border-app-border pt-3 text-[10px] font-extrabold uppercase tracking-wider text-app-muted">
              {t("dashboard.pages.products.manageModal.sectionCollab")}
          </p>
          )}
          {activeCollaborators.length > 0 &&
            (splitsEditId === product.id ? (
              <div className="flex flex-col gap-2 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
                <p className="text-[11px] text-app-muted">{t("dashboard.pages.products.manageModal.splitsHint")}</p>
                {splitRows.map((row, i) => (
                  <div key={i} className="flex gap-1.5">
                    <select
                      value={row.user_id}
                      onChange={(e) => onUpdateSplitRow(i, { user_id: e.target.value })}
                      className="flex-1 rounded-md border border-app-border px-2 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                    >
                      <option value="">{t("dashboard.pages.products.manageModal.chooseCollaborator")}</option>
                      {activeCollaborators.map((c) => (
                        <option key={c.collaborator_user_id} value={c.collaborator_user_id}>
                          {c.email}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.1"
                      placeholder="%"
                      value={row.percent || ""}
                      onChange={(e) => onUpdateSplitRow(i, { percent: Number(e.target.value) })}
                      className="w-16 rounded-md border border-app-border px-2 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => onRemoveSplitRow(i)}
                      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-red-600 hover:bg-red-50"
                    >
                      <IconTrash className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={onAddSplitRow} className="self-start text-[11px] font-semibold text-jeon-purple hover:underline">
                  {t("dashboard.pages.products.manageModal.addCollaborator")}
                </button>
                <div className="flex gap-1.5">
                  <button type="button" onClick={onCancelSplitsEdit} className="flex-1 rounded-md border-2 border-jeon-ink py-1.5 text-[11px] font-bold text-app-muted">
                    {t("dashboard.pages.products.manageModal.cancel")}
                  </button>
                  <button
                    type="button"
                    disabled={savingSplits}
                    onClick={() => onSaveSplits(product)}
                    className="btn-primary flex-1 rounded-md py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
                  >
                    {savingSplits ? t("dashboard.pages.products.manageModal.savingEllipsis") : t("dashboard.pages.products.manageModal.save")}
                  </button>
                </div>
              </div>
            ) : product.collaborator_splits.length > 0 ? (
              <div className="flex items-center justify-between rounded-lg bg-jeon-purple/10 px-2.5 py-1.5">
                <span className="text-[11px] font-semibold text-jeon-purple">
                  {t("dashboard.pages.products.manageModal.collaboratorsShare")
                    .replace("{count}", String(product.collaborator_splits.length))
                    .replace("{percent}", String(product.collaborator_splits.reduce((sum, s) => sum + s.percent, 0)))}
                </span>
                <button type="button" onClick={() => onOpenSplitsForm(product)} className="text-[11px] font-bold text-jeon-purple hover:underline">
                  {t("dashboard.pages.products.manageModal.change")}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onOpenSplitsForm(product)}
                className="flex items-center gap-1.5 rounded-lg border border-dashed border-app-border px-3 py-2 text-[11px] font-semibold text-app-muted hover:border-jeon-purple hover:text-jeon-purple"
              >
                <IconUsers className="h-3.5 w-3.5" /> {t("dashboard.pages.products.manageModal.setSplits")}
              </button>
            ))}
        </div>

        {/* Tautan produk -- Modul Toko (migrasi 000068): satu-satunya
            field khusus external_link yang bisa diubah setelah dibuat
            (ProductKind sendiri immutable, lihat catatan di product.go). */}
        {product.product_kind !== "payment_link" && (
          <p className="mt-5 border-t border-app-border pt-3 text-[10px] font-extrabold uppercase tracking-wider text-app-muted">
            {t("dashboard.pages.products.manageModal.sectionDelivery")}
          </p>
        )}
        {product.product_kind === "external_link" && (
          <div className="mt-4 flex flex-col gap-2 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
            <p className="flex items-center gap-1.5 text-[11px] font-bold text-app-ink">
              <IconExternal className="h-3.5 w-3.5" /> {t("dashboard.pages.products.manageModal.productLinkLabel")}
            </p>
            {externalUrlEditId === product.id ? (
              <>
                <input
                  type="url"
                  autoFocus
                  value={externalUrlDraft}
                  onChange={(e) => onExternalUrlDraftChange(e.target.value)}
                  className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                />
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={savingExternalUrl}
                    onClick={() => onSaveExternalUrl(product)}
                    className="btn-primary flex-1 rounded-md py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
                  >
                    {savingExternalUrl ? t("dashboard.pages.products.manageModal.savingEllipsis") : t("dashboard.pages.products.manageModal.save")}
                  </button>
                  <button
                    type="button"
                    onClick={onCancelExternalUrlEdit}
                    className="flex-1 rounded-md border-2 border-jeon-ink py-1.5 text-[11px] font-bold text-app-muted hover:border-ink/30"
                  >
                    {t("dashboard.pages.products.manageModal.cancel")}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-[11px] text-app-ink">{product.external_url}</p>
                <button
                  type="button"
                  onClick={() => onStartExternalUrlEdit(product)}
                  className="flex-shrink-0 text-[11px] font-bold text-jeon-purple hover:underline"
                >
                  {t("dashboard.pages.products.manageModal.change")}
                </button>
              </div>
            )}
          </div>
        )}

        {product.product_kind !== "payment_link" && product.product_kind !== "external_link" && (
          <DeliveryMethodPanel key={product.id} product={product} onUpdated={onProductPatch} onError={onError} />
        )}

        {/* Advance Option -- permintaan langsung pengguna, 5 September
            2026: 5 toggle pengaturan lanjutan perilaku produk (Release
            Time, Fee, notifikasi WhatsApp, Custom Message, Show Unit
            Sold). */}
        <p className="mt-5 border-t border-app-border pt-3 text-[10px] font-extrabold uppercase tracking-wider text-app-muted">
          {t("dashboard.pages.products.manageModal.sectionAdvanced")}
        </p>
        <div className="mt-4 flex flex-col gap-2.5">
          {releaseAtEditId === product.id ? (
            <div className="flex flex-col gap-2 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-app-ink">
                <IconClock className="h-3.5 w-3.5" /> {t("dashboard.pages.products.manageModal.releaseTimeLabel")}
              </p>
              <input
                type="datetime-local"
                value={releaseAtDraft}
                onChange={(e) => onReleaseAtDraftChange(e.target.value)}
                className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
              />
              <div className="flex gap-1.5">
                <button type="button" onClick={onCancelReleaseAtEdit} className="flex-1 rounded-md border-2 border-jeon-ink py-1.5 text-[11px] font-bold text-app-muted">
                  {t("dashboard.pages.products.manageModal.cancel")}
                </button>
                <button
                  type="button"
                  disabled={savingReleaseAt}
                  onClick={() => onSaveReleaseAt(product)}
                  className="btn-primary flex-1 rounded-md py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
                >
                  {savingReleaseAt ? t("dashboard.pages.products.manageModal.savingEllipsis") : t("dashboard.pages.products.manageModal.save")}
                </button>
              </div>
            </div>
          ) : product.release_at ? (
            <div className="flex items-center justify-between rounded-lg bg-jeon-purple/10 px-2.5 py-1.5">
              <span className="text-[11px] font-semibold text-jeon-purple">
                {t("dashboard.pages.products.manageModal.releaseScheduled").replace(
                  "{date}",
                  new Date(product.release_at).toLocaleString("id-ID")
                )}
              </span>
              <button type="button" onClick={() => onClearReleaseAt(product)} className="text-[11px] font-bold text-red-600 hover:underline">
                {t("dashboard.pages.products.manageModal.cancelAction")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onOpenReleaseAtForm(product)}
              className="flex items-center gap-1.5 rounded-lg border border-dashed border-app-border px-3 py-2 text-[11px] font-semibold text-app-muted hover:border-jeon-purple hover:text-jeon-purple"
            >
              <IconClock className="h-3.5 w-3.5" /> {t("dashboard.pages.products.manageModal.scheduleRelease")}
            </button>
          )}

          <div className="flex items-center justify-between rounded-lg border border-app-border px-2.5 py-1.5">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-app-ink">
              <IconWallet className="h-3.5 w-3.5" /> {t("dashboard.pages.products.manageModal.transactionFeeLabel")}
            </span>
            <button
              type="button"
              onClick={() => onToggleTransactionFee(product)}
              aria-pressed={product.transaction_fee_enabled}
              className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors ${
                product.transaction_fee_enabled ? "bg-jeon-purple" : "bg-app-border"
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                  product.transaction_fee_enabled ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          {notifyWhatsappEditId === product.id ? (
            <div className="flex flex-col gap-2 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-app-ink">
                <IconWhatsapp className="h-3.5 w-3.5" /> {t("dashboard.pages.products.manageModal.notifyWhatsappLabel")}
              </p>
              <label className="flex items-center gap-1.5 text-[11px] text-app-ink">
                <input
                  type="checkbox"
                  checked={notifyWhatsappEnabledDraft}
                  onChange={(e) => onNotifyWhatsappEnabledDraftChange(e.target.checked)}
                />
                {t("dashboard.pages.products.manageModal.notifyWhatsappToggleHint")}
              </label>
              <textarea
                placeholder={t("dashboard.pages.products.manageModal.notifyWhatsappMessagePlaceholder")}
                value={notifyWhatsappMessageDraft}
                onChange={(e) => onNotifyWhatsappMessageDraftChange(e.target.value)}
                rows={2}
                maxLength={500}
                className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
              />
              <div className="flex gap-1.5">
                <button type="button" onClick={onCancelNotifyWhatsappEdit} className="flex-1 rounded-md border-2 border-jeon-ink py-1.5 text-[11px] font-bold text-app-muted">
                  {t("dashboard.pages.products.manageModal.cancel")}
                </button>
                <button
                  type="button"
                  disabled={savingNotifyWhatsapp}
                  onClick={() => onSaveNotifyWhatsapp(product)}
                  className="btn-primary flex-1 rounded-md py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
                >
                  {savingNotifyWhatsapp ? t("dashboard.pages.products.manageModal.savingEllipsis") : t("dashboard.pages.products.manageModal.save")}
                </button>
              </div>
            </div>
          ) : product.notify_whatsapp_enabled ? (
            <div className="flex items-center justify-between rounded-lg bg-jeon-purple/10 px-2.5 py-1.5">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-jeon-purple">
                <IconWhatsapp className="h-3.5 w-3.5" /> {t("dashboard.pages.products.manageModal.notifyWhatsappActive")}
              </span>
              <button type="button" onClick={() => onOpenNotifyWhatsappForm(product)} className="text-[11px] font-bold text-jeon-purple hover:underline">
                {t("dashboard.pages.products.manageModal.change")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onOpenNotifyWhatsappForm(product)}
              className="flex items-center gap-1.5 rounded-lg border border-dashed border-app-border px-3 py-2 text-[11px] font-semibold text-app-muted hover:border-jeon-purple hover:text-jeon-purple"
            >
              <IconWhatsapp className="h-3.5 w-3.5" /> {t("dashboard.pages.products.manageModal.activateNotifyWhatsapp")}
            </button>
          )}

          {successMessageEditId === product.id ? (
            <div className="flex flex-col gap-2 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-app-ink">
                <IconTextLines className="h-3.5 w-3.5" /> {t("dashboard.pages.products.manageModal.customMessageLabel")}
              </p>
              <textarea
                placeholder={t("dashboard.pages.products.manageModal.customMessagePlaceholder")}
                value={successMessageDraft}
                onChange={(e) => onSuccessMessageDraftChange(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
              />
              <div className="flex gap-1.5">
                <button type="button" onClick={onCancelSuccessMessageEdit} className="flex-1 rounded-md border-2 border-jeon-ink py-1.5 text-[11px] font-bold text-app-muted">
                  {t("dashboard.pages.products.manageModal.cancel")}
                </button>
                <button
                  type="button"
                  disabled={savingSuccessMessage}
                  onClick={() => onSaveSuccessMessage(product)}
                  className="btn-primary flex-1 rounded-md py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
                >
                  {savingSuccessMessage ? t("dashboard.pages.products.manageModal.savingEllipsis") : t("dashboard.pages.products.manageModal.save")}
                </button>
              </div>
            </div>
          ) : product.success_message ? (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-jeon-purple/10 px-2.5 py-1.5">
              <span className="min-w-0 truncate text-[11px] font-semibold text-jeon-purple">{product.success_message}</span>
              <button
                type="button"
                onClick={() => onOpenSuccessMessageForm(product)}
                className="flex-shrink-0 text-[11px] font-bold text-jeon-purple hover:underline"
              >
                {t("dashboard.pages.products.manageModal.change")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onOpenSuccessMessageForm(product)}
              className="flex items-center gap-1.5 rounded-lg border border-dashed border-app-border px-3 py-2 text-[11px] font-semibold text-app-muted hover:border-jeon-purple hover:text-jeon-purple"
            >
              <IconTextLines className="h-3.5 w-3.5" /> {t("dashboard.pages.products.manageModal.setCustomMessage")}
            </button>
          )}

          <div className="flex items-center justify-between rounded-lg border border-app-border px-2.5 py-1.5">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-app-ink">
              <IconChart className="h-3.5 w-3.5" /> {t("dashboard.pages.products.manageModal.showSoldCountLabel")}
            </span>
            <button
              type="button"
              onClick={() => onToggleShowSoldCount(product)}
              aria-pressed={product.show_sold_count}
              className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors ${
                product.show_sold_count ? "bg-jeon-purple" : "bg-app-border"
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                  product.show_sold_count ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </div>

        <p className="mt-5 border-t border-app-border pt-3 text-[10px] font-extrabold uppercase tracking-wider text-app-muted">
          {t("dashboard.pages.products.manageModal.sectionDanger")}
        </p>
        <button
          type="button"
          onClick={() => onDelete(product)}
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
        >
          <IconTrash className="h-3.5 w-3.5" />
          {t("dashboard.pages.products.manageModal.deleteProduct")}
        </button>
      </div>
    </div>
  );
}
