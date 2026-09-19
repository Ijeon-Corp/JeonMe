"use client";

import { useEffect, useState } from "react";
import { ApiError, createCheckout, trackEvent, trackEventBySlug, validateVoucher } from "@/lib/api-client";
import { IconClose } from "@/components/icons";
import { getCategoryInstruction } from "@/lib/product-categories";

// EMAIL_PATTERN -- validasi format ringan di sisi klien (permintaan
// langsung pengguna, 10 September 2026: "alur pembelian ... ui dan ux
// nya masih sangat kurang") -- SEBELUMNYA cuma mengandalkan atribut HTML
// `type="email" required` (baru menegur SAAT submit, bukan reaktif saat
// mengetik/blur) -- backend TETAP validator utama (binding:"required,email",
// createCheckoutRequest), regex ini murni UX (tegur lebih awal), bukan
// pengganti validasi server.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatIDR(amount: number): string {
  return `Rp ${Math.max(0, Math.round(amount)).toLocaleString("id-ID")}`;
}

export default function BuyProductButton({
  productId,
  buttonClassName = "bg-jeon-purple text-white hover:opacity-90",
  pwywMinPriceIdr,
  hideVoucher = false,
  openLabel = "Beli",
  submitLabel = "Bayar Sekarang",
  referralCode,
  username,
  pageSlug,
  wishlistItemId,
  externalUrl,
  productName,
  basePriceIdr,
  category,
}: {
  productId: string;
  buttonClassName?: string;
  pwywMinPriceIdr?: number;
  // No.71: dipakai ulang untuk blok dukungan/donasi -- kode voucher tidak
  // masuk akal untuk donasi, dan labelnya perlu bilang "Dukung"/"Kirim
  // Dukungan", bukan "Beli"/"Bayar Sekarang".
  hideVoucher?: boolean;
  openLabel?: string;
  submitLabel?: string;
  // No.72: kode ?ref= dari URL halaman publik, diteruskan apa adanya ke
  // checkout -- backend yang memvalidasi & mengabaikan kalau tidak cocok.
  referralCode?: string;
  // Modul Toko (Fase A, Overview): "Klik Beli" -- dilacak sama seperti klik
  // tautan (lihat TrackedLink.tsx), dipicu saat tombol INI ditekan pertama
  // kali (minat nyata terhadap produk), bukan saat form checkout disubmit.
  // Opsional -- kalau tidak diisi (dipakai di luar PagePreview), tracking
  // dilewati diam-diam.
  username?: string;
  pageSlug?: string;
  // wishlistItemId -- Gap #4 benchmark kompetitif (9 Agustus 2026): cuma
  // relevan untuk blok Donasi, item wishlist yang dipilih pendukung untuk
  // "diwujudkan". Dioper apa adanya ke createCheckout, divalidasi di
  // backend (lihat catatan panjang di CheckoutHandler.Create).
  wishlistItemId?: string;
  // externalUrl -- Modul Toko (migrasi 000068, permintaan langsung
  // pengguna: "saya mau untuk produk bisa untuk affiliate juga ke shopee
  // dll"): kalau diisi, tombol ini TIDAK PERNAH membuka form checkout --
  // klik langsung membuka tautan ini di tab baru (mis. listing Shopee/
  // Tokopedia kreator sendiri), sama seperti tautan biasa. Klik tetap
  // dilacak sebagai product_click seperti biasa.
  externalUrl?: string;
  // productName/basePriceIdr -- permintaan langsung pengguna, 10 September
  // 2026 ("alur pembelian ... ui dan ux nya masih sangat kurang"): baris
  // ringkasan "Kamu akan membeli: X -- Rp Y" tepat di atas form, supaya
  // pembeli SELALU lihat apa & berapa yang benar-benar akan dibayar SAAT
  // form terbuka (kartu produk di atasnya bisa saja sudah tergulir keluar
  // layar begitu form ini expand). Keduanya OPSIONAL & murni tampilan --
  // kalau tidak diisi (pemanggil di luar PagePreview), form tetap
  // berfungsi identik seperti sebelumnya, cuma tanpa baris ringkasan ini.
  // `basePriceIdr` diabaikan kalau `pwywMinPriceIdr` terisi (PWYW pakai
  // jumlah yang benar-benar diketik pembeli, bukan harga dasar).
  productName?: string;
  basePriceIdr?: number;
  // category -- susulan langsung permintaan pengguna, 15 September 2026:
  // "harusnya untuk tiap kategori ada instruksi cara pembelian sampai
  // barang diterima atau jasa dll". OPSIONAL & murni tampilan (sama
  // seperti productName/basePriceIdr di atas) -- pemanggil TANPA konsep
  // kategori sama sekali (event/donasi, lihat PagePreview.tsx) boleh
  // tidak mengisinya, getCategoryInstruction (product-categories.ts)
  // sudah punya fallback generik utk undefined MAUPUN kategori custom
  // yang tidak dikenal.
  category?: string;
}) {
  const [open, setOpen] = useState(false);
  // entered -- animasi buka/tutup (permintaan langsung pengguna, 19
  // September 2026: "kasih animasi saat membuka form dan menutup").
  // `open` TETAP menentukan mounted/tidaknya modal di DOM (kontrak lama,
  // dipakai `{open && (...)}` di bawah TIDAK diubah) -- `entered` murni
  // kelas CSS transisi: mulai `false` (posisi/opacity "tersembunyi") tiap
  // kali modal baru di-mount, di-flip ke `true` SATU FRAME sesudahnya
  // (dua nested requestAnimationFrame -- pola tahan-banting utk "tunggu
  // satu render dicat dulu" sebelum transisi CSS mulai berjalan, kalau
  // langsung true di render yang sama, browser tidak sempat melihat
  // state awal & transisi tidak pernah terlihat). Saat MENUTUP: `entered`
  // dibalik ke false DULU (memicu transisi keluar), `open` baru menyusul
  // false 200ms kemudian (match `duration-200` di kelas transisi) --
  // supaya modal-nya SENDIRI tidak langsung lenyap sebelum sempat
  // teranimasi keluar.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (!open) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [open]);
  // name/note -- permintaan langsung pengguna, 15 September 2026: "di form
  // pembelian tambahkan beberapa field lagi yang penting selain 2 field
  // yang sekarang" (sebelumnya cuma email+WhatsApp). `name` WAJIB (lihat
  // handleBuy) -- setiap order sungguhan seharusnya punya nama, bukan
  // cuma alamat email mentah, utk invoice/riwayat order kreator. `note`
  // tetap OPSIONAL, sama seperti WhatsApp -- disembunyikan utk donasi
  // (hideVoucher) sama seperti WhatsApp, alasan sama: catatan "pesanan"
  // tidak masuk akal utk dukungan/donasi.
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [note, setNote] = useState("");
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [whatsappTouched, setWhatsappTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buyerAmount, setBuyerAmount] = useState(pwywMinPriceIdr ? String(pwywMinPriceIdr) : "");

  const [showVoucher, setShowVoucher] = useState(false);
  const [voucherCode, setVoucherCode] = useState("");
  const [checkingVoucher, setCheckingVoucher] = useState(false);
  const [voucherResult, setVoucherResult] = useState<{ discountIDR: number; finalIDR: number } | null>(null);
  const [voucherMessage, setVoucherMessage] = useState<string | null>(null);

  const nameError = nameTouched && !name.trim() ? "Nama wajib diisi." : null;
  const emailError = emailTouched && email.trim() && !EMAIL_PATTERN.test(email.trim()) ? "Format email tidak valid." : null;
  // whatsappError -- format longgar (cukup angka, spasi, +/-, min 8 digit)
  // karena field ini OPSIONAL & format nomor lokal/internasional beda-beda
  // -- validasi ketat di sini cuma akan menolak nomor sah yang formatnya
  // sedikit beda, backend tidak punya validasi format nomor ini sama sekali.
  const whatsappDigits = whatsappNumber.replace(/[^0-9]/g, "");
  const whatsappError =
    whatsappTouched && whatsappNumber.trim() && (whatsappDigits.length < 8 || !/^[0-9+\-\s]+$/.test(whatsappNumber.trim()))
      ? "Nomor WhatsApp sepertinya belum lengkap."
      : null;

  // displayAmountIDR -- angka yang BENAR-BENAR akan ditagihkan, dihitung
  // ulang tiap render supaya baris ringkasan selalu ikut PWYW/voucher yang
  // sedang berubah (bukan snapshot beku saat form pertama dibuka).
  const rawAmount = pwywMinPriceIdr !== undefined ? Number(buyerAmount || pwywMinPriceIdr) : basePriceIdr;
  const displayAmountIDR = voucherResult ? voucherResult.finalIDR : rawAmount;

  async function handleApplyVoucher() {
    if (!voucherCode.trim()) return;
    setCheckingVoucher(true);
    setVoucherMessage(null);
    setVoucherResult(null);
    try {
      const res = await validateVoucher({
        code: voucherCode.trim(),
        product_id: productId,
        buyer_amount_idr: pwywMinPriceIdr !== undefined ? Number(buyerAmount) : undefined,
      });
      if (res.valid && res.discount_idr !== undefined && res.final_amount_idr !== undefined) {
        setVoucherResult({ discountIDR: res.discount_idr, finalIDR: res.final_amount_idr });
      } else {
        setVoucherMessage(res.message ?? "Kode voucher tidak valid.");
      }
    } catch (err) {
      setVoucherMessage(err instanceof ApiError ? err.message : "Gagal memeriksa voucher, coba lagi.");
    } finally {
      setCheckingVoucher(false);
    }
  }

  async function handleBuy(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNameTouched(true);
    setEmailTouched(true);
    if (!name.trim()) {
      setError("Masukkan nama kamu.");
      return;
    }
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError("Masukkan alamat email yang valid.");
      return;
    }
    if (pwywMinPriceIdr !== undefined && (!buyerAmount || Number(buyerAmount) < pwywMinPriceIdr)) {
      setError(`Jumlah pembayaran minimal Rp${pwywMinPriceIdr.toLocaleString("id-ID")}.`);
      return;
    }
    setLoading(true);
    try {
      const { invoice_url } = await createCheckout({
        product_id: productId,
        buyer_email: email,
        buyer_name: name.trim(),
        buyer_note: note.trim() || undefined,
        buyer_contact: whatsappNumber.trim() || undefined,
        voucher_code: voucherResult ? voucherCode.trim() : undefined,
        buyer_amount_idr: pwywMinPriceIdr !== undefined ? Number(buyerAmount) : undefined,
        referral_code: referralCode,
        wishlist_item_id: wishlistItemId,
      });
      window.location.href = invoice_url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memulai checkout, coba lagi.");
      setLoading(false);
    }
  }

  function handleOpen() {
    if (username) {
      if (pageSlug) {
        trackEventBySlug(username, pageSlug, { event_type: "product_click", product_id: productId });
      } else {
        trackEvent(username, { event_type: "product_click", product_id: productId });
      }
    }
    if (externalUrl) {
      window.open(externalUrl, "_blank", "noopener,noreferrer");
      return;
    }
    setOpen(true);
  }

  // handleClose -- permintaan langsung pengguna, 11 September 2026 ("lebih
  // bagus kalo klik pembelian muncul pop up form"): form checkout SEKARANG
  // modal (bukan expand inline di bawah tombol) -- alasan sekaligus
  // perbaikan gap lama: versi inline SEBELUMNYA tidak punya cara batal sama
  // sekali begitu dibuka (tidak ada tombol tutup), modal ini menambahkannya
  // gratis. Ditahan (tidak bisa ditutup) selagi `loading` -- checkout SUDAH
  // terlanjur jalan ke backend, menutup modal begitu saja akan membuat
  // window.location.href tetap pindah halaman TANPA peringatan begitu
  // request itu selesai, membingungkan kalau modalnya sudah "ditutup".
  function handleClose() {
    if (loading) return;
    // entered=false DULU (memicu transisi keluar via kelas CSS), open
    // baru menyusul false 200ms kemudian (samakan dgn duration-200 di
    // JSX) -- lihat catatan lengkap di deklarasi `entered`.
    setEntered(false);
    setTimeout(() => setOpen(false), 200);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className={`mt-2.5 w-full rounded-lg py-2 text-sm font-semibold transition-all duration-200 ${buttonClassName}`}
      >
        {openLabel}
      </button>

      {open && (
        // max-w-md -- permintaan langsung pengguna, 19 September 2026:
        // "perbesar layout nya sesuai lebar layout utama" -- SAMA PERSIS
        // lebar kolom halaman publik (`max-w-md`, PagePreview.tsx), dulu
        // `max-w-sm` (24rem) lebih sempit dari halaman di belakangnya.
        // transition-opacity pada backdrop + transition (transform+opacity)
        // pada panel -- animasi buka/tutup, lihat catatan lengkap di
        // deklarasi state `entered`.
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 transition-opacity duration-200 ${entered ? "opacity-100" : "opacity-0"}`}
          onClick={handleClose}
        >
          <div
            className={`max-h-[85vh] w-full max-w-md overflow-y-auto rounded-jlg border-2 border-jeon-ink bg-white p-5 shadow-brutal transition-all duration-200 ${
              entered ? "translate-y-0 scale-100 opacity-100" : "translate-y-3 scale-95 opacity-0"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-display text-sm font-bold text-[#111111]">{openLabel}</h2>
              <button
                type="button"
                onClick={handleClose}
                disabled={loading}
                aria-label="Tutup"
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-black/50 hover:bg-jeon-purple/10 disabled:opacity-40"
              >
                <IconClose className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleBuy} className="mt-3 flex flex-col gap-2">
              {productName && (
                <div className="rounded-md border border-black/10 bg-jeon-purple/5 px-2.5 py-1.5">
                  <p className="text-[11px] text-black/55">Kamu akan membeli</p>
                  {/* min-w-0 WAJIB di sini -- tanpa ini `truncate` (white-space:
                      nowrap) membuat lebar minimum item flex ini SAMA DENGAN
                      lebar penuh nama produk (default min-width:auto), jadi
                      alih-alih terpotong rapi dgn "...", nama malah memaksa
                      seluruh baris melebar & baru dipotong brutal oleh
                      overflow-hidden induknya (bug ditemukan lewat laporan
                      langsung pengguna, screenshot: "Kamu akan membeli J...").
                      Pola sama persis catatan CSS overflow di CLAUDE.md. */}
                  <div className="flex min-w-0 items-baseline justify-between gap-2">
                    <p className="min-w-0 truncate text-xs font-bold text-[#111111]">{productName}</p>
                    {displayAmountIDR !== undefined && (
                      <p className="flex-shrink-0 text-xs font-bold text-[#111111]">
                        {voucherResult && rawAmount !== undefined && (
                          <span className="mr-1 font-normal text-black/40 line-through">{formatIDR(rawAmount)}</span>
                        )}
                        {formatIDR(displayAmountIDR)}
                      </p>
                    )}
                  </div>
                </div>
              )}
              {/* Instruksi cara pembelian per kategori -- permintaan langsung
                  pengguna, 15 September 2026: "harusnya untuk tiap kategori
                  ada instruksi cara pembelian sampai barang diterima atau
                  jasa dll". Digerbang `category` (bukan cuma `productName`)
                  -- event/donasi (PagePreview.tsx) tidak pernah mengisi prop
                  ini sama sekali, jadi baris ini otomatis tidak tampil utk
                  keduanya (instruksi "unduh file"/"jadwal konsultasi" tidak
                  relevan buat pendaftaran event atau donasi). Produk lama
                  dari sebelum kategori wajib (category="") ikut dilewati
                  sama alasannya -- daripada menampilkan instruksi generik
                  utk sesuatu yang kategorinya benar-benar tidak diketahui. */}
              {category && (
                <p className="rounded-md bg-jeon-purple/5 px-2.5 py-1.5 text-[11px] text-black/55">
                  {getCategoryInstruction(category)}
                </p>
              )}
              {pwywMinPriceIdr !== undefined && (
                <div>
                  <label className="text-[11px] font-semibold text-black/55">
                    Bayar berapa saja, min Rp{pwywMinPriceIdr.toLocaleString("id-ID")}
                  </label>
                  <input
                    type="number"
                    required
                    min={pwywMinPriceIdr}
                    value={buyerAmount}
                    onChange={(e) => setBuyerAmount(e.target.value)}
                    className="mt-1 w-full rounded-md border border-black/10 px-2.5 py-2 text-sm text-[#111111] focus:border-jeon-purple focus:outline-none"
                  />
                </div>
              )}
              <div>
                <input
                  type="text"
                  required
                  placeholder="Nama kamu"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => setNameTouched(true)}
                  aria-invalid={!!nameError}
                  className={`w-full rounded-md border px-2.5 py-2 text-sm text-[#111111] focus:outline-none ${
                    nameError ? "border-red-400 focus:border-red-400" : "border-black/10 focus:border-jeon-purple"
                  }`}
                />
                {nameError && <p className="mt-0.5 text-[11px] text-red-600">{nameError}</p>}
              </div>
              <div>
                <input
                  type="email"
                  required
                  placeholder="Email kamu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setEmailTouched(true)}
                  aria-invalid={!!emailError}
                  className={`w-full rounded-md border px-2.5 py-2 text-sm text-[#111111] focus:outline-none ${
                    emailError ? "border-red-400 focus:border-red-400" : "border-black/10 focus:border-jeon-purple"
                  }`}
                />
                {emailError && <p className="mt-0.5 text-[11px] text-red-600">{emailError}</p>}
              </div>

              {/* No.74 (Sprint 8): nomor WhatsApp OPSIONAL -- kolom buyer_contact
                  sudah ada di skema sejak lama tapi TIDAK PERNAH dikumpulkan lewat
                  form manapun sampai sekarang, jadi kanal notifikasi WhatsApp
                  (worker.go) tidak akan pernah punya nomor untuk dikirimi apa pun
                  tanpa ini. Disembunyikan untuk donasi (hideVoucher juga menandai
                  "ini blok dukungan", lihat PagePreview.tsx) -- backend belum
                  mendukung WhatsApp untuk donasi (perlu template Meta terpisah),
                  jadi menampilkannya di situ cuma akan mengumpulkan nomor yang
                  tidak pernah benar-benar dipakai. */}
              {!hideVoucher && (
                <div>
                  {/* Placeholder DIPERSINGKAT (permintaan langsung pengguna,
                      screenshot: teks placeholder kepotong di layar sempit
                      "Nomor Whats..."/tanpa elipsis, browser memotong
                      placeholder native tanpa "..." begitu lebih panjang
                      dari lebar input) -- "(opsional)" tetap ada, sengaja
                      DIPERPENDEK bukan dihapus supaya pembeli tetap tahu
                      field ini boleh dilewati. */}
                  <input
                    type="tel"
                    placeholder="WhatsApp (opsional)"
                    value={whatsappNumber}
                    onChange={(e) => setWhatsappNumber(e.target.value)}
                    onBlur={() => setWhatsappTouched(true)}
                    aria-invalid={!!whatsappError}
                    className={`w-full rounded-md border px-2.5 py-2 text-sm text-[#111111] focus:outline-none ${
                      whatsappError ? "border-red-400 focus:border-red-400" : "border-black/10 focus:border-jeon-purple"
                    }`}
                  />
                  {whatsappError && <p className="mt-0.5 text-[11px] text-red-600">{whatsappError}</p>}
                </div>
              )}

              {/* note -- catatan bebas OPSIONAL utk penjual (mis. permintaan
                  khusus produk kategori "Jasa & Konsultasi", instruksi
                  pengiriman) -- disembunyikan utk donasi, alasan sama
                  persis nomor WhatsApp di atas ("pesanan" tidak masuk akal
                  utk dukungan/donasi). */}
              {!hideVoucher && (
                <textarea
                  placeholder="Catatan (opsional)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-black/10 px-2.5 py-2 text-sm text-[#111111] focus:border-jeon-purple focus:outline-none"
                />
              )}

              {!hideVoucher &&
                (!showVoucher ? (
                  <button
                    type="button"
                    onClick={() => setShowVoucher(true)}
                    className="text-left text-[11px] font-semibold text-black/55 underline"
                  >
                    Punya kode voucher?
                  </button>
                ) : (
                  <div className="flex flex-col gap-1">
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        placeholder="Kode voucher"
                        value={voucherCode}
                        onChange={(e) => {
                          setVoucherCode(e.target.value.toUpperCase());
                          setVoucherResult(null);
                          setVoucherMessage(null);
                        }}
                        className="min-w-0 flex-1 rounded-md border border-black/10 px-2.5 py-2 text-sm uppercase text-[#111111] focus:border-jeon-purple focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleApplyVoucher}
                        disabled={checkingVoucher || !voucherCode.trim()}
                        className="flex-shrink-0 rounded-md border border-black/10 px-2.5 py-2 text-xs font-bold text-[#111111] disabled:opacity-60"
                      >
                        {checkingVoucher ? "..." : "Terapkan"}
                      </button>
                    </div>
                    {voucherResult && (
                      <p className="text-[11px] font-semibold text-green-600">
                        Diskon Rp {voucherResult.discountIDR.toLocaleString("id-ID")} diterapkan -- total Rp{" "}
                        {voucherResult.finalIDR.toLocaleString("id-ID")}
                      </p>
                    )}
                    {voucherMessage && <p className="text-[11px] text-red-600">{voucherMessage}</p>}
                  </div>
                ))}

              {error && <p className="text-[11px] text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={loading || !!emailError || !!whatsappError}
                className={`flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition-all duration-200 disabled:opacity-60 ${buttonClassName}`}
              >
                {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
                {loading ? "Memproses..." : submitLabel}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
