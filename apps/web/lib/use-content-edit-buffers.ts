"use client";

import { useState } from "react";
import type { LinkItem } from "@/lib/api-client";
import { toDatetimeLocalValue } from "@/components/dashboard/page/ListItemsEditor";

// useContentEditBuffers -- buffer edit lokal panel "edit isi blok" untuk
// 10 tipe blok berbasis form (video/maps/text/accordion/project_showcase/
// button/countdown/embed/video_image/embed_link), SATU state per field yang
// dipakai BERGANTIAN oleh blok mana pun yang sedang terbuka.
//
// Audit 24 September 2026 (P4): 22 state + computeContentEditSnapshot/
// currentContentEditSnapshot + isi openContentEdit SEBELUMNYA disalin
// byte-per-byte di dashboard/links/page.tsx (halaman utama) DAN
// ProdukPageEditor.tsx (Toko) -- persis jenis duplikasi yang berulang kali
// membuat Toko tertinggal (mis. cek draft-belum-disimpan yang ditemukan 21
// Sept di halaman utama baru diporting ke Toko 22 Sept). Sekarang satu hook
// dipakai keduanya; nama state/setter dipertahankan PERSIS supaya JSX di
// kedua editor tidak berubah.
//
// contentEditSnapshot -- bug UI/UX ditemukan 21 September 2026: menutup
// panel (Kembali/Batal/klik blok lain) SEBELUMNYA membuang draft tanpa cek.
// Snapshot JSON dari nilai `link` saat panel dibuka dibandingkan ke buffer
// LIVE saat ditutup (isContentEditDirty). State (bukan ref) -- react-hooks/
// refs melarang fungsi biasa membaca `.current` lalu dipanggil dari JSX.
// null = tidak ada blok berbasis-buffer yang terbuka (tipe lain aman
// ditutup tanpa cek).

interface ContentEditValues {
  videoUrl: string;
  videoAutoplay: boolean;
  videoSource: "url" | "upload";
  mapsUrl: string;
  mapsEmbed: boolean;
  text: string;
  accordionText: string;
  showcaseUrl: string;
  showcaseDescription: string;
  showcaseBadge: string;
  showcaseCta: string;
  buttonUrl: string;
  buttonMode: "url" | "whatsapp";
  buttonWhatsappNumber: string;
  buttonWhatsappMessage: string;
  countdownTargetAt: string;
  countdownProductId: string;
  countdownCtaLabel: string;
  countdownCtaUrl: string;
  embedUrl: string;
  videoImageVideoUrl: string;
  embedLinkUrl: string;
  embedLinkDescription: string;
}

// computeContentEditSnapshot -- bentuk objek per tipe blok berbasis buffer,
// dipakai DUA arah: dari nilai `link` (snapshot "bersih" saat dibuka) dan
// dari buffer LIVE (saat ditutup). null utk tipe tanpa buffer.
function computeContentEditSnapshot(blockType: LinkItem["block_type"], v: ContentEditValues): Record<string, unknown> | null {
  switch (blockType) {
    case "video":
      return { videoUrl: v.videoUrl, videoAutoplay: v.videoAutoplay, videoSource: v.videoSource };
    case "maps":
      return { mapsUrl: v.mapsUrl, mapsEmbed: v.mapsEmbed };
    case "text":
      return { text: v.text };
    case "accordion":
      return { accordionText: v.accordionText };
    case "project_showcase":
      return { showcaseUrl: v.showcaseUrl, showcaseDescription: v.showcaseDescription, showcaseBadge: v.showcaseBadge, showcaseCta: v.showcaseCta };
    case "button":
      return { buttonUrl: v.buttonUrl, buttonMode: v.buttonMode, buttonWhatsappNumber: v.buttonWhatsappNumber, buttonWhatsappMessage: v.buttonWhatsappMessage };
    case "countdown":
      return { countdownTargetAt: v.countdownTargetAt, countdownProductId: v.countdownProductId, countdownCtaLabel: v.countdownCtaLabel, countdownCtaUrl: v.countdownCtaUrl };
    case "embed":
      return { embedUrl: v.embedUrl };
    case "video_image":
      return { videoImageVideoUrl: v.videoImageVideoUrl };
    case "embed_link":
      return { embedLinkUrl: v.embedLinkUrl, embedLinkDescription: v.embedLinkDescription };
    default:
      return null;
  }
}

function contentEditValuesFromLink(link: LinkItem): ContentEditValues {
  return {
    videoUrl: (link.block_data?.video_url as string) ?? "",
    // autoplay BAWAAN aktif -- hanya `false` eksplisit yang mematikan.
    videoAutoplay: link.block_data?.autoplay !== false,
    videoSource: link.block_data?.source === "upload" ? "upload" : "url",
    mapsUrl: link.url ?? "",
    mapsEmbed: Boolean(link.block_data?.embed),
    text: (link.block_data?.text as string) ?? "",
    accordionText: (link.block_data?.text as string) ?? "",
    showcaseUrl: link.url ?? "",
    showcaseDescription: link.description ?? "",
    showcaseBadge: (link.block_data?.badge_text as string) ?? "",
    showcaseCta: (link.block_data?.cta_text as string) ?? "",
    buttonUrl: link.url ?? "",
    buttonMode: (link.block_data?.whatsapp_number as string) ? "whatsapp" : "url",
    buttonWhatsappNumber: (link.block_data?.whatsapp_number as string) ?? "",
    buttonWhatsappMessage: (link.block_data?.whatsapp_message as string) ?? "",
    countdownTargetAt: toDatetimeLocalValue(link.block_data?.target_at as string | undefined),
    countdownProductId: (link.block_data?.product_id as string) ?? "",
    countdownCtaLabel: (link.block_data?.cta_label as string) ?? "",
    countdownCtaUrl: (link.block_data?.cta_url as string) ?? "",
    embedUrl: (link.block_data?.embed_url as string) ?? "",
    videoImageVideoUrl: (link.block_data?.video_url as string) ?? "",
    embedLinkUrl: link.url ?? "",
    embedLinkDescription: link.description ?? "",
  };
}

export function useContentEditBuffers() {
  const [contentEditSnapshot, setContentEditSnapshot] = useState<string | null>(null);
  const [editVideoUrl, setEditVideoUrl] = useState("");
  const [editVideoAutoplay, setEditVideoAutoplay] = useState(true);
  const [editVideoSource, setEditVideoSource] = useState<"url" | "upload">("url");
  const [editMapsUrl, setEditMapsUrl] = useState("");
  const [editMapsEmbed, setEditMapsEmbed] = useState(true);
  const [editText, setEditText] = useState("");
  const [editAccordionText, setEditAccordionText] = useState("");
  const [editShowcaseUrl, setEditShowcaseUrl] = useState("");
  const [editShowcaseDescription, setEditShowcaseDescription] = useState("");
  const [editShowcaseBadge, setEditShowcaseBadge] = useState("");
  const [editShowcaseCta, setEditShowcaseCta] = useState("");
  const [editButtonUrl, setEditButtonUrl] = useState("");
  const [editButtonMode, setEditButtonMode] = useState<"url" | "whatsapp">("url");
  const [editButtonWhatsappNumber, setEditButtonWhatsappNumber] = useState("");
  const [editButtonWhatsappMessage, setEditButtonWhatsappMessage] = useState("");
  const [editCountdownTargetAt, setEditCountdownTargetAt] = useState("");
  const [editCountdownProductId, setEditCountdownProductId] = useState("");
  const [editCountdownCtaLabel, setEditCountdownCtaLabel] = useState("");
  const [editCountdownCtaUrl, setEditCountdownCtaUrl] = useState("");
  const [editEmbedUrl, setEditEmbedUrl] = useState("");
  const [editVideoImageVideoUrl, setEditVideoImageVideoUrl] = useState("");
  const [editEmbedLinkUrl, setEditEmbedLinkUrl] = useState("");
  const [editEmbedLinkDescription, setEditEmbedLinkDescription] = useState("");

  // loadContentEditBuffers -- salin nilai `link` SAAT INI ke buffer (hanya
  // field milik tipenya) + simpan snapshot bersih. WAJIB dipanggil tiap
  // panel dibuka -- melewatinya menampilkan nilai BASI blok lain yang
  // terakhir dibuka (buffer dipakai bergantian).
  function loadContentEditBuffers(link: LinkItem) {
    const v = contentEditValuesFromLink(link);
    setContentEditSnapshot(JSON.stringify(computeContentEditSnapshot(link.block_type, v)));
    if (link.block_type === "video") {
      setEditVideoUrl(v.videoUrl);
      setEditVideoAutoplay(v.videoAutoplay);
      setEditVideoSource(v.videoSource);
    } else if (link.block_type === "maps") {
      setEditMapsUrl(v.mapsUrl);
      setEditMapsEmbed(v.mapsEmbed);
    } else if (link.block_type === "text") {
      setEditText(v.text);
    } else if (link.block_type === "accordion") {
      setEditAccordionText(v.accordionText);
    } else if (link.block_type === "project_showcase") {
      setEditShowcaseUrl(v.showcaseUrl);
      setEditShowcaseDescription(v.showcaseDescription);
      setEditShowcaseBadge(v.showcaseBadge);
      setEditShowcaseCta(v.showcaseCta);
    } else if (link.block_type === "button") {
      setEditButtonUrl(v.buttonUrl);
      setEditButtonMode(v.buttonMode);
      setEditButtonWhatsappNumber(v.buttonWhatsappNumber);
      setEditButtonWhatsappMessage(v.buttonWhatsappMessage);
    } else if (link.block_type === "countdown") {
      setEditCountdownTargetAt(v.countdownTargetAt);
      setEditCountdownProductId(v.countdownProductId);
      setEditCountdownCtaLabel(v.countdownCtaLabel);
      setEditCountdownCtaUrl(v.countdownCtaUrl);
    } else if (link.block_type === "embed") {
      setEditEmbedUrl(v.embedUrl);
    } else if (link.block_type === "video_image") {
      setEditVideoImageVideoUrl(v.videoImageVideoUrl);
    } else if (link.block_type === "embed_link") {
      setEditEmbedLinkUrl(v.embedLinkUrl);
      setEditEmbedLinkDescription(v.embedLinkDescription);
    }
  }

  // isContentEditDirty -- true kalau buffer LIVE beda dari snapshot saat
  // panel dibuka (pemanggil lalu minta konfirmasi buang draft).
  function isContentEditDirty(blockType: LinkItem["block_type"]): boolean {
    if (contentEditSnapshot === null) return false;
    const current = computeContentEditSnapshot(blockType, {
      videoUrl: editVideoUrl,
      videoAutoplay: editVideoAutoplay,
      videoSource: editVideoSource,
      mapsUrl: editMapsUrl,
      mapsEmbed: editMapsEmbed,
      text: editText,
      accordionText: editAccordionText,
      showcaseUrl: editShowcaseUrl,
      showcaseDescription: editShowcaseDescription,
      showcaseBadge: editShowcaseBadge,
      showcaseCta: editShowcaseCta,
      buttonUrl: editButtonUrl,
      buttonMode: editButtonMode,
      buttonWhatsappNumber: editButtonWhatsappNumber,
      buttonWhatsappMessage: editButtonWhatsappMessage,
      countdownTargetAt: editCountdownTargetAt,
      countdownProductId: editCountdownProductId,
      countdownCtaLabel: editCountdownCtaLabel,
      countdownCtaUrl: editCountdownCtaUrl,
      embedUrl: editEmbedUrl,
      videoImageVideoUrl: editVideoImageVideoUrl,
      embedLinkUrl: editEmbedLinkUrl,
      embedLinkDescription: editEmbedLinkDescription,
    });
    return JSON.stringify(current) !== contentEditSnapshot;
  }

  // clearContentEditSnapshot -- dipanggil saat panel ditutup (setelah
  // konfirmasi) atau sesudah Simpan berhasil.
  function clearContentEditSnapshot() {
    setContentEditSnapshot(null);
  }

  return {
    editVideoUrl, setEditVideoUrl,
    editVideoAutoplay, setEditVideoAutoplay,
    editVideoSource, setEditVideoSource,
    editMapsUrl, setEditMapsUrl,
    editMapsEmbed, setEditMapsEmbed,
    editText, setEditText,
    editAccordionText, setEditAccordionText,
    editShowcaseUrl, setEditShowcaseUrl,
    editShowcaseDescription, setEditShowcaseDescription,
    editShowcaseBadge, setEditShowcaseBadge,
    editShowcaseCta, setEditShowcaseCta,
    editButtonUrl, setEditButtonUrl,
    editButtonMode, setEditButtonMode,
    editButtonWhatsappNumber, setEditButtonWhatsappNumber,
    editButtonWhatsappMessage, setEditButtonWhatsappMessage,
    editCountdownTargetAt, setEditCountdownTargetAt,
    editCountdownProductId, setEditCountdownProductId,
    editCountdownCtaLabel, setEditCountdownCtaLabel,
    editCountdownCtaUrl, setEditCountdownCtaUrl,
    editEmbedUrl, setEditEmbedUrl,
    editVideoImageVideoUrl, setEditVideoImageVideoUrl,
    editEmbedLinkUrl, setEditEmbedLinkUrl,
    editEmbedLinkDescription, setEditEmbedLinkDescription,
    loadContentEditBuffers,
    isContentEditDirty,
    clearContentEditSnapshot,
  };
}
