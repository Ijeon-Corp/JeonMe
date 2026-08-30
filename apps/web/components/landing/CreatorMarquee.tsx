// CreatorMarquee -- Redesign "Modern Playful Creator Platform"
// (DESIGN-JEONID-REDESIGN.md §11.3, Fase 2): strip kreator berjalan
// horizontal tanpa henti di bawah hero. SEMUA nama di sini FIKTIF
// (placeholder yang diizinkan spec -- "menampilkan creator nyata hanya
// dengan izin; jika belum ada, gunakan fictional placeholders") -- JANGAN
// ganti dengan akun sungguhan tanpa izin tertulis kreatornya. Gerak lewat
// CSS murni (.jeon-marquee-track, globals.css): pause saat hover, mati
// total di prefers-reduced-motion. aria-hidden pada salinan kedua supaya
// screen reader tidak membaca daftar dua kali.
const CREATORS: { handle: string; niche: string; color: string }[] = [
  { handle: "mayalin", niche: "Desain", color: "bg-jeon-lavender" },
  { handle: "rakafit", niche: "Fitness", color: "bg-jeon-lime" },
  { handle: "dapursisi", niche: "Kuliner", color: "bg-jeon-pink" },
  { handle: "arunika.art", niche: "Ilustrasi", color: "bg-jeon-blue" },
  { handle: "bengkelkata", niche: "Penulis", color: "bg-jeon-lime" },
  { handle: "nadatinggi", niche: "Musisi", color: "bg-jeon-pink" },
  { handle: "kelasrupa", niche: "Edukasi", color: "bg-jeon-lavender" },
  { handle: "lensakaki", niche: "Fotografi", color: "bg-jeon-blue" },
];

function MarqueeRow({ ariaHidden = false }: { ariaHidden?: boolean }) {
  return (
    <div aria-hidden={ariaHidden || undefined} className="flex shrink-0 items-center gap-4 pr-4">
      {CREATORS.map((c) => (
        <span
          key={c.handle}
          className={`flex shrink-0 items-center gap-2 rounded-full border-2 border-[#111111] ${c.color} px-5 py-2.5 font-display text-sm font-bold text-[#111111]`}
        >
          <span aria-hidden="true">✦</span>
          jeon.id/{c.handle}
          <span className="rounded-full bg-[#111111] px-2 py-0.5 text-[10px] font-bold text-white">{c.niche}</span>
        </span>
      ))}
    </div>
  );
}

export default function CreatorMarquee() {
  return (
    <section aria-label="Contoh kreator" className="overflow-hidden border-y-2 border-jeon-ink bg-jeon-surface py-5">
      <div className="jeon-marquee-track flex w-max">
        <MarqueeRow />
        <MarqueeRow ariaHidden />
      </div>
    </section>
  );
}
