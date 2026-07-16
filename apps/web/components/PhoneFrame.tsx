// Bingkai ponsel sederhana untuk pratinjau halaman publik di dashboard --
// tinggi tetap dengan scroll internal supaya halaman panjang (banyak
// tautan/produk) tetap terasa seperti melihat di layar HP sungguhan,
// bukan area pratinjau yang membesar tak terbatas.
export default function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[340px] rounded-[2.25rem] border-[6px] border-ink bg-ink p-1.5 shadow-hero">
      <div className="relative h-[640px] overflow-y-auto rounded-[1.75rem] bg-white">
        <div className="sticky top-0 z-10 flex justify-center pt-2.5">
          <div className="h-4 w-20 rounded-full bg-ink/90" />
        </div>
        <div className="-mt-4">{children}</div>
      </div>
    </div>
  );
}
