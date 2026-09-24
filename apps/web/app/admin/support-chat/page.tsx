"use client";

import { useEffect, useState } from "react";
import {
  AdminSupportThreadDetail,
  AdminSupportThreadItem,
  ApiError,
  getAdminSupportThread,
  listAdminSupportChats,
  replyAdminSupportChat,
} from "@/lib/api-client";
import AdminEmptyState from "@/components/admin/AdminEmptyState";
import { MessageCircle, Send } from "lucide-react";
import { useErrorToast } from "@/lib/use-error-toast";
import { useToast } from "@/components/Toast";
import { useModalA11y } from "@/lib/use-modal-a11y";

const PAGE_SIZE = 50;

// Live Chat dukungan -- permintaan langsung pengguna, 7 September 2026:
// "saya itu ingin ada fitur live chat tetapi yang membalas nanti dari
// pihak jeon id nya langsung bukan bot". Satu kotak masuk lintas kreator,
// pola sama persis admin/kyc/page.tsx (daftar + modal detail). filter
// default "needs_reply" -- thread yg pesan terakhirnya dari kreator
// (giliran staf membalas), lihat SupportChatHandler.AdminList (backend).
export default function AdminSupportChatPage() {
  const [items, setItems] = useState<AdminSupportThreadItem[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<"needs_reply" | "all">("needs_reply");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const { showToast } = useToast();

  const [detail, setDetail] = useState<AdminSupportThreadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // Lihat catatan lengkap di lib/use-modal-a11y.ts -- modal ini sebelumnya
  // memerangkap pengguna keyboard sama seperti modal KYC admin.
  const detailModalRef = useModalA11y(detailLoading || detail !== null, () => setDetail(null));
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  function reload(f: "needs_reply" | "all", offset = 0) {
    return listAdminSupportChats({ filter: f, search, limit: PAGE_SIZE, offset }).then((res) => {
      setTotal(res.total);
      if (offset === 0) setItems(res.items);
      else setItems((prev) => [...prev, ...res.items]);
    });
  }

  function handleFilterChange(f: "needs_reply" | "all") {
    setFilter(f);
    setLoading(true);
  }

  useEffect(() => {
    reload(filter)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat daftar live chat."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await reload(filter, 0);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mencari live chat.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadMore() {
    setLoadingMore(true);
    setError(null);
    try {
      await reload(filter, items.length);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memuat thread lainnya.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function openDetail(userId: string) {
    setError(null);
    setDetail(null);
    setReply("");
    setDetailLoading(true);
    try {
      const d = await getAdminSupportThread(userId);
      setDetail(d);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memuat percakapan.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleReply() {
    if (!detail || !reply.trim() || busy) return;
    setError(null);
    setBusy(true);
    try {
      const msg = await replyAdminSupportChat(detail.user_id, reply.trim());
      setDetail((prev) => (prev ? { ...prev, messages: [...prev.messages, msg] } : prev));
      setReply("");
      await reload(filter, 0);
      showToast("Balasan terkirim.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengirim balasan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    // mx-auto -- 24 September 2026 (audit admin): halaman ini menempel
    // kiri sementara menu admin lain terpusat, jadi konten melompat posisi
    // setiap berpindah menu dan separuh kanan layar lebar kosong -- satu-
    // satunya hal yang membuat panel ini terasa "halaman internal yang
    // ditinggalkan". Lebarnya sengaja tidak diubah.
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-2xl font-bold text-app-ink">Live Chat</h1>
      <p className="mt-1 text-sm text-app-muted">
        Percakapan dukungan dengan kreator. Balasan di sini tampil ke kreator sbg &quot;Tim Jeon.id&quot; (identitas staf
        individual tidak ditampilkan).
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => handleFilterChange("needs_reply")}
          className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            filter === "needs_reply"
              ? "border-jeon-purple border-2 border-[#111111] bg-jeon-lavender text-[#111111]"
              : "border-app-border text-app-muted hover:border-jeon-purple/50"
          }`}
        >
          Perlu Dibalas
        </button>
        <button
          type="button"
          onClick={() => handleFilterChange("all")}
          className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            filter === "all"
              ? "border-jeon-purple border-2 border-[#111111] bg-jeon-lavender text-[#111111]"
              : "border-app-border text-app-muted hover:border-jeon-purple/50"
          }`}
        >
          Semua
        </button>
        <form onSubmit={handleSearch} className="ml-auto flex gap-1.5">
          <input
            type="text"
            placeholder="Cari username/email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-48 rounded-lg border border-app-border px-3 py-1.5 text-xs focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
          />
          <button type="submit" className="rounded-lg border-2 border-jeon-ink px-3 py-1.5 text-xs font-semibold hover:border-jeon-purple">
            Cari
          </button>
        </form>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-app-muted">Memuat...</p>
      ) : (
        <>
          <div className="mt-4 flex flex-col gap-2">
            {items.map((it) => (
              <button
                key={it.user_id}
                type="button"
                onClick={() => openDetail(it.user_id)}
                className="flex items-center justify-between gap-3 rounded-xl border-2 border-jeon-ink bg-app-surface p-4 text-left shadow-card hover:border-jeon-purple/50"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-jmd border-2 border-[#111111] bg-jeon-lavender text-[#111111]">
                    <MessageCircle className="h-[18px] w-[18px]" />
                  </div>
                  <div className="min-w-0">
                    {/* truncate -- bug UI/UX ditemukan 21 September 2026
                        (audit menyeluruh): overflow horizontal terkonfirmasi
                        di mobile 390px untuk email panjang, baris ini
                        sebelumnya tanpa truncate sama sekali. */}
                    <p className="truncate text-sm font-semibold text-app-ink">
                      @{it.username} <span className="font-normal text-app-muted">({it.email})</span>
                    </p>
                    <p className="truncate text-xs text-app-muted">{it.last_message}</p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 flex-col items-end gap-1">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      it.last_sender_role === "creator" ? "bg-jeon-warning/15 text-jeon-warning" : "bg-gray-100 text-app-muted"
                    }`}
                  >
                    {it.last_sender_role === "creator" ? "Menunggu balasan" : "Sudah dibalas"}
                  </span>
                  <p className="text-[10px] text-app-muted">{new Date(it.last_message_at).toLocaleString("id-ID")}</p>
                </div>
              </button>
            ))}

            {items.length === 0 && (
              <AdminEmptyState text={filter === "needs_reply" ? "Tidak ada thread yang perlu dibalas." : "Belum ada percakapan sama sekali."} />
            )}
          </div>

          {items.length > 0 && (
            <p className="mt-3 text-xs text-app-muted">
              Menampilkan {items.length} dari {total} thread.
            </p>
          )}
          {items.length < total && (
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="mt-2 w-full rounded-lg border-2 border-jeon-ink py-2 text-sm font-semibold hover:border-jeon-purple disabled:opacity-50"
            >
              {loadingMore ? "Memuat..." : "Muat lebih"}
            </button>
          )}
        </>
      )}

      {(detailLoading || detail) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setDetail(null)}
        >
          <div
            ref={detailModalRef}
            role="dialog"
            aria-modal="true"
            aria-label="Percakapan dukungan"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            className="flex h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-jlg border-2 border-jeon-ink bg-app-surface shadow-brutal"
          >
            {detailLoading && <p className="p-6 text-sm text-app-muted">Memuat percakapan...</p>}
            {detail && (
              <>
                <div className="flex flex-shrink-0 items-center justify-between border-b border-app-border p-4">
                  <div>
                    <h2 className="font-display text-lg font-bold text-app-ink">@{detail.username}</h2>
                    <p className="text-xs text-app-muted">{detail.email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDetail(null)}
                    className="rounded-lg border-2 border-jeon-ink px-3 py-1.5 text-xs font-semibold text-app-muted hover:border-jeon-purple hover:text-jeon-purple"
                  >
                    Tutup
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  <div className="flex flex-col gap-2.5">
                    {detail.messages.map((m) => (
                      <div key={m.id} className={`flex flex-col ${m.sender_role === "admin" ? "items-end" : "items-start"}`}>
                        <span className="mb-0.5 px-1 text-[10px] font-semibold text-app-muted">
                          {m.sender_role === "admin" ? "Tim Jeon.id" : `@${detail.username}`}
                        </span>
                        <p
                          className={`max-w-[80%] whitespace-pre-wrap break-words rounded-jsm px-3 py-2 text-sm leading-relaxed ${
                            m.sender_role === "admin" ? "bg-jeon-purple text-white" : "border border-app-border bg-app-surface-2 text-app-ink"
                          }`}
                        >
                          {m.body}
                        </p>
                        <span className="mt-0.5 px-1 text-[10px] text-app-muted/70">{new Date(m.created_at).toLocaleString("id-ID")}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex-shrink-0 border-t border-app-border p-3">
                  <div className="flex items-end gap-2">
                    <textarea
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder="Tulis balasan..."
                      rows={2}
                      maxLength={2000}
                      className="flex-1 resize-none rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
                    />
                    <button
                      type="button"
                      onClick={handleReply}
                      disabled={busy || !reply.trim()}
                      className="btn-primary flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-white disabled:opacity-60"
                      aria-label="Kirim balasan"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
