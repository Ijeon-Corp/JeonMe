"use client";

import Logo from "./Logo";

export default function Footer() {
  return (
    <footer className="border-t border-border bg-white" aria-label="Footer">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Logo className="mb-4" />
            <p className="mb-5 max-w-xs text-sm leading-relaxed text-muted">
              Satu link, peluang tanpa batas. Platform all-in-one bagi kreator untuk berbagi, menjual, dan bertumbuh.
            </p>
            <div className="flex items-center gap-2.5">
              <a href="#" aria-label="Instagram" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border bg-slate-50 text-muted transition-colors hover:border-primary hover:bg-primary hover:text-white">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></svg>
              </a>
              <a href="#" aria-label="X / Twitter" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border bg-slate-50 text-muted transition-colors hover:border-primary hover:bg-primary hover:text-white">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z" /></svg>
              </a>
              <a href="#" aria-label="YouTube" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border bg-slate-50 text-muted transition-colors hover:border-primary hover:bg-primary hover:text-white">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
              </a>
              <a href="#" aria-label="LinkedIn" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border bg-slate-50 text-muted transition-colors hover:border-primary hover:bg-primary hover:text-white">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" /><rect x="2" y="9" width="4" height="12" /><circle cx="4" cy="4" r="2" /></svg>
              </a>
            </div>
          </div>

          <div>
            <h3 className="mb-4 font-heading text-sm font-bold text-ink">Produk</h3>
            <ul className="space-y-2.5">
              <li><a href="#features" className="cursor-pointer text-sm text-slate-500 transition-colors hover:text-primary">Fitur</a></li>
              <li><a href="#pricing" className="cursor-pointer text-sm text-slate-500 transition-colors hover:text-primary">Harga</a></li>
              <li><a href="#templates" className="cursor-pointer text-sm text-slate-500 transition-colors hover:text-primary">Template</a></li>
              <li><a href="#" className="cursor-pointer text-sm text-slate-500 transition-colors hover:text-primary">Dokumentasi</a></li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 font-heading text-sm font-bold text-ink">Perusahaan</h3>
            <ul className="space-y-2.5">
              <li><a href="#" className="cursor-pointer text-sm text-slate-500 transition-colors hover:text-primary">Tentang Kami</a></li>
              <li><a href="#" className="cursor-pointer text-sm text-slate-500 transition-colors hover:text-primary">Blog</a></li>
              <li><a href="#" className="cursor-pointer text-sm text-slate-500 transition-colors hover:text-primary">Karier</a></li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 font-heading text-sm font-bold text-ink">Tetap Terhubung</h3>
            <p className="mb-3 text-sm text-slate-500">Update produk dan tips kreator, setiap bulan.</p>
            <form className="flex items-center gap-2" onSubmit={(e) => e.preventDefault()}>
              <input
                type="email"
                required
                placeholder="kamu@email.com"
                className="w-full rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button type="submit" className="btn-primary flex-shrink-0 cursor-pointer rounded-lg px-4 py-2.5 text-sm font-bold text-white" aria-label="Subscribe">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
              </button>
            </form>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-border py-6 sm:flex-row">
          <p className="text-sm text-slate-400">© 2026 Jeonme. Seluruh hak cipta dilindungi.</p>
          <div className="flex items-center gap-6">
            <a href="#" className="cursor-pointer text-xs text-slate-400 transition-colors hover:text-ink">Kebijakan Privasi</a>
            <a href="#" className="cursor-pointer text-xs text-slate-400 transition-colors hover:text-ink">Ketentuan Layanan</a>
            <a href="#" className="cursor-pointer text-xs text-slate-400 transition-colors hover:text-ink">Cookies</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
