"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import { clearToken, logout as apiLogout } from "@/lib/api-client";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  async function handleLogout() {
    try {
      await apiLogout();
    } catch {
      // Tetap lanjut hapus token lokal walau request revoke ke server gagal
      // (mis. token sudah kedaluwarsa) -- pengguna tetap harus bisa keluar.
    } finally {
      clearToken();
      router.push("/login");
    }
  }

  return (
    <AuthGuard>
      <div className="flex min-h-screen">
        <aside className="flex w-56 flex-col justify-between border-r border-gray-200 p-4">
          <div>
            <p className="mb-6 font-semibold text-primary">Jeonme</p>
            <nav className="flex flex-col gap-2 text-sm">
              <Link href="/dashboard" className="rounded px-3 py-2 hover:bg-gray-100">
                Ringkasan
              </Link>
              <Link href="/dashboard/links" className="rounded px-3 py-2 hover:bg-gray-100">
                Tautan & Halaman
              </Link>
              <Link href="/dashboard/products" className="rounded px-3 py-2 hover:bg-gray-100">
                Produk
              </Link>
              <Link href="/dashboard/balance" className="rounded px-3 py-2 hover:bg-gray-100">
                Saldo & Penarikan
              </Link>
            </nav>
          </div>
          <button
            onClick={handleLogout}
            className="rounded px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Keluar
          </button>
        </aside>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </AuthGuard>
  );
}
