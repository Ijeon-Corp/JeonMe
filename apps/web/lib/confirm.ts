// Modul UX (permintaan langsung pengguna): pengganti window.confirm() bawaan
// browser (kotak dialog polos, tidak bisa distyle, beda gaya tiap OS) dengan
// SweetAlert2 -- dipakai di SEMUA konfirmasi destruktif (hapus tautan/
// produk/halaman/voucher/dst) di seluruh dashboard supaya konsisten & terasa
// satu produk. Tombolnya di-restyle lewat class swal-btn-* (globals.css)
// supaya pakai warna brand, bukan tombol biru default SweetAlert2.
//
// import("sweetalert2") DINAMIS, bukan static import -- laporan pengguna
// 3 September 2026 ("optimasi performa, jadi lama untuk ngeload tiap page
// nya"): file ini di-import oleh 18+ halaman/komponen dashboard cuma untuk
// dua fungsi yang HANYA dipanggil saat user benar-benar klik tombol
// hapus/konfirmasi -- static import sebelumnya membuat seluruh library
// SweetAlert2 (~50-80KB JS) ikut ter-bundle & di-parse di initial load
// SEMUA 18 halaman itu, padahal tidak pernah dibutuhkan sampai user
// mengklik. Modul di-cache oleh browser setelah require pertama, jadi
// panggilan konfirmasi kedua dst di sesi yang sama tetap instan.
export async function confirmDelete(text: string, options?: { title?: string; confirmButtonText?: string }): Promise<boolean> {
  const { default: Swal } = await import("sweetalert2");
  return Swal.fire({
    title: options?.title ?? "Yakin?",
    text,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: options?.confirmButtonText ?? "Ya, Hapus",
    cancelButtonText: "Batal",
    reverseButtons: true,
    focusCancel: true,
    buttonsStyling: false,
    customClass: {
      popup: "rounded-2xl",
      confirmButton: "swal-btn-danger",
      cancelButton: "swal-btn-cancel",
    },
  }).then((result) => result.isConfirmed);
}

// confirmAction -- versi netral (ikon biru "?", bukan segitiga merah) untuk
// konfirmasi PENTING tapi bukan destruktif permanen (mis. batalkan
// langganan, keluar dari tim) -- tetap perlu jeda "yakin?" tanpa terkesan
// seram seperti aksi hapus.
export async function confirmAction(text: string, options?: { title?: string; confirmButtonText?: string }): Promise<boolean> {
  const { default: Swal } = await import("sweetalert2");
  return Swal.fire({
    title: options?.title ?? "Konfirmasi",
    text,
    icon: "question",
    showCancelButton: true,
    confirmButtonText: options?.confirmButtonText ?? "Ya, Lanjutkan",
    cancelButtonText: "Batal",
    reverseButtons: true,
    focusCancel: true,
    buttonsStyling: false,
    customClass: {
      popup: "rounded-2xl",
      confirmButton: "swal-btn-primary",
      cancelButton: "swal-btn-cancel",
    },
  }).then((result) => result.isConfirmed);
}
