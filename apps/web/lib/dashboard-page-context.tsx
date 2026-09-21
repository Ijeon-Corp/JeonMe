"use client";

import { createContext, useContext } from "react";
import type { MyPage } from "@/lib/api-client";

// DashboardMyPageContext -- perbaikan performa (audit menyeluruh 21
// September 2026): dashboard/layout.tsx SUDAH memanggil getMyPage() sekali
// saat mount untuk keperluannya sendiri (chip username/avatar/status
// terbit), tapi app/dashboard/page.tsx (Beranda) memanggil getMyPage() LAGI
// secara independen untuk kebutuhan yang SAMA persis (nama/username/status
// terbit/avatar) -- diukur langsung: satu hard-reload /dashboard
// menghasilkan endpoint ini terpanggil 2x lipat dari yang perlu. Context ini
// membagikan hasil fetch layout apa adanya supaya halaman anak tinggal
// membaca, bukan fetch ulang. null berarti "belum termuat" (state awal ATAU
// gagal dimuat) -- pemakai context tetap harus menangani itu, sama seperti
// sebelumnya menangani promise getMyPage() yang belum resolve/reject.
export const DashboardMyPageContext = createContext<MyPage | null>(null);

export function useDashboardMyPage(): MyPage | null {
  return useContext(DashboardMyPageContext);
}
