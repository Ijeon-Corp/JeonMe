import type { Config } from "tailwindcss";

const config: Config = {
  // "./lib/**" ditambahkan karena lib/page-themes.ts menyimpan string kelas
  // Tailwind (termasuk arbitrary value seperti "bg-[#0A1512]") sebagai nilai
  // objek, bukan literal langsung di JSX -- tanpa ini, JIT purge Tailwind
  // tidak pernah "melihat" kelas-kelas itu dipakai di mana pun, jadi
  // dihapus dari CSS akhir (ketahuan lewat tema selain "default" yang semua
  // classnya kebetulan sudah dipakai di file lain yang ter-scan).
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}", "./lib/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        heading: ["var(--font-heading)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
      },
      colors: {
        // Warna identitas Jeonme, konsisten dengan PRD/TDD & docs/*.pdf.
        primary: { DEFAULT: "#1B4D3E", dark: "#123328", light: "#3E7C59", subtle: "#EAF3EF" },
        secondary: { DEFAULT: "#1F7A6C", dark: "#145C52", light: "#5FB3A3", subtle: "#E7F5F2" },
        accent: { DEFAULT: "#C9A24B", dark: "#A9822F", light: "#E0C378", subtle: "#FBF6E8" },
        ink: "#1C2B25",
        muted: "#5B6B63",
        border: "#D8DDD9",
        // "pop" -- aksen tambahan KHUSUS dashboard (permintaan langsung
        // pengguna, redesain "Playful Creator" 9 Agustus 2026), sengaja
        // TERPISAH dari primary/secondary/accent (identitas brand Jeonme
        // dipakai di situs pemasaran & halaman publik kreator, TIDAK
        // diubah supaya konsistensi brand di PRD/TDD tetap utuh). Dipakai
        // untuk kartu statistik/badge berwarna-warni di dalam dashboard
        // saja -- lihat StatCard di dashboard/page.tsx & sidebar di
        // dashboard/layout.tsx.
        pop: {
          blue: { DEFAULT: "#4C8DFF", tint: "#E7EEFF" },
          yellow: { DEFAULT: "#FFC63A", tint: "#FFF6DF" },
          pink: { DEFAULT: "#FF5A79", tint: "#FFE7EC" },
          lilac: { DEFAULT: "#B98CFF", tint: "#F2E9FF" },
        },
      },
      animation: {
        "fade-up": "fadeUp 0.7s ease-out forwards",
        float: "float 5s ease-in-out infinite",
        "float-slow": "float 8s ease-in-out infinite",
        "pulse-slow": "pulse 3s ease-in-out infinite",
      },
      keyframes: {
        fadeUp: { "0%": { opacity: "0", transform: "translateY(24px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        float: { "0%,100%": { transform: "translateY(0px)" }, "50%": { transform: "translateY(-14px)" } },
      },
      boxShadow: {
        card: "0 4px 24px -4px rgba(27,77,62,0.12)",
        "card-hover": "0 16px 44px -8px rgba(27,77,62,0.22)",
        hero: "0 30px 90px -16px rgba(27,77,62,0.35)",
        glow: "0 0 0 1px rgba(255,255,255,0.4) inset, 0 8px 32px -8px rgba(27,77,62,0.25)",
      },
    },
  },
  plugins: [],
};
export default config;
