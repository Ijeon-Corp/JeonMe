// uploadFilesSequentially -- multi-upload foto (permintaan langsung
// pengguna, 25 September 2026: "saya mau bisa multi upload di beberapa
// blok seperti photo gallery dll"). Endpoint unggah galeri/sub-foto/
// katalog tetap SATU foto per request (dan mengembalikan daftar TERBARU),
// jadi multi-upload cukup di klien: file dikirim BERURUTAN, bukan paralel
// -- tiap request backend mengunci baris blok (SELECT ... FOR UPDATE, fix
// TOCTOU galeri 21 September 2026), unggahan paralel cuma saling antre &
// memperbesar risiko timeout tanpa mempercepat apa pun.
//
// `remaining` = sisa slot (mis. 9 - jumlah foto galeri saat ini): file
// di luar kuota TIDAK dikirim (backend toh akan menolaknya satu per satu)
// dan dilaporkan lewat `skipped` supaya pemanggil bisa memberi tahu
// kreator. Berhenti di error pertama -- foto yang sudah terunggah tetap
// tersimpan (onEach sudah menerapkannya ke state).
export interface MultiUploadOutcome {
  uploaded: number;
  skipped: number;
  error: unknown;
}

export async function uploadFilesSequentially<T>(
  fileList: FileList | File[] | null | undefined,
  remaining: number,
  uploadOne: (file: File) => Promise<T>,
  onEach: (result: T, done: number, total: number) => void,
  onStart?: (total: number) => void,
): Promise<MultiUploadOutcome> {
  const all = fileList ? Array.from(fileList) : [];
  const files = all.slice(0, Math.max(0, remaining));
  const skipped = all.length - files.length;
  onStart?.(files.length);
  let uploaded = 0;
  for (const file of files) {
    try {
      const result = await uploadOne(file);
      uploaded++;
      onEach(result, uploaded, files.length);
    } catch (error) {
      return { uploaded, skipped, error };
    }
  }
  return { uploaded, skipped, error: null };
}
