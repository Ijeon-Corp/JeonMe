"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import Link from "next/link";
import {
  ApiError,
  SupportChatMessage,
  listSupportChatMessages,
  markSupportChatRead,
  sendSupportChatMessage,
} from "@/lib/api-client";
import { buildHelpFaqGroups } from "@/lib/help-faq";
import { IconChevronRight, IconClose } from "@/components/icons";
import { useLocale } from "@/lib/locale-context";

// SupportChatWidget -- Live Chat dukungan (permintaan langsung pengguna, 7
// September 2026: "saya itu ingin ada fitur live chat tetapi yang membalas
// nanti dari pihak jeon id nya langsung bukan bot tapi tetep ada
// pertanyaan faq yang langsung bisa diberikan jawaban nya ke creator").
// Bubble mengambang di SEMUA halaman dashboard (dikonfirmasi via
// AskUserQuestion), dipasang sekali di dashboard/layout.tsx.
//
// Tab FAQ -- pakai ulang konten statis halaman Bantuan (lib/help-faq.ts,
// SAMA PERSIS, bukan CMS baru) -- klik pertanyaan menampilkan jawaban
// LANGSUNG DI SINI, LOKAL, TANPA panggilan jaringan sama sekali. Tab Chat
// -- percakapan sungguhan dengan staf Jeon.id (BUKAN bot), balasan admin
// TIDAK PERNAH menampilkan identitas staf individual, cuma label umum
// "Tim Jeon.id" (lihat sender_admin_id, migrasi 000095 backend).
//
// Polling -- SATU effect (model persis NotificationBell.tsx): interval
// dipercepat (~4.5 detik) selagi panel terbuka, dilambatkan (~25 detik)
// selagi tertutup, cuma untuk badge unread. TIDAK ADA WebSocket/SSE,
// konsisten dgn seluruh codebase ini (lihat komentar di NotificationBell.tsx).
export default function SupportChatWidget() {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"faq" | "chat">("faq");
  const [messages, setMessages] = useState<SupportChatMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  // Satu effect polling, interval berbeda tergantung `open` -- pola sama
  // NotificationBell.tsx (setState di dalam .then(), bukan sinkron di
  // badan effect, supaya lolos react-hooks/set-state-in-effect).
  useEffect(() => {
    function refresh() {
      return listSupportChatMessages()
        .then(({ messages: items, unread_count }) => {
          setUnreadCount(unread_count);
          if (open) setMessages(items);
        })
        .catch(() => {
          // Badge/riwayat cuma kemudahan tambahan -- gagal poll diamkan,
          // sama seperti NotificationBell.
        });
    }
    refresh();
    const interval = setInterval(refresh, open ? 4500 : 25_000);
    return () => clearInterval(interval);
  }, [open]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (open && activeTab === "chat") threadEndRef.current?.scrollIntoView({ block: "end" });
  }, [open, activeTab, messages.length]);

  function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next) setActiveTab(unreadCount > 0 ? "chat" : "faq");
  }

  function handleTabChange(tab: "faq" | "chat") {
    setActiveTab(tab);
    if (tab === "chat" && unreadCount > 0) {
      setUnreadCount(0);
      markSupportChatRead().catch(() => {
        // Best-effort -- poll berikutnya akan mengoreksi kalau memang gagal.
      });
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const msg = await sendSupportChatMessage(body);
      setMessages((prev) => [...prev, msg]);
      setDraft("");
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : t("dashboard.components.supportChatWidget.chatSendError"));
    } finally {
      setSending(false);
    }
  }

  const faqGroups = buildHelpFaqGroups(t);

  return (
    <div ref={containerRef} className="fixed bottom-20 right-4 z-40 md:bottom-6 md:right-6">
      {open && (
        <div className="mb-3 flex h-[28rem] w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-jmd border-2 border-jeon-ink bg-app-surface shadow-2xl">
          <div className="flex flex-shrink-0 items-center justify-between border-b border-app-border bg-jeon-lavender px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-bold text-[#111111]">{t("dashboard.components.supportChatWidget.panelTitle")}</p>
              <p className="truncate text-[11px] text-[#111111]/70">{t("dashboard.components.supportChatWidget.panelSubtitle")}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("dashboard.components.supportChatWidget.closeAriaLabel")}
              className="flex-shrink-0 rounded-full p-1.5 text-[#111111]/70 hover:bg-white/40 hover:text-[#111111]"
            >
              <IconClose className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-shrink-0 border-b border-app-border">
            <button
              type="button"
              onClick={() => handleTabChange("faq")}
              className={`flex-1 border-b-2 py-2.5 text-xs font-bold transition-colors ${
                activeTab === "faq" ? "border-jeon-purple text-jeon-purple" : "border-transparent text-app-muted hover:text-app-ink"
              }`}
            >
              {t("dashboard.components.supportChatWidget.tabFaq")}
            </button>
            <button
              type="button"
              onClick={() => handleTabChange("chat")}
              className={`relative flex-1 border-b-2 py-2.5 text-xs font-bold transition-colors ${
                activeTab === "chat" ? "border-jeon-purple text-jeon-purple" : "border-transparent text-app-muted hover:text-app-ink"
              }`}
            >
              {t("dashboard.components.supportChatWidget.tabChat")}
              {unreadCount > 0 && (
                <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
          </div>

          {activeTab === "faq" ? (
            <div className="flex-1 overflow-y-auto p-3">
              <p className="mb-2 px-1 text-[11px] text-app-muted">{t("dashboard.components.supportChatWidget.faqHint")}</p>
              <div className="flex flex-col gap-3">
                {faqGroups.map((g) => (
                  <div key={g.label}>
                    <p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wider text-app-muted">{g.label}</p>
                    <div className="overflow-hidden rounded-lg border border-app-border">
                      {g.items.map((it) => {
                        const key = `${g.label}:${it.q}`;
                        const isExpanded = expandedFaq === key;
                        return (
                          <div key={key} className="border-b border-app-border last:border-0">
                            <button
                              type="button"
                              onClick={() => setExpandedFaq(isExpanded ? null : key)}
                              className="flex w-full items-center justify-between gap-2 bg-app-surface px-3 py-2.5 text-left text-xs font-semibold text-app-ink hover:bg-jeon-purple/5"
                            >
                              {it.q}
                              <IconChevronRight className={`h-3.5 w-3.5 flex-shrink-0 text-app-muted transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                            </button>
                            {isExpanded && <p className="bg-app-surface-2 px-3 py-2.5 text-xs leading-relaxed text-app-muted">{it.a}</p>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <Link
                href="/dashboard/help"
                onClick={() => setOpen(false)}
                className="mt-3 block px-1 text-xs font-bold text-jeon-purple hover:underline"
              >
                {t("dashboard.components.supportChatWidget.faqSeeAll")}
              </Link>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-3">
                {messages.length === 0 ? (
                  <p className="px-1 py-6 text-center text-xs text-app-muted">{t("dashboard.components.supportChatWidget.chatEmptyState")}</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {messages.map((m) => (
                      <div key={m.id} className={`flex flex-col ${m.sender_role === "creator" ? "items-end" : "items-start"}`}>
                        <span className="mb-0.5 px-1 text-[10px] font-semibold text-app-muted">
                          {m.sender_role === "creator"
                            ? t("dashboard.components.supportChatWidget.chatYouLabel")
                            : t("dashboard.components.supportChatWidget.chatTeamLabel")}
                        </span>
                        <p
                          className={`max-w-[85%] whitespace-pre-wrap break-words rounded-jsm px-3 py-2 text-xs leading-relaxed ${
                            m.sender_role === "creator" ? "bg-jeon-purple text-white" : "border border-app-border bg-app-surface-2 text-app-ink"
                          }`}
                        >
                          {m.body}
                        </p>
                      </div>
                    ))}
                    <div ref={threadEndRef} />
                  </div>
                )}
              </div>
              <form onSubmit={handleSend} className="flex-shrink-0 border-t border-app-border p-2.5">
                {sendError && <p className="mb-1.5 text-[11px] font-semibold text-red-600">{sendError}</p>}
                <div className="flex items-end gap-2">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend(e);
                      }
                    }}
                    placeholder={t("dashboard.components.supportChatWidget.chatComposerPlaceholder")}
                    rows={1}
                    maxLength={2000}
                    className="min-h-9 flex-1 resize-none rounded-lg border border-app-border px-3 py-2 text-xs focus:border-jeon-purple focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={sending || !draft.trim()}
                    aria-label={t("dashboard.components.supportChatWidget.chatSendButton")}
                    className="btn-primary flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-white disabled:opacity-60"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={handleToggle}
        aria-label={t("dashboard.components.supportChatWidget.bubbleLabel")}
        className="relative flex h-14 w-14 items-center justify-center rounded-full border-2 border-jeon-ink bg-jeon-purple text-white shadow-brutal transition-transform hover:-translate-y-0.5"
      >
        <MessageCircle className="h-6 w-6" />
        {!open && unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-app-surface bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
    </div>
  );
}
