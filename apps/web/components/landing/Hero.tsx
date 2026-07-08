import Link from "next/link";

export default function Hero() {
  return (
    <section className="bg-mesh relative overflow-hidden pb-20 pt-32 md:pb-28 md:pt-40" aria-label="Hero">
      <div className="blob absolute left-[-100px] top-10 h-72 w-72 bg-primary/10" aria-hidden="true" />
      <div className="blob absolute right-[-80px] top-40 h-60 w-60 bg-secondary/10" aria-hidden="true" style={{ animationDelay: "2s" }} />
      <div className="blob absolute bottom-10 left-1/4 h-40 w-40 bg-accent/10" aria-hidden="true" style={{ animationDelay: "4s" }} />
      <div
        className="dot-grid absolute inset-0 opacity-[0.4]"
        aria-hidden="true"
        style={{ maskImage: "radial-gradient(ellipse 60% 50% at 50% 0%, black, transparent)" }}
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-10">
          <div className="text-center lg:text-left">
            <div className="reveal mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-white px-4 py-1.5 shadow-sm">
              <span className="animate-pulse-slow h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
              <span className="text-xs font-semibold tracking-wide text-ink/80">Satu Link, Peluang Tanpa Batas.</span>
            </div>

            <h1
              className="reveal mb-6 font-heading text-4xl font-extrabold leading-[1.12] tracking-tight text-ink sm:text-5xl lg:text-[3.3rem]"
              style={{ transitionDelay: "0.05s" }}
            >
              Semua yang Kamu Butuhkan dalam
              <span className="text-gradient"> Satu Link Cantik.</span>
            </h1>

            <p
              className="reveal mx-auto mb-8 max-w-lg text-lg leading-relaxed text-muted sm:text-xl lg:mx-0"
              style={{ transitionDelay: "0.1s" }}
            >
              Buat halaman bio yang menawan, jual produk digital, bagikan kontenmu, dan kembangkan audiensmu dari satu tempat.
            </p>

            <div
              className="reveal flex flex-col justify-center gap-3 sm:flex-row lg:justify-start"
              style={{ transitionDelay: "0.15s" }}
            >
              <Link
                href="/dashboard"
                className="btn-primary shadow-hero cursor-pointer rounded-xl px-7 py-3.5 text-center font-heading text-base font-bold text-white"
              >
                Mulai Gratis
              </Link>
              <a
                href="#features"
                className="btn-ghost flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-border px-7 py-3.5 text-center text-base font-semibold text-ink"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <polygon points="10 8 16 12 10 16 10 8" />
                </svg>
                Lihat Demo
              </a>
            </div>

            <div
              className="reveal mt-9 flex items-center justify-center gap-3 lg:justify-start"
              style={{ transitionDelay: "0.2s" }}
            >
              <div className="flex -space-x-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold text-white ring-2 ring-white" style={{ background: "linear-gradient(135deg,#1B4D3E,#1F7A6C)" }}>MP</div>
                <div className="flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold text-white ring-2 ring-white" style={{ background: "linear-gradient(135deg,#1F7A6C,#C9A24B)" }}>RS</div>
                <div className="flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold text-white ring-2 ring-white" style={{ background: "linear-gradient(135deg,#C9A24B,#1B4D3E)" }}>AK</div>
              </div>
              <div>
                <div className="flex items-center gap-0.5 text-accent" aria-hidden="true">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <svg key={i} width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                  ))}
                </div>
                <p className="text-xs font-medium text-muted">Dipercaya 10.000+ kreator</p>
              </div>
            </div>
          </div>

          <div className="relative flex justify-center pb-6 lg:justify-end">
            <div className="animate-float relative w-full max-w-[300px]">
              <div className="shadow-hero relative rounded-[2.5rem] bg-ink p-3">
                <div
                  className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-50 via-teal-50 to-amber-50"
                  style={{ aspectRatio: "9/18" }}
                >
                  <div className="flex h-8 items-center justify-between px-6 pt-3">
                    <span className="text-[10px] font-bold text-ink/60">9:41</span>
                    <div className="h-4 w-16 rounded-full bg-ink/80" />
                    <span className="text-[10px] font-bold text-ink/60">100%</span>
                  </div>

                  <div className="px-6 pb-3 pt-4 text-center">
                    <div
                      className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full text-xl font-extrabold text-white ring-4 ring-white"
                      style={{ background: "linear-gradient(135deg,#1B4D3E,#1F7A6C)" }}
                    >
                      MP
                    </div>
                    <p className="font-heading text-base font-extrabold text-ink">Maya Putri</p>
                    <p className="mt-0.5 text-xs text-ink/50">Kreator Digital • jeonme.com/mayaputri</p>
                  </div>

                  <div className="space-y-2 px-5">
                    <div className="flex items-center gap-2.5 rounded-2xl border-2 border-primary bg-white px-4 py-2.5 shadow-sm">
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-xl bg-primary">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" aria-hidden="true"><path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /></svg>
                      </div>
                      <p className="text-[11px] font-bold text-ink">Gabung Kelas</p>
                    </div>
                    <div className="flex items-center gap-2.5 rounded-2xl border-2 border-accent bg-white px-4 py-2.5 shadow-sm">
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-xl bg-accent">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
                      </div>
                      <p className="text-[11px] font-bold text-ink">Beli Ebook</p>
                    </div>
                    <div className="flex items-center gap-2.5 rounded-2xl border-2 border-secondary bg-white px-4 py-2.5 shadow-sm">
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-xl bg-secondary">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                      </div>
                      <p className="text-[11px] font-bold text-ink">Booking Konsultasi</p>
                    </div>
                    <div className="flex items-center gap-2.5 rounded-2xl border-2 border-rose-300 bg-white px-4 py-2.5 shadow-sm">
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-xl bg-rose-500">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" aria-hidden="true"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
                      </div>
                      <p className="text-[11px] font-bold text-ink">Tonton YouTube</p>
                    </div>
                  </div>

                  <div className="mt-4 flex justify-center gap-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-sm">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="#1B4D3E" aria-hidden="true"><path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z" /></svg>
                    </div>
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-sm">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#C9A24B" strokeWidth="2" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></svg>
                    </div>
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-sm">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="#1F7A6C" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                    </div>
                  </div>
                </div>
              </div>

              <div className="glass animate-float-slow absolute -left-12 top-16 hidden rounded-xl px-3 py-2.5 shadow-card lg:block">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-green-100">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" aria-hidden="true"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                  </div>
                  <div>
                    <p className="text-[9px] text-muted">Pendapatan</p>
                    <p className="font-heading text-xs font-extrabold text-green-600">+Rp2,4jt</p>
                  </div>
                </div>
              </div>

              <div className="glass animate-float-slow absolute -right-10 top-44 hidden rounded-xl px-3 py-2.5 shadow-card lg:block" style={{ animationDelay: "1s" }}>
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-100">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#145C52" strokeWidth="2" aria-hidden="true"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
                  </div>
                  <div>
                    <p className="text-[9px] text-muted">Klik</p>
                    <p className="font-heading text-xs font-extrabold text-secondary-dark">15K</p>
                  </div>
                </div>
              </div>

              <div className="glass animate-float-slow absolute -left-10 bottom-28 hidden rounded-xl px-3 py-2.5 shadow-card lg:block" style={{ animationDelay: "2s" }}>
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A9822F" strokeWidth="2" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
                  </div>
                  <div>
                    <p className="text-[9px] text-muted">Pelanggan</p>
                    <p className="font-heading text-xs font-extrabold text-accent-dark">1.200</p>
                  </div>
                </div>
              </div>

              <div className="glass animate-float-slow absolute -right-8 bottom-2 hidden rounded-xl px-3 py-2 shadow-card lg:block" style={{ animationDelay: "1.5s" }}>
                <p className="mb-1 text-[9px] text-muted">Pertumbuhan</p>
                <div className="flex h-6 items-end gap-0.5">
                  <div className="mock-bar w-1.5 rounded-sm bg-primary/40" style={{ height: "40%" }} />
                  <div className="mock-bar w-1.5 rounded-sm bg-primary/60" style={{ height: "60%", animationDelay: "0.3s" }} />
                  <div className="mock-bar w-1.5 rounded-sm bg-primary" style={{ height: "90%", animationDelay: "0.6s" }} />
                  <div className="mock-bar w-1.5 rounded-sm bg-accent" style={{ height: "70%", animationDelay: "0.9s" }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
