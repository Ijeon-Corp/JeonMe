import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-4xl font-bold text-primary">Jeonme</h1>
      <p className="max-w-md text-gray-600">
        Satu link untuk semua yang kamu tawarkan — link-in-bio dan monetisasi
        produk digital untuk kreator Indonesia.
      </p>
      <Link
        href="/dashboard"
        className="rounded-lg bg-primary px-6 py-3 font-medium text-white hover:opacity-90"
      >
        Mulai buat halamanmu
      </Link>
    </main>
  );
}
