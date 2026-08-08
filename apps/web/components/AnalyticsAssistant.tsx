"use client";

import { useState } from "react";
import { ApiError, askAnalyticsAssistant } from "@/lib/api-client";
import { IconSparkle } from "@/components/icons";

const SUGGESTIONS = [
  "Dari mana traffic saya berasal?",
  "Produk apa yang paling laku?",
  "Bagaimana tren kunjungan saya?",
  "Perangkat apa yang paling banyak dipakai pengunjung?",
];

type ChatEntry = { question: string; answer: string };

// No.96 (Sprint 13): panel "tanya analitik", TANPA LLM API sungguhan --
// keputusan eksplisit pengguna (belum ada anggaran/kredensial API LLM
// per-query). Jawaban dirangkai backend dari templat + data analitik asli,
// bukan model bahasa -- ditulis jujur di deskripsi supaya tidak terkesan
// menjanjikan lebih dari yang sebenarnya dikerjakan.
export default function AnalyticsAssistant() {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<ChatEntry[]>([]);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAsk(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    setError(null);
    setAsking(true);
    try {
      const res = await askAnalyticsAssistant(trimmed);
      setHistory((prev) => [...prev, { question: trimmed, answer: res.answer }]);
      setQuestion("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memproses pertanyaan, coba lagi.");
    } finally {
      setAsking(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    handleAsk(question);
  }

  return (
    <section className="glass mt-4 rounded-2xl p-5 shadow-card">
      <div className="flex items-center gap-2">
        <IconSparkle className="h-4 w-4 text-accent" />
        <h2 className="font-heading text-sm font-bold text-ink">Tanya Analitik</h2>
      </div>
      <p className="mt-1 text-[11px] text-muted">
        Jawaban dirangkai otomatis dari data analitikmu 30 hari terakhir (bukan model AI berbayar).
      </p>

      {history.length === 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleAsk(s)}
              disabled={asking}
              className="rounded-full border border-border px-3 py-1.5 text-[11px] font-semibold text-ink hover:border-primary hover:text-primary disabled:opacity-60"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-3 flex flex-col gap-3">
          {history.map((entry, i) => (
            <div key={i} className="flex flex-col gap-1">
              <p className="self-end rounded-xl bg-primary-subtle px-3 py-1.5 text-xs font-semibold text-ink">
                {entry.question}
              </p>
              <p className="rounded-xl bg-ink/5 px-3 py-1.5 text-xs text-ink">{entry.answer}</p>
            </div>
          ))}
        </div>
      )}

      {error && <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-600">{error}</p>}

      <form onSubmit={handleSubmit} className="mt-3 flex gap-1.5">
        <input
          type="text"
          placeholder="Tanya soal trafik, produk, tren, perangkat, atau tautan..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={500}
          className="min-w-0 flex-1 rounded-lg border border-border px-3 py-2 text-xs focus:border-primary focus:outline-none"
        />
        <button
          type="submit"
          disabled={asking || !question.trim()}
          className="btn-primary flex-shrink-0 rounded-lg px-3.5 py-2 text-xs font-bold text-white disabled:opacity-60"
        >
          {asking ? "..." : "Tanya"}
        </button>
      </form>
    </section>
  );
}
