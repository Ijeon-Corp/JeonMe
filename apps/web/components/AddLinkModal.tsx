"use client";

import {
  IconChevronRight,
  IconClose,
  IconFacebook,
  IconInstagram,
  IconLink,
  IconLinkedin,
  IconMail,
  IconSearch,
  IconSpotify,
  IconTelegram,
  IconTiktok,
  IconWhatsapp,
  IconX,
  IconYoutube,
} from "@/components/icons";
import { useLocale } from "@/lib/locale-context";
import type { AddCategory, ContentTile, PlatformQuickAdd } from "@/app/dashboard/links/page";
import { useModalA11y } from "@/lib/use-modal-a11y";

// AddLinkModal -- diangkat keluar dari links/page.tsx (laporan pengguna 3
// September 2026: audit Lighthouse dashboard, "Reduce unused JavaScript
// Est savings of 739 KiB"). links/page.tsx adalah salah satu halaman
// TERBERAT di dashboard (~3800 baris, lihat catatan di ManageProductModal.tsx
// untuk konteks race hydration serupa di halaman Produk) tapi jauh lebih
// sedikit dipecah lewat next/dynamic dibanding products/page.tsx -- modal
// "+ Tambah" ini (dipicu tombol tambah tautan/blok) SEBELUMNYA didefinisikan
// inline & dimuat EAGER meski cuma perlu tampil saat user benar-benar klik
// tombol tambah. contentTiles diterima sebagai PROP (dihitung sekali oleh
// pemanggil, yang juga memakainya sendiri di tempat lain) alih-alih dihitung
// ulang di sini, supaya modul ini tidak perlu meng-import balik seluruh
// daftar ikon block_type dari page.tsx.

const DISARANKAN_KEYS = ["instagram", "tiktok", "youtube", "whatsapp", "spotify"];

// badgeClass -- samakan persis dengan warna brand di lib/link-icons.ts
// (dipakai di daftar tautan & pratinjau publik) supaya modal ini pun
// menampilkan warna platform yang sama, bukan abu-abu netral generik.
// buildSuggestedPlatforms -- FUNGSI (bukan konstanta modul) supaya label/
// deskripsinya ikut berganti bahasa, pola sama seperti buildBlockTypeLabel
// (page.tsx).
function buildSuggestedPlatforms(t: (key: string) => string): PlatformQuickAdd[] {
  return [
    {
      key: "instagram",
      label: "Instagram",
      description: t("dashboard.pages.links.suggestedPlatforms.instagram"),
      Icon: IconInstagram,
      kind: "link",
      urlTemplate: "https://instagram.com/",
      badgeClass: "bg-gradient-to-br from-[#FEDA75] via-[#D62976] to-[#4F5BD5] text-white",
    },
    {
      key: "tiktok",
      label: "TikTok",
      description: t("dashboard.pages.links.suggestedPlatforms.tiktok"),
      Icon: IconTiktok,
      kind: "video",
      urlTemplate: "",
      badgeClass: "bg-black text-white",
    },
    {
      key: "youtube",
      label: "YouTube",
      description: t("dashboard.pages.links.suggestedPlatforms.youtube"),
      Icon: IconYoutube,
      kind: "video",
      urlTemplate: "",
      badgeClass: "bg-[#FF0000] text-white",
    },
    {
      key: "whatsapp",
      label: "WhatsApp",
      description: t("dashboard.pages.links.suggestedPlatforms.whatsapp"),
      Icon: IconWhatsapp,
      kind: "link",
      urlTemplate: "https://wa.me/62",
      badgeClass: "bg-[#25D366] text-white",
    },
    {
      key: "spotify",
      label: "Spotify",
      description: t("dashboard.pages.links.suggestedPlatforms.spotify"),
      Icon: IconSpotify,
      kind: "link",
      urlTemplate: "https://open.spotify.com/",
      badgeClass: "bg-[#1DB954] text-white",
    },
    {
      key: "telegram",
      label: "Telegram",
      description: t("dashboard.pages.links.suggestedPlatforms.telegram"),
      Icon: IconTelegram,
      kind: "link",
      urlTemplate: "https://t.me/",
      badgeClass: "bg-[#26A5E4] text-white",
    },
    {
      key: "x",
      label: "X (Twitter)",
      description: t("dashboard.pages.links.suggestedPlatforms.x"),
      Icon: IconX,
      kind: "link",
      urlTemplate: "https://x.com/",
      badgeClass: "bg-black text-white",
    },
    {
      key: "facebook",
      label: "Facebook",
      description: t("dashboard.pages.links.suggestedPlatforms.facebook"),
      Icon: IconFacebook,
      kind: "link",
      urlTemplate: "https://facebook.com/",
      badgeClass: "bg-[#1877F2] text-white",
    },
    {
      key: "linkedin",
      label: "LinkedIn",
      description: t("dashboard.pages.links.suggestedPlatforms.linkedin"),
      Icon: IconLinkedin,
      kind: "link",
      urlTemplate: "https://linkedin.com/in/",
      badgeClass: "bg-[#0A66C2] text-white",
    },
    {
      key: "email",
      label: "Email",
      description: t("dashboard.pages.links.suggestedPlatforms.email"),
      Icon: IconMail,
      kind: "link",
      urlTemplate: "mailto:",
      badgeClass: "bg-slate-600 text-white",
    },
  ];
}

function buildAddCategories(t: (key: string) => string): { key: AddCategory; label: string }[] {
  return [
    { key: "populer", label: t("dashboard.pages.links.addModal.categories.popular") },
    { key: "sosial", label: t("dashboard.pages.links.addModal.categories.social") },
    { key: "konten", label: t("dashboard.pages.links.addModal.categories.content") },
    { key: "lanjutan", label: t("dashboard.pages.links.addModal.categories.advanced") },
  ];
}

// Pemetaan tile per kategori v2 -- HANYA tipe blok yang benar-benar ada
// (§0.4: tidak mengarang blok Commerce baru; produk/donasi dirender
// otomatis di halaman publik, bukan blok manual).
const V2_TILE_KEYS: Record<string, string[]> = {
  // "link" -- bug ditemukan 8 September 2026 (sweep regresi e2e): spec
  // redesain (JEONID-DASHBOARD-REDESIGN-SPEC.md, "Popular: Link, Produk,
  // Video, Form, Appointment" -- Produk/Appointment memang sengaja tidak
  // ada, bukan blok manual) menaruh Link di kategori Populer, tapi tidak
  // pernah benar-benar ditambahkan ke sini -- tautan biasa (blank link
  // manual, bukan tempel URL) jadi TIDAK BISA dibuat sama sekali lewat
  // grid tile di v2, cuma lewat kotak "Tempel atau cari tautan" (perlu
  // URL sudah ada duluan).
  populer: ["link", "video", "contact_form", "faq"],
  konten: ["text", "accordion", "maps", "gallery", "audio", "file", "faq", "video"],
  // 9 tipe blok "full parity" mode Builder (permintaan langsung pengguna 12
  // September 2026) -- masuk "Lanjutan", sama seperti project_showcase/
  // catalog yang sudah ada.
  lanjutan: [
    "project_showcase",
    "catalog",
    "button",
    "image",
    "video_image",
    "image_slider",
    "list",
    "countdown",
    "produk",
    "embed_link",
    "embed",
  ],
  sosial: [],
};

function isUrlLike(value: string): boolean {
  return /^https?:\/\/\S+\.\S+/i.test(value.trim());
}

export default function AddLinkModal({
  category,
  onCategoryChange,
  search,
  onSearchChange,
  onClose,
  onSelectPlatform,
  onSelectContentTile,
  onQuickPasteLink,
  contentTiles,
}: {
  category: AddCategory;
  onCategoryChange: (c: AddCategory) => void;
  search: string;
  onSearchChange: (v: string) => void;
  onClose: () => void;
  onSelectPlatform: (p: PlatformQuickAdd) => void;
  onSelectContentTile: (t: ContentTile) => void;
  onQuickPasteLink: (url: string) => void;
  contentTiles: ContentTile[];
}) {
  // useModalA11y -- 24 September 2026 (audit aksesibilitas): Escape
  // sebelumnya tidak menutup modal ini, fokus tidak dikurung (lolos ke
  // balik scrim setelah belasan Tab), dan fokus tidak kembali ke pemicu.
  // Komponen ini hanya di-mount saat terbuka, jadi open cukup true --
  // cleanup saat unmount yang mengembalikan fokus. Lihat
  // lib/use-modal-a11y.ts.
  const modalRef = useModalA11y(true, onClose);
  const { t } = useLocale();
  // Kategori Populer/Sosial/Konten/Lanjutan + grid tile per kategori
  // (SPEC §10.5).
  const addCategories = buildAddCategories(t);
  const suggestedPlatforms = buildSuggestedPlatforms(t);
  const searchLower = search.trim().toLowerCase();
  const pastedUrl = isUrlLike(search);

  const gridTiles = contentTiles.filter((tile) => (V2_TILE_KEYS[category] ?? []).includes(tile.key));

  const contentRows = searchLower ? contentTiles.filter((tile) => tile.label.toLowerCase().includes(searchLower)) : [];

  const platformRows = searchLower
    ? suggestedPlatforms.filter((p) => p.label.toLowerCase().includes(searchLower))
    : category === "sosial"
      ? suggestedPlatforms
      : category === "populer"
        ? suggestedPlatforms.filter((p) => DISARANKAN_KEYS.includes(p.key))
        : [];

  const sectionLabel = searchLower
    ? t("dashboard.pages.links.addModal.searchResults")
    : (addCategories.find((c) => c.key === category)?.label ?? "");

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-8 sm:items-center" onClick={onClose}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Tambah blok" className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-jlg border-2 border-jeon-ink bg-app-surface shadow-brutal" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-shrink-0 items-center justify-between border-b border-app-border px-5 py-4">
          <h2 className="font-display text-lg font-bold text-app-ink">{t("dashboard.pages.links.addModal.title")}</h2>
          <button type="button" onClick={onClose} className="text-app-muted hover:text-app-ink">
            <IconClose className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-shrink-0 border-b border-app-border px-5 py-3">
          <div className="flex items-center gap-2 rounded-full bg-gray-100 px-4 py-2.5">
            <IconSearch className="h-4 w-4 flex-shrink-0 text-app-muted" />
            <input
              type="text"
              autoFocus
              placeholder={t("dashboard.pages.links.addModal.searchPlaceholder")}
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {pastedUrl && (
            <button
              type="button"
              onClick={() => onQuickPasteLink(search.trim())}
              className="mb-3 flex w-full items-center gap-3 rounded-xl border border-jeon-purple/30 bg-jeon-purple/5 p-3 text-left hover:bg-jeon-purple/5"
            >
              <IconLink className="h-5 w-5 flex-shrink-0 text-jeon-purple" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-app-ink">{t("dashboard.pages.links.addModal.addThisLink")}</p>
                <p className="truncate text-xs text-app-muted">{search.trim()}</p>
              </div>
            </button>
          )}

          {!searchLower && (
            <>
              <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
                {addCategories.map((cat) => (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => onCategoryChange(cat.key)}
                    className={`flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
                      category === cat.key ? "bg-jeon-sidebar text-white" : "bg-gray-100 text-app-muted hover:bg-gray-200"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="mb-4 grid grid-cols-4 gap-2">
                {gridTiles.map((tile) => (
                  <button
                    key={tile.key}
                    type="button"
                    onClick={() => onSelectContentTile(tile)}
                    className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-jeon-ink p-2.5 hover:border-jeon-purple/50"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-jmd bg-jeon-lavender text-[#111111]">
                      <tile.Icon className="h-5 w-5" />
                    </span>
                    <span className="text-center text-[11px] font-semibold text-app-ink">{tile.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {(contentRows.length > 0 || platformRows.length > 0) && (
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-app-muted">{sectionLabel}</p>
          )}

          <div className="flex flex-col gap-1">
            {contentRows.map((tile) => (
              <button
                key={tile.key}
                type="button"
                onClick={() => onSelectContentTile(tile)}
                className="flex items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-app-surface-2"
              >
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-jmd bg-jeon-lavender text-[#111111]">
                  <tile.Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-app-ink">{tile.label}</p>
                  <p className="truncate text-xs text-app-muted">{tile.description}</p>
                </div>
                <IconChevronRight className="h-4 w-4 flex-shrink-0 text-app-muted" />
              </button>
            ))}

            {platformRows.map((platform) => (
              <button
                key={platform.key}
                type="button"
                onClick={() => onSelectPlatform(platform)}
                className="flex items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-app-surface-2"
              >
                <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${platform.badgeClass}`}>
                  <platform.Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-app-ink">{platform.label}</p>
                  <p className="truncate text-xs text-app-muted">{platform.description}</p>
                </div>
                <IconChevronRight className="h-4 w-4 flex-shrink-0 text-app-muted" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
