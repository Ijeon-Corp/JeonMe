import Link from "next/link";

export default function FinalCTA() {
  return (
    <section
      className="relative overflow-hidden py-20 md:py-28"
      style={{ background: "linear-gradient(135deg,#123328 0%,#145C52 50%,#A9822F 100%)" }}
      aria-label="Ajakan bertindak"
    >
      <div className="blob absolute left-[-100px] top-0 h-80 w-80 bg-white/10" aria-hidden="true" />
      <div className="blob absolute bottom-0 right-[-100px] h-72 w-72 bg-white/10" aria-hidden="true" style={{ animationDelay: "3s" }} />
      <div className="dot-grid absolute inset-0 opacity-[0.06]" aria-hidden="true" />

      <div className="reveal relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <h2 className="mb-5 font-heading text-3xl font-extrabold leading-tight text-white sm:text-4xl lg:text-5xl">
          Mulai Bangun Kehadiran
          <br />
          Digitalmu Hari Ini.
        </h2>
        <p className="mx-auto mb-9 max-w-xl text-lg text-white/75">Bergabunglah dengan ribuan kreator yang bertumbuh bersama Jeon.id.</p>
        <Link href="/dashboard" className="btn-primary shadow-hero inline-flex cursor-pointer rounded-xl px-9 py-4 font-heading text-base font-bold text-white">
          Mulai Gratis
        </Link>
      </div>
    </section>
  );
}
