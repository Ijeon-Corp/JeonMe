"use client";

import Link from "next/link";
import AdminGuard from "@/components/AdminGuard";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminGuard>
      <div className="flex min-h-screen">
        <aside className="w-56 border-r border-gray-200 p-4">
          <p className="mb-6 font-semibold text-primary">Jeonme Admin</p>
          <nav className="flex flex-col gap-2 text-sm">
            <Link href="/admin" className="rounded px-3 py-2 hover:bg-gray-100">
              Ringkasan
            </Link>
            <Link href="/admin/users" className="rounded px-3 py-2 hover:bg-gray-100">
              Pengguna
            </Link>
            <Link href="/admin/reports" className="rounded px-3 py-2 hover:bg-gray-100">
              Laporan
            </Link>
            <Link href="/dashboard" className="mt-4 rounded px-3 py-2 text-muted hover:bg-gray-100">
              &larr; Kembali ke Dashboard
            </Link>
          </nav>
        </aside>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </AdminGuard>
  );
}
