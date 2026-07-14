const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080/api/v1";

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
  title: string;
  url: string;
}

export interface PublicProduct {
  id: string;
  name: string;
  price_idr: number;
  cover_image_url: string;
}

export interface PublicPage {
  username: string;
  bio: string;
  avatar_url: string;
  theme: string;
  links: PublicLink[];
  products: PublicProduct[];
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

export function register(input: { email: string; password: string; username: string }) {
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
  input: Partial<{ name: string; description: string; price_idr: number; is_active: boolean }>
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

export function getProductDownloadURL(id: string) {
  return apiFetch<{ download_url: string; expires_in_seconds: number }>(
    `/dashboard/products/${id}/download-url`,
    { method: "GET" },
    { auth: true }
  );
}

// ---------- Checkout (publik, REQ-F-401) ----------

export function createCheckout(input: { product_id: string; buyer_email: string; buyer_contact?: string }) {
  return apiFetch<{ order_id: string; invoice_url: string }>("/checkout", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface CheckoutStatus {
  order_id: string;
  status: "pending" | "paid" | "expired" | "failed";
  product_name: string;
}

export function getCheckoutStatus(orderId: string) {
  return apiFetch<CheckoutStatus>(`/checkout/${orderId}/status`, { method: "GET" });
}
