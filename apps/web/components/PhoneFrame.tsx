// Bingkai ponsel sederhana untuk pratinjau halaman publik di dashboard --
// tinggi tetap dengan scroll internal supaya halaman panjang (banyak
// tautan/produk) tetap terasa seperti melihat di layar HP sungguhan,
// bukan area pratinjau yang membesar tak terbatas.
//
// Dua bug tampilan yang diperbaiki (dilaporkan pengguna: "kadang ada warna
// putih terlihat di atas dan bawah"): (1) wrapper notch di atas memakan
// tinggi 26px (pt-2.5=10px + h-4=16px) tapi konten cuma ditarik naik -mt-4
// (16px) -- selisih 10px itu yang bocor sebagai warna putih layar (bg-white)
// di ATAS tema. (2) wrapper konten sebelumnya tidak punya tinggi pasti (auto),
// padahal isinya (PagePreview) pakai `min-h-full` -- persentase tinggi CSS
// TIDAK bisa dihitung tanpa induk berketinggian pasti, jadi min-h-full itu
// efektif tidak berlaku, dan untuk halaman pendek (sedikit tautan) latar
// tema berhenti sebelum 640px, membocorkan bg-white di BAWAH. Solusi: (1)
// samakan -mt-4 jadi -mt-[26px] persis sesuai tinggi wrapper notch, (2)
// jadikan wrapper konten `flex-1` di dalam induk `flex flex-col` -- flexbox
// memberi wrapper itu tinggi pasti (mengisi sisa 640px) SEKALIGUS tetap
// boleh membesar melebihi 640px untuk halaman panjang (default flexbox
// `min-height: auto` mencegah item flex mengecil di bawah tinggi konten
// aslinya), jadi scroll internal untuk halaman panjang tetap berfungsi.
export default function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[340px] rounded-[2.25rem] border-[6px] border-ink bg-ink p-1.5 shadow-hero">
      <div className="relative flex h-[640px] flex-col overflow-y-auto rounded-[1.75rem] bg-white">
        <div className="sticky top-0 z-10 flex flex-shrink-0 justify-center pt-2.5">
          <div className="h-4 w-20 rounded-full bg-ink/90" />
        </div>
        <div className="-mt-[26px] flex-1">{children}</div>
      </div>
    </div>
  );
}
