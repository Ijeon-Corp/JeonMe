"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ApiError,
  PayoutMethod,
  PayoutSchedule,
  createPayoutMethod,
  deletePayoutMethod,
  getPayoutSchedule,
  listPayoutMethods,
  requestPayoutMethodVerification,
  setPayoutMethodPrimary,
  updatePayoutSchedule,
  verifyPayoutMethod,
} from "@/lib/api-client";
import { useToast } from "@/components/Toast";
import { IconChevronRight, IconTrash } from "@/components/icons";
import { confirmDelete } from "@/lib/confirm";

// Modul Settings §3 (Payment / Payout). Rekening baru WAJIB verifikasi
// (kode OTP) sebelum bisa jadi utama -- lihat PayoutMethodHandler backend.
export default function SettingsPaymentPage() {
  const { showToast } = useToast();

  const [methods, setMethods] = useState<PayoutMethod[] | null>(null);
  const [schedule, setSchedule] = useState<PayoutSchedule | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<"bank_transfer" | "ewallet">("bank_transfer");
  const [provider, setProvider] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [creating, setCreating] = useState(false);

  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyBusy, setVerifyBusy] = useState(false);

  const [frequency, setFrequency] = useState<PayoutSchedule["frequency"]>("manual");
  const [minThreshold, setMinThreshold] = useState("0");
  const [savingSchedule, setSavingSchedule] = useState(false);

  function reload() {
    return Promise.all([listPayoutMethods(), getPayoutSchedule()]).then(([m, s]) => {
      setMethods(m);
      setSchedule(s);
      setFrequency(s.frequency);
      setMinThreshold(String(s.min_threshold_idr));
    });
  }

  useEffect(() => {
    reload().catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat metode pembayaran."));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!provider.trim() || !accountNumber.trim() || !accountName.trim()) {
      setError("Semua kolom wajib diisi.");
      return;
    }
    setError(null);
    setCreating(true);
    try {
      await createPayoutMethod({ type, provider, account_number: accountNumber, account_name: accountName });
      setProvider("");
      setAccountNumber("");
      setAccountName("");
      setAdding(false);
      await reload();
      showToast("Metode pembayaran ditambahkan, verifikasi dulu sebelum dipakai.");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Gagal menambahkan metode pembayaran.", "error");
    } finally {
      setCreating(false);
    }
  }

  async function handleStartVerify(id: string) {
    try {
      const res = await requestPayoutMethodVerification(id);
      setVerifyingId(id);
      setVerifyCode(res.dev_otp ?? "");
      showToast(res.dev_otp ? `Mode dev, kode: ${res.dev_otp}` : "Kode verifikasi dikirim.");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Gagal meminta kode verifikasi.", "error");
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!verifyingId) return;
    setVerifyBusy(true);
    try {
      await verifyPayoutMethod(verifyingId, verifyCode);
      setVerifyingId(null);
      setVerifyCode("");
      await reload();
      showToast("Metode pembayaran terverifikasi.");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Kode verifikasi salah.", "error");
    } finally {
      setVerifyBusy(false);
    }
  }

  async function handleSetPrimary(id: string) {
    if (!methods) return;
    const previous = methods;
    setMethods(methods.map((m) => ({ ...m, is_primary: m.id === id })));
    try {
      await setPayoutMethodPrimary(id);
      showToast("Metode pembayaran utama diperbarui.");
    } catch (err) {
      setMethods(previous);
      showToast(err instanceof ApiError ? err.message : "Gagal menjadikan metode utama.", "error");
    }
  }

  async function handleDelete(id: string) {
    if (!methods) return;
    if (!(await confirmDelete("Hapus metode pembayaran ini?"))) return;
    const previous = methods;
    setMethods(methods.filter((m) => m.id !== id));
    try {
      await deletePayoutMethod(id);
      showToast("Metode pembayaran dihapus.");
    } catch (err) {
      setMethods(previous);
      showToast(err instanceof ApiError ? err.message : "Gagal menghapus metode pembayaran.", "error");
    }
  }

  async function handleSaveSchedule(e: React.FormEvent) {
    e.preventDefault();
    setSavingSchedule(true);
    try {
      await updatePayoutSchedule({ frequency, min_threshold_idr: Number(minThreshold) || 0 });
      showToast("Jadwal penarikan disimpan.");
      setSchedule({ frequency, min_threshold_idr: Number(minThreshold) || 0 });
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Gagal menyimpan jadwal penarikan.", "error");
    } finally {
      setSavingSchedule(false);
    }
  }

  if (methods === null || schedule === null) {
    return <div className="mx-auto max-w-2xl text-sm text-muted">Memuat...</div>;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/dashboard/settings"
        className="flex items-center gap-1 text-xs font-semibold text-muted hover:text-primary"
      >
        <IconChevronRight className="h-3.5 w-3.5 rotate-180" />
        Pengaturan
      </Link>

      <h1 className="mt-3 font-heading text-2xl font-bold text-ink">Pembayaran & Penarikan</h1>
      <p className="mt-1 text-sm text-muted">
        Kelola rekening/e-wallet dan jadwal auto-withdraw. Lihat saldo & ajukan penarikan manual di{" "}
        <Link href="/dashboard/balance" className="font-semibold text-primary hover:underline">
          Saldo & Penarikan
        </Link>
        .
      </p>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <section className="mt-6 rounded-2xl border border-border bg-white p-5">
        <h2 className="font-heading text-sm font-bold text-ink">Metode Pembayaran</h2>

        <div className="mt-3 flex flex-col gap-2">
          {methods.map((m) => (
            <div key={m.id} className="rounded-xl border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">
                    {m.provider} {m.account_number_masked}
                  </p>
                  <p className="text-xs text-muted">{m.account_name}</p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1.5">
                  {m.is_primary && (
                    <span className="rounded-full bg-primary-subtle px-2 py-0.5 text-[10px] font-bold text-primary">
                      Utama
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      m.verified ? "bg-secondary-subtle text-secondary-dark" : "bg-gray-100 text-muted"
                    }`}
                  >
                    {m.verified ? "Terverifikasi" : "Belum verifikasi"}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDelete(m.id)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"
                    title="Hapus"
                  >
                    <IconTrash className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="mt-2 flex gap-2">
                {!m.verified && verifyingId !== m.id && (
                  <button
                    type="button"
                    onClick={() => handleStartVerify(m.id)}
                    className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-semibold text-primary hover:border-primary"
                  >
                    Verifikasi
                  </button>
                )}
                {m.verified && !m.is_primary && (
                  <button
                    type="button"
                    onClick={() => handleSetPrimary(m.id)}
                    className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-semibold text-ink hover:border-primary"
                  >
                    Jadikan Utama
                  </button>
                )}
              </div>

              {verifyingId === m.id && (
                <form onSubmit={handleVerify} className="mt-2 flex gap-2 rounded-lg bg-primary-subtle/40 p-2.5">
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    placeholder="Kode 6 digit"
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value)}
                    className="flex-1 rounded-md border border-border px-2.5 py-1.5 text-xs focus:border-primary focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={verifyBusy}
                    className="rounded-md bg-primary px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
                  >
                    {verifyBusy ? "..." : "Konfirmasi"}
                  </button>
                </form>
              )}
            </div>
          ))}
          {methods.length === 0 && <p className="text-xs text-muted">Belum ada metode pembayaran.</p>}
        </div>

        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-3 rounded-xl border border-dashed border-border px-4 py-2.5 text-sm font-semibold text-primary hover:border-primary"
          >
            + Tambah Metode Pembayaran
          </button>
        ) : (
          <form onSubmit={handleCreate} className="mt-3 flex flex-col gap-2 rounded-xl border border-border p-3">
            <select
              value={type}
              onChange={(e) => setType(e.target.value as "bank_transfer" | "ewallet")}
              className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
            >
              <option value="bank_transfer">Transfer Bank</option>
              <option value="ewallet">E-Wallet</option>
            </select>
            <input
              type="text"
              required
              placeholder="Penyedia (mis. BCA, GoPay)"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
            <input
              type="text"
              required
              placeholder="Nomor rekening/e-wallet"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
            <input
              type="text"
              required
              placeholder="Nama pemilik rekening"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={creating}
                className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
              >
                {creating ? "Menyimpan..." : "Simpan"}
              </button>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="rounded-lg border border-border px-4 py-2 text-xs font-semibold text-ink"
              >
                Batal
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="mt-4 rounded-2xl border border-border bg-white p-5">
        <h2 className="font-heading text-sm font-bold text-ink">Auto-Withdraw Terjadwal</h2>
        <p className="mt-1 text-xs text-muted">
          Butuh metode pembayaran utama yang sudah terverifikasi. Penarikan otomatis berjalan kalau saldo tersedia
          sudah mencapai jumlah minimum.
        </p>
        {/* Bug ditemukan (5 Agustus 2026, audit responsif): baris ini jadi
            flex-row mulai sm: (640px), tapi <select> (lebar minimalnya
            ditentukan opsi terpanjang "Manual (tidak otomatis)") tidak
            pernah diberi min-w-0 -- di lebar tablet, total select+input+
            tombol melebihi lebar layar & memaksa SELURUH halaman melebar. */}
        <form onSubmit={handleSaveSchedule} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as PayoutSchedule["frequency"])}
            className="min-w-0 rounded-lg border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
          >
            <option value="manual">Manual (tidak otomatis)</option>
            <option value="weekly">Mingguan</option>
            <option value="monthly">Bulanan</option>
          </select>
          <input
            type="number"
            min={0}
            placeholder="Saldo minimum (Rp)"
            value={minThreshold}
            onChange={(e) => setMinThreshold(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none"
          />
          <button
            type="submit"
            disabled={savingSchedule}
            className="flex-shrink-0 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {savingSchedule ? "Menyimpan..." : "Simpan"}
          </button>
        </form>
      </section>
    </div>
  );
}
