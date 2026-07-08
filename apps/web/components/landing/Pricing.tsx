import Link from "next/link";

const check = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="mt-0.5 flex-shrink-0" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export default function Pricing() {
  return (
    <section id="pricing" className="relative overflow-hidden bg-white py-20 md:py-28" aria-label="Harga">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="reveal mx-auto mb-14 max-w-2xl text-center">
          <span className="mb-4 inline-block rounded-full border border-primary/15 bg-primary-subtle px-3 py-1.5 text-xs font-semibold text-primary">
            Harga
          </span>
          <h2 className="mb-4 font-heading text-3xl font-bold leading-tight text-ink sm:text-4xl">
            Harga Sederhana untuk
            <br />
            <span className="text-gradient">Setiap Tahap Pertumbuhan</span>
          </h2>
          <p className="text-lg leading-relaxed text-muted">Mulai gratis. Upgrade saat kamu siap memonetisasi lebih besar.</p>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-3">
          <div className="reveal rounded-3xl border border-border bg-white p-8 shadow-card">
            <h3 className="mb-1 font-heading text-lg font-bold text-ink">Gratis</h3>
            <p className="mb-5 text-sm text-muted">Untuk kreator yang baru memulai</p>
            <p className="mb-1 font-heading text-4xl font-extrabold text-ink">
              Rp0<span className="text-base font-medium text-muted">/bln</span>
            </p>
            <Link href="/dashboard" className="btn-ghost mb-7 mt-6 block cursor-pointer rounded-xl border border-border px-5 py-3 text-center text-sm font-bold text-ink">
              Mulai Sekarang
            </Link>
            <ul className="space-y-3">
              <li className="flex items-start gap-2.5 text-sm text-ink"><span className="text-green-600">{check}</span>Tautan Tanpa Batas</li>
              <li className="flex items-start gap-2.5 text-sm text-ink"><span className="text-green-600">{check}</span>Tema Dasar</li>
              <li className="flex items-start gap-2.5 text-sm text-ink"><span className="text-green-600">{check}</span>Analitik Dasar</li>
            </ul>
          </div>

          <div
            className="reveal relative rounded-3xl p-8 text-white shadow-hero lg:-translate-y-3"
            style={{ background: "linear-gradient(160deg,#1B4D3E,#145C52 60%,#C9A24B)", transitionDelay: "0.1s" }}
          >
            <span className="absolute -top-3 right-8 rounded-full bg-amber-400 px-3 py-1 text-[11px] font-bold text-amber-900 shadow-md">
              Paling Populer
            </span>
            <h3 className="mb-1 font-heading text-lg font-bold">Pro</h3>
            <p className="mb-5 text-sm text-white/70">Untuk kreator siap memonetisasi</p>
            <p className="mb-1 font-heading text-4xl font-extrabold">
              Rp149rb<span className="text-base font-medium text-white/70">/bln</span>
            </p>
            <Link href="/dashboard" className="mb-7 mt-6 block cursor-pointer rounded-xl bg-white px-5 py-3 text-center font-heading text-sm font-bold text-primary transition-shadow hover:shadow-lg">
              Coba Gratis
            </Link>
            <ul className="space-y-3">
              <li className="flex items-start gap-2.5 text-sm"><span className="text-yellow-300">{check}</span>Analitik Lanjutan</li>
              <li className="flex items-start gap-2.5 text-sm"><span className="text-yellow-300">{check}</span>Domain Kustom</li>
              <li className="flex items-start gap-2.5 text-sm"><span className="text-yellow-300">{check}</span>Hapus Branding</li>
              <li className="flex items-start gap-2.5 text-sm"><span className="text-yellow-300">{check}</span>Fitur Monetisasi</li>
            </ul>
          </div>

          <div className="reveal rounded-3xl border border-border bg-white p-8 shadow-card" style={{ transitionDelay: "0.2s" }}>
            <h3 className="mb-1 font-heading text-lg font-bold text-ink">Business</h3>
            <p className="mb-5 text-sm text-muted">Untuk tim dan brand yang berkembang</p>
            <p className="mb-1 font-heading text-4xl font-extrabold text-ink">
              Rp399rb<span className="text-base font-medium text-muted">/bln</span>
            </p>
            <Link href="/dashboard" className="btn-ghost mb-7 mt-6 block cursor-pointer rounded-xl border border-border px-5 py-3 text-center text-sm font-bold text-ink">
              Hubungi Sales
            </Link>
            <ul className="space-y-3">
              <li className="flex items-start gap-2.5 text-sm text-ink"><span className="text-green-600">{check}</span>Anggota Tim</li>
              <li className="flex items-start gap-2.5 text-sm text-ink"><span className="text-green-600">{check}</span>Laporan Lanjutan</li>
              <li className="flex items-start gap-2.5 text-sm text-ink"><span className="text-green-600">{check}</span>Dukungan Prioritas</li>
              <li className="flex items-start gap-2.5 text-sm text-ink"><span className="text-green-600">{check}</span>Akses API</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
