"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, checkUsername, register } from "@/lib/api-client";
import AuthShell from "@/components/AuthShell";
import AppleAuthButton from "@/components/AppleAuthButton";
import GoogleAuthButton from "@/components/GoogleAuthButton";
import { IconCheck, IconClose } from "@/components/icons";

type UsernameCheckState = "idle" | "checking" | "available" | "unavailable";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [usernameCheck, setUsernameCheck] = useState<{ username: string; state: UsernameCheckState; message: string }>({
    username: "",
    state: "idle",
    message: "",
  });

  // Live-check ketersediaan username -- permintaan langsung pengguna, 11
  // Agustus 2026: begitu berhenti mengetik, langsung tampilkan hasilnya di
  // bawah field (bukan menunggu submit lalu baru tahu sudah dipakai).
  // Debounce 500ms supaya tidak nge-hit API tiap huruf. SEMUA setState di
  // sini (termasuk status "checking") sengaja ditaruh di DALAM callback
  // setTimeout, bukan di badan efek langsung -- badan efek sendiri cuma
  // `setTimeout(...)` + return cleanup, tanpa satu pun setState sinkron,
  // supaya lolos aturan react-hooks/set-state-in-effect (setState sinkron
  // di badan efek dilarang, tapi setState di dalam callback async seperti
  // setTimeout/promise boleh -- itu bukan "sinkron selama commit efek").
  useEffect(() => {
    const trimmed = username.trim();
    const timer = setTimeout(() => {
      if (trimmed.length < 3) {
        setUsernameCheck({ username: trimmed, state: "idle", message: "" });
        return;
      }
      setUsernameCheck({ username: trimmed, state: "checking", message: "" });
      checkUsername(trimmed)
        .then((res) => {
          setUsernameCheck({ username: trimmed, state: res.available ? "available" : "unavailable", message: res.message });
        })
        .catch(() => {
          setUsernameCheck({ username: trimmed, state: "idle", message: "" });
        });
    }, 500);
    return () => clearTimeout(timer);
  }, [username]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!consentAccepted) {
      setError("Kamu harus menyetujui pemrosesan data pribadi untuk mendaftar.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await register({ email, username, password, consent_accepted: consentAccepted });
      // Permintaan langsung pengguna, 19 Agustus 2026: "saat sign up butuh
      // kode verif yang dikirim dari email untuk aktivasi baru setelah itu
      // akun bisa digunakan" -- akun baru SEKARANG SELALU butuh verifikasi
      // (backend menolak /auth/login sebelum kode dimasukkan), jadi
      // langsung ke halaman verifikasi tanpa mencoba login dulu (percobaan
      // login di sini cuma akan gagal 403). dev_verification_code diteruskan
      // lewat sessionStorage (bukan query string URL) supaya tidak
      // tersimpan di riwayat browser/log server -- cuma dipakai halaman
      // verifikasi utk prefill kode saat SMTP belum dikonfigurasi
      // (AppEnv != production, lihat catatan lengkap di api-client.ts).
      if (res.dev_verification_code) {
        sessionStorage.setItem("jeon_dev_verification_code", res.dev_verification_code);
      }
      router.push(`/verify-email?email=${encodeURIComponent(email)}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mendaftar, coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  // Abaikan hasil check yang sudah basi (username berubah lagi setelah hasil
  // sebelumnya datang, sebelum debounce berikutnya sempat jalan).
  const usernameState: UsernameCheckState = usernameCheck.username === username.trim() ? usernameCheck.state : "idle";

  // requireConsent -- dipakai KEDUA tombol OAuth (Google & Apple, permintaan
  // langsung pengguna 20 Agustus 2026: "tambahkan juga login via apple") --
  // checkbox persetujuan data pribadi (NF-09, UU PDP) WAJIB tercentang dulu
  // sebelum redirect ke penyedia OAuth mana pun terjadi, karena begitu
  // redirect jalan akun bisa langsung terbuat di backend tanpa titik
  // konfirmasi lain.
  function requireConsent(): boolean {
    if (!consentAccepted) {
      setError("Kamu harus menyetujui pemrosesan data pribadi untuk mendaftar.");
      return false;
    }
    return true;
  }

  return (
    <AuthShell>
      <h1 className="font-heading text-3xl font-extrabold leading-tight text-ink sm:text-4xl" style={{ textWrap: "balance" }}>
        Daftar ke Jeon.id
      </h1>
      <p className="mt-3 text-sm text-muted">
        Buat halaman bio, jualan produk digital, & terima dukungan dari satu link -- <span className="font-semibold text-ink">gratis</span>.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted">Klaim link bio gratismu</label>
          {/* Prefiks "jeon.id/" MENYATU dengan input (referensi layout
              signup Beacons) -- lebih jelas ini adalah alamat, bukan cuma
              teks bantuan terpisah di bawah field seperti sebelumnya. */}
          <div
            className={`flex items-center rounded-xl border bg-white pl-3.5 transition-colors focus-within:ring-2 ${
              usernameState === "available"
                ? "border-secondary focus-within:border-secondary focus-within:ring-secondary/20"
                : usernameState === "unavailable"
                ? "border-red-300 focus-within:border-red-400 focus-within:ring-red-200"
                : "border-border focus-within:border-primary focus-within:ring-primary/20"
            }`}
          >
            <span className="flex-shrink-0 text-sm font-semibold text-muted">jeon.id/</span>
            <input
              type="text"
              required
              minLength={3}
              maxLength={30}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username-kamu"
              // focus:!shadow-none (BUKAN cuma focus:shadow-none, `!` wajib)
              // -- input INI menyatu di tengah pil "jeon.id/[input]",
              // bukan kotak fokus berdiri sendiri; glow fokus global
              // (globals.css, `input:not([type=checkbox]):not([type=radio])
              // :focus`) selektornya justru LEBIH spesifik daripada utility
              // Tailwind biasa (tiap :not() ikut menyumbang specificity),
              // jadi focus:shadow-none polos KALAH & glow tetap muncul
              // sebagai "blok" abu-abu melayang persis di batas kiri input
              // (bukan ngikutin bentuk pil bulat pembungkusnya) -- dilaporkan
              // pengguna via screenshot, dikonfirmasi lewat inspeksi
              // getComputedStyle sebelum akhirnya ketahuan butuh `!important`.
              // Pembungkus <div> di atas sudah menampilkan highlight fokus
              // sendiri lewat focus-within:ring, jadi glow bawaan pada
              // <input> mentahnya harus benar-benar dimatikan.
              className="w-full min-w-0 bg-transparent py-3 pl-0.5 pr-3.5 text-sm text-ink focus:!shadow-none focus:outline-none"
            />
          </div>
          {usernameState !== "idle" && (
            <p
              className={`mt-1.5 flex items-center gap-1 text-xs font-medium ${
                usernameState === "available"
                  ? "text-secondary-dark"
                  : usernameState === "unavailable"
                  ? "text-red-600"
                  : "text-muted"
              }`}
            >
              {usernameState === "checking" && "Memeriksa ketersediaan..."}
              {usernameState === "available" && (
                <>
                  <IconCheck className="h-3.5 w-3.5 flex-shrink-0" /> Username tersedia
                </>
              )}
              {usernameState === "unavailable" && (
                <>
                  <IconClose className="h-3.5 w-3.5 flex-shrink-0" /> {usernameCheck.message}
                </>
              )}
            </p>
          )}
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-border px-3.5 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted">Password</label>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-border px-3.5 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <p className="mt-1 text-xs text-muted">Minimal 8 karakter.</p>
        </div>

        <label className="flex items-start gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={consentAccepted}
            onChange={(e) => setConsentAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 flex-shrink-0"
          />
          Saya menyetujui pemrosesan data pribadi saya oleh Jeon.id sesuai kebutuhan layanan
          (sesuai UU PDP).
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading || usernameState === "checking" || usernameState === "unavailable"}
          className="mt-2 rounded-full bg-primary px-5 py-3.5 text-sm font-bold text-white shadow-card transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
        >
          {loading ? "Memproses..." : "Daftar Gratis"}
        </button>
      </form>

      {/* Google -- permintaan langsung pengguna, 20 Agustus 2026: "pindah
          kan daftar dengan google nya dibagian bawah setelah password" --
          SEBELUMNYA di atas form (di atas divider "atau"), sekarang di
          bawah form (checkbox persetujuan data pribadi sudah kelihatan di
          atasnya begitu discroll ke sini). onBeforeRedirect TIDAK berubah
          -- checkbox tetap wajib tercentang dulu sebelum redirect ke
          Google, cuma posisi tombolnya yang pindah. */}
      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">atau</span>
        <div className="h-px flex-1 bg-border" />
      </div>
      {/* AppleAuthButton -- permintaan langsung pengguna, 20 Agustus 2026:
          "tambahkan juga login via apple". onBeforeRedirect sama persis
          dengan Google -- checkbox persetujuan data pribadi wajib
          tercentang dulu untuk KEDUA tombol, satu fungsi dipakai ulang
          bukan didefinisikan dobel. */}
      <div className="flex flex-col gap-2.5">
        <GoogleAuthButton label="Daftar dengan Google" onBeforeRedirect={requireConsent} />
        <AppleAuthButton label="Daftar dengan Apple" onBeforeRedirect={requireConsent} />
      </div>

      <p className="mt-8 text-center text-sm text-muted">
        Sudah punya akun?{" "}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          Masuk
        </Link>
      </p>
    </AuthShell>
  );
}
