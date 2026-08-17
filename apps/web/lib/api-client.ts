// PENTING (bug ditemukan 16 Juli 2026): NEXT_PUBLIC_API_BASE_URL adalah
// nilai BUILD-TIME Next.js -- sekali ter-bake ke bundle browser saat
// `npm run build`, tidak bisa diubah lagi lewat environment variable
// container saat runtime. ci.yml TIDAK PERNAH mengirim build-arg ini, jadi
// bundle browser yang di-deploy ke staging/production selalu jatuh ke
// fallback lama "http://localhost:8080/api/v1" -- artinya browser
// PENGUNJUNG SUNGGUHAN mencoba menghubungi localhost:8080 MEREKA SENDIRI,
// bukan backend jeonme.com/staging.jeonme.com. Verifikasi browser
// sebelumnya selalu (tanpa sadar) dijalankan lewat proses lokal
// (`go run .` + `npm run dev` di host yang sama, TANPA Docker) sehingga
// "localhost:8080" kebetulan selalu benar dan bug ini tidak pernah
// ketahuan sampai pengguna sungguhan membuka domain asli.
//
// Perbaikan: path RELATIF ("/api/v1") di sisi BROWSER -- Apache/reverse
// proxy sudah meneruskan /api/ ke backend di origin yang SAMA persis
// (lihat CICD-GUIDE.md ProxyPass /api/), jadi tidak perlu tahu domainnya
// sama sekali, otomatis benar di staging MAUPUN production dari satu image
// yang sama. Di sisi SERVER (SSR/generateMetadata, jalan di dalam
// container `web`), path relatif tidak bisa dipakai (fetch() Node.js wajib
// URL absolut) dan "localhost" tidak menjangkau container `api` yang
// terpisah -- pakai INTERNAL_API_BASE_URL (nama service Docker internal,
// dibaca saat RUNTIME karena BUKAN prefix NEXT_PUBLIC_, lihat
// docker-compose.staging.yml/.prod.yml).
function resolveApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1";
  }
  return process.env.INTERNAL_API_BASE_URL ?? "http://localhost:8080/api/v1";
}

const API_BASE_URL = resolveApiBaseUrl();

const TOKEN_STORAGE_KEY = "jeonme_token";

// Token disimpan di localStorage (bukan httpOnly cookie) karena backend
// (middleware.AuthRequired) memang dirancang membaca header
// "Authorization: Bearer <token>", bukan cookie -- lihat apps/api/internal/middleware.
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}

// No.87 (Sprint 10): ruang kerja aktif ("bertindak sebagai" pemilik lain
// kalau pengguna ini kolaborator). Disimpan terpisah dari token supaya
// bertahan lintas navigasi tapi TIDAK ikut ke akun lain kalau logout+login
// beda pengguna di browser yang sama (dibersihkan saat clearToken).
const ACTIVE_WORKSPACE_STORAGE_KEY = "jeonme_active_workspace_owner_id";

export function getActiveWorkspaceOwnerId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY);
}

export function setActiveWorkspaceOwnerId(ownerId: string | null): void {
  if (typeof window === "undefined") return;
  if (ownerId) {
    window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, ownerId);
  } else {
    window.localStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY);
  }
}

// Header X-Act-As-Owner HANYA berpengaruh pada rute yang dipasangi
// middleware.ActAsOwner di backend (tautan/produk/desain) -- rute lain
// (saldo/KYC/domain/dst.) mengabaikannya sepenuhnya, jadi aman dikirim di
// SETIAP request tanpa perlu pengecualian per endpoint di sisi klien.
function activeWorkspaceHeaders(): Record<string, string> {
  const ownerId = getActiveWorkspaceOwnerId();
  return ownerId ? { "X-Act-As-Owner": ownerId } : {};
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function apiFetch<T>(path: string, options: RequestInit = {}, opts: { auth?: boolean } = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  if (opts.auth) {
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const workspaceHeaders = activeWorkspaceHeaders();
    for (const [key, value] of Object.entries(workspaceHeaders)) headers.set(key, value);
  }

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const isJSON = res.headers.get("content-type")?.includes("application/json");
  const body = isJSON ? await res.json().catch(() => ({})) : undefined;

  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? `Permintaan gagal (${res.status})`);
  }

  return body as T;
}

// ---------- Halaman publik ----------

export interface PublicLink {
  id: string;
  title: string;
  url: string;
  lock_type: "" | "age" | "code" | "subscribe";
  lock_min_age: number | null;
  block_type: "link" | "video" | "contact_form" | "faq" | "heading" | "text" | "image" | "button" | "maps" | "accordion" | "gallery" | "audio";
  block_data: Record<string, unknown>;
  custom_icon_url: string;
  // icon_key -- permintaan langsung pengguna, 13 Agustus 2026: ikon dipilih
  // dari galeri siap-pakai (lib/icon-library.ts). Prioritas render (lihat
  // PagePreview.tsx): custom_icon_url > icon_key > deteksi otomatis dari
  // URL > ikon generik.
  icon_key: string;
  // is_featured/thumbnail_url -- Modul "Featured Link" (permintaan langsung
  // pengguna, referensi "Featured Layout" Linktree sungguhan): kalau
  // is_featured true DAN thumbnail_url terisi, tautan dirender sebagai
  // kartu thumbnail 16:9 (lihat renderLinkOrBlock, PagePreview.tsx).
  is_featured: boolean;
  thumbnail_url: string;
}

// No.79 (Sprint 9): buka tautan terkunci -- endpoint publik, tanpa akun.
export function unlockLink(linkId: string, input: { code?: string; email?: string; whatsapp_number?: string }) {
  return apiFetch<{ url: string }>(`/links/${linkId}/unlock`, { method: "POST", body: JSON.stringify(input) });
}

// No.77 (Sprint 9): kirim pesan lewat blok Formulir Kontak -- endpoint
// publik, tanpa akun.
export function submitContactForm(linkId: string, input: { name: string; email: string; message: string }) {
  return apiFetch<{ message: string }>(`/links/${linkId}/contact`, { method: "POST", body: JSON.stringify(input) });
}

export interface PublicProduct {
  id: string;
  name: string;
  price_idr: number;
  cover_image_url: string;
  effective_price_idr: number;
  is_flash_sale_active: boolean;
  pwyw_enabled: boolean;
  pwyw_min_price_idr: number | null;
  is_bundle: boolean;
  bundle_original_price_idr: number | null;
  is_course: boolean;
  chapter_count: number;
  // is_external_link/external_url -- Modul Toko (migrasi 000068): tombol
  // Beli membuka external_url di tab baru, bukan checkout Jeonme.
  is_external_link: boolean;
  external_url: string;
}

export interface PublicWishlistItem {
  id: string;
  name: string;
  price_idr: number;
  link: string;
  raised_idr: number;
}

export interface PublicDonation {
  product_id: string;
  title: string;
  min_amount_idr: number;
  // Gap #4 benchmark kompetitif (9 Agustus 2026) -- goal_amount_idr=0
  // berarti kreator belum memasang target, sembunyikan progress bar.
  goal_title: string;
  goal_amount_idr: number;
  goal_raised_idr: number;
  wishlist: PublicWishlistItem[];
}

// No.90 (Sprint 11): blok event.
export interface PublicEvent {
  product_id: string;
  name: string;
  description: string;
  effective_price_idr: number;
  is_flash_sale_active: boolean;
  starts_at: string;
  ends_at: string;
  timezone: string;
  location: string;
  is_online: boolean;
  spots_left: number | null;
}

export interface PublicLeadCapture {
  title: string;
  collect_email: boolean;
  collect_whatsapp: boolean;
}

// No.92 (Sprint 11): blok booking konsultasi. Slot tersedia dimuat
// terpisah lewat getAvailableSlots(), bukan digabung di sini.
export interface PublicBooking {
  product_id: string;
  name: string;
  description: string;
  price_idr: number;
  duration_minutes: number;
  available_slot_count: number;
}

export interface AvailableSlot {
  id: string;
  starts_at: string;
  ends_at: string;
}

export function getAvailableSlots(productId: string) {
  return apiFetch<AvailableSlot[]>(`/products/${productId}/available-slots`, { method: "GET" });
}

// PageStickerData -- Modul Desain (koreksi langsung pengguna, 8 Agustus
// 2026): stiker dekoratif INTERAKTIF, posisi & ukuran sendiri per stiker
// (bukan satu pilihan tetap dekat avatar). x/y persen (0-100) relatif
// terhadap kanvas halaman (TITIK TENGAH stiker), scale 0.4-2.5 -- harus
// sinkron dengan PageSticker & validateStickers di page.go.
export interface PageStickerData {
  id: string;
  type: string;
  x: number;
  y: number;
  scale: number;
}

export interface PublicPage {
  id: string;
  username: string;
  // display_name -- permintaan langsung pengguna: nama tampilan bebas (mis.
  // "PIKO"), terpisah dari username (identitas URL). Kosong berarti belum
  // pernah diisi -- jatuh balik ke username TANPA "@" (lihat toPreviewData).
  display_name: string;
  bio: string;
  avatar_url: string;
  theme: string;
  links: PublicLink[];
  products: PublicProduct[];
  donation: PublicDonation | null;
  lead_capture: PublicLeadCapture | null;
  social_proof: SocialProofFeed | null;
  // analytics -- Modul Analitik Pihak Ketiga (permintaan langsung
  // pengguna, 12 Agustus 2026): null kalau kreator belum mengisi Pixel
  // ID/GA Measurement ID SAMA SEKALI, ATAU bukan Premium (gerbang
  // ditegakkan backend, lihat publicAnalytics di page.go) -- TIDAK ADA
  // access token di sini, itu SECRET yang cuma dipakai server-side.
  analytics: PublicAnalytics | null;
  seo_title: string;
  seo_description: string;
  noindex: boolean;
  custom_background_type: "solid" | "gradient" | "image";
  custom_background_value: string;
  custom_font:
    | "inter"
    | "playfair"
    | "lora"
    | "montserrat"
    | "roboto-mono"
    | "poppins"
    | "quicksand"
    | "merriweather"
    | "space-grotesk";
  custom_button_color: string;
  custom_button_style: "fill" | "outline" | "glass";
  custom_button_rounded: "none" | "sm" | "md" | "full";
  custom_button_shadow: "none" | "soft" | "strong" | "hard";
  custom_button_text_color: string;
  custom_page_text_color: string;
  custom_title_font: "" | PublicPage["custom_font"];
  custom_title_color: string;
  // custom_style_override -- migrasi 000035 (bug dilaporkan pengguna):
  // menentukan apakah custom_button_*/custom_page_text_color/custom_title_*
  // di atas DITERAPKAN, independen dari `theme` -- lihat komentar
  // getPageTheme di page-themes.ts.
  custom_style_override: boolean;
  // stickers -- Modul Desain: stiker dekoratif interaktif (posisi+ukuran
  // per stiker, lihat PageStickerData), array kosong = tidak ada.
  stickers: PageStickerData[];
  is_verified: boolean;
  // is_premium -- Modul Langganan Premium: sembunyikan watermark
  // "Buat halaman gratis di Jeonme" untuk kreator Premium. Lihat
  // isPremiumUser (backend) & PagePreviewData.isPremium.
  is_premium: boolean;
  // hide_watermark -- Modul Langganan Premium (permintaan langsung
  // pengguna, 8 Agustus 2026): toggle yang bisa diatur SENDIRI oleh
  // kreator Premium untuk sembunyikan pil watermark di footer. Backend
  // SUDAH menegakkan gerbang premium sebelum field ini dikirim (lihat
  // finishPublicPageResponse di page.go) -- kreator gratis selalu
  // menerima false di sini apa pun nilai kolomnya di DB.
  hide_watermark: boolean;
  events: PublicEvent[];
  bookings: PublicBooking[];
  loyalty_active: boolean;
  // page_type -- No.99 (Sprint 14): "bio" (halaman utama SELALU "bio") atau
  // "landing" (halaman tambahan No.98 dengan builder blok manual). Modul
  // Halaman Produk: "produk" (showcase katalog Toko saja).
  page_type: "bio" | "landing" | "produk";
  // shop_paused/shop_paused_message -- Modul Toko (Fase E5): kreator bisa
  // menjeda seluruh toko dari tab Shop Settings. Backend TETAP menolak
  // checkout kalau true (lihat checkout.go Create) -- ini murni untuk
  // menyembunyikan tombol beli & menampilkan pesannya di frontend.
  shop_paused: boolean;
  shop_paused_message: string;
  // social_instagram..social_email -- permintaan langsung pengguna, 11
  // Agustus 2026: baris ikon kontak sosial di bawah bio halaman publik.
  // String kosong = platform itu belum diisi kreator, ikonnya tidak
  // dirender (lihat buildSocialHref di lib/social-links.ts).
  social_instagram: string;
  social_tiktok: string;
  social_facebook: string;
  social_whatsapp: string;
  social_youtube: string;
  social_x: string;
  social_linkedin: string;
  social_telegram: string;
  social_email: string;
  // layout_variant -- permintaan langsung pengguna, 11 Agustus 2026
  // (susulan Quick Setup), "card"/"spotlight" ditambah 12 Agustus 2026:
  // "centered" (bawaan, avatar+nama+bio di tengah), "banner" (rata kiri
  // sebaris), "card" (dibungkus kartu bertema), "spotlight" (avatar
  // besar + badge nama). Lihat renderBioHeader di PagePreview.tsx.
  layout_variant: "centered" | "banner" | "card" | "spotlight" | "cover" | "minimal" | "hero" | "polaroid";
}

// No.73 (Sprint 8): submit form pengumpulan lead -- endpoint publik, tanpa
// perlu akun, sama seperti createCheckout/trackClick.
export function subscribeLead(input: { username: string; email?: string; whatsapp_number?: string }) {
  return apiFetch<{ message: string }>("/leads", { method: "POST", body: JSON.stringify(input) });
}

/**
 * Mengambil data halaman publik kreator. Mengembalikan null jika halaman
 * tidak ditemukan (404) alih-alih melempar error, karena "halaman tidak ada"
 * adalah kondisi normal, bukan kegagalan sistem.
 */
export async function getPublicPage(username: string): Promise<PublicPage | null> {
  // Bug ditemukan Modul Settings §6 (2026-08-02): dulu next:{revalidate:60}
  // (ISR) -- ternyata begitu sebuah halaman berpindah dari ADA ke
  // notFound() (persis yang terjadi saat nonaktifkan/hapus akun, atau
  // unpublish biasa), cache ISR Next.js MACET selamanya menyajikan versi
  // lama, TIDAK PERNAH pulih sendiri (dibuktikan lewat polling >80 detik,
  // padahal perubahan KONTEN biasa -- mis. bio -- tetap ter-refresh normal
  // di detik ke-60). cache: "no-store" mengorbankan keuntungan performa ISR
  // di rute publik dengan traffic tertinggi, TAPI itu murni optimisasi,
  // sementara "halaman nonaktif harus langsung tidak tampil" adalah
  // jaminan keamanan/privasi eksplisit dari spec -- benar itu yang menang.
  // Cache backend (Redis, page.go, TTL 30 detik, diinvalidasi eksplisit
  // tiap mutasi) TETAP ada & TIDAK kena bug ini (bukan ISR/SWR, cuma
  // GET+TTL biasa) -- jadi endpoint ini masih tidak selalu memukul Postgres.
  const res = await fetch(`${API_BASE_URL}/pages/${username}`, { cache: "no-store" });

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    throw new Error(`Gagal memuat halaman publik: ${res.status}`);
  }

  return res.json();
}

// ---------- Auth ----------

export function register(input: {
  email: string;
  password: string;
  username: string;
  consent_accepted: boolean;
}) {
  return apiFetch<{ id: string; username: string }>("/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// checkUsername -- live-check ketersediaan username di /register (permintaan
// langsung pengguna, 11 Agustus 2026). Publik, tidak butuh auth: true.
export function checkUsername(username: string) {
  return apiFetch<{ available: boolean; message: string }>(
    `/auth/check-username?username=${encodeURIComponent(username)}`
  );
}

// Modul Settings §5: kalau akun ini sudah mengaktifkan 2FA, backend TIDAK
// mengembalikan token di sini -- mengembalikan mfa_required+mfa_token,
// caller (halaman login) lalu memanggil verifyLogin2FA dengan kode TOTP.
export function login(input: { email: string; password: string }) {
  return apiFetch<{ token?: string; mfa_required?: boolean; mfa_token?: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function verifyLogin2FA(input: { mfa_token: string; code: string }) {
  return apiFetch<{ token: string }>("/auth/2fa/verify-login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// googleLogin -- alur Authorization Code (permintaan langsung pengguna, 13
// Agustus 2026: "tambahkan di login dan register login via google").
// Dipanggil dari app/auth/google/callback/page.tsx sesudah Google redirect
// balik bawa authorization code -- endpoint backend yang sama melayani
// login MAUPUN register (akun dibuat otomatis kalau emailnya belum
// terdaftar), jadi token SELALU langsung ada di respons (tidak ada
// mfa_required seperti login()/password biasa -- 2FA password tidak
// relevan untuk jalur masuk lewat Google).
export function googleLogin(input: { code: string; redirect_uri: string }) {
  return apiFetch<{ token: string }>("/auth/google", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function logout() {
  return apiFetch<{ message: string }>("/auth/logout", { method: "POST" }, { auth: true });
}

export function requestPasswordReset(email: string) {
  return apiFetch<{ message: string; dev_reset_token?: string }>("/auth/password-reset/request", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function confirmPasswordReset(input: { token: string; new_password: string }) {
  return apiFetch<{ message: string }>("/auth/password-reset/confirm", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ---------- Dashboard: halaman milik kreator ----------

export interface MyPage {
  username: string;
  display_name: string;
  bio: string;
  avatar_url: string;
  theme: string;
  is_published: boolean;
  seo_title: string;
  seo_description: string;
  noindex: boolean;
  custom_background_type: "solid" | "gradient" | "image";
  custom_background_value: string;
  custom_font:
    | "inter"
    | "playfair"
    | "lora"
    | "montserrat"
    | "roboto-mono"
    | "poppins"
    | "quicksand"
    | "merriweather"
    | "space-grotesk";
  custom_button_color: string;
  // custom_button_style -- "Desain 2.0": fill/outline/glass, HANYA relevan
  // ("shadow", nilai lama, sudah dilebur jadi axis independen
  // custom_button_shadow di bawah -- lihat migrasi 000034.)
  custom_button_style: "fill" | "outline" | "glass";
  custom_button_rounded: "none" | "sm" | "md" | "full";
  custom_button_shadow: "none" | "soft" | "strong" | "hard";
  custom_button_text_color: string;
  // custom_page_text_color/custom_title_color kosong ("") berarti "ikuti
  // warna bawaan tema". custom_title_font kosong berarti "samakan dengan
  // font halaman" (toggle "Alternative title font", default mati).
  custom_page_text_color: string;
  custom_title_font: "" | MyPage["custom_font"];
  custom_title_color: string;
  // custom_style_override -- migrasi 000035 (bug dilaporkan pengguna:
  // mengubah tombol/font sebelumnya memaksa ganti theme jadi "custom" &
  // membuang preset yang sudah dipilih): field-field custom_button_*/
  // custom_page_text_color/custom_title_* di atas SEKARANG independen dari
  // theme, hanya diterapkan kalau flag ini true.
  custom_style_override: boolean;
  stickers: PageStickerData[];
  // hide_watermark -- Modul Langganan Premium (permintaan langsung
  // pengguna, 8 Agustus 2026): nilai TOGGLE apa adanya dari DB (BEDA dari
  // PublicPage.hide_watermark yang sudah digerbang server-side) -- endpoint
  // dashboard ini perlu menunjukkan preferensi tersimpan kreator meski
  // sedang tidak Premium, supaya toggle-nya tidak "lupa" posisi begitu
  // upgrade lagi. Gerbang premium diterapkan di UI (dikunci/disabled untuk
  // kreator gratis), bukan disembunyikan nilainya.
  hide_watermark: boolean;
  verification: {
    email_verified: boolean;
    profile_complete: boolean;
    has_paid_order: boolean;
    is_verified: boolean;
  };
  // is_premium -- Modul Langganan Premium: kreator Premium bisa pakai latar
  // kustom (theme="custom") & watermark halaman publik disembunyikan. Lihat
  // getSubscriptionStatus untuk detail plan/status/harga.
  is_premium: boolean;
  // social_instagram..social_email -- lihat catatan lengkap di PublicPage.
  social_instagram: string;
  social_tiktok: string;
  social_facebook: string;
  social_whatsapp: string;
  social_youtube: string;
  social_x: string;
  social_linkedin: string;
  social_telegram: string;
  social_email: string;
  layout_variant: "centered" | "banner" | "card" | "spotlight" | "cover" | "minimal" | "hero" | "polaroid";
}

// "Desain 2.0": diperluas dari 5 jadi 10 preset (rose/ocean/lavender/noir/
// peach baru); galeri tema ala Linktree menambah 6 lagi bernuansa gradien
// vivid (bloom/blaze/cyber/mint/golden/cosmic) -- lihat catatan lingkup di
// page-themes.ts.
export const THEME_PRESETS = [
  "default",
  "midnight",
  "sunrise",
  "forest",
  "minimal",
  "rose",
  "ocean",
  "lavender",
  "noir",
  "peach",
  "bloom",
  "blaze",
  "cyber",
  "mint",
  "golden",
  "cosmic",
  "dusk",
  "marble",
  "nightfall",
  "mist",
  "berry",
  "amber",
  "valley",
  "storm",
  "frost",
  "dew",
  "air",
  "lake",
  "mineral",
  "blocks",
  "haven",
  "grid",
  "mesh",
  "aurora",
  "prism",
  "borealis",
  "orbit",
  "halo",
  "lava",
  "bubble",
  "canvas",
  "static",
  "crystal",
  "aqua",
  "nebula",
  "flux",
  "sapphire",
  "opal",
  "quartz",
  "glacier",
  "mirage",
  "canyon",
  "highland",
  "cascade",
  "tide",
  "skyline",
  "sphere",
  "chrome",
  "cube",
  "relief",
  "facet",
  "flow",
  "pulse",
  "drift",
  "brew",
  "lagoon",
  "dune",
  "sakura",
  "nova",
  "maple",
  "electric",
  "surge",
  "downtown",
  "polaris",
  "atmos",
  "ember",
  // 5 preset baru hasil analisa galeri tema kompetitor (16 Agustus 2026) --
  // lihat catatan lingkup lengkap di PAGE_THEMES (page-themes.ts).
  "xmas",
  "pride",
  "retro",
  "kraft",
  "monsoon",
] as const;

export function getMyPage() {
  return apiFetch<MyPage>("/dashboard/page", { method: "GET" }, { auth: true });
}

export function updateMyPage(
  input: Partial<
    Pick<
      MyPage,
      | "theme"
      | "display_name"
      | "bio"
      | "is_published"
      | "seo_title"
      | "seo_description"
      | "noindex"
      | "custom_background_type"
      | "custom_background_value"
      | "custom_font"
      | "custom_button_color"
      | "custom_button_style"
      | "custom_button_rounded"
      | "custom_button_shadow"
      | "custom_button_text_color"
      | "custom_page_text_color"
      | "custom_title_font"
      | "custom_title_color"
      | "custom_style_override"
      | "hide_watermark"
      | "social_instagram"
      | "social_tiktok"
      | "social_facebook"
      | "social_whatsapp"
      | "social_youtube"
      | "social_x"
      | "social_linkedin"
      | "social_telegram"
      | "social_email"
      | "layout_variant"
    >
  >
) {
  return apiFetch<{ message: string }>(
    "/dashboard/page",
    { method: "PATCH", body: JSON.stringify(input) },
    { auth: true }
  );
}

// updateMyPageStickers -- Modul Desain: endpoint TERPISAH dari updateMyPage,
// ganti array stiker UTUH tiap simpan (drag/resize kirim seluruh daftar
// terbaru sekaligus, bukan di-patch per field seperti tema/warna/dst).
export function updateMyPageStickers(stickers: PageStickerData[]) {
  return apiFetch<{ message: string }>(
    "/dashboard/page/stickers",
    { method: "PUT", body: JSON.stringify({ stickers }) },
    { auth: true }
  );
}

// Upload lewat multipart/form-data -- TIDAK lewat apiFetch(), sama seperti
// uploadProductFile (lihat komentar di sana soal Content-Type/boundary).
export async function uploadAvatar(file: File): Promise<{ avatar_url: string; message: string }> {
  const token = getToken();
  const form = new FormData();
  form.append("avatar", file);

  const res = await fetch(`${API_BASE_URL}/dashboard/page/avatar`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}`, ...activeWorkspaceHeaders() } : undefined,
    body: form,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? `Unggah gagal (${res.status})`);
  }
  return body;
}

// uploadCustomBackground -- bug dilaporkan pengguna ("tidak bisa mengupload
// gambar"): opsi latar "Gambar" sebelumnya cuma kolom URL polos, tidak ada
// cara unggah file sungguhan. Endpoint ini otomatis menyimpan
// custom_background_type="image" + value=URL sekaligus di backend.
export async function uploadCustomBackground(file: File): Promise<{ custom_background_value: string; message: string }> {
  const token = getToken();
  const form = new FormData();
  form.append("background", file);

  const res = await fetch(`${API_BASE_URL}/dashboard/page/background`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}`, ...activeWorkspaceHeaders() } : undefined,
    body: form,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? `Unggah gagal (${res.status})`);
  }
  return body;
}

// ---------- Dashboard: tautan ----------

export interface LinkItem {
  id: string;
  title: string;
  url: string;
  position: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  lock_type: "" | "age" | "code" | "subscribe";
  lock_code: string;
  lock_min_age: number | null;
  // No.99 (Sprint 14): heading/text/image/button -- builder landing page
  // blok manual, lihat catatan lingkup di BlockData backend (migrasi 000030).
  block_type: "link" | "video" | "contact_form" | "faq" | "heading" | "text" | "image" | "button" | "maps" | "accordion" | "gallery" | "audio";
  block_data: Record<string, unknown>;
  // click_count -- redesain dashboard Tautan ala Linktree: jumlah klik
  // NYATA dari analytics_events, dihitung backend.
  click_count: number;
  // custom_icon_url -- permintaan langsung pengguna: gambar kustom per
  // tautan, menggantikan ikon platform yang terdeteksi otomatis dari URL
  // (lihat lib/link-icons.ts). Kosong berarti tetap pakai deteksi otomatis.
  custom_icon_url: string;
  // icon_key -- permintaan langsung pengguna, 13 Agustus 2026: ikon dipilih
  // dari galeri siap-pakai (lib/icon-library.ts), lihat catatan lengkap di
  // PublicLink.icon_key.
  icon_key: string;
  // is_featured/thumbnail_url -- Modul "Featured Link", lihat catatan
  // lengkap di PublicLink.
  is_featured: boolean;
  thumbnail_url: string;
}

// No.77 (Sprint 9): blok konten baru (video/formulir kontak/FAQ) -- baris
// links yang sama, cuma butuh endpoint create sendiri (validasi berbeda
// dari tautan biasa); edit/hapus/reorder pakai updateLink/deleteLink/
// reorderLinks yang sudah ada.
export function createBlock(input: {
  block_type: "video" | "contact_form" | "faq" | "heading" | "text" | "image" | "button" | "maps" | "accordion" | "gallery" | "audio";
  title: string;
  url?: string;
  block_data: Record<string, unknown>;
}) {
  return apiFetch<LinkItem>("/dashboard/blocks", { method: "POST", body: JSON.stringify(input) }, { auth: true });
}

export function listLinks() {
  return apiFetch<LinkItem[]>("/dashboard/links", { method: "GET" }, { auth: true });
}

export function createLink(input: { title: string; url: string }) {
  return apiFetch<LinkItem>("/dashboard/links", { method: "POST", body: JSON.stringify(input) }, { auth: true });
}

export function updateLink(
  id: string,
  input: Partial<{
    title: string;
    url: string;
    is_active: boolean;
    starts_at: string;
    ends_at: string;
    clear_schedule: boolean;
    lock_type: "age" | "code" | "subscribe";
    lock_code: string;
    lock_min_age: number;
    clear_lock: boolean;
    block_data: Record<string, unknown>;
    is_featured: boolean;
    icon_key: string;
  }>
) {
  return apiFetch<{ message: string }>(
    `/dashboard/links/${id}`,
    { method: "PATCH", body: JSON.stringify(input) },
    { auth: true }
  );
}

export function deleteLink(id: string) {
  return apiFetch<{ message: string }>(`/dashboard/links/${id}`, { method: "DELETE" }, { auth: true });
}

// uploadLinkIcon -- permintaan langsung pengguna: unggah gambar kustom per
// tautan, menggantikan ikon platform otomatis di halaman publik. Lewat
// multipart/form-data (bukan apiFetch JSON biasa), sama seperti
// uploadCustomBackground/uploadProductCover.
export async function uploadLinkIcon(id: string, file: File): Promise<{ custom_icon_url: string; message: string }> {
  const token = getToken();
  const form = new FormData();
  form.append("icon", file);

  const res = await fetch(`${API_BASE_URL}/dashboard/links/${id}/icon`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}`, ...activeWorkspaceHeaders() } : undefined,
    body: form,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? `Unggah gagal (${res.status})`);
  }
  return body;
}

export function deleteLinkIcon(id: string) {
  return apiFetch<{ message: string }>(`/dashboard/links/${id}/icon`, { method: "DELETE" }, { auth: true });
}

// uploadLinkThumbnail -- Modul "Featured Link" (permintaan langsung
// pengguna, referensi "Featured Layout" Linktree sungguhan): thumbnail
// 16:9 manual untuk tautan non-YouTube (YouTube diturunkan otomatis
// server-side lewat updateLink biasa, lihat deriveYoutubeThumbnail
// backend). Sama pola multipart dengan uploadLinkIcon -- field beda
// ("thumbnail"), endpoint beda, dan mengaktifkan is_featured sekaligus
// (lihat UploadThumbnail, links.go).
export async function uploadLinkThumbnail(id: string, file: File): Promise<{ thumbnail_url: string; message: string }> {
  const token = getToken();
  const form = new FormData();
  form.append("thumbnail", file);

  const res = await fetch(`${API_BASE_URL}/dashboard/links/${id}/thumbnail`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}`, ...activeWorkspaceHeaders() } : undefined,
    body: form,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? `Unggah gagal (${res.status})`);
  }
  return body;
}

export function deleteLinkThumbnail(id: string) {
  return apiFetch<{ message: string }>(`/dashboard/links/${id}/thumbnail`, { method: "DELETE" }, { auth: true });
}

// uploadGalleryImage/deleteGalleryImage -- blok "gallery" (hasil analisa
// galeri tema kompetitor, 17 Agustus 2026): SATU foto per panggilan,
// ditambahkan ke array block_data.images di backend (bukan ditimpa seperti
// uploadLinkIcon/uploadLinkThumbnail) -- dipanggil berkali-kali untuk
// mengisi galeri. Respons mengembalikan array `images` TERBARU (bukan cuma
// URL foto yang baru diunggah) supaya UI tinggal render ulang, tidak perlu
// menggabungkan state lama+baru sendiri.
export async function uploadGalleryImage(id: string, file: File): Promise<{ images: string[]; message: string }> {
  const token = getToken();
  const form = new FormData();
  form.append("image", file);

  const res = await fetch(`${API_BASE_URL}/dashboard/links/${id}/gallery-images`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}`, ...activeWorkspaceHeaders() } : undefined,
    body: form,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? `Unggah gagal (${res.status})`);
  }
  return body;
}

export function deleteGalleryImage(id: string, index: number) {
  return apiFetch<{ images: string[]; message: string }>(
    `/dashboard/links/${id}/gallery-images/${index}`,
    { method: "DELETE" },
    { auth: true }
  );
}

// uploadAudioBlock/deleteAudioBlock -- blok "audio" (hasil analisa yang
// sama): SATU file audio per blok, key storage tetap (unggah ulang
// menimpa) -- pola sama seperti uploadLinkIcon. Cover art blok ini sengaja
// memakai uploadLinkIcon yang sudah ada (custom_icon_url generik untuk
// semua block_type), tidak ada endpoint cover terpisah.
// `title` di respons -- permintaan langsung pengguna, 17 Agustus 2026:
// "otomatis ambil judul dari audio yang di upload" -- backend membaca tag
// ID3 (atau fallback nama file) & MENIMPA title blok, dikembalikan di sini
// supaya UI langsung menampilkan judul baru tanpa perlu refetch terpisah.
export async function uploadAudioBlock(id: string, file: File): Promise<{ audio_url: string; title: string; message: string }> {
  const token = getToken();
  const form = new FormData();
  form.append("audio", file);

  const res = await fetch(`${API_BASE_URL}/dashboard/links/${id}/audio`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}`, ...activeWorkspaceHeaders() } : undefined,
    body: form,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? `Unggah gagal (${res.status})`);
  }
  return body;
}

export function deleteAudioBlock(id: string) {
  return apiFetch<{ message: string }>(`/dashboard/links/${id}/audio`, { method: "DELETE" }, { auth: true });
}

export function reorderLinks(items: { id: string; position: number }[]) {
  return apiFetch<{ message: string }>(
    "/dashboard/links/reorder",
    { method: "PATCH", body: JSON.stringify(items) },
    { auth: true }
  );
}

// ---------- Dashboard: halaman bio TAMBAHAN (Sprint 14, No.98) ----------
// LINGKUP: halaman tambahan (is_primary=false) punya bio/tema/tautan
// sendiri, tapi berbagi katalog produk/monetisasi yang SAMA dengan halaman
// utama -- lihat catatan lingkup lengkap di PageHandler (backend).

export interface ExtraPage {
  id: string;
  name: string;
  slug: string;
  bio: string;
  theme: string;
  is_published: boolean;
  // page_type -- No.99 (Sprint 14): "bio" (default, No.98) atau "landing"
  // (builder blok manual, lihat catatan lingkup di migrasi 000030). Modul
  // Halaman Produk: "produk" (showcase katalog Toko, batas gratis/Premium
  // TERPISAH dari pool bio/landing -- lihat migrasi 000054 & page.go).
  page_type: "bio" | "landing" | "produk";
}

// ExtraPageDetail -- Modul Halaman Toko (permintaan langsung pengguna, 7
// Agustus 2026): "semua fitur yang ada di link bio" (builder blok/tautan +
// 4 panel desain Tema/Header/Tombol/Font) sekarang juga tersedia untuk
// halaman TAMBAHAN, lewat GetPage (bukan cuma ListMyPages yang field-nya
// sengaja ringkas untuk daftar). Bentuk field SAMA PERSIS dengan MyPage
// (plus id/name/slug/page_type) supaya komponen desain bisa dipakai ulang
// untuk halaman utama maupun tambahan.
export interface ExtraPageDetail extends Omit<MyPage, "username"> {
  id: string;
  name: string;
  slug: string;
  page_type: "bio" | "landing" | "produk";
}

export function getExtraPage(id: string) {
  return apiFetch<ExtraPageDetail>(`/dashboard/pages/${id}`, { method: "GET" }, { auth: true });
}

// uploadExtraPageAvatar/uploadExtraPageBackground -- analog uploadAvatar/
// uploadCustomBackground di atas, untuk halaman TAMBAHAN (pola multipart
// yang sama, cuma target endpoint beda).
export async function uploadExtraPageAvatar(id: string, file: File): Promise<{ avatar_url: string; message: string }> {
  const token = getToken();
  const form = new FormData();
  form.append("avatar", file);

  const res = await fetch(`${API_BASE_URL}/dashboard/pages/${id}/avatar`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}`, ...activeWorkspaceHeaders() } : undefined,
    body: form,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? `Unggah gagal (${res.status})`);
  }
  return body;
}

export async function uploadExtraPageBackground(
  id: string,
  file: File
): Promise<{ custom_background_value: string; message: string }> {
  const token = getToken();
  const form = new FormData();
  form.append("background", file);

  const res = await fetch(`${API_BASE_URL}/dashboard/pages/${id}/background`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}`, ...activeWorkspaceHeaders() } : undefined,
    body: form,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? `Unggah gagal (${res.status})`);
  }
  return body;
}

export function listMyExtraPages() {
  return apiFetch<ExtraPage[]>("/dashboard/pages", { method: "GET" }, { auth: true });
}

export function createExtraPage(input: { name: string; slug: string; page_type?: "bio" | "landing" | "produk" }) {
  return apiFetch<{ id: string; message: string }>(
    "/dashboard/pages",
    { method: "POST", body: JSON.stringify(input) },
    { auth: true }
  );
}

export function updateExtraPage(
  id: string,
  input: Partial<
    {
      name: string;
      slug: string;
    } & Pick<
      MyPage,
      | "theme"
      | "display_name"
      | "bio"
      | "is_published"
      | "seo_title"
      | "seo_description"
      | "noindex"
      | "custom_background_type"
      | "custom_background_value"
      | "custom_font"
      | "custom_button_color"
      | "custom_button_style"
      | "custom_button_rounded"
      | "custom_button_shadow"
      | "custom_button_text_color"
      | "custom_page_text_color"
      | "custom_title_font"
      | "custom_title_color"
      | "custom_style_override"
      | "hide_watermark"
      | "social_instagram"
      | "social_tiktok"
      | "social_facebook"
      | "social_whatsapp"
      | "social_youtube"
      | "social_x"
      | "social_linkedin"
      | "social_telegram"
      | "social_email"
      | "layout_variant"
    >
  >
) {
  return apiFetch<{ message: string }>(
    `/dashboard/pages/${id}`,
    { method: "PATCH", body: JSON.stringify(input) },
    { auth: true }
  );
}

// updateExtraPageStickers -- analog updateMyPageStickers untuk halaman
// TAMBAHAN (Toko/Landing/Bio kedua).
export function updateExtraPageStickers(id: string, stickers: PageStickerData[]) {
  return apiFetch<{ message: string }>(
    `/dashboard/pages/${id}/stickers`,
    { method: "PUT", body: JSON.stringify({ stickers }) },
    { auth: true }
  );
}

export function deleteExtraPage(id: string) {
  return apiFetch<{ message: string }>(`/dashboard/pages/${id}`, { method: "DELETE" }, { auth: true });
}

export function listExtraPageLinks(pageId: string) {
  return apiFetch<LinkItem[]>(`/dashboard/pages/${pageId}/links`, { method: "GET" }, { auth: true });
}

export function createExtraPageLink(pageId: string, input: { title: string; url: string }) {
  return apiFetch<LinkItem>(
    `/dashboard/pages/${pageId}/links`,
    { method: "POST", body: JSON.stringify(input) },
    { auth: true }
  );
}

export function reorderExtraPageLinks(pageId: string, items: { id: string; position: number }[]) {
  return apiFetch<{ message: string }>(
    `/dashboard/pages/${pageId}/links/reorder`,
    { method: "PATCH", body: JSON.stringify(items) },
    { auth: true }
  );
}

// No.99 (Sprint 14): blok builder landing page (heading/text/image/button)
// untuk halaman TAMBAHAN -- TANPA "Create with AI", murni blok manual.
export function createExtraPageBlock(
  pageId: string,
  input: {
    block_type: "heading" | "text" | "image" | "button" | "video" | "faq" | "contact_form" | "maps" | "accordion" | "gallery" | "audio";
    title: string;
    url?: string;
    block_data: Record<string, unknown>;
  }
) {
  return apiFetch<LinkItem>(
    `/dashboard/pages/${pageId}/blocks`,
    { method: "POST", body: JSON.stringify(input) },
    { auth: true }
  );
}

/**
 * Mengambil data halaman bio TAMBAHAN publik lewat slug (jeonme.com/p/{slug}).
 * Mengembalikan null kalau tidak ditemukan (404), sama seperti getPublicPage.
 */
export async function getPublicPageBySlug(slug: string): Promise<PublicPage | null> {
  // cache: "no-store", bukan ISR -- lihat catatan panjang di getPublicPage
  // (bug ISR + notFound() macet permanen).
  const res = await fetch(`${API_BASE_URL}/p/${slug}`, { cache: "no-store" });

  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Gagal memuat halaman publik: ${res.status}`);
  }

  return res.json();
}

// ---------- Dashboard: produk ----------

// Modul Settings §3 (diferensiasi dari Lynk.id): revenue share otomatis ke
// kolaborator saat produk ini terjual. user_id HARUS kolaborator yang
// sudah diundang & aktif (lihat Collaborator.collaborator_user_id) --
// bukan UUID sembarang, UI selalu mengisinya dari daftar kolaborator.
export interface CollaboratorSplit {
  user_id: string;
  percent: number;
}

export interface DashboardProduct {
  id: string;
  name: string;
  description: string;
  price_idr: number;
  is_active: boolean;
  has_file: boolean;
  cover_image_url: string;
  flash_sale_price_idr: number | null;
  flash_sale_starts_at: string | null;
  flash_sale_ends_at: string | null;
  effective_price_idr: number;
  is_flash_sale_active: boolean;
  pwyw_enabled: boolean;
  pwyw_min_price_idr: number | null;
  watermark_enabled: boolean;
  is_pdf: boolean;
  collaborator_splits: CollaboratorSplit[];
  // sold_count -- Modul Toko (tab "Manage Items"): jumlah order LUNAS untuk
  // produk ini, dipakai kolom "Terjual" di tabel.
  sold_count: number;
  // category -- Modul Toko (Fase B1): bebas isi kreator, "" berarti belum diisi.
  category: string;
  // delivery_method/webhook_url/unclaimed_code_count -- Modul Toko (Fase C):
  // lihat migrasi 000047. unclaimed_code_count hanya relevan kalau
  // delivery_method="random_code" (dipakai sebagai "Stok" yang JUJUR).
  delivery_method: "download_link" | "manual" | "random_code" | "webhook";
  webhook_url: string;
  unclaimed_code_count: number;
  // product_kind/success_message/payment_limit_count/link_expires_at --
  // Modul Toko (Fase D): "payment_link" kumpulkan pembayaran TANPA file
  // (jasa/konsultasi), lihat migrasi 000048. "external_link" -- permintaan
  // langsung pengguna, 17 Agustus 2026: "produk bisa untuk affiliate juga
  // ke shopee dll" (migrasi 000068) -- tombol Beli membuka external_url,
  // tidak pernah lewat checkout Jeonme.
  product_kind: "digital" | "payment_link" | "external_link";
  success_message: string;
  payment_limit_count: number | null;
  link_expires_at: string | null;
  external_url: string;
  // position/is_featured -- Modul Toko (Fase E2, tab Listing): urutan
  // tampil di halaman publik. Unggulan (is_featured) selalu di atas,
  // lalu diurutkan position ASC -- lihat migrasi 000050.
  position: number;
  is_featured: boolean;
  // click_count -- permintaan langsung pengguna, 13 Agustus 2026: "di link
  // bio dan juga product tambahkan dibagian bawah statistik berapa kali
  // jumlah klik per bloknya" -- jumlah klik NYATA dari analytics_events
  // (event_type="product_click"), dihitung backend, pola sama seperti
  // LinkItem.click_count.
  click_count: number;
}

export function reorderProducts(items: { id: string; position: number }[]) {
  return apiFetch<{ message: string }>(
    "/dashboard/products/reorder",
    { method: "PATCH", body: JSON.stringify(items) },
    { auth: true }
  );
}

// ---------- Modul Toko (Fase E3): Storage & Files ----------

export interface StorageFileItem {
  product_id: string;
  product_name: string;
  has_file: boolean;
  file_size_bytes: number | null;
  cover_image_url: string;
  is_active: boolean;
}

export function listStorage() {
  return apiFetch<{ files: StorageFileItem[]; total_bytes: number }>("/dashboard/storage", { method: "GET" }, { auth: true });
}

export function deleteProductFile(productId: string) {
  return apiFetch<{ message: string }>(`/dashboard/products/${productId}/file`, { method: "DELETE" }, { auth: true });
}

// ---------- Modul Toko (Fase E4): Webhook Events ----------

export interface WebhookEventItem {
  id: string;
  product_id: string;
  product_name: string;
  order_id: string;
  url: string;
  status: "success" | "failed";
  response_code: number | null;
  error_message: string;
  attempt: number;
  created_at: string;
}

export function listWebhookEvents() {
  return apiFetch<WebhookEventItem[]>("/dashboard/webhook-events", { method: "GET" }, { auth: true });
}

// ---------- Modul Toko (Fase E5): Shop Settings ----------

export interface ShopSettings {
  shop_paused: boolean;
  shop_paused_message: string;
}

export function getShopSettings() {
  return apiFetch<ShopSettings>("/dashboard/shop-settings", { method: "GET" }, { auth: true });
}

export function updateShopSettings(input: ShopSettings) {
  return apiFetch<ShopSettings>("/dashboard/shop-settings", { method: "PATCH", body: JSON.stringify(input) }, { auth: true });
}

export function listProducts() {
  return apiFetch<DashboardProduct[]>("/dashboard/products", { method: "GET" }, { auth: true });
}

export function createProduct(input: {
  name: string;
  description?: string;
  price_idr: number;
  category?: string;
  collaborator_splits?: CollaboratorSplit[];
  // Modul Toko (Fase D): lihat DashboardProduct.product_kind dkk.
  product_kind?: "digital" | "payment_link" | "external_link";
  success_message?: string;
  payment_limit_count?: number;
  link_expires_at?: string;
  // external_url -- WAJIB kalau product_kind="external_link", lihat
  // catatan lengkap di DashboardProduct.
  external_url?: string;
}) {
  return apiFetch<{ id: string; message: string }>(
    "/dashboard/products",
    { method: "POST", body: JSON.stringify(input) },
    { auth: true }
  );
}

export function updateProduct(
  id: string,
  input: Partial<{
    name: string;
    description: string;
    price_idr: number;
    is_active: boolean;
    flash_sale_price_idr: number;
    flash_sale_starts_at: string;
    flash_sale_ends_at: string;
    clear_flash_sale: boolean;
    pwyw_enabled: boolean;
    pwyw_min_price_idr: number;
    watermark_enabled: boolean;
    event_starts_at: string;
    event_ends_at: string;
    event_location: string;
    event_is_online: boolean;
    event_capacity: number;
    clear_event_capacity: boolean;
    collaborator_splits: CollaboratorSplit[];
    category: string;
    delivery_method: "download_link" | "manual" | "random_code" | "webhook";
    webhook_url: string;
    success_message: string;
    payment_limit_count: number;
    clear_payment_limit: boolean;
    link_expires_at: string;
    clear_link_expiration: boolean;
    is_featured: boolean;
    external_url: string;
  }>
) {
  return apiFetch<{ message: string }>(
    `/dashboard/products/${id}`,
    { method: "PATCH", body: JSON.stringify(input) },
    { auth: true }
  );
}

export function deleteProduct(id: string) {
  return apiFetch<{ message: string }>(`/dashboard/products/${id}`, { method: "DELETE" }, { auth: true });
}

// ---------- Modul Toko (Fase C): metode penyerahan produk ----------

export interface ProductCode {
  id: string;
  code: string;
  claimed_at: string | null;
  buyer_email?: string;
}

export function addProductCodes(productId: string, codes: string[]) {
  return apiFetch<{ added: number; message: string }>(
    `/dashboard/products/${productId}/codes`,
    { method: "POST", body: JSON.stringify({ codes }) },
    { auth: true }
  );
}

export function listProductCodes(productId: string) {
  return apiFetch<ProductCode[]>(`/dashboard/products/${productId}/codes`, { method: "GET" }, { auth: true });
}

export function deleteProductCode(productId: string, codeId: string) {
  return apiFetch<{ message: string }>(`/dashboard/products/${productId}/codes/${codeId}`, { method: "DELETE" }, { auth: true });
}

export function getProductWebhookSecret(productId: string) {
  return apiFetch<{ webhook_secret: string }>(`/dashboard/products/${productId}/webhook-secret`, { method: "GET" }, { auth: true });
}

// markOrderFulfilled -- metode "manual": kreator menandai pesanan sudah
// diproses/dikirim lewat kanal lain.
export function markOrderFulfilled(orderId: string) {
  return apiFetch<{ message: string }>(`/dashboard/orders/${orderId}/fulfill`, { method: "POST" }, { auth: true });
}

// ---------- Modul Toko (tab Transaction) ----------

export interface OrderListItem {
  order_id: string;
  product_name: string;
  buyer_email: string;
  amount_idr: number;
  platform_fee_idr: number;
  status: "pending" | "paid" | "expired" | "failed" | "refunded";
  payment_method: string;
  created_at: string;
  fulfilled_at: string | null;
  refunded_at: string | null;
}

export function listOrders(filters?: { status?: string; search?: string }) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.search) params.set("search", filters.search);
  const qs = params.toString();
  return apiFetch<{ orders: OrderListItem[] }>(`/dashboard/orders${qs ? `?${qs}` : ""}`, { method: "GET" }, { auth: true });
}

export interface OrderLedgerEntry {
  type: string;
  amount_idr: number;
  created_at: string;
}

export interface OrderDetail {
  order_id: string;
  product_name: string;
  buyer_email: string;
  buyer_contact: string;
  amount_idr: number;
  platform_fee_idr: number;
  discount_idr: number;
  affiliate_commission_idr: number;
  status: "pending" | "paid" | "expired" | "failed" | "refunded";
  psp_reference: string;
  payment_method: string;
  created_at: string;
  fulfilled_at: string | null;
  refunded_at: string | null;
  refund_amount_idr: number | null;
  refund_reason: string;
  ledger_entries: OrderLedgerEntry[];
}

export function getOrderDetail(orderId: string) {
  return apiFetch<OrderDetail>(`/dashboard/orders/${orderId}`, { method: "GET" }, { auth: true });
}

// refundOrder -- refund PENUH lewat Midtrans (lihat catatan lingkup di
// CheckoutHandler.RefundOrder) -- tidak ada opsi jumlah sebagian.
export function refundOrder(orderId: string, reason: string) {
  return apiFetch<{ message: string; refund_amount_idr: number }>(
    `/dashboard/orders/${orderId}/refund`,
    { method: "POST", body: JSON.stringify({ reason }) },
    { auth: true }
  );
}

// Upload file lewat multipart/form-data -- TIDAK lewat apiFetch() karena
// browser wajib menentukan sendiri header Content-Type (dengan boundary)
// untuk FormData; memaksanya jadi "application/json" akan merusak body.
export async function uploadProductFile(id: string, file: File): Promise<{ message: string }> {
  const token = getToken();
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${API_BASE_URL}/dashboard/products/${id}/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}`, ...activeWorkspaceHeaders() } : undefined,
    body: form,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? `Unggah gagal (${res.status})`);
  }
  return body;
}

// Sampul produk (gambar publik permanen, beda dari file produk yang privat
// -- lihat komentar ProductHandler.UploadCover di backend).
export async function uploadProductCover(id: string, file: File): Promise<{ cover_image_url: string; message: string }> {
  const token = getToken();
  const form = new FormData();
  form.append("cover", file);

  const res = await fetch(`${API_BASE_URL}/dashboard/products/${id}/cover`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}`, ...activeWorkspaceHeaders() } : undefined,
    body: form,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? `Unggah gagal (${res.status})`);
  }
  return body;
}

export function getProductDownloadURL(id: string) {
  return apiFetch<{ download_url: string; expires_in_seconds: number }>(
    `/dashboard/products/${id}/download-url`,
    { method: "GET" },
    { auth: true }
  );
}

// ---------- Dashboard: voucher/diskon (Sprint 7, No.67) ----------

export interface DashboardVoucher {
  id: string;
  code: string;
  batch_label: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  max_discount_idr: number | null;
  min_purchase_idr: number;
  max_uses: number | null;
  used_count: number;
  is_active: boolean;
  expires_at: string | null;
  product_ids: string[];
}

export function listVouchers() {
  return apiFetch<DashboardVoucher[]>("/dashboard/vouchers", { method: "GET" }, { auth: true });
}

export function createVoucher(input: {
  code?: string;
  batch_label?: string;
  quantity?: number;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  max_discount_idr?: number;
  min_purchase_idr?: number;
  max_uses?: number;
  expires_at?: string;
  product_ids?: string[];
}) {
  return apiFetch<{ ids: string[]; message: string }>(
    "/dashboard/vouchers",
    { method: "POST", body: JSON.stringify(input) },
    { auth: true }
  );
}

export function updateVoucher(id: string, input: Partial<{ is_active: boolean; max_uses: number; expires_at: string }>) {
  return apiFetch<{ message: string }>(
    `/dashboard/vouchers/${id}`,
    { method: "PATCH", body: JSON.stringify(input) },
    { auth: true }
  );
}

export function deleteVoucher(id: string) {
  return apiFetch<{ message: string }>(`/dashboard/vouchers/${id}`, { method: "DELETE" }, { auth: true });
}

// ---------- Dashboard: bundel produk (Sprint 7, No.70) ----------
// Bundel adalah baris produk biasa (is_bundle=true) -- toggle aktif &
// hapus pakai updateProduct()/deleteProduct() yang sudah ada, cuma
// List & Create yang punya endpoint sendiri.

export interface DashboardBundle {
  id: string;
  name: string;
  price_idr: number;
  is_active: boolean;
  original_total_idr: number;
  item_names: string[];
}

export function listBundles() {
  return apiFetch<DashboardBundle[]>("/dashboard/bundles", { method: "GET" }, { auth: true });
}

export function createBundle(input: { name: string; price_idr: number; product_ids: string[] }) {
  return apiFetch<{ id: string; message: string }>(
    "/dashboard/bundles",
    { method: "POST", body: JSON.stringify(input) },
    { auth: true }
  );
}

// ---------- Dashboard: blok event (Sprint 11, No.90) ----------
// Event adalah baris produk biasa (is_event=true) -- toggle aktif & hapus
// pakai updateProduct()/deleteProduct() yang sudah ada, reschedule/edit
// kuota juga lewat updateProduct() (field event_* opsional).

export interface DashboardEvent {
  id: string;
  name: string;
  description: string;
  price_idr: number;
  is_active: boolean;
  starts_at: string;
  ends_at: string;
  timezone: string;
  location: string;
  is_online: boolean;
  capacity: number | null;
  attendee_count: number;
}

export function listEvents() {
  return apiFetch<DashboardEvent[]>("/dashboard/events", { method: "GET" }, { auth: true });
}

export function createEvent(input: {
  name: string;
  description?: string;
  price_idr: number;
  starts_at: string;
  ends_at: string;
  timezone: string;
  location?: string;
  is_online: boolean;
  capacity?: number;
}) {
  return apiFetch<{ id: string; message: string }>(
    "/dashboard/events",
    { method: "POST", body: JSON.stringify(input) },
    { auth: true }
  );
}

// ---------- Dashboard: program poin loyalitas (Sprint 13, No.94) ----------
// Penukaran reward menghasilkan voucher lewat sistem voucher (No.67) yang
// sudah ada -- lihat catatan lingkup di LoyaltyHandler backend.

export interface LoyaltySettings {
  is_active: boolean;
  point_type: "percentage" | "nominal";
  points_rate: number;
  points_limit: number | null;
  min_purchase_idr: number;
}

export function getLoyaltySettings() {
  return apiFetch<LoyaltySettings>("/dashboard/loyalty/settings", { method: "GET" }, { auth: true });
}

export function upsertLoyaltySettings(input: {
  is_active: boolean;
  point_type: "percentage" | "nominal";
  points_rate: number;
  points_limit?: number;
  clear_limit?: boolean;
  min_purchase_idr: number;
}) {
  return apiFetch<{ message: string }>(
    "/dashboard/loyalty/settings",
    { method: "PUT", body: JSON.stringify(input) },
    { auth: true }
  );
}

export interface LoyaltyReward {
  id: string;
  name: string;
  points_needed: number;
  discount_type: "percentage" | "nominal";
  discount_value: number;
  valid_until: string | null;
  is_published: boolean;
  redeemed_count: number;
}

export function listLoyaltyRewards() {
  return apiFetch<LoyaltyReward[]>("/dashboard/loyalty/rewards", { method: "GET" }, { auth: true });
}

export function createLoyaltyReward(input: {
  name: string;
  points_needed: number;
  discount_type: "percentage" | "nominal";
  discount_value: number;
  valid_until?: string;
}) {
  return apiFetch<{ id: string; message: string }>(
    "/dashboard/loyalty/rewards",
    { method: "POST", body: JSON.stringify(input) },
    { auth: true }
  );
}

export function updateLoyaltyReward(id: string, input: { is_published: boolean }) {
  return apiFetch<{ message: string }>(
    `/dashboard/loyalty/rewards/${id}`,
    { method: "PATCH", body: JSON.stringify(input) },
    { auth: true }
  );
}

export function deleteLoyaltyReward(id: string) {
  return apiFetch<{ message: string }>(`/dashboard/loyalty/rewards/${id}`, { method: "DELETE" }, { auth: true });
}

// Publik: pembeli mengecek poin & menukar reward, tanpa akun (cukup email).
export interface PublicLoyaltyReward {
  id: string;
  name: string;
  points_needed: number;
  discount_type: "percentage" | "nominal";
  discount_value: number;
  valid_until: string | null;
}

export function getMyLoyaltyPoints(username: string, email: string) {
  return apiFetch<{ total_points: number; rewards: PublicLoyaltyReward[] }>(
    `/pages/${username}/loyalty?email=${encodeURIComponent(email)}`,
    { method: "GET" }
  );
}

export function redeemLoyaltyReward(rewardId: string, buyerEmail: string) {
  return apiFetch<{ message: string; voucher_code: string; reward_name: string }>(
    `/loyalty/rewards/${rewardId}/redeem`,
    { method: "POST", body: JSON.stringify({ buyer_email: buyerEmail }) }
  );
}

// ---------- Dashboard: kartu kontak digital (Sprint 13, No.95) ----------
// LINGKUP DIPERSEMPIT: tanpa Apple/Google Wallet (butuh kredensial developer
// yang belum ada) -- pengunjung mengunduh file vCard (.vcf) standar yang
// dibuat di sisi frontend, bukan lewat integrasi Wallet pihak ketiga.

export interface BusinessCard {
  is_active: boolean;
  full_name: string;
  job_title: string;
  company: string;
  phone: string;
  whatsapp_number: string;
  email: string;
  website: string;
  collect_contact_back: boolean;
}

export function getBusinessCard() {
  return apiFetch<BusinessCard>("/dashboard/business-card", { method: "GET" }, { auth: true });
}

export function upsertBusinessCard(input: BusinessCard) {
  return apiFetch<{ message: string }>(
    "/dashboard/business-card",
    { method: "PUT", body: JSON.stringify(input) },
    { auth: true }
  );
}

export interface PublicBusinessCard {
  username: string;
  avatar_url: string;
  full_name: string;
  job_title: string;
  company: string;
  phone: string;
  whatsapp_number: string;
  email: string;
  website: string;
  collect_contact_back: boolean;
}

export async function getPublicBusinessCard(username: string): Promise<PublicBusinessCard | null> {
  // cache: "no-store", bukan ISR -- lihat catatan panjang di getPublicPage
  // (bug ISR + notFound() macet permanen), berlaku sama untuk rute publik
  // apa pun yang bisa berpindah dari ada ke notFound().
  const res = await fetch(`${API_BASE_URL}/cards/${username}`, { cache: "no-store" });

  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Gagal memuat kartu kontak: ${res.status}`);
  }

  return res.json();
}

export function submitCardContact(username: string, input: { name: string; email: string; whatsapp_number: string }) {
  return apiFetch<{ message: string }>(`/cards/${username}/contact`, { method: "POST", body: JSON.stringify(input) });
}

// ---------- Dashboard: booking konsultasi (Sprint 11, No.92) ----------
// Booking adalah baris produk biasa (is_booking=true) -- toggle aktif &
// hapus pakai updateProduct()/deleteProduct() yang sudah ada. SENGAJA
// TIDAK terhubung Google Calendar (butuh kredensial OAuth terpisah yang
// belum ada) -- kuota/bentrok jadwal dijamin lewat klaim slot atomik di
// database sendiri, lihat catatan lingkup BookingHandler backend.

export interface DashboardBooking {
  id: string;
  name: string;
  description: string;
  price_idr: number;
  is_active: boolean;
  duration_minutes: number;
  available_slot_count: number;
  booked_slot_count: number;
}

export function listBookings() {
  return apiFetch<DashboardBooking[]>("/dashboard/bookings", { method: "GET" }, { auth: true });
}

export function createBooking(input: { name: string; description?: string; price_idr: number; duration_minutes: number }) {
  return apiFetch<{ id: string; message: string }>(
    "/dashboard/bookings",
    { method: "POST", body: JSON.stringify(input) },
    { auth: true }
  );
}

export interface DashboardBookingSlot {
  id: string;
  starts_at: string;
  ends_at: string;
  is_booked: boolean;
  buyer_email?: string;
}

export function listBookingSlots(bookingId: string) {
  return apiFetch<DashboardBookingSlot[]>(`/dashboard/bookings/${bookingId}/slots`, { method: "GET" }, { auth: true });
}

export function createBookingSlots(bookingId: string, startTimes: string[]) {
  return apiFetch<{ message: string; created_count: number }>(
    `/dashboard/bookings/${bookingId}/slots`,
    { method: "POST", body: JSON.stringify({ start_times: startTimes }) },
    { auth: true }
  );
}

export function deleteBookingSlot(bookingId: string, slotId: string) {
  return apiFetch<{ message: string }>(`/dashboard/bookings/${bookingId}/slots/${slotId}`, { method: "DELETE" }, { auth: true });
}

// ---------- Dashboard: blok kelas/kursus video (Sprint 11, No.91) ----------
// Kursus adalah baris produk biasa (is_course=true) -- toggle aktif & hapus
// pakai updateProduct()/deleteProduct() yang sudah ada. Video per-bab wajib
// tautan YouTube/TikTok (sama seperti blok video No.77), bukan upload file.

export interface CourseChapterInput {
  title: string;
  description?: string;
  video_url: string;
}

export interface DashboardCourse {
  id: string;
  name: string;
  description: string;
  price_idr: number;
  is_active: boolean;
  prerequisites: string;
  chapter_count: number;
}

export function listCourses() {
  return apiFetch<DashboardCourse[]>("/dashboard/courses", { method: "GET" }, { auth: true });
}

export function createCourse(input: {
  name: string;
  description?: string;
  price_idr: number;
  prerequisites?: string;
  chapters: CourseChapterInput[];
}) {
  return apiFetch<{ id: string; message: string }>(
    "/dashboard/courses",
    { method: "POST", body: JSON.stringify(input) },
    { auth: true }
  );
}

export interface DashboardCourseChapter extends CourseChapterInput {
  id: string;
  position: number;
}

export function getCourseChapters(courseId: string) {
  return apiFetch<DashboardCourseChapter[]>(`/dashboard/courses/${courseId}/chapters`, { method: "GET" }, { auth: true });
}

export function replaceCourseChapters(courseId: string, chapters: CourseChapterInput[]) {
  return apiFetch<{ message: string }>(
    `/dashboard/courses/${courseId}/chapters`,
    { method: "PUT", body: JSON.stringify({ chapters }) },
    { auth: true }
  );
}

// ---------- Dashboard: blok dukungan/donasi (Sprint 7, No.71) ----------
// Donasi juga baris produk biasa (is_donation=true, pwyw_enabled=true),
// tapi cuma SATU per kreator -- Get+Upsert, bukan CRUD list.

export interface DonationSettings {
  product_id: string | null;
  enabled: boolean;
  title: string;
  min_amount_idr: number | null;
  // goal_* -- Gap #4 benchmark kompetitif (9 Agustus 2026, ala Saweria/
  // Trakteer). goal_amount_idr=0 berarti belum ada target dipasang.
  goal_title: string;
  goal_amount_idr: number;
  goal_raised_idr: number;
}

export function getDonationSettings() {
  return apiFetch<DonationSettings>("/dashboard/donation", { method: "GET" }, { auth: true });
}

export function upsertDonationSettings(input: {
  enabled: boolean;
  title: string;
  min_amount_idr: number;
  goal_title: string;
  goal_amount_idr: number;
}) {
  return apiFetch<{ message: string }>(
    "/dashboard/donation",
    { method: "PUT", body: JSON.stringify(input) },
    { auth: true }
  );
}

// ---------- Dashboard: Wishlist Donasi (Gap #4 benchmark kompetitif, 9
// Agustus 2026) ----------

export interface WishlistItem {
  id: string;
  name: string;
  price_idr: number;
  link: string;
  raised_idr: number;
  created_at: string;
}

export function listWishlistItems() {
  return apiFetch<WishlistItem[]>("/dashboard/donation/wishlist", { method: "GET" }, { auth: true });
}

export function createWishlistItem(input: { name: string; price_idr: number; link: string }) {
  return apiFetch<{ id: string; message: string }>(
    "/dashboard/donation/wishlist",
    { method: "POST", body: JSON.stringify(input) },
    { auth: true }
  );
}

export function deleteWishlistItem(id: string) {
  return apiFetch<{ message: string }>(`/dashboard/donation/wishlist/${id}`, { method: "DELETE" }, { auth: true });
}

// ---------- Dashboard: program afiliasi (Sprint 7, No.72) ----------
// Mode privat: kreator undang afiliator (harus sudah jadi pengguna Jeonme)
// lewat email, atur komisi custom per produk. Satu afiliator = satu
// referral_code untuk semua produk yang dikomisikan kepadanya.

export interface AffiliateProductCommission {
  product_id: string;
  product_name: string;
  commission_percent: number;
}

export interface MyAffiliate {
  id: string;
  affiliate_email: string;
  referral_code: string;
  referral_base_url: string;
  commissions: AffiliateProductCommission[];
}

export interface AffiliateProgram {
  id: string;
  creator_username: string;
  referral_code: string;
  referral_url: string;
  commissions: AffiliateProductCommission[];
}

export function upsertAffiliate(input: { affiliate_email: string; product_id: string; commission_percent: number }) {
  return apiFetch<{ message: string; affiliate_id: string }>(
    "/dashboard/affiliates",
    { method: "POST", body: JSON.stringify(input) },
    { auth: true }
  );
}

export function listMyAffiliates() {
  return apiFetch<MyAffiliate[]>("/dashboard/affiliates", { method: "GET" }, { auth: true });
}

export function listAffiliatePrograms() {
  return apiFetch<AffiliateProgram[]>("/dashboard/affiliate-programs", { method: "GET" }, { auth: true });
}

export function revokeAffiliate(affiliateId: string) {
  return apiFetch<{ message: string }>(`/dashboard/affiliates/${affiliateId}`, { method: "DELETE" }, { auth: true });
}

export function removeAffiliateCommission(affiliateId: string, productId: string) {
  return apiFetch<{ message: string }>(
    `/dashboard/affiliates/${affiliateId}/products/${productId}`,
    { method: "DELETE" },
    { auth: true }
  );
}

// ---------- Dashboard: Manajer Audiens (Sprint 8, No.73) ----------
// Blok pengumpulan lead di halaman publik + daftar kontak tersentralisasi
// (subscriber form + pembeli produk, digabung lewat email).

export interface LeadCaptureSettings {
  is_active: boolean;
  title: string;
  collect_email: boolean;
  collect_whatsapp: boolean;
}

export function getLeadCaptureSettings() {
  return apiFetch<LeadCaptureSettings>("/dashboard/lead-capture", { method: "GET" }, { auth: true });
}

export function upsertLeadCaptureSettings(input: LeadCaptureSettings) {
  return apiFetch<{ message: string }>(
    "/dashboard/lead-capture",
    { method: "PUT", body: JSON.stringify(input) },
    { auth: true }
  );
}

export interface AudienceContact {
  name: string;
  email: string;
  whatsapp_number: string;
  sources: string[];
  joined_at: string;
}

export function getAudience() {
  return apiFetch<AudienceContact[]>("/dashboard/audience", { method: "GET" }, { auth: true });
}

// ---------- Dashboard: Broadcast Email Audiens (Gap #3 benchmark
// kompetitif, 9 Agustus 2026) ----------
// Kirim email ke subscriber (bukan pembeli -- lihat catatan consent di
// migrations/000059_audience_broadcasts.up.sql).

export interface AudienceBroadcast {
  id: string;
  subject: string;
  recipient_count: number;
  sent_count: number;
  status: "queued" | "sending" | "sent" | "failed";
  created_at: string;
  completed_at: string | null;
}

export function listBroadcasts() {
  return apiFetch<AudienceBroadcast[]>("/dashboard/audience/broadcasts", { method: "GET" }, { auth: true });
}

export function createBroadcast(input: { subject: string; body: string }) {
  return apiFetch<{ message: string; id: string; recipient_count: number }>(
    "/dashboard/audience/broadcasts",
    { method: "POST", body: JSON.stringify(input) },
    { auth: true }
  );
}

// ---------- Dashboard: notifikasi social proof (Sprint 8, No.76) ----------

export interface SocialProofSettings {
  is_active: boolean;
  show_on_product_page: boolean;
  show_on_checkout: boolean;
  display_seconds: number;
  interval_seconds: number;
}

export function getSocialProofSettings() {
  return apiFetch<SocialProofSettings>("/dashboard/social-proof", { method: "GET" }, { auth: true });
}

export function upsertSocialProofSettings(input: SocialProofSettings) {
  return apiFetch<{ message: string }>(
    "/dashboard/social-proof",
    { method: "PUT", body: JSON.stringify(input) },
    { auth: true }
  );
}

// ---------- Dashboard: Analitik Pihak Ketiga (permintaan langsung
// pengguna, 12 Agustus 2026, referensi tangkapan layar panel "Analytics"
// Linktree) ----------

// PublicAnalytics -- versi PUBLIK (dikirim ke halaman jeonme.com/{username}
// milik siapa pun yang mengunjunginya), TANPA fb_access_token -- itu
// SECRET, cuma dipakai server (analytics.go, Conversions API). Beda dari
// AnalyticsSettings di bawah (versi DASHBOARD, cuma kreator pemilik akun
// yang bisa memuatnya, dan fb_access_token TETAP tidak pernah dikirim
// utuh -- cuma fb_access_token_set).
export interface PublicAnalytics {
  fb_pixel_id: string;
  ga_measurement_id: string;
  utm_enabled: boolean;
}

export interface AnalyticsSettings {
  fb_pixel_id: string;
  fb_access_token_set: boolean;
  ga_measurement_id: string;
  utm_enabled: boolean;
  is_premium: boolean;
}

export function getAnalyticsSettings() {
  return apiFetch<AnalyticsSettings>("/dashboard/analytics-settings", { method: "GET" }, { auth: true });
}

// upsertAnalyticsSettings -- fb_access_token: undefined = TIDAK disentuh
// (kreator cuma ganti field lain), "" = SENGAJA dihapus, string berisi =
// diisi/diganti. Lihat catatan sama di backend (upsertAnalyticsSettingsRequest,
// analytics_settings.go).
export function upsertAnalyticsSettings(input: {
  fb_pixel_id: string;
  fb_access_token?: string;
  ga_measurement_id: string;
  utm_enabled: boolean;
}) {
  return apiFetch<{ message: string }>(
    "/dashboard/analytics-settings",
    { method: "PUT", body: JSON.stringify(input) },
    { auth: true }
  );
}

// ---------- Dashboard: domain kustom (Sprint 9, No.81) ----------
// Bagian aplikasi saja -- lihat catatan lingkup di CustomDomainHandler
// backend (belum ada wiring Apache/SSL produksi untuk domain sembarang).

export interface DomainSettings {
  domain: string;
  verified: boolean;
  verification_token: string;
  cname_target: string;
  txt_record_name: string;
}

export function getDomainSettings() {
  return apiFetch<DomainSettings>("/dashboard/domain", { method: "GET" }, { auth: true });
}

export function setDomainSettings(domain: string) {
  return apiFetch<DomainSettings>(
    "/dashboard/domain",
    { method: "PUT", body: JSON.stringify({ domain }) },
    { auth: true }
  );
}

export function verifyDomainSettings() {
  return apiFetch<{ domain_settings: DomainSettings; message: string }>(
    "/dashboard/domain/verify",
    { method: "POST" },
    { auth: true }
  );
}

export function deleteDomainSettings() {
  return apiFetch<{ message: string }>("/dashboard/domain", { method: "DELETE" }, { auth: true });
}

// ---------- Checkout (publik, REQ-F-401) ----------

export function createCheckout(input: {
  product_id: string;
  buyer_email: string;
  buyer_contact?: string;
  voucher_code?: string;
  buyer_amount_idr?: number;
  referral_code?: string;
  // No.92 (Sprint 11): wajib diisi untuk produk booking konsultasi --
  // slot dipilih lewat getAvailableSlots() sebelum checkout ini dipanggil.
  slot_id?: string;
  // Gap #4 benchmark kompetitif (9 Agustus 2026) -- opsional, cuma relevan
  // untuk donasi: pendonor memilih mewujudkan satu item wishlist tertentu.
  wishlist_item_id?: string;
}) {
  return apiFetch<{ order_id: string; invoice_url: string }>("/checkout", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface VoucherValidation {
  valid: boolean;
  discount_idr?: number;
  final_amount_idr?: number;
  message?: string;
}

export function validateVoucher(input: { code: string; product_id: string; buyer_amount_idr?: number }) {
  return apiFetch<VoucherValidation>("/checkout/validate-voucher", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface RecentPurchase {
  product_name: string;
  masked_email: string;
  purchased_at: string;
}

export interface SocialProofFeed {
  display_seconds: number;
  interval_seconds: number;
  recent: RecentPurchase[];
}

export interface CheckoutStatus {
  order_id: string;
  status: "pending" | "paid" | "expired" | "failed";
  product_name: string;
  is_bundle: boolean;
  is_donation: boolean;
  is_course: boolean;
  is_booking: boolean;
  booked_slot_at?: string;
  social_proof: SocialProofFeed | null;
  // Modul Toko (Fase C): status penyerahan produk digital biasa -- kosong
  // untuk bundel/donasi/kursus/booking/event (lihat catatan lingkup di
  // CheckoutHandler.GetStatus).
  delivery_method?: "download_link" | "manual" | "random_code" | "webhook";
  fulfilled_at?: string;
  claimed_code?: string;
  // Modul Toko (Fase D): pesan sukses kustom kreator untuk Payment Link.
  is_payment_link: boolean;
  success_message?: string;
}

export function getCheckoutStatus(orderId: string) {
  return apiFetch<CheckoutStatus>(`/checkout/${orderId}/status`, { method: "GET" });
}

// ---------- Modul Toko (Fase E1): Ulasan ----------

export function submitReview(orderId: string, input: { rating: number; comment?: string }) {
  return apiFetch<{ message: string }>(`/checkout/${orderId}/review`, { method: "POST", body: JSON.stringify(input) });
}

export interface ProductReview {
  id: string;
  product_id: string;
  product_name: string;
  buyer_email: string;
  rating: number;
  comment: string;
  is_hidden: boolean;
  created_at: string;
}

export function listReviews() {
  return apiFetch<ProductReview[]>("/dashboard/reviews", { method: "GET" }, { auth: true });
}

export function setReviewHidden(reviewId: string, isHidden: boolean) {
  return apiFetch<{ message: string }>(
    `/dashboard/reviews/${reviewId}`,
    { method: "PATCH", body: JSON.stringify({ is_hidden: isHidden }) },
    { auth: true }
  );
}

export function deleteReview(reviewId: string) {
  return apiFetch<{ message: string }>(`/dashboard/reviews/${reviewId}`, { method: "DELETE" }, { auth: true });
}

export interface BundleDownloadItem {
  name: string;
  download_url: string;
}

// No.70: dipanggil dari halaman status checkout begitu order bundel
// lunas -- presigned URL baru dibuat tiap dipanggil (15 menit), sama
// seperti pola getProductDownloadURL.
export function getBundleItems(orderId: string) {
  return apiFetch<{ items: BundleDownloadItem[] }>(`/checkout/${orderId}/bundle-items`, { method: "GET" });
}

// No.91 (Sprint 11): dipanggil dari halaman status checkout begitu order
// kursus lunas -- video selalu tautan embed YouTube/TikTok, tidak perlu
// presigned URL sama sekali (beda dari bundel yang filenya privat).
export interface CourseChapterView {
  title: string;
  description: string;
  video_url: string;
}

export function getCourseChaptersForOrder(orderId: string) {
  return apiFetch<{ chapters: CourseChapterView[] }>(`/checkout/${orderId}/course-chapters`, { method: "GET" });
}

// ---------- Dashboard: saldo & penarikan (Sprint 4) ----------

export interface Balance {
  available_idr: number;
  held_idr: number;
  holding_period_days: number;
}

export function getBalance() {
  return apiFetch<Balance>("/dashboard/balance", { method: "GET" }, { auth: true });
}

export interface Payout {
  id: string;
  amount_idr: number;
  destination_account: string;
  status: "requested" | "processing" | "completed" | "failed";
  requested_at: string;
  completed_at?: string;
}

// Modul Settings §3 (keputusan pengguna 2026-07-31): penarikan sekarang
// WAJIB lewat payout_method tersimpan & terverifikasi, bukan lagi rekening
// bebas ketik per pengajuan.
export function createPayout(input: { amount_idr: number; payout_method_id: string }) {
  return apiFetch<{ id: string; message: string }>(
    "/dashboard/payouts",
    { method: "POST", body: JSON.stringify(input) },
    { auth: true }
  );
}

export function listPayouts() {
  return apiFetch<Payout[]>("/dashboard/payouts", { method: "GET" }, { auth: true });
}

// No.89 (Sprint 10): transparansi biaya per metode pembayaran.
export interface FeeReferenceItem {
  method: string;
  label: string;
  fee_description: string;
}

export interface FeeBreakdownItem {
  method: string;
  label: string;
  transaction_count: number;
  total_fee_idr: number;
}

export interface FeeBreakdown {
  reference: FeeReferenceItem[];
  actual: FeeBreakdownItem[];
}

export function getFeeBreakdown() {
  return apiFetch<FeeBreakdown>("/dashboard/balance/fee-breakdown", { method: "GET" }, { auth: true });
}

// ---------- Pengaturan: Payment / Payout (Modul Settings §3) ----------

export interface PayoutMethod {
  id: string;
  type: "bank_transfer" | "ewallet";
  provider: string;
  account_number_masked: string;
  account_name: string;
  is_primary: boolean;
  verified: boolean;
  created_at: string;
}

export function listPayoutMethods() {
  return apiFetch<PayoutMethod[]>("/dashboard/payout-methods", { method: "GET" }, { auth: true });
}

export function createPayoutMethod(input: {
  type: "bank_transfer" | "ewallet";
  provider: string;
  account_number: string;
  account_name: string;
}) {
  return apiFetch<{ id: string; message: string }>(
    "/dashboard/payout-methods",
    { method: "POST", body: JSON.stringify(input) },
    { auth: true }
  );
}

export function requestPayoutMethodVerification(id: string) {
  return apiFetch<{ message: string; dev_otp?: string }>(
    `/dashboard/payout-methods/${id}/request-verification`,
    { method: "POST" },
    { auth: true }
  );
}

export function verifyPayoutMethod(id: string, code: string) {
  return apiFetch<{ message: string }>(
    `/dashboard/payout-methods/${id}/verify`,
    { method: "POST", body: JSON.stringify({ code }) },
    { auth: true }
  );
}

export function setPayoutMethodPrimary(id: string) {
  return apiFetch<{ message: string }>(`/dashboard/payout-methods/${id}/primary`, { method: "PATCH" }, { auth: true });
}

export function deletePayoutMethod(id: string) {
  return apiFetch<{ message: string }>(`/dashboard/payout-methods/${id}`, { method: "DELETE" }, { auth: true });
}

export interface PayoutSchedule {
  frequency: "manual" | "weekly" | "monthly";
  min_threshold_idr: number;
}

export function getPayoutSchedule() {
  return apiFetch<PayoutSchedule>("/dashboard/payout-schedule", { method: "GET" }, { auth: true });
}

export function updatePayoutSchedule(input: PayoutSchedule) {
  return apiFetch<{ message: string }>(
    "/dashboard/payout-schedule",
    { method: "PUT", body: JSON.stringify(input) },
    { auth: true }
  );
}

// ---------- Dashboard: Langganan Premium ----------
// Watermark halaman publik & latar kustom (theme="custom") khusus Premium --
// harga (monthly_price_idr/yearly_price_idr) SELALU dibaca dari sini, tidak
// pernah di-hardcode di frontend (satu sumber kebenaran, lihat
// PREMIUM_MONTHLY_PRICE_IDR/PREMIUM_YEARLY_PRICE_IDR di backend).

export interface SubscriptionStatus {
  plan: "free" | "monthly" | "yearly";
  status: "none" | "pending_card" | "active" | "past_due" | "canceled";
  amount_idr: number;
  current_period_end: string | null;
  is_premium: boolean;
  monthly_price_idr: number;
  yearly_price_idr: number;
}

export function getSubscriptionStatus() {
  return apiFetch<SubscriptionStatus>("/dashboard/subscription", { method: "GET" }, { auth: true });
}

// getPlans -- perbaikan SEO/marketing (temuan audit, 15 Agustus 2026):
// varian PUBLIK (tanpa auth) dari harga di atas, khusus dipakai halaman
// publik (landing page, /pricing) yang belum tentu ada sesi login --
// sebelumnya halaman itu memakai angka KARANGAN karena satu-satunya
// endpoint harga (getSubscriptionStatus) mewajibkan login.
export interface Plans {
  monthly_price_idr: number;
  yearly_price_idr: number;
}

export function getPlans() {
  return apiFetch<Plans>("/plans", { method: "GET" });
}

// checkoutSubscription -- mulai pendaftaran, mengembalikan invoice_url
// (halaman Snap ter-hosting Midtrans) untuk redirect. Kartu yang dipakai di
// sini tersimpan otomatis untuk penagihan berulang siklus berikutnya.
export function checkoutSubscription(plan: "monthly" | "yearly") {
  return apiFetch<{ invoice_url: string }>(
    "/dashboard/subscription/checkout",
    { method: "POST", body: JSON.stringify({ plan }) },
    { auth: true }
  );
}

// cancelSubscription -- hentikan penagihan berulang; akses Premium tetap
// berlaku sampai current_period_end (masa yang sudah dibayar).
export function cancelSubscription() {
  return apiFetch<{ message: string }>("/dashboard/subscription/cancel", { method: "POST" }, { auth: true });
}

// ---------- Dashboard: verifikasi KYC (Sprint 10, No.84) ----------
// TIDAK memblokir penarikan -- hanya dipakai admin untuk memprioritaskan
// antrian proses manual (lihat catatan lingkup di KycHandler backend).

export interface KycStatus {
  status: "unverified" | "pending" | "verified" | "rejected";
  full_name_ktp: string;
  bank_account_name: string;
  domicile_address: string;
  business_description: string;
  promotion_channels: string;
  has_ktp_photo: boolean;
  has_selfie_photo: boolean;
  has_bank_proof: boolean;
  rejection_reason?: string;
  submitted_at?: string;
  reviewed_at?: string;
}

export function getKycStatus() {
  return apiFetch<KycStatus>("/dashboard/kyc", { method: "GET" }, { auth: true });
}

// Upload lewat multipart/form-data -- TIDAK lewat apiFetch(), sama seperti
// uploadProductFile (browser wajib menentukan sendiri header Content-Type
// dengan boundary untuk FormData).
export async function submitKyc(input: {
  full_name_ktp: string;
  bank_account_name: string;
  domicile_address: string;
  business_description: string;
  promotion_channels: string;
  ktp_photo: File;
  selfie_photo: File;
  bank_proof: File;
}): Promise<{ message: string }> {
  const token = getToken();
  const form = new FormData();
  form.append("full_name_ktp", input.full_name_ktp);
  form.append("bank_account_name", input.bank_account_name);
  form.append("domicile_address", input.domicile_address);
  form.append("business_description", input.business_description);
  form.append("promotion_channels", input.promotion_channels);
  form.append("ktp_photo", input.ktp_photo);
  form.append("selfie_photo", input.selfie_photo);
  form.append("bank_proof", input.bank_proof);

  const res = await fetch(`${API_BASE_URL}/dashboard/kyc`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? `Pengajuan gagal (${res.status})`);
  }
  return body;
}

// ---------- Analytics (Sprint 5) ----------

// Fire-and-forget: kegagalan tracking TIDAK BOLEH mengganggu pengunjung
// halaman publik, jadi error diabaikan diam-diam (bukan throw).
export function trackEvent(
  username: string,
  input: { event_type: "view" | "click" | "product_click"; link_id?: string; product_id?: string; referrer?: string }
) {
  fetch(`${API_BASE_URL}/pages/${username}/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).catch(() => {
    // Sengaja diabaikan -- lihat komentar di atas.
  });
}

// No.98 (Sprint 14): tracking untuk halaman bio TAMBAHAN, diresolusi lewat
// slug (bukan username) supaya tidak salah tercatat ke halaman utama
// kreator yang sama -- lihat AnalyticsHandler.TrackBySlug (backend).
export function trackEventBySlug(
  slug: string,
  input: { event_type: "view" | "click" | "product_click"; link_id?: string; product_id?: string; referrer?: string }
) {
  fetch(`${API_BASE_URL}/p/${slug}/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    keepalive: true,
  }).catch(() => {});
}

export interface DailyPoint {
  date: string;
  views: number;
  clicks: number;
}

export interface TopLink {
  link_id: string;
  title: string;
  clicks: number;
}

export interface TopProduct {
  product_id: string;
  name: string;
  sold_count: number;
  revenue_idr: number;
}

export interface TopReferrer {
  referrer: string;
  count: number;
}

export interface DeviceBreakdown {
  device_type: string;
  count: number;
}

export interface RevenuePoint {
  date: string;
  orders_count: number;
  revenue_idr: number;
}

export interface AnalyticsSummary {
  total_views: number;
  total_clicks: number;
  // total_orders/total_revenue_idr -- pesanan lunas pada rentang yang sama
  // seperti total_views/total_clicks (redesain Dashboard ala referensi
  // admin template, kartu "Total Order"/"Total Sales").
  total_orders: number;
  total_revenue_idr: number;
  // total_product_clicks/total_checkouts -- Modul Toko (Fase A, Overview):
  // pengganti jujur "Product View"/"Checkout" -- lihat catatan lingkup di
  // AnalyticsHandler (backend). total_checkouts menghitung SEMUA order
  // (bukan cuma lunas), jadi total_orders/total_checkouts = tingkat konversi.
  total_product_clicks: number;
  total_checkouts: number;
  daily_series: DailyPoint[];
  top_links: TopLink[];
  top_products: TopProduct[];
  top_referrers: TopReferrer[];
  device_breakdown: DeviceBreakdown[];
  // weekly_revenue -- SELALU 7 hari terakhir (rolling), independen dari
  // range_days/from-to yang dipilih di bagian lain halaman.
  weekly_revenue: RevenuePoint[];
  weekly_revenue_total_idr: number;
  range_days: number;
  from_date: string;
  to_date: string;
}

// No.86 (Sprint 10): rentang tanggal kustom -- kirim { from, to } (YYYY-MM-DD)
// untuk rentang bebas, atau { range_days } untuk preset lama (default 30
// kalau keduanya kosong). Backend menolak kalau keduanya dicampur secara
// tidak konsisten (lihat resolveDateRange).
export function getAnalyticsSummary(params?: { from?: string; to?: string; range_days?: number }) {
  const q = new URLSearchParams();
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  if (params?.range_days) q.set("range_days", String(params.range_days));
  const qs = q.toString();
  return apiFetch<AnalyticsSummary>(`/dashboard/analytics/summary${qs ? `?${qs}` : ""}`, { method: "GET" }, { auth: true });
}

// Modul Statistik (tab "Toko"): transaksi terbaru -- lihat catatan lingkup
// lengkap di CheckoutHandler.ListRecentOrders.
export interface RecentOrder {
  order_id: string;
  product_name: string;
  buyer_email: string;
  amount_idr: number;
  status: string;
  created_at: string;
}

export function listRecentOrders() {
  return apiFetch<{ orders: RecentOrder[] }>("/dashboard/orders/recent", { method: "GET" }, { auth: true }).then(
    (r) => r.orders
  );
}

// Ekspor CSV -- TIDAK lewat apiFetch() karena responsnya bukan JSON
// (text/csv), diunduh langsung sebagai file lewat Blob + anchor sementara.
export async function exportAnalyticsCSV(params?: { from?: string; to?: string; range_days?: number }): Promise<void> {
  const q = new URLSearchParams();
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  if (params?.range_days) q.set("range_days", String(params.range_days));
  const qs = q.toString();

  const token = getToken();
  const res = await fetch(`${API_BASE_URL}/dashboard/analytics/export${qs ? `?${qs}` : ""}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body?.error ?? `Ekspor gagal (${res.status})`);
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename=([^;]+)/.exec(disposition);
  const filename = match ? match[1].trim() : "analitik.csv";

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// No.96 (Sprint 13): asisten analitik TANPA LLM API sungguhan (keputusan
// eksplisit pengguna -- lihat catatan lingkup di AnalyticsHandler.Ask
// backend). Jawaban dirangkai dari templat + data analitik 30 hari terakhir
// yang sudah ada, nol biaya per-query.
export function askAnalyticsAssistant(question: string) {
  return apiFetch<{ answer: string }>(
    "/dashboard/analytics/ask",
    { method: "POST", body: JSON.stringify({ question }) },
    { auth: true }
  );
}

// ---------- Pengaturan: Danger Zone (Modul Settings §6) ----------
// DeleteAccount instan (NF-09 versi lama) DIHAPUS -- diganti alur
// nonaktifkan (reversibel kapan saja) + ajukan hapus (masa tunggu 14 hari,
// bisa dibatalkan), lihat AccountHandler backend.

export function deactivateAccount(password: string) {
  return apiFetch<{ message: string }>(
    "/dashboard/account/deactivate",
    { method: "POST", body: JSON.stringify({ password }) },
    { auth: true }
  );
}

export function reactivateAccount() {
  return apiFetch<{ message: string }>("/dashboard/account/reactivate", { method: "POST" }, { auth: true });
}

export function requestAccountDeletion(input: { username_confirmation: string; password: string }) {
  return apiFetch<{ message: string; scheduled_purge_at: string }>(
    "/dashboard/account/request-deletion",
    { method: "POST", body: JSON.stringify(input) },
    { auth: true }
  );
}

export function cancelAccountDeletion() {
  return apiFetch<{ message: string }>("/dashboard/account/cancel-deletion", { method: "POST" }, { auth: true });
}

export interface AccountDeletionStatus {
  pending: boolean;
  scheduled_purge_at?: string;
  deactivated: boolean;
}

export function getAccountDeletionStatus() {
  return apiFetch<AccountDeletionStatus>("/dashboard/account/deletion-status", { method: "GET" }, { auth: true });
}

export function exportAccountData() {
  return apiFetch<{ download_url: string; expires_in_seconds: number }>(
    "/dashboard/account/export",
    { method: "GET" },
    { auth: true }
  );
}

// ---------- Modul Onboarding ----------
// Pita "Tutorial" untuk kreator gratis maupun Premium yang belum pernah
// menutupnya -- lihat OnboardingHandler (backend) untuk kenapa ini bukan
// murni "user baru".

// checklist -- Gap #5 benchmark kompetitif (9 Agustus 2026): pita statis
// sebelumnya cuma 1 link ke Tutorial, sekarang checklist actionable
// dihitung SERVER-SIDE (satu titik kebenaran, bukan dihitung ulang di
// frontend dari beberapa fetch terpisah).
export interface OnboardingChecklistItem {
  key: string;
  label: string;
  done: boolean;
  href: string;
}

export interface OnboardingStatus {
  dismissed: boolean;
  checklist: OnboardingChecklistItem[];
  done_count: number;
  total: number;
}

export function getOnboardingStatus() {
  return apiFetch<OnboardingStatus>("/dashboard/onboarding", { method: "GET" }, { auth: true });
}

export function dismissOnboarding() {
  return apiFetch<{ message: string }>("/dashboard/onboarding/dismiss", { method: "POST" }, { auth: true });
}

// ---------- Pengaturan: Profil & Akun (Modul Settings §2) ----------

export interface SettingsProfile {
  username: string;
  category: string;
  display_name: string;
  bio: string;
  avatar_url: string;
}

export function getSettingsProfile() {
  return apiFetch<SettingsProfile>("/dashboard/settings/profile", { method: "GET" }, { auth: true });
}

export function updateSettingsProfile(input: {
  username?: string;
  category?: string;
  display_name?: string;
  bio?: string;
}) {
  return apiFetch<{ message: string; username: string }>(
    "/dashboard/settings/profile",
    { method: "PATCH", body: JSON.stringify(input) },
    { auth: true }
  );
}

/**
 * Dipanggil app/[username]/page.tsx HANYA setelah getPublicPage 404 --
 * membedakan "username memang tidak pernah ada" dari "sudah diganti,
 * masih dalam window redirect 90 hari". null berarti tidak ada redirect
 * (baik karena benar-benar tidak pernah ada, ATAUPUN pemeriksaan gagal --
 * fail-silent, jatuh ke notFound() seperti biasa, bukan melempar error).
 */
export async function resolveUsernameRedirect(username: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/usernames/${username}/redirect`);
    if (!res.ok) return null;
    const body = await res.json().catch(() => null);
    return body?.new_username ?? null;
  } catch {
    return null;
  }
}

// ---------- Pengaturan: Keamanan (Modul Settings §5) ----------

export function changePassword(input: { old_password: string; new_password: string }) {
  return apiFetch<{ message: string }>(
    "/dashboard/security/password",
    { method: "PATCH", body: JSON.stringify(input) },
    { auth: true }
  );
}

export function enable2FA() {
  return apiFetch<{ secret: string; otpauth_url: string }>(
    "/dashboard/security/2fa/enable",
    { method: "POST" },
    { auth: true }
  );
}

export function verify2FA(code: string) {
  return apiFetch<{ message: string }>(
    "/dashboard/security/2fa/verify",
    { method: "POST", body: JSON.stringify({ code }) },
    { auth: true }
  );
}

export function disable2FA(password: string) {
  return apiFetch<{ message: string }>(
    "/dashboard/security/2fa/disable",
    { method: "POST", body: JSON.stringify({ password }) },
    { auth: true }
  );
}

export function snooze2FA() {
  return apiFetch<{ message: string }>("/dashboard/security/2fa/snooze", { method: "POST" }, { auth: true });
}

export interface TwoFactorStatus {
  enabled: boolean;
  required: boolean;
  snoozed_until?: string;
}

export function get2FAStatus() {
  return apiFetch<TwoFactorStatus>("/dashboard/security/2fa/status", { method: "GET" }, { auth: true });
}

export interface ActiveSession {
  id: string;
  created_at: string;
  expires_at: string;
  user_agent: string;
  is_current: boolean;
}

export function listSessions() {
  return apiFetch<ActiveSession[]>("/dashboard/security/sessions", { method: "GET" }, { auth: true });
}

export function revokeSession(id: string) {
  return apiFetch<{ message: string }>(`/dashboard/security/sessions/${id}`, { method: "DELETE" }, { auth: true });
}

// Audit keamanan 15 Agustus 2026: cabut semua sesi lain (semua device lain)
// kecuali sesi yang sedang dipakai pemanggil.
export function revokeAllSessions() {
  return apiFetch<{ message: string; revoked: number }>(`/dashboard/security/sessions/all`, { method: "DELETE" }, { auth: true });
}

// ---------- Laporan konten publik (REQ-F-702) ----------

export function createReport(input: { target_type: "page" | "product"; target_id: string; reason: string; reporter_email?: string }) {
  return apiFetch<{ message: string }>("/reports", { method: "POST", body: JSON.stringify(input) });
}

// ---------- Panel Admin (Sprint 6) ----------
// Tidak ada endpoint "whoami role" terpisah -- AdminGuard mengecek akses
// dengan memanggil getAdminSummary() langsung; 403 berarti bukan admin.

export interface AdminSummary {
  total_users: number;
  new_users_7_days: number;
  total_orders: number;
  total_revenue_idr: number;
  pending_reports: number;
  pending_payouts: number;
}

export function getAdminSummary() {
  return apiFetch<AdminSummary>("/admin/summary", { method: "GET" }, { auth: true });
}

export interface AdminUser {
  id: string;
  email: string;
  username: string;
  role: string;
  created_at: string;
  suspended_at?: string;
  deleted_at?: string;
}

export function listAdminUsers(search?: string) {
  const query = search ? `?search=${encodeURIComponent(search)}` : "";
  return apiFetch<AdminUser[]>(`/admin/users${query}`, { method: "GET" }, { auth: true });
}

export function suspendUser(id: string) {
  return apiFetch<{ message: string }>(`/admin/users/${id}/suspend`, { method: "PATCH" }, { auth: true });
}

export function activateUser(id: string) {
  return apiFetch<{ message: string }>(`/admin/users/${id}/activate`, { method: "PATCH" }, { auth: true });
}

export interface AdminReport {
  id: string;
  target_type: string;
  target_id: string;
  reason: string;
  reporter_email: string;
  status: string;
  created_at: string;
}

export function listAdminReports(status = "pending") {
  return apiFetch<AdminReport[]>(`/admin/reports?status=${status}`, { method: "GET" }, { auth: true });
}

export function resolveReport(id: string, action: "takedown" | "dismiss") {
  return apiFetch<{ message: string }>(
    `/admin/reports/${id}/resolve`,
    { method: "PATCH", body: JSON.stringify({ action }) },
    { auth: true }
  );
}

export interface AdminPayout {
  id: string;
  username: string;
  email: string;
  amount_idr: number;
  destination_account: string;
  status: "requested" | "processing" | "completed" | "failed";
  kyc_status_at_request: "unverified" | "pending" | "verified" | "rejected";
  requested_at: string;
  completed_at?: string;
}

// REQ-F-505: rekonsiliasi disbursement lintas kreator. status default
// ("needs_action") menampilkan hanya "requested"+"processing" -- kirim
// "all" untuk melihat riwayat lengkap termasuk yang sudah selesai/gagal.
export function listAdminPayouts(status: string = "needs_action") {
  return apiFetch<AdminPayout[]>(`/admin/payouts?status=${status}`, { method: "GET" }, { auth: true });
}

export function updatePayoutStatus(id: string, status: "processing" | "completed" | "failed") {
  return apiFetch<{ message: string }>(
    `/admin/payouts/${id}`,
    { method: "PATCH", body: JSON.stringify({ status }) },
    { auth: true }
  );
}

// ---------- Admin: review KYC (Sprint 10, No.84) ----------

export interface AdminKycItem {
  user_id: string;
  username: string;
  email: string;
  status: "unverified" | "pending" | "verified" | "rejected";
  full_name_ktp: string;
  submitted_at?: string;
}

export function listAdminKyc(status: string = "pending") {
  return apiFetch<AdminKycItem[]>(`/admin/kyc?status=${status}`, { method: "GET" }, { auth: true });
}

export interface AdminKycDetail extends AdminKycItem {
  bank_account_name: string;
  domicile_address: string;
  business_description: string;
  promotion_channels: string;
  ktp_photo_url?: string;
  selfie_photo_url?: string;
  bank_proof_url?: string;
  rejection_reason?: string;
}

export function getAdminKycDetail(userId: string) {
  return apiFetch<AdminKycDetail>(`/admin/kyc/${userId}`, { method: "GET" }, { auth: true });
}

export function reviewKyc(userId: string, input: { status: "verified" | "rejected"; rejection_reason?: string }) {
  return apiFetch<{ message: string }>(
    `/admin/kyc/${userId}`,
    { method: "PATCH", body: JSON.stringify(input) },
    { auth: true }
  );
}

// ---------- Dashboard: kolaborator / multi-admin (Sprint 10, No.87) ----------
// Lihat catatan lingkup di CollaboratorHandler backend -- kolaborator HANYA
// bisa diberi akses ke tautan/produk/desain, tidak pernah saldo/KYC/domain.

// Modul Settings §4 (Team & Role Management, keputusan pengguna
// 2026-07-31): role dipetakan ke 3 flag boolean lama di backend
// (roleToPermissions di collaborator.go) -- keduanya dikembalikan API
// supaya UI bisa menampilkan ringkasan akses tanpa perlu tabel pemetaan
// terpisah di frontend.
export type TeamRole = "content_admin" | "sales_admin" | "full_access";

export interface DashboardCollaborator {
  id: string;
  email: string;
  can_edit_links: boolean;
  can_edit_products: boolean;
  can_edit_design: boolean;
  role: TeamRole;
  status: "invited" | "active" | "revoked";
  invited_at: string;
  accepted_at?: string;
  // Modul Settings §3: terisi begitu status="active" -- dipakai UI split
  // kolaborator per produk supaya kreator memilih dari daftar, bukan
  // mengetik user_id.
  collaborator_user_id?: string;
}

export function listCollaborators() {
  return apiFetch<DashboardCollaborator[]>("/dashboard/collaborators", { method: "GET" }, { auth: true });
}

// email_or_username: Modul Settings §4 acceptance criteria -- boleh akun
// existing (username), tidak mengharuskan email baru seperti Lynk.id.
export function inviteCollaborator(input: { email_or_username: string; role: TeamRole }) {
  return apiFetch<{ message: string }>(
    "/dashboard/collaborators",
    { method: "POST", body: JSON.stringify(input) },
    { auth: true }
  );
}

export function updateCollaboratorRole(id: string, role: TeamRole) {
  return apiFetch<{ message: string }>(
    `/dashboard/collaborators/${id}/role`,
    { method: "PATCH", body: JSON.stringify({ role }) },
    { auth: true }
  );
}

export function revokeCollaborator(id: string) {
  return apiFetch<{ message: string }>(`/dashboard/collaborators/${id}`, { method: "DELETE" }, { auth: true });
}

export interface PendingCollaborationInvite {
  id: string;
  owner_username: string;
  can_edit_links: boolean;
  can_edit_products: boolean;
  can_edit_design: boolean;
  role: TeamRole;
  invited_at: string;
}

export function listInvitesForMe() {
  return apiFetch<PendingCollaborationInvite[]>("/dashboard/collaboration-invites", { method: "GET" }, { auth: true });
}

export function acceptCollaborationInvite(id: string) {
  return apiFetch<{ message: string }>(`/dashboard/collaboration-invites/${id}/accept`, { method: "POST" }, { auth: true });
}

// Modul Settings §4 acceptance criteria: pemilik bisa lihat siapa mengubah
// apa dan kapan dari UI, bukan cuma di database.
export interface TeamAuditLogEntry {
  id: string;
  action: "team.invited" | "team.role_updated" | "team.revoked" | "team.invite_accepted";
  metadata?: Record<string, string>;
  created_at: string;
}

export function listTeamAuditLog() {
  return apiFetch<TeamAuditLogEntry[]>("/dashboard/team/audit-log", { method: "GET" }, { auth: true });
}

export interface Workspace {
  owner_user_id: string;
  owner_username: string;
  is_self: boolean;
  can_edit_links: boolean;
  can_edit_products: boolean;
  can_edit_design: boolean;
}

export function listWorkspaces() {
  return apiFetch<Workspace[]>("/dashboard/workspaces", { method: "GET" }, { auth: true });
}

// Pusat notifikasi dalam-app (ikon lonceng top bar dashboard, permintaan
// langsung pengguna berdasar tangkapan layar top bar Linktree).
export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  link_url: string | null;
  read: boolean;
  created_at: string;
}

export function listNotifications() {
  return apiFetch<{ notifications: AppNotification[]; unread_count: number }>(
    "/dashboard/notifications",
    { method: "GET" },
    { auth: true }
  );
}

export function markNotificationRead(id: string) {
  return apiFetch<{ message: string }>(`/dashboard/notifications/${id}/read`, { method: "POST" }, { auth: true });
}

export function markAllNotificationsRead() {
  return apiFetch<{ message: string }>("/dashboard/notifications/read-all", { method: "POST" }, { auth: true });
}
