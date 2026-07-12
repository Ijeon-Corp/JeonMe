export default function DashboardBalancePage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Saldo & Penarikan</h1>
      <p className="mt-2 max-w-lg text-sm text-muted">
        Fitur ini menunggu ledger saldo dan alur penarikan dana (REQ-F-501..504,
        Sprint 4 di Rencana-Sprint-Jeonme.xlsx). Skema database (
        <code>ledger_entries</code>, <code>payouts</code>) sudah tersedia, endpoint dan
        tampilannya belum.
      </p>
    </div>
  );
}
