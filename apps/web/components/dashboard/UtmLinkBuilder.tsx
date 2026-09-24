"use client";

import { useState } from "react";
import { useLocale } from "@/lib/locale-context";
import { IconCheck, IconCopy } from "@/components/icons";
import { copyText } from "@/lib/copy-text";

const INPUT = "w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20";

// UtmLinkBuilder -- permintaan langsung pengguna, 17 September 2026: "kerjakan
// buildernya" (susulan diskusi soal panel Admin > Sumber Trafik yang MEMBACA
// kunjungan ber-UTM, tapi tidak ada satu pun tempat di dashboard yang
// membantu kreator MEMBUAT link ber-UTM itu sendiri -- kreator sebelumnya
// harus mengetik `?utm_source=...` manual, atau pakai tool eksternal seperti
// Google Campaign URL Builder). Benchmark Linktree yang punya generator
// serupa tertanam langsung di panel analitik mereka sendiri -- alasannya:
// kreator generate link DI TEMPAT YANG SAMA dengan tempat nanti melihat
// hasilnya (halaman ini & panel Admin), dan penamaan source/medium jadi
// konsisten (menghindari "Facebook" vs "facebook" vs "FB" yang bikin data
// UTM di admin.go/analytics_events pecah jadi baris terpisah).
//
// SENGAJA murni klien (tanpa panggilan API/endpoint baru): parameter UTM
// cuma string yang ditempel ke query URL, tidak ada apa pun di sini yang
// perlu disimpan di server -- backend baru terlibat NANTI, saat link ini
// benar-benar diklik pengunjung (lihat getUtmParamsFromWindow/trackEvent di
// api-client.ts, sudah ada sebelum fitur ini).
export default function UtmLinkBuilder({ defaultUrl }: { defaultUrl: string }) {
  const { t } = useLocale();
  const [targetUrl, setTargetUrl] = useState(defaultUrl);
  const [source, setSource] = useState("");
  const [medium, setMedium] = useState("");
  const [campaign, setCampaign] = useState("");
  const [content, setContent] = useState("");
  const [term, setTerm] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [copied, setCopied] = useState(false);

  let generatedUrl = "";
  let urlError = false;
  const trimmedTarget = targetUrl.trim();
  if (trimmedTarget) {
    try {
      const url = new URL(trimmedTarget);
      if (source.trim()) url.searchParams.set("utm_source", source.trim());
      if (medium.trim()) url.searchParams.set("utm_medium", medium.trim());
      if (campaign.trim()) url.searchParams.set("utm_campaign", campaign.trim());
      if (content.trim()) url.searchParams.set("utm_content", content.trim());
      if (term.trim()) url.searchParams.set("utm_term", term.trim());
      generatedUrl = url.toString();
    } catch {
      urlError = true;
    }
  }

  function handleCopy() {
    if (!generatedUrl) return;
    copyText(generatedUrl).then((ok) => { if (!ok) return;
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="glass rounded-jlg p-5 shadow-card">
      <p className="text-sm font-bold text-app-ink">{t("dashboard.pages.analytics.utmBuilder.title")}</p>
      <p className="mt-0.5 text-xs text-app-muted">{t("dashboard.pages.analytics.utmBuilder.description")}</p>

      <label className="mb-1 mt-3 block text-xs font-semibold text-app-ink">{t("dashboard.pages.analytics.utmBuilder.targetLabel")}</label>
      <input type="text" value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} className={INPUT} />
      {urlError && <p className="mt-1 text-[11px] font-semibold text-red-600">{t("dashboard.pages.analytics.utmBuilder.targetInvalid")}</p>}

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.analytics.utmBuilder.sourceLabel")}</label>
          <input
            type="text"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder={t("dashboard.pages.analytics.utmBuilder.sourcePlaceholder")}
            className={INPUT}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.analytics.utmBuilder.mediumLabel")}</label>
          <input
            type="text"
            value={medium}
            onChange={(e) => setMedium(e.target.value)}
            placeholder={t("dashboard.pages.analytics.utmBuilder.mediumPlaceholder")}
            className={INPUT}
          />
        </div>
      </div>

      <label className="mb-1 mt-3 block text-xs font-semibold text-app-ink">{t("dashboard.pages.analytics.utmBuilder.campaignLabel")}</label>
      <input
        type="text"
        value={campaign}
        onChange={(e) => setCampaign(e.target.value)}
        placeholder={t("dashboard.pages.analytics.utmBuilder.campaignPlaceholder")}
        className={INPUT}
      />

      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        className="mt-3 text-[11px] font-bold text-jeon-purple hover:underline"
      >
        {t("dashboard.pages.analytics.utmBuilder.advancedToggle")}
      </button>
      {showAdvanced && (
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.analytics.utmBuilder.contentLabel")}</label>
            <input
              type="text"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t("dashboard.pages.analytics.utmBuilder.contentPlaceholder")}
              className={INPUT}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.analytics.utmBuilder.termLabel")}</label>
            <input
              type="text"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder={t("dashboard.pages.analytics.utmBuilder.termPlaceholder")}
              className={INPUT}
            />
          </div>
        </div>
      )}

      <label className="mb-1 mt-4 block text-xs font-semibold text-app-ink">{t("dashboard.pages.analytics.utmBuilder.resultLabel")}</label>
      <div className="flex gap-2">
        <input type="text" readOnly value={generatedUrl} className={`${INPUT} bg-app-surface-2 text-app-muted`} />
        <button
          type="button"
          onClick={handleCopy}
          disabled={!generatedUrl}
          title={t("dashboard.pages.analytics.utmBuilder.copyButton")}
          className="flex flex-shrink-0 items-center gap-1.5 rounded-lg border-2 border-jeon-ink px-3 py-2 text-xs font-bold text-app-ink hover:border-jeon-purple disabled:cursor-not-allowed disabled:opacity-40"
        >
          {copied ? <IconCheck className="h-3.5 w-3.5" /> : <IconCopy className="h-3.5 w-3.5" />}
          {copied ? t("dashboard.pages.analytics.utmBuilder.copiedLabel") : t("dashboard.pages.analytics.utmBuilder.copyButton")}
        </button>
      </div>
      {!source.trim() && <p className="mt-1.5 text-[11px] text-app-muted">{t("dashboard.pages.analytics.utmBuilder.fillHint")}</p>}
    </div>
  );
}
