"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppNotification, listNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/api-client";
import { IconBell } from "@/components/icons";

// Ikon lonceng top bar dashboard (permintaan langsung pengguna berdasar
// tangkapan layar top bar Linktree) -- panel dropdown ringkas, BUKAN
// halaman riwayat penuh. Polling ringan (60 detik) dipilih daripada
// WebSocket/SSE supaya tetap "sederhana" sesuai cakupan yang disepakati,
// cukup untuk badge terasa hidup tanpa infrastruktur real-time baru.
export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // loadNotifications -- setState terjadi di dalam callback .then() (bukan
  // langsung di badan fungsi lewat await) SUPAYA aman dipanggil dari effect
  // di bawah tanpa memicu aturan react-hooks/set-state-in-effect (setState
  // sinkron langsung di badan effect). Dipakai ulang oleh polling interval &
  // tombol buka dropdown (handleToggle) -- keduanya bukan konteks effect,
  // jadi bebas dipanggil langsung.
  function loadNotifications() {
    return listNotifications()
      .then(({ notifications: items, unread_count }) => {
        setNotifications(items);
        setUnreadCount(unread_count);
      })
      .catch(() => {
        // Badge lonceng cuma kemudahan tambahan -- gagal dimuat diamkan saja,
        // jangan ganggu dashboard dengan pesan error.
      });
  }

  useEffect(() => {
    listNotifications()
      .then(({ notifications: items, unread_count }) => {
        setNotifications(items);
        setUnreadCount(unread_count);
      })
      .catch(() => {});
    const interval = setInterval(loadNotifications, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      loadNotifications().finally(() => setLoading(false));
    }
  }

  async function handleItemClick(n: AppNotification) {
    setOpen(false);
    if (!n.read) {
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
      markNotificationRead(n.id).catch(() => {
        // Best-effort -- kalau gagal, penanda dibaca lokal tetap dipertahankan
        // (lebih baik daripada memaksa render ulang jadi "belum dibaca" lagi).
      });
    }
    if (n.link_url) router.push(n.link_url);
  }

  function handleMarkAllRead() {
    setNotifications((prev) => prev.map((x) => ({ ...x, read: true })));
    setUnreadCount(0);
    markAllNotificationsRead().catch(() => {
      // Best-effort juga -- state lokal sudah terlanjur optimis, refresh
      // berikutnya (60 detik) akan mengoreksi kalau memang gagal di server.
    });
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        title="Notifikasi"
        aria-label="Notifikasi"
        className="relative flex h-8 w-8 items-center justify-center rounded-full border border-border bg-white text-ink hover:border-primary hover:text-primary"
      >
        <IconBell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-40 flex max-h-[70vh] w-80 flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-2xl">
          <div className="flex flex-shrink-0 items-center justify-between border-b border-border px-4 py-3">
            <p className="font-heading text-sm font-bold text-ink">Notifikasi</p>
            {unreadCount > 0 && (
              <button type="button" onClick={handleMarkAllRead} className="text-xs font-bold text-primary hover:underline">
                Tandai semua dibaca
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted">Memuat...</p>
            ) : notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted">Belum ada notifikasi.</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleItemClick(n)}
                  className={`flex w-full flex-col gap-0.5 border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-primary-subtle/40 ${
                    n.read ? "" : "bg-primary-subtle/20"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    {!n.read && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" aria-hidden />}
                    <p className="truncate text-sm font-bold text-ink">{n.title}</p>
                  </div>
                  <p className="text-xs text-muted">{n.body}</p>
                  <p className="mt-0.5 text-[10px] text-muted/70">{new Date(n.created_at).toLocaleString("id-ID")}</p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
