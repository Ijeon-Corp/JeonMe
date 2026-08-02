"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { IconCheck, IconClose } from "@/components/icons";

type ToastVariant = "success" | "error";

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION_MS = 4000;

// Requirement UI wajib Modul Settings: setiap aksi simpan form HARUS
// menampilkan toast sukses/gagal, jangan silent save. Sebelum ini belum
// ada sistem toast generik di aplikasi -- SocialProofToast yang sudah ada
// khusus untuk notifikasi "X baru saja membeli" di halaman publik, bukan
// feedback form dashboard. ToastProvider dipasang sekali di dashboard
// layout supaya semua halaman dashboard (bukan cuma Settings) bisa pakai
// useToast().
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = "success") => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, message, variant }]);
      window.setTimeout(() => dismiss(id), TOAST_DURATION_MS);
    },
    [dismiss]
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex w-full max-w-sm items-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm font-medium shadow-card ${
              t.variant === "success" ? "border-primary/20 text-primary" : "border-red-200 text-red-600"
            }`}
          >
            {t.variant === "success" ? (
              <IconCheck className="h-4 w-4 shrink-0" />
            ) : (
              <IconClose className="h-4 w-4 shrink-0" />
            )}
            <span className="flex-1">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="text-muted hover:text-ink"
              aria-label="Tutup notifikasi"
            >
              <IconClose className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast harus dipakai di dalam ToastProvider");
  }
  return ctx;
}
