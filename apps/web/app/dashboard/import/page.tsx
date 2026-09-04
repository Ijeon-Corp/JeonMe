"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  ImportAnalyzeResult,
  LinkItem,
  MyPage,
  analyzeImportSource,
  createLink,
  deleteLink,
  getMyPage,
  listLinks,
  updateMyPage,
} from "@/lib/api-client";
import { toPreviewData } from "@/lib/page-preview-data";
import { IconCheck, IconSparkle, IconUpload } from "@/components/icons";
import { useLocale } from "@/lib/locale-context";
import { useErrorToast } from "@/lib/use-error-toast";

// PagePreview.tsx -- lihat catatan di components/LivePreviewPanel.tsx,
// di-dynamic-import supaya bundle awal halaman ini lebih kecil.
const PagePreview = dynamic(() => import("@/components/PagePreview"));

type Step = "input" | "preview" | "generating";

const maxScreenshotBytes = 8 * 1024 * 1024;

// DashboardImportPage -- permintaan langsung pengguna, 31 Agustus 2026:
// "bisa ga buat fungsi... membuat bentuk visual persis seperti foto yang
// diunggah dan juga bisa mengambil seluruh link". Generate halaman dari
// screenshot (dicocokkan ke tema Jeon.id lewat Claude vision, backend
// handlers.ImportHandler) + URL (di-scrape link-nya). Fitur Premium-only
// (dicek ulang server-side, lihat catatan gating di ImportHandler.Analyze)
// -- gate di sini murni UX, bukan satu-satunya penegakan.
export default function DashboardImportPage() {
  const router = useRouter();
  const { t } = useLocale();

  const [myPage, setMyPage] = useState<MyPage | null>(null);
  const [pageLoadError, setPageLoadError] = useState<string | null>(null);

  const [step, setStep] = useState<Step>("input");
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreviewUrl, setScreenshotPreviewUrl] = useState("");
  const [url, setUrl] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  useErrorToast(analyzeError);

  const [result, setResult] = useState<ImportAnalyzeResult | null>(null);
  const [checkedLinks, setCheckedLinks] = useState<boolean[]>([]);
  const [existingLinks, setExistingLinks] = useState<LinkItem[]>([]);

  const [applying, setApplying] = useState(false);
  const [applySuccess, setApplySuccess] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  useErrorToast(applyError);

  useEffect(() => {
    getMyPage()
      .then(setMyPage)
      .catch((err) => setPageLoadError(err instanceof ApiError ? err.message : t("dashboard.pages.import.pageLoadError")));
  }, []);

  useEffect(() => {
    if (!applySuccess) return;
    const timer = setTimeout(() => router.push("/dashboard/links"), 1500);
    return () => clearTimeout(timer);
  }, [applySuccess, router]);

  function handleScreenshotChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (file && file.size > maxScreenshotBytes) {
      setAnalyzeError(t("dashboard.pages.import.screenshotTooLarge"));
      return;
    }
    setAnalyzeError(null);
    setScreenshotFile(file);
    setScreenshotPreviewUrl(file ? URL.createObjectURL(file) : "");
  }

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) {
      setAnalyzeError(t("dashboard.pages.import.urlRequired"));
      return;
    }
    setAnalyzeError(null);
    setAnalyzing(true);
    try {
      const [res, links] = await Promise.all([analyzeImportSource(screenshotFile, url.trim()), listLinks()]);
      setResult(res);
      setCheckedLinks(res.links.map(() => true));
      setExistingLinks(links);
      setStep("preview");
    } catch (err) {
      setAnalyzeError(err instanceof ApiError ? err.message : t("dashboard.pages.import.analyzeError"));
    } finally {
      setAnalyzing(false);
    }
  }

  function toggleLink(index: number) {
    setCheckedLinks((prev) => prev.map((v, i) => (i === index ? !v : v)));
  }

  async function handleApply(mode: "add" | "replace") {
    if (!result) return;
    setApplyError(null);
    setApplying(true);
    setStep("generating");
    try {
      if (result.theme) {
        const theme = result.theme;
        const customPatch = theme.custom
          ? {
              custom_background_type: theme.custom.background_type,
              custom_background_value: theme.custom.background_value,
              custom_font: theme.custom.font as MyPage["custom_font"],
              custom_button_color: theme.custom.button_color,
              custom_button_style: theme.custom.button_style as MyPage["custom_button_style"],
              custom_button_rounded: theme.custom.button_rounded as MyPage["custom_button_rounded"],
              custom_button_text_color: theme.custom.button_text_color,
              custom_page_text_color: theme.custom.page_text_color,
              custom_title_color: theme.custom.title_color,
              custom_style_override: true,
            }
          : {};
        await updateMyPage({ theme: theme.theme, layout_variant: theme.layout_variant, ...customPatch });
      }

      if (mode === "replace") {
        for (const l of existingLinks) {
          await deleteLink(l.id);
        }
      }

      // Sequential (bukan Promise.all) -- posisi tautan dihitung server-side
      // dari MAX(position)+1 tiap insert, sama alasan applyTemplate di
      // quick-setup/page.tsx.
      const toCreate = result.links.filter((_, i) => checkedLinks[i]);
      for (const l of toCreate) {
        await createLink({ title: l.title, url: l.url });
      }

      setApplySuccess(true);
    } catch (err) {
      setApplyError(err instanceof ApiError ? err.message : t("dashboard.pages.import.applyError"));
    } finally {
      setApplying(false);
    }
  }

  if (pageLoadError) {
    return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{pageLoadError}</p>;
  }
  if (!myPage) {
    return <div className="h-40 animate-pulse rounded-jmd bg-app-surface-2" />;
  }

  if (!myPage.is_premium) {
    return (
      <div className="glass mx-auto mt-8 flex max-w-md flex-col items-center gap-3 rounded-jlg p-8 text-center shadow-card">
        <span className="flex h-12 w-12 items-center justify-center rounded-jmd border-2 border-[#111111] bg-jeon-lavender text-[#111111]">
          <IconSparkle className="h-6 w-6" />
        </span>
        <p className="font-display text-lg font-bold text-app-ink">{t("dashboard.pages.import.premiumOnlyNote")}</p>
        <button
          type="button"
          onClick={() => router.push("/dashboard/settings/subscription")}
          className="mt-2 rounded-full btn-primary px-5 py-2.5 text-sm font-bold text-white"
        >
          {t("dashboard.pages.import.upgradeButton")}
        </button>
      </div>
    );
  }

  if (step === "generating") {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center py-16 text-center">
        {!applySuccess ? (
          <>
            <span className="h-10 w-10 animate-spin rounded-full border-4 border-jeon-purple-subtle border-t-primary" aria-hidden />
            <p className="mt-4 font-display text-lg font-bold text-app-ink">{t("dashboard.pages.import.generatingTitle")}</p>
            <p className="mt-1 text-sm text-app-muted">{t("dashboard.pages.import.generatingDesc")}</p>
          </>
        ) : (
          <>
            <span className="flex h-14 w-14 items-center justify-center rounded-jmd border-2 border-[#111111] bg-jeon-lavender text-[#111111]">
              <IconCheck className="h-6 w-6" />
            </span>
            <p className="mt-4 font-display text-lg font-bold text-app-ink">{t("dashboard.pages.import.successTitle")}</p>
            <p className="mt-1 text-sm text-app-muted">{t("dashboard.pages.import.successDesc")}</p>
          </>
        )}
        {applyError && (
          <button type="button" onClick={() => setStep("preview")} className="mt-3 text-sm font-semibold text-jeon-purple hover:underline">
            {t("dashboard.pages.import.backButton")}
          </button>
        )}
      </div>
    );
  }

  if (step === "preview" && result) {
    const hasTheme = !!result.theme;
    const checkedCount = checkedLinks.filter(Boolean).length;
    const hasLinks = checkedCount > 0;

    const previewData = toPreviewData(
      {
        ...myPage,
        is_verified: myPage.verification.is_verified,
        ...(hasTheme && result.theme
          ? {
              theme: result.theme.theme,
              layout_variant: result.theme.layout_variant,
              ...(result.theme.custom
                ? {
                    custom_background_type: result.theme.custom.background_type,
                    custom_background_value: result.theme.custom.background_value,
                    custom_font: result.theme.custom.font as MyPage["custom_font"],
                    custom_button_color: result.theme.custom.button_color,
                    custom_button_style: result.theme.custom.button_style as MyPage["custom_button_style"],
                    custom_button_rounded: result.theme.custom.button_rounded as MyPage["custom_button_rounded"],
                    custom_button_text_color: result.theme.custom.button_text_color,
                    custom_page_text_color: result.theme.custom.page_text_color,
                    custom_title_color: result.theme.custom.title_color,
                    custom_style_override: true,
                  }
                : {}),
            }
          : {}),
      },
      existingLinks,
      []
    );

    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-5">
          <button type="button" onClick={() => setStep("input")} className="w-fit text-xs font-semibold text-app-muted hover:text-jeon-purple">
            &larr; {t("dashboard.pages.import.backButton")}
          </button>

          <section className="glass rounded-jlg p-5 shadow-card">
            <p className="font-display text-sm font-bold text-app-ink">{t("dashboard.pages.import.themeHeading")}</p>
            {hasTheme && result.theme ? (
              <div className="mt-3 flex items-center gap-3">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-jmd border-2 border-[#111111] bg-jeon-lavender text-[#111111]">
                  <IconSparkle className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold capitalize text-app-ink">{result.theme.theme}</p>
                  <p className="text-xs text-app-muted">
                    {t("dashboard.pages.import.confidenceLabel")}:{" "}
                    {result.theme.confidence === "high"
                      ? t("dashboard.pages.import.confidenceHigh")
                      : result.theme.confidence === "medium"
                        ? t("dashboard.pages.import.confidenceMedium")
                        : t("dashboard.pages.import.confidenceLow")}
                  </p>
                  {result.theme.notes && <p className="mt-1 text-xs text-app-muted">{result.theme.notes}</p>}
                </div>
              </div>
            ) : (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                {result.theme_error || t("dashboard.pages.import.themeFallbackNote")}
              </p>
            )}
          </section>

          <section className="glass rounded-jlg p-5 shadow-card">
            <p className="font-display text-sm font-bold text-app-ink">
              {t("dashboard.pages.import.linksHeading")} ({result.links.length})
            </p>
            {result.links.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-2">
                {result.links.map((l, i) => (
                  <li key={`${l.url}-${i}`} className="flex items-center gap-2.5 rounded-xl border border-app-border px-3 py-2">
                    <input
                      type="checkbox"
                      checked={checkedLinks[i] ?? false}
                      onChange={() => toggleLink(i)}
                      className="h-4 w-4 flex-shrink-0 accent-jeon-purple"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-app-ink">{l.title}</p>
                      <p className="truncate text-xs text-app-muted">{l.url}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                {result.links_error || t("dashboard.pages.import.linksEmptyNote")}
              </p>
            )}
          </section>


          {!hasTheme && !hasLinks ? (
            <button type="button" onClick={() => setStep("input")} className="rounded-full border-2 border-jeon-ink px-5 py-2.5 text-sm font-bold text-app-ink">
              {t("dashboard.pages.import.backButton")}
            </button>
          ) : existingLinks.length > 0 && hasLinks ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-app-muted">{t("dashboard.pages.import.existingLinksPrompt")}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={applying}
                  onClick={() => handleApply("add")}
                  className="rounded-full btn-primary px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                >
                  {t("dashboard.pages.import.addToExisting")}
                </button>
                <button
                  type="button"
                  disabled={applying}
                  onClick={() => handleApply("replace")}
                  className="rounded-full border-2 border-jeon-ink px-5 py-2.5 text-sm font-bold text-app-ink hover:border-jeon-purple disabled:opacity-60"
                >
                  {t("dashboard.pages.import.replaceExisting")}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={applying}
              onClick={() => handleApply("add")}
              className="w-fit rounded-full btn-primary px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {hasTheme && hasLinks
                ? t("dashboard.pages.import.applyButtonBoth")
                : hasTheme
                  ? t("dashboard.pages.import.applyButtonThemeOnly")
                  : t("dashboard.pages.import.applyButtonLinksOnly")}
            </button>
          )}
        </div>

        <div className="mt-8 min-w-0 lg:sticky lg:top-6 lg:mt-0">
          <div className="mx-auto h-[580px] w-full max-w-[280px] overflow-y-auto rounded-jmd border-2 border-jeon-ink shadow-card [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="h-full [zoom:0.72]">
              <PagePreview interactive={false} rootClassName="min-h-full" data={previewData} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Step 1: input ----------
  return (
    <div className="mx-auto max-w-xl">
      <p className="text-sm text-app-muted">{t("dashboard.pages.import.intro")}</p>

      <form onSubmit={handleAnalyze} className="glass mt-5 flex flex-col gap-4 rounded-jlg p-5 shadow-card">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-app-ink">{t("dashboard.pages.import.screenshotLabel")}</label>
          <div className="flex items-center gap-3">
            {screenshotPreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={screenshotPreviewUrl} alt="" className="h-14 w-14 rounded-xl object-cover ring-2 ring-app-border" />
            ) : (
              <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-app-surface-2 text-app-muted">
                <IconUpload className="h-5 w-5" />
              </span>
            )}
            <label className="cursor-pointer rounded-lg border-2 border-jeon-ink bg-app-surface px-3 py-1.5 text-xs font-semibold text-app-ink transition-colors hover:border-jeon-purple hover:text-jeon-purple">
              {t("dashboard.pages.import.screenshotLabel")}
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                onChange={handleScreenshotChange}
                className="hidden"
              />
            </label>
          </div>
          <p className="mt-1 text-[11px] text-app-muted">{t("dashboard.pages.import.screenshotHint")}</p>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-app-ink">{t("dashboard.pages.import.urlLabel")}</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t("dashboard.pages.import.urlPlaceholder")}
            className="w-full rounded-xl border border-app-border bg-app-surface px-3.5 py-2.5 text-sm text-app-ink outline-none focus:border-jeon-purple"
          />
        </div>


        <button
          type="submit"
          disabled={analyzing}
          className="w-fit rounded-full btn-primary px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {analyzing ? t("dashboard.pages.import.analyzingButton") : t("dashboard.pages.import.analyzeButton")}
        </button>
      </form>
    </div>
  );
}
