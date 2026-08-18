import Link from "next/link";
import { IconBox, IconLink, IconSparkle } from "@/components/icons";

// Modul Onboarding: halaman Tutorial STATIS (dipilih pengguna lewat
// AskUserQuestion, bukan tur interaktif spotlight/tooltip) -- dua alur
// utama yang ditanyakan langsung: "cara membuat link bio ataupun product".
// Tidak butuh data dinamis apa pun, jadi server component biasa (tidak
// perlu "use client").
const LINK_BIO_STEPS = [
  {
    title: "Atur profil halamanmu",
    body: "Buka Desain untuk mengisi nama tampilan, bio, foto profil, dan memilih tema (warna/gradien/wallpaper).",
    href: "/dashboard/design",
  },
  {
    title: "Tambahkan tautan",
    body: "Buka Link Bio, klik \"+ Tambah Tautan\", isi judul dan URL (Instagram, WhatsApp, YouTube, dll). Susun ulang urutannya dengan drag-and-drop.",
    href: "/dashboard/links",
  },
  {
    title: "Terbitkan halamanmu",
    body: "Di Desain, aktifkan \"Terbitkan halaman publik\". Halamanmu langsung bisa diakses di jeon.id/username-mu.",
    href: "/dashboard/design",
  },
];

const PRODUCT_STEPS = [
  {
    title: "Buka menu Toko",
    body: "Toko adalah tempat mengelola semua produk digital yang kamu jual (e-book, template, kelas, dll).",
    href: "/dashboard/products",
  },
  {
    title: "Tambahkan produk",
    body: "Klik \"+ Tambah Produk\", isi nama, harga, dan unggah file yang akan dikirim ke pembeli setelah pembayaran berhasil, lalu unggah gambar sampul.",
    href: "/dashboard/products",
  },
  {
    title: "Aktifkan produk",
    body: "Produk baru otomatis muncul di halaman publikmu setelah file selesai diunggah dan produk diaktifkan. Pembeli membayar lewat Midtrans, kamu terima dana lewat Saldo & Penarikan.",
    href: "/dashboard/balance",
  },
];

function StepCard({ index, title, body, href }: { index: number; title: string; body: string; href: string }) {
  return (
    <Link
      href={href}
      className="flex gap-3 rounded-2xl border border-border bg-white p-4 transition-colors hover:border-primary"
    >
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary-subtle text-xs font-bold text-primary">
        {index}
      </span>
      <span>
        <span className="block text-sm font-bold text-ink">{title}</span>
        <span className="mt-0.5 block text-xs text-muted">{body}</span>
      </span>
    </Link>
  );
}

export default function TutorialPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="flex items-center gap-2 font-heading text-2xl font-bold text-ink">
        <IconSparkle className="h-6 w-6 text-primary" />
        Tutorial
      </h1>
      <p className="mt-1 text-sm text-muted">
        Panduan singkat membuat link bio dan produk pertamamu di Jeon.id.
      </p>

      <section className="mt-6">
        <h2 className="flex items-center gap-1.5 font-heading text-sm font-bold text-ink">
          <IconLink className="h-4 w-4 text-primary" />
          Membuat Link Bio
        </h2>
        <div className="mt-3 flex flex-col gap-2.5">
          {LINK_BIO_STEPS.map((s, i) => (
            <StepCard key={s.title} index={i + 1} title={s.title} body={s.body} href={s.href} />
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="flex items-center gap-1.5 font-heading text-sm font-bold text-ink">
          <IconBox className="h-4 w-4 text-primary" />
          Menjual Produk
        </h2>
        <div className="mt-3 flex flex-col gap-2.5">
          {PRODUCT_STEPS.map((s, i) => (
            <StepCard key={s.title} index={i + 1} title={s.title} body={s.body} href={s.href} />
          ))}
        </div>
      </section>

      <p className="mt-8 rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted">
        Butuh bantuan lebih lanjut? Hubungi kami lewat halaman{" "}
        <Link href="/dashboard/audience" className="font-semibold text-primary hover:underline">
          Audiens
        </Link>{" "}
        atau email support Jeon.id.
      </p>
    </div>
  );
}
