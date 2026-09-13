"use client";

import { useState } from "react";
import {
  ApiError,
  DashboardProduct,
  createProduct,
  listProducts,
  updateProduct,
  uploadProductCover,
} from "@/lib/api-client";
import { IconCamera, IconExternal, IconUpload, IconWallet } from "@/components/icons";
import { useLocale } from "@/lib/locale-context";

// CreateProductForm.tsx -- diekstrak APA ADANYA dari `app/dashboard/products/page.tsx`
// (state `addMode`/`name`/`priceIDR`/`category`/`coverFile`/`creating`/
// `successMessage`/`paymentLimitCount`/`linkExpiresAt`/`externalUrl`, 3
// handler create, JSX panel "Add Items" + 3 form) -- permintaan langsung
// pengguna 10 September 2026 ("harusnya ada blok produk... isinya sama
// seperti mengisi di menu product"): blok "Produk" BARU di Canvas Page
// Builder butuh alur "Buat Produk Baru" YANG SAMA PERSIS dengan menu
// Produk dashboard, TANPA duplikasi kode -- badan/logic form di sini
// SAMA PERSIS dengan versi lama, cuma dipisah jadi komponen presentasional
// murni supaya bisa dipakai ULANG di 2 tempat:
//   1. `dashboard/products/page.tsx` -- inline PERSIS di posisi lama
//      (visual TIDAK berubah).
//   2. Panel builder (`BuilderLeftPanel.tsx`, blok "produk") -- dibungkus
//      modal overlay baru di titik pemanggilan (pola sama
//      `ManageProductModal.tsx`), komponen INI SENDIRI tidak tahu/peduli
//      dibungkus modal atau tidak.
//
// SENGAJA TIDAK punya state "closed" sendiri (beda dari `addMode` versi
// lama yang termasuk "closed") -- komponen ini SELALU mulai di langkah
// "choose" begitu di-mount, pemanggil yang memutuskan KAPAN me-mount/
// unmount (page.tsx via tombol "+ Tambah Produk" + boolean lokal, builder
// via buka/tutup modal) -- reset ke "choose" jadi otomatis lewat remount,
// tidak perlu direset manual.
//
// `onError` WAJIB diisi pemanggil (BUKAN state error internal + tampilan
// bawaan) -- page.tsx meneruskan `setError`-nya sendiri (toast yang sudah
// ada via `useErrorToast`, visual TIDAK berubah), builder meneruskan error
// lokalnya sendiri (tampil inline, pola sama editor blok lain).
export type CreateProductMode = "choose" | "digital" | "payment_link" | "external_link";

function renderCoverPicker(coverFile: File | null, setCoverFile: (f: File | null) => void, t: (key: string) => string) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-app-border px-3.5 py-2.5 text-xs font-semibold text-app-muted hover:border-jeon-purple hover:text-jeon-purple">
      <IconCamera className="h-4 w-4 flex-shrink-0" />
      <span className="min-w-0 truncate">{coverFile ? coverFile.name : t("dashboard.pages.products.coverPicker.placeholder")}</span>
      <input
        type="file"
        required
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
      />
    </label>
  );
}

const NEW_CATEGORY_VALUE = "__new__";
const CATEGORY_FIELD_CLASSNAME =
  "w-full rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20";

// CategoryField -- permintaan langsung pengguna, 13 September 2026 ("jika
// creator sudah pernah membuat category produk tampil drop down untuk
// memilih category produk selanjutnya"): begitu kreator PUNYA >=1 kategori
// dari produk sebelumnya, field ini defaultnya jadi <select> (bukan lagi
// input teks bebas) supaya penamaan kategori konsisten antar produk (mis.
// tidak ada "Ebook"/"ebook"/"E-book" jadi 3 kategori terpisah gara-gara
// typo). Tetap ada jalan keluar bikin kategori BARU lewat opsi
// "+ Kategori baru" di dropdown -- balik ke input teks biasa -- supaya
// kreator tidak pernah terkunci cuma bisa pilih dari yang sudah ada.
// Kreator TANPA kategori sama sekali (produk pertama) tetap dapat input
// teks polos apa adanya, tidak ada apa pun utk dipilih.
function CategoryField({
  value,
  onChange,
  categories,
  placeholder,
  wrapperClassName,
  t,
}: {
  value: string;
  onChange: (v: string) => void;
  categories: string[];
  placeholder: string;
  wrapperClassName: string;
  t: (key: string) => string;
}) {
  const [addingNew, setAddingNew] = useState(categories.length === 0);

  if (categories.length > 0 && !addingNew) {
    return (
      <div className={wrapperClassName}>
        <select
          value={categories.includes(value) ? value : ""}
          onChange={(e) => {
            if (e.target.value === NEW_CATEGORY_VALUE) {
              setAddingNew(true);
              onChange("");
            } else {
              onChange(e.target.value);
            }
          }}
          className={CATEGORY_FIELD_CLASSNAME}
        >
          <option value="">{placeholder}</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          <option value={NEW_CATEGORY_VALUE}>{t("dashboard.pages.products.form.newCategoryOption")}</option>
        </select>
      </div>
    );
  }

  return (
    <div className={wrapperClassName}>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={CATEGORY_FIELD_CLASSNAME}
      />
      {categories.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setAddingNew(false);
            onChange("");
          }}
          className="mt-1 text-[10px] font-semibold text-jeon-purple hover:underline"
        >
          {t("dashboard.pages.products.form.backToCategoryList")}
        </button>
      )}
    </div>
  );
}

export default function CreateProductForm({
  categories,
  onCreated,
  onCancel,
  onError,
}: {
  // categories -- daftar kategori UNIK milik kreator ini (dihitung
  // pemanggil dari produk yang sudah ada, lihat CategoryField di atas).
  categories: string[];
  onCreated: (product: DashboardProduct) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const { t } = useLocale();
  const [mode, setMode] = useState<CreateProductMode>("choose");
  const [name, setName] = useState("");
  const [priceIDR, setPriceIDR] = useState("");
  const [category, setCategory] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [paymentLimitCount, setPaymentLimitCount] = useState("");
  const [linkExpiresAt, setLinkExpiresAt] = useState("");
  const [externalUrl, setExternalUrl] = useState("");

  // findCreated -- createProduct cuma balas {id, message} (bukan objek
  // produk lengkap) -- pola SAMA PERSIS versi lama: listProducts() ulang,
  // cari yang baru dibuat by id, supaya onCreated dapat DashboardProduct
  // utuh (cover_image_url/is_active/dst yang benar-benar tersimpan).
  async function findCreated(id: string): Promise<DashboardProduct> {
    const all = await listProducts();
    const created = all.find((p) => p.id === id);
    if (!created) throw new Error("produk baru tidak ditemukan setelah dibuat");
    return created;
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const price = Number(priceIDR);
    if (!name.trim() || !price || price < 1000) {
      onError(t("dashboard.pages.products.errors.nameAndPriceRequired"));
      return;
    }
    if (!coverFile) {
      onError(t("dashboard.pages.products.errors.coverRequired"));
      return;
    }
    setCreating(true);
    try {
      const { id } = await createProduct({ name, price_idr: price, category: category.trim() || undefined });
      // Sampul WAJIB (permintaan langsung pengguna, 19 Agustus 2026) --
      // diunggah LANGSUNG setelah produk dibuat. Produk digital MASIH
      // perlu unggah File Produk & aktivasi manual terpisah seperti
      // sebelumnya (tidak berubah) -- sampul cuma satu syarat TAMBAHAN.
      await uploadProductCover(id, coverFile);
      onCreated(await findCreated(id));
    } catch (err) {
      onError(err instanceof ApiError ? err.message : t("dashboard.pages.products.errors.createProduct"));
    } finally {
      setCreating(false);
    }
  }

  // handleCreatePaymentLink -- link_expires_at dikirim sbg ISO (RFC3339)
  // dari <input type="datetime-local">, yang TIDAK menyertakan zona waktu
  // -- new Date(...).toISOString() mengasumsikan waktu lokal browser.
  async function handleCreatePaymentLink(e: React.FormEvent) {
    e.preventDefault();
    const price = Number(priceIDR);
    if (!name.trim() || !price || price < 1000) {
      onError(t("dashboard.pages.products.errors.nameAndPriceRequiredShort"));
      return;
    }
    if (!coverFile) {
      onError(t("dashboard.pages.products.errors.coverRequired"));
      return;
    }
    setCreating(true);
    try {
      const { id } = await createProduct({
        name,
        price_idr: price,
        category: category.trim() || undefined,
        product_kind: "payment_link",
        success_message: successMessage.trim() || undefined,
        payment_limit_count: paymentLimitCount ? Number(paymentLimitCount) : undefined,
        link_expires_at: linkExpiresAt ? new Date(linkExpiresAt).toISOString() : undefined,
      });
      // Payment Link TIDAK aktif otomatis begitu dibuat (lihat product.go
      // Create) -- aktivasi eksplisit di sini SETELAH sampul terunggah
      // supaya "langsung jadi" tetap terasa sama dari sisi kreator.
      await uploadProductCover(id, coverFile);
      await updateProduct(id, { is_active: true });
      onCreated(await findCreated(id));
    } catch (err) {
      onError(err instanceof ApiError ? err.message : t("dashboard.pages.products.errors.createPaymentLink"));
    } finally {
      setCreating(false);
    }
  }

  // handleCreateExternalLink -- diaktifkan otomatis setelah sampul
  // terunggah (pola sama Payment Link di atas).
  async function handleCreateExternalLink(e: React.FormEvent) {
    e.preventDefault();
    // Harga OPSIONAL khusus jenis ini (permintaan langsung pengguna, 20
    // Agustus 2026) -- link afiliasi tidak pernah lewat checkout Jeonme,
    // harga di sini murni informasi tampilan. Kalau diisi, tetap >= Rp1.000.
    const priceTrimmed = priceIDR.trim();
    const price = priceTrimmed ? Number(priceTrimmed) : undefined;
    if (!name.trim()) {
      onError(t("dashboard.pages.products.errors.nameRequired"));
      return;
    }
    if (price !== undefined && price < 1000) {
      onError(t("dashboard.pages.products.errors.priceOptionalMin"));
      return;
    }
    if (!externalUrl.trim()) {
      onError(t("dashboard.pages.products.errors.productUrlRequired"));
      return;
    }
    if (!coverFile) {
      onError(t("dashboard.pages.products.errors.coverRequired"));
      return;
    }
    setCreating(true);
    try {
      const { id } = await createProduct({
        name,
        price_idr: price,
        category: category.trim() || undefined,
        product_kind: "external_link",
        external_url: externalUrl.trim(),
      });
      await uploadProductCover(id, coverFile);
      await updateProduct(id, { is_active: true });
      onCreated(await findCreated(id));
    } catch (err) {
      onError(err instanceof ApiError ? err.message : t("dashboard.pages.products.errors.createExternalLink"));
    } finally {
      setCreating(false);
    }
  }

  if (mode === "choose") {
    return (
      <div className="glass mt-3 grid grid-cols-1 gap-2.5 rounded-jlg p-4 shadow-card sm:grid-cols-3">
        <p className="text-[10px] font-extrabold uppercase tracking-wider text-jeon-purple sm:col-span-3">
          {t("dashboard.pages.products.createStep1")}
        </p>
        {/* min-w-0 -- bug dilaporkan pengguna 13 September 2026 ("pop up
            create produk tidak responsif data teks melewati batas"): tile
            ini anak grid (sm:grid-cols-3), yang defaultnya min-width:auto
            menolak menyusut di bawah ukuran KONTEN (pola overflow berulang
            di repo ini, lihat CLAUDE.md). Deskripsi Link Eksternal juga
            punya frasa tanpa spasi ("Shopee/Tokopedia/toko") yang browser
            tidak mau patahkan di tengah tanpa break-words -- keduanya
            perlu diperbaiki bersamaan supaya teks benar-benar berhenti di
            dalam kartu, bukan cuma di layar lebar yang kebetulan cukup. */}
        <button
          type="button"
          onClick={() => setMode("digital")}
          className="flex min-w-0 flex-col items-start gap-1 rounded-xl border-2 border-jeon-ink p-3.5 text-left hover:border-jeon-purple"
        >
          <IconUpload className="h-5 w-5 text-jeon-purple" />
          <span className="text-sm font-bold text-app-ink">{t("dashboard.pages.products.addChoose.digitalTitle")}</span>
          <span className="break-words text-[11px] text-app-muted">{t("dashboard.pages.products.addChoose.digitalDesc")}</span>
        </button>
        <button
          type="button"
          onClick={() => setMode("payment_link")}
          className="flex min-w-0 flex-col items-start gap-1 rounded-xl border-2 border-jeon-ink p-3.5 text-left hover:border-jeon-purple"
        >
          <IconWallet className="h-5 w-5 text-jeon-purple" />
          <span className="text-sm font-bold text-app-ink">{t("dashboard.pages.products.addChoose.paymentLinkTitle")}</span>
          <span className="break-words text-[11px] text-app-muted">{t("dashboard.pages.products.addChoose.paymentLinkDesc")}</span>
        </button>
        <button
          type="button"
          onClick={() => setMode("external_link")}
          className="flex min-w-0 flex-col items-start gap-1 rounded-xl border-2 border-jeon-ink p-3.5 text-left hover:border-jeon-purple"
        >
          <IconExternal className="h-5 w-5 text-jeon-purple" />
          <span className="text-sm font-bold text-app-ink">{t("dashboard.pages.products.addChoose.externalLinkTitle")}</span>
          <span className="break-words text-[11px] text-app-muted">{t("dashboard.pages.products.addChoose.externalLinkDesc")}</span>
        </button>
      </div>
    );
  }

  if (mode === "digital") {
    return (
      <form onSubmit={handleCreate} className="glass mt-3 flex flex-col gap-2 rounded-jlg p-4 shadow-card">
        <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-jeon-purple">{t("dashboard.pages.products.createStep2")}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            autoFocus
            required
            placeholder={t("dashboard.pages.products.form.namePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
          />
          <input
            type="number"
            required
            placeholder={t("dashboard.pages.products.form.pricePlaceholder")}
            min={1000}
            value={priceIDR}
            onChange={(e) => setPriceIDR(e.target.value)}
            className="flex-1 rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
          />
          <CategoryField
            value={category}
            onChange={setCategory}
            categories={categories}
            placeholder={t("dashboard.pages.products.form.categoryPlaceholder")}
            wrapperClassName="flex-1"
            t={t}
          />
        </div>
        {renderCoverPicker(coverFile, setCoverFile, t)}
        <div className="flex gap-2">
          <button type="submit" disabled={creating} className="btn-primary rounded-lg px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">
            {creating ? t("dashboard.pages.products.form.creating") : t("dashboard.pages.products.form.create")}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border-2 border-jeon-ink px-4 py-2.5 text-sm font-bold text-app-muted hover:border-ink/30"
          >
            {t("dashboard.pages.products.form.cancel")}
          </button>
        </div>
      </form>
    );
  }

  if (mode === "payment_link") {
    return (
      <form onSubmit={handleCreatePaymentLink} className="glass mt-3 flex flex-col gap-2 rounded-jlg p-4 shadow-card">
        <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-jeon-purple">{t("dashboard.pages.products.createStep2")}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            autoFocus
            required
            placeholder={t("dashboard.pages.products.form.titlePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
          />
          <input
            type="number"
            required
            placeholder={t("dashboard.pages.products.form.pricePlaceholder")}
            min={1000}
            value={priceIDR}
            onChange={(e) => setPriceIDR(e.target.value)}
            className="flex-1 rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
          />
        </div>
        <textarea
          placeholder={t("dashboard.pages.products.form.successMessagePlaceholder")}
          value={successMessage}
          onChange={(e) => setSuccessMessage(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="number"
            min={1}
            placeholder={t("dashboard.pages.products.form.paymentLimitPlaceholder")}
            value={paymentLimitCount}
            onChange={(e) => setPaymentLimitCount(e.target.value)}
            className="flex-1 rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
          />
          <input
            type="datetime-local"
            value={linkExpiresAt}
            onChange={(e) => setLinkExpiresAt(e.target.value)}
            title={t("dashboard.pages.products.form.linkExpiresTitle")}
            className="flex-1 rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
          />
        </div>
        {renderCoverPicker(coverFile, setCoverFile, t)}
        <div className="flex gap-2">
          <button type="submit" disabled={creating} className="btn-primary rounded-lg px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">
            {creating ? t("dashboard.pages.products.form.creating") : t("dashboard.pages.products.form.createPaymentLink")}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border-2 border-jeon-ink px-4 py-2.5 text-sm font-bold text-app-muted hover:border-ink/30"
          >
            {t("dashboard.pages.products.form.cancel")}
          </button>
        </div>
      </form>
    );
  }

  // mode === "external_link"
  return (
    <form onSubmit={handleCreateExternalLink} className="glass mt-3 flex flex-col gap-2 rounded-jlg p-4 shadow-card">
      <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-jeon-purple">{t("dashboard.pages.products.createStep2")}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          autoFocus
          required
          placeholder={t("dashboard.pages.products.form.namePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
        />
        <input
          type="number"
          placeholder={t("dashboard.pages.products.form.priceOptionalPlaceholder")}
          min={1000}
          value={priceIDR}
          onChange={(e) => setPriceIDR(e.target.value)}
          className="flex-1 rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
        />
      </div>
      <input
        type="url"
        required
        placeholder={t("dashboard.pages.products.form.externalUrlPlaceholder")}
        value={externalUrl}
        onChange={(e) => setExternalUrl(e.target.value)}
        className="w-full rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
      />
      <CategoryField
        value={category}
        onChange={setCategory}
        categories={categories}
        placeholder={t("dashboard.pages.products.form.categoryPlaceholder")}
        wrapperClassName="w-full"
        t={t}
      />
      {renderCoverPicker(coverFile, setCoverFile, t)}
      <div className="flex gap-2">
        <button type="submit" disabled={creating} className="btn-primary rounded-lg px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">
          {creating ? t("dashboard.pages.products.form.creating") : t("dashboard.pages.products.form.createProductButton")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border-2 border-jeon-ink px-4 py-2.5 text-sm font-bold text-app-muted hover:border-ink/30"
        >
          {t("dashboard.pages.products.form.cancel")}
        </button>
      </div>
    </form>
  );
}
