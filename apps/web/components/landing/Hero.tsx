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
            {/* Mockup pratinjau produk -- permintaan langsung pengguna, 20
                Agustus 2026: "ganti yang bagian kanan ini dengan gambar
                hero.png". SEBELUMNYA telepon + kartu mengambang dibangun
                manual dari puluhan div/SVG (lihat riwayat git kalau perlu
                versi lama itu) -- diganti satu file gambar (public/hero.png)
                yang sudah mengandung ilustrasi lengkap yang sama (telepon +
                kartu statistik mengambang), pola yang SAMA seperti
                AuthShowcase.tsx (image1.png, sekarang hero.png juga --
                lihat catatan di sana) menggantikan mockup JSX buatan tangan
                dengan gambar. animate-float dipertahankan di pembungkusnya
                supaya efek mengambang halus yang sama tetap ada. */}
            <div className="animate-float w-full max-w-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/hero.png" alt="Pratinjau halaman bio & dashboard Jeon.id" className="w-full object-contain" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
