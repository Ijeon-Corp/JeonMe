const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080/api/v1";

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
