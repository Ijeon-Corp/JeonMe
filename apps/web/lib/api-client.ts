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
}

export interface PublicDonation {
  product_id: string;
  title: string;
  min_amount_idr: number;
}

export interface PublicLeadCapture {
  title: string;
  collect_email: boolean;
  collect_whatsapp: boolean;
}

export interface PublicPage {
  id: string;
  username: string;
  bio: string;
  avatar_url: string;
  theme: string;
  links: PublicLink[];
  products: PublicProduct[];
  donation: PublicDonation | null;
  lead_capture: PublicLeadCapture | null;
  social_proof: SocialProofFeed | null;
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
  const res = await fetch(`${API_BASE_URL}/pages/${username}`, {
    // Revalidate tiap 60 detik -- sesuaikan dengan kebutuhan kesegaran data
    // vs beban ke backend (lihat strategi cache di Technical Design Document).
    next: { revalidate: 60 },
  });

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

export function login(input: { email: string; password: string }) {
  return apiFetch<{ token: string }>("/auth/login", {
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
  bio: string;
  avatar_url: string;
  theme: string;
  is_published: boolean;
}

export const THEME_PRESETS = ["default", "midnight", "sunrise", "forest", "minimal"] as const;

export function getMyPage() {
  return apiFetch<MyPage>("/dashboard/page", { method: "GET" }, { auth: true });
}

export function updateMyPage(input: Partial<Pick<MyPage, "theme" | "bio" | "is_published">>) {
  return apiFetch<{ message: string }>(
    "/dashboard/page",
    { method: "PATCH", body: JSON.stringify(input) },
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
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
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
}

export function listLinks() {
  return apiFetch<LinkItem[]>("/dashboard/links", { method: "GET" }, { auth: true });
}

export function createLink(input: { title: string; url: string }) {
  return apiFetch<LinkItem>("/dashboard/links", { method: "POST", body: JSON.stringify(input) }, { auth: true });
}

export function updateLink(id: string, input: Partial<{ title: string; url: string; is_active: boolean }>) {
  return apiFetch<{ message: string }>(
    `/dashboard/links/${id}`,
    { method: "PATCH", body: JSON.stringify(input) },
    { auth: true }
  );
}

export function deleteLink(id: string) {
  return apiFetch<{ message: string }>(`/dashboard/links/${id}`, { method: "DELETE" }, { auth: true });
}

export function reorderLinks(items: { id: string; position: number }[]) {
  return apiFetch<{ message: string }>(
    "/dashboard/links/reorder",
    { method: "PATCH", body: JSON.stringify(items) },
    { auth: true }
  );
}

// ---------- Dashboard: produk ----------

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
}

export function listProducts() {
  return apiFetch<DashboardProduct[]>("/dashboard/products", { method: "GET" }, { auth: true });
}

export function createProduct(input: { name: string; description?: string; price_idr: number }) {
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

// Upload file lewat multipart/form-data -- TIDAK lewat apiFetch() karena
// browser wajib menentukan sendiri header Content-Type (dengan boundary)
// untuk FormData; memaksanya jadi "application/json" akan merusak body.
export async function uploadProductFile(id: string, file: File): Promise<{ message: string }> {
  const token = getToken();
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${API_BASE_URL}/dashboard/products/${id}/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
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
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
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

// ---------- Dashboard: blok dukungan/donasi (Sprint 7, No.71) ----------
// Donasi juga baris produk biasa (is_donation=true, pwyw_enabled=true),
// tapi cuma SATU per kreator -- Get+Upsert, bukan CRUD list.

export interface DonationSettings {
  product_id: string | null;
  enabled: boolean;
  title: string;
  min_amount_idr: number | null;
}

export function getDonationSettings() {
  return apiFetch<DonationSettings>("/dashboard/donation", { method: "GET" }, { auth: true });
}

export function upsertDonationSettings(input: { enabled: boolean; title: string; min_amount_idr: number }) {
  return apiFetch<{ message: string }>(
    "/dashboard/donation",
    { method: "PUT", body: JSON.stringify(input) },
    { auth: true }
  );
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
  email: string;
  whatsapp_number: string;
  sources: string[];
  joined_at: string;
}

export function getAudience() {
  return apiFetch<AudienceContact[]>("/dashboard/audience", { method: "GET" }, { auth: true });
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

// ---------- Checkout (publik, REQ-F-401) ----------

export function createCheckout(input: {
  product_id: string;
  buyer_email: string;
  buyer_contact?: string;
  voucher_code?: string;
  buyer_amount_idr?: number;
  referral_code?: string;
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
  social_proof: SocialProofFeed | null;
}

export function getCheckoutStatus(orderId: string) {
  return apiFetch<CheckoutStatus>(`/checkout/${orderId}/status`, { method: "GET" });
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

export function createPayout(input: { amount_idr: number; destination_account: string }) {
  return apiFetch<{ id: string; message: string }>(
    "/dashboard/payouts",
    { method: "POST", body: JSON.stringify(input) },
    { auth: true }
  );
}

export function listPayouts() {
  return apiFetch<Payout[]>("/dashboard/payouts", { method: "GET" }, { auth: true });
}

// ---------- Analytics (Sprint 5) ----------

// Fire-and-forget: kegagalan tracking TIDAK BOLEH mengganggu pengunjung
// halaman publik, jadi error diabaikan diam-diam (bukan throw).
export function trackEvent(username: string, input: { event_type: "view" | "click"; link_id?: string; referrer?: string }) {
  fetch(`${API_BASE_URL}/pages/${username}/track`, {
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

export interface AnalyticsSummary {
  total_views: number;
  total_clicks: number;
  daily_series: DailyPoint[];
  top_links: TopLink[];
  top_products: TopProduct[];
  top_referrers: TopReferrer[];
  range_days: number;
}

export function getAnalyticsSummary() {
  return apiFetch<AnalyticsSummary>("/dashboard/analytics/summary", { method: "GET" }, { auth: true });
}

// ---------- Akun (NF-09) ----------

export function deleteAccount() {
  return apiFetch<{ message: string }>("/dashboard/account", { method: "DELETE" }, { auth: true });
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
