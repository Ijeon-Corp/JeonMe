export type HelpFaqItem = { q: string; a: string };
export type HelpFaqGroup = { label: string; items: HelpFaqItem[] };

// buildHelpFaqGroups -- diekstrak dari app/dashboard/help/page.tsx, 7
// September 2026 (fitur live chat baru butuh FAQ instan IDENTIK dengan
// halaman Bantuan, tanpa duplikasi konten atau CMS baru -- lihat
// components/SupportChatWidget.tsx). FUNGSI (bukan konstanta modul) supaya
// labelnya ikut berganti bahasa -- pola sama seperti buildEmbeddableTypes
// (lib/catalog-blocks.ts) / buildContentTiles (dashboard/links/page.tsx).
// DUA pemanggil: DashboardHelpPage (dibungkus useMemo, sudah ada
// sebelumnya) dan SupportChatWidget (dipanggil langsung tanpa memo --
// cukup murah, sama seperti buildContentTiles).
export function buildHelpFaqGroups(t: (key: string) => string): HelpFaqGroup[] {
  const k = (key: string) => t(`dashboard.pages.help.${key}`);
  return [
    { label: k("groupPage"), items: [1, 2, 3] },
    { label: k("groupSelling"), items: [4, 5, 6] },
    { label: k("groupPremium"), items: [7, 8] },
    { label: k("groupAccount"), items: [9, 10, 11] },
  ].map((g) => ({ label: g.label, items: g.items.map((n) => ({ q: k(`q${n}`), a: k(`a${n}`) })) }));
}
