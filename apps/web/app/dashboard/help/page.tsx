"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/dashboard/page/PageHeader";
import IconBadge, { accentForIndex } from "@/components/IconBadge";
import { IconBook, IconBox, IconChevronRight, IconMail, IconSearch, IconSparkle, IconWallet, IconWhatsapp } from "@/components/icons";
import { useLocale } from "@/lib/locale-context";
import { getMyPage } from "@/lib/api-client";
import { SUPPORT_EMAIL, SUPPORT_WHATSAPP } from "@/lib/site";
import { buildHelpFaqGroups } from "@/lib/help-faq";

// Pusat Bantuan -- benchmark Linktree "More > Support" (permintaan pengguna,
// 3 September 2026). SEBELUMNYA "Bantuan" di sidebar hanya membuka halaman
// Tutorial. Sekarang satu tempat: mulai cepat (tautan ke alur utama),
// pertanyaan umum yang bisa dicari (jawabannya menunjuk menu yang tepat),
// dan kontak dukungan. Tutorial tetap ada dan ditautkan dari sini.
//
// FAQ memakai <details> asli: bisa diakses keyboard/screen reader tanpa
// state, dan pencarian cukup menyaring daftar.
export default function DashboardHelpPage() {
  const { t } = useLocale();
  const k = (key: string) => t(`dashboard.pages.help.${key}`);
  const [query, setQuery] = useState("");
  const [username, setUsername] = useState("");

  useEffect(() => {
    getMyPage()
      .then((p) => setUsername(p.username))
      .catch(() => {});
  }, []);

  const quick = [
    { href: "/dashboard/tutorial", title: k("quickTutorial"), desc: k("quickTutorialDesc"), icon: IconBook },
    { href: "/dashboard/quick-setup", title: k("quickSetup"), desc: k("quickSetupDesc"), icon: IconSparkle },
    { href: "/dashboard/products?tab=items", title: k("quickProduct"), desc: k("quickProductDesc"), icon: IconBox },
    { href: "/dashboard/balance", title: k("quickPayout"), desc: k("quickPayoutDesc"), icon: IconWallet },
  ];

  const groups = useMemo(() => buildHelpFaqGroups(t), [t]);

  const q = query.trim().toLowerCase();
  const filtered = groups
    .map((g) => ({ ...g, items: g.items.filter((it) => !q || it.q.toLowerCase().includes(q) || it.a.toLowerCase().includes(q)) }))
    .filter((g) => g.items.length > 0);

  const subject = encodeURIComponent(k("contactSubject").replace("{username}", username || "-"));
  const waDigits = SUPPORT_WHATSAPP.replace(/\D/g, "");

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t("dashboard.extraPages.help")} description={k("subtitle")} />

      <section aria-labelledby="help-quick">
        <h2 id="help-quick" className="text-xs font-bold uppercase tracking-wider text-app-muted">{k("quickHeading")}</h2>
        <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
          {quick.map((item, i) => (
            <Link key={item.href} href={item.href} className="flex min-w-0 items-center gap-3 rounded-jmd border border-jeon-ink bg-app-surface p-3.5 transition-colors hover:border-jeon-purple">
              <IconBadge icon={item.icon} accent={accentForIndex(i)} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-app-ink">{item.title}</span>
                <span className="block truncate text-xs text-app-muted">{item.desc}</span>
              </span>
              <IconChevronRight className="h-4 w-4 flex-shrink-0 text-app-muted" />
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-8" aria-labelledby="help-faq">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="help-faq" className="font-display text-lg font-bold text-app-ink">{k("faqHeading")}</h2>
          <div className="relative w-full sm:w-64">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={k("faqSearchPlaceholder")}
              aria-label={k("faqSearchPlaceholder")}
              className="w-full rounded-lg border border-app-border bg-app-surface py-2 pl-9 pr-3 text-sm text-app-ink focus:border-jeon-purple focus:outline-none"
            />
          </div>
        </div>
        {filtered.length === 0 ? (
          <p className="mt-4 text-sm text-app-muted">{k("faqEmpty")}</p>
        ) : (
          <div className="mt-4 flex flex-col gap-5">
            {filtered.map((g) => (
              <div key={g.label}>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-app-muted">{g.label}</p>
                <div className="overflow-hidden rounded-jmd border border-jeon-ink bg-app-surface">
                  {g.items.map((it) => (
                    <details key={it.q} className="group border-b border-app-border last:border-0" open={q !== ""}>
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-app-ink hover:bg-jeon-purple/5 [&::-webkit-details-marker]:hidden">
                        {it.q}
                        <IconChevronRight className="h-4 w-4 flex-shrink-0 text-app-muted transition-transform group-open:rotate-90" />
                      </summary>
                      <p className="px-4 pb-4 text-sm leading-relaxed text-app-muted">{it.a}</p>
                    </details>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8 rounded-jlg border-2 border-[#111111] bg-jeon-lavender p-5 text-[#111111]" aria-labelledby="help-contact">
        <h2 id="help-contact" className="font-display text-lg font-bold">{k("contactHeading")}</h2>
        <p className="mt-1 text-sm text-[#111111]/75">{k("contactSub")}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={`mailto:${SUPPORT_EMAIL}?subject=${subject}`} className="flex items-center gap-2 rounded-jmd border-2 border-[#111111] bg-white px-4 py-2.5 text-sm font-bold text-[#111111] shadow-btn transition-transform hover:-translate-y-0.5">
            <IconMail className="h-4 w-4" />
            {k("contactEmail")}
            <span className="font-normal text-[#111111]/60">{SUPPORT_EMAIL}</span>
          </a>
          {waDigits && (
            <a href={`https://wa.me/${waDigits}?text=${subject}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-jmd border-2 border-[#111111] bg-white px-4 py-2.5 text-sm font-bold text-[#111111] shadow-btn transition-transform hover:-translate-y-0.5">
              <IconWhatsapp className="h-4 w-4" />
              {k("contactWhatsapp")}
            </a>
          )}
        </div>
      </section>

      <section className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-app-muted">
        <span className="font-bold uppercase tracking-wider">{k("legalHeading")}</span>
        <Link href="/privacy" className="hover:text-jeon-purple hover:underline">{k("legalPrivacy")}</Link>
        <Link href="/cookies" className="hover:text-jeon-purple hover:underline">{k("legalCookies")}</Link>
        <Link href="/terms" className="hover:text-jeon-purple hover:underline">{k("legalTerms")}</Link>
      </section>
    </div>
  );
}
