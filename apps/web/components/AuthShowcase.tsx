// Panel visual kanan halaman /register & /login -- rework redesign Fase 3
// lanjutan (permintaan langsung pengguna, 31 Agustus 2026: "ubah juga login
// dan register nya sesuai tema"): gambar hero-v2.png (mockup identitas
// hijau lama) DIGANTI mockup mini-bio token-native yang dibangun langsung
// dari palet redesign -- persona fiktif "maya.lin" yang SAMA dengan flip
// card Hero.tsx & contoh URL spec §9, plus chip statistik mengambang.
// Data 100% fiktif.
// Teks kutipan tetap PERNYATAAN NILAI PRODUK tanpa atribusi nama (keputusan
// lama dipertahankan: Jeonme belum punya testimoni pelanggan sungguhan
// untuk dikutip, jangan mengarang -- lihat riwayat komentar file ini).
export default function AuthShowcase() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-10 overflow-hidden py-12">
      <div className="relative" aria-hidden="true">
        {/* Kartu bio mini */}
        <div className="flex w-[260px] flex-col rounded-jxl border-2 border-jeon-ink bg-jeon-surface p-6 shadow-brutal">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border-2 border-[#111111] bg-jeon-lavender font-display text-lg font-extrabold text-[#111111]">
            M
          </div>
          <p className="mt-3 text-center font-display text-base font-bold text-jeon-ink">maya.lin</p>
          <p className="text-center text-xs text-jeon-muted">jeon.id/mayalin</p>
          <div className="mt-4 flex flex-col gap-2">
            <span className="rounded-jmd border-2 border-[#111111] bg-jeon-lime px-4 py-2.5 text-center text-xs font-bold text-[#111111]">Playbook Kreator ✦</span>
            <span className="rounded-jmd border-2 border-jeon-ink bg-jeon-surface px-4 py-2.5 text-center text-xs font-bold text-jeon-ink">Kelas Editing</span>
            <span className="rounded-jmd border-2 border-[#111111] bg-jeon-pink px-4 py-2.5 text-center text-xs font-bold text-[#111111]">Booking 1-on-1</span>
          </div>
        </div>
        {/* Chip statistik mengambang */}
        <div className="absolute -left-24 top-8 rounded-jmd border-2 border-jeon-ink bg-jeon-surface px-4 py-2.5 shadow-jsoft">
          <p className="text-[10px] font-bold uppercase tracking-wider text-jeon-muted">Kunjungan</p>
          <p className="font-display text-xl font-extrabold text-jeon-ink">12.480</p>
        </div>
        <div className="absolute -right-24 bottom-10 rounded-jmd border-2 border-[#111111] bg-jeon-sidebar px-4 py-2.5 shadow-jsoft">
          <p className="text-[10px] font-bold uppercase tracking-wider text-jeon-lime">Penjualan</p>
          <p className="font-display text-xl font-extrabold text-white">Rp2,4jt</p>
        </div>
        <span className="absolute -top-6 right-2 select-none font-display text-2xl text-jeon-purple">✦</span>
      </div>

      <p className="max-w-md text-center font-display text-2xl font-bold leading-snug text-app-ink" style={{ textWrap: "balance" }}>
        &ldquo;<span className="text-jeon-purple">Satu halaman</span> untuk jualan produk digital, terima dukungan, dan kelola semua tautan kamu.&rdquo;
      </p>
    </div>
  );
}
