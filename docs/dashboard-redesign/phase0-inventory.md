# Dashboard Redesign — Phase 0: Safety & Inventory

> Artefak keselamatan sebelum migrasi visual (JEONID-DASHBOARD-REDESIGN-SPEC.md §25 Phase 0).
> Tanggal: 31 Agustus 2026 · Baseline rilis: `v0.36.0`.

## 1. Sumber kebenaran

- **Fitur/API/route/permission/state existing** → `DASHBOARD-CURRENT-STATE.md` (root).
  §5 mencatat API-per-halaman; §7 = route map lengkap (dipakai sebagai route
  regression checklist).
- **Target IA/visual/komponen/UX** → `JEONID-DASHBOARD-REDESIGN-SPEC.md` (root).

## 2. Route regression checklist

Semua route di `DASHBOARD-CURRENT-STATE.md` §7 wajib: (a) tetap resolve, (b) memuat
konten tanpa page error, (c) fungsi utamanya jalan. Verifikasi live terakhir
(31 Agustus 2026, staging, akun brian): 12 route utama 200 + konten + 0 error;
14 leaf nav klik-route benar. Ulangi cek yang sama setiap fase sebelum push.

## 3. Peta warna status hard-coded (target sentralisasi StatusBadge, Phase 8 cleanup)

`grep -rloE "bg-(red|green|amber|blue)-(50|100)|text-(red|green|amber|blue)-(500|600|700|800)"`
atas `app/dashboard` + `components`: **66 file**. Terbanyak:

| Hits | File |
|---:|---|
| 19 | app/dashboard/links/page.tsx |
| 12 | app/dashboard/import/page.tsx |
| 11 | app/dashboard/products/page.tsx |
| 8 | app/dashboard/kyc/page.tsx |
| 8 | app/dashboard/audience/page.tsx |
| 8 | app/dashboard/(monetisasi)/donation/page.tsx |
| 7 | app/dashboard/settings/security/page.tsx |
| 6 | app/dashboard/settings/danger-zone/page.tsx |
| 6 | app/dashboard/analytics/page.tsx |
| 6 | app/dashboard/(monetisasi)/courses/page.tsx |

Catatan: dark-mode override untuk kelas-kelas ini hidup di `globals.css` scope
`.app-shell` — JANGAN dihapus sampai semua caller pindah ke `StatusBadge`/token
soft (Phase 8, setelah dua rilis stabil).

## 4. Infra test

Tidak ada jest/vitest/playwright-config di repo (per 31 Agustus 2026). Level
verifikasi per fase (realistis, sesuai CLAUDE.md):

1. `npx tsc --noEmit` + `npm run lint` + `npm run build` (wajib hijau).
2. Skrip Playwright ad-hoc (dependency `playwright` sudah ada di node_modules):
   render lokal `next start` + klik-test; lalu verifikasi live staging pasca-push.
3. Regression checklist §2 di staging.

Menambah framework test formal = di luar scope visual-only migration (butuh
keputusan terpisah).

## 5. Snapshot visual

Baseline redesign sebelumnya: `docs/redesign-baseline/`. Snapshot per-fase baru
diambil ad-hoc via Playwright saat verifikasi fase (staging) — tidak di-commit
(ukuran); rujuk hash rilis `v0.36.0` sebagai baseline visual "sebelum".

## 6. Invariants (tidak boleh berubah selama seluruh migrasi)

- Route publik & dashboard, kontrak API, payload, auth, localStorage key
  (`jeonme_token`, `jeonme-sidebar-expanded-groups`).
- Premium gate backend (`isPremiumUser`), validasi server.
- Dark mode 3-lapis + i18n ID/EN + reduced-motion + focus-visible + skip-link.
- Optimistic update + rollback pattern di handler existing.
- `components/PagePreview.tsx` + `lib/page-themes.ts` (tema publik kreator).
- Business rule: payout min 50k, KYC, subscription, deletion 14 hari, limit
  5 halaman/5 toko Premium.
