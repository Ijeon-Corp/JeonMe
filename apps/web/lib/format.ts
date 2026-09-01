// Helper format bersama (JEONID-DASHBOARD-REDESIGN-SPEC.md §24.4 "do not
// duplicate: format currency/date", Phase 8). Sebelumnya formatIDR/
// formatRupiah/formatDateTime didefinisikan ulang per-file (TransactionPanel,
// ShopOverviewPanel, balance, dst) -- satu sumber di sini; pemakai lama
// dimigrasikan bertahap saat filenya tersentuh.
export function formatIDR(n: number): string {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}
