import Link from "next/link";

// TODO: tambahkan pengecekan sesi login (JWT) di sini -- redirect ke /login
// jika token tidak ada/kedaluwarsa. Kerangka ini belum mengimplementasikan
// state management auth, hanya struktur halaman.
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 border-r border-gray-200 p-4">
        <p className="mb-6 font-semibold text-primary">Jeonme</p>
        <nav className="flex flex-col gap-2 text-sm">
          <Link href="/dashboard" className="rounded px-3 py-2 hover:bg-gray-100">
            Ringkasan
          </Link>
          <Link href="/dashboard/links" className="rounded px-3 py-2 hover:bg-gray-100">
            Tautan
          </Link>
          <Link href="/dashboard/products" className="rounded px-3 py-2 hover:bg-gray-100">
            Produk
          </Link>
          <Link href="/dashboard/balance" className="rounded px-3 py-2 hover:bg-gray-100">
            Saldo & Penarikan
          </Link>
        </nav>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
