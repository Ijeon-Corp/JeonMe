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
        // serifDisplay -- redesain "Premium Refined" (permintaan langsung
        // pengguna, 9 Agustus 2026): angka besar/judul utama di dashboard
        // pakai serif untuk kontras sengaja dengan Poppins (heading) di
        // UI/label/tombol -- "laporan tahunan", bukan template SaaS. Pakai
        // ULANG --font-custom-lora (SUDAH dimuat global di app/layout.tsx
        // untuk kustomisasi font halaman publik kreator, lihat customLora)
        // -- TIDAK menambah font baru sama sekali, nol biaya muat tambahan.
        serifDisplay: ["var(--font-custom-lora)", "Georgia", "serif"],
        // display -- redesign (spec §7): Inter Tight utk heading display
        // besar. Self-hosted (lihat app/layout.tsx), fallback sesuai spec.
        display: ["var(--font-display)", "Helvetica Neue", "Arial", "sans-serif"],
        // editorial -- aksen serif editorial (spec §7), pakai Georgia
        // sistem (tanpa file font tambahan).
        editorial: ["Georgia", "Times New Roman", "serif"],
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
        // app-* -- Modul Dark/Light Mode (permintaan langsung pengguna, 29
        // Agustus 2026). Nilai sebenarnya ada di variable CSS (globals.css,
        // lihat catatan lengkap di sana soal kenapa token BARU & TERPISAH
        // dari ink/muted/border di atas, bukan menimpanya). Dipakai HANYA
        // di komponen cangkang aplikasi (navbar/footer pemasaran, shell
        // dashboard) -- JANGAN dipakai di PagePreview.tsx/page-themes.ts.
        app: {
          bg: "var(--app-bg)",
          surface: "var(--app-surface)",
          "surface-2": "var(--app-surface-2)",
          ink: "var(--app-ink)",
          muted: "var(--app-muted)",
          border: "var(--app-border)",
        },
        // jeon-* -- Redesign "Modern Playful Creator Platform"
        // (DESIGN-JEONID-REDESIGN.md §6). Nilai asli di variable CSS
        // (globals.css) -- token permukaan (paper/surface/ink/muted/border)
        // ikut dark mode, warna brand (purple/coral/lime/dst) konstan.
        // DITAMBAHKAN di samping primary/app-* lama selama migrasi
        // bertahap -- lihat REDESIGN-AUDIT.md §4. PENTING: key multi-kata
        // WAJIB pakai strip & dikutip ("purple-dark", BUKAN purpleDark) --
        // key tanpa strip diam-diam TIDAK menghasilkan class utility yang
        // dipakai kode (bug nyata bg-app-surface-2, 30 Agustus 2026),
        // verifikasi selalu lewat grep CSS hasil build.
        // PENTING (bug nyata 31 Agustus 2026, pola sama bg-app-surface-2):
        // warna berbasis var() di Tailwind v3 TIDAK mendukung modifier
        // opasitas -- bg-jeon-purple/25 dst diam-diam TIDAK menghasilkan
        // rule CSS sama sekali (build tetap hijau). Warna BRAND jeon
        // sengaja konstan di kedua mode, jadi didefinisikan hex LITERAL di
        // sini (dukungan /opacity penuh); variable CSS-nya di globals.css
        // TETAP ada untuk pemakaian langsung (shadow, gradient, dsb).
        // HANYA token permukaan yang flip ikut tema (ink/paper/surface/
        // surface-2/muted/border) yang tetap var() -- JANGAN pakai
        // modifier opasitas pada keenam token itu (pakai literal
        // text-[#111111]/70 dst di permukaan tint konstan, atau token
        // app-* yang senasib var-nya).
        jeon: {
          ink: "var(--jeon-ink)",
          paper: "var(--jeon-paper)",
          surface: "var(--jeon-surface)",
          "surface-2": "var(--jeon-surface-2)",
          purple: "#7657ff",
          "purple-dark": "#5636e8",
          lavender: "#d9ceff",
          orange: "#ff7043",
          coral: "#ff6448",
          lime: "#d7ff60",
          blue: "#8ad5ff",
          pink: "#ffafd0",
          success: "#168153",
          warning: "#d98600",
          danger: "#d93d36",
          muted: "var(--jeon-muted)",
          border: "var(--jeon-border)",
          sidebar: "#17151c",
        },
        // Token target redesign dashboard (JEONID-DASHBOARD-REDESIGN-SPEC
        // §4.1, Phase 1) -- dipakai HANYA oleh components/dashboard/* baru;
        // halaman lama tetap app-*/jeon-* sampai fasenya tiba. Permukaan =
        // var() (flip dark, JANGAN pakai modifier opasitas); brand & status
        // teks/soft juga var() karena status IKUT flip di dark (teks status
        // terang di atas soft gelap -- beda dari jeon-* yang konstan).
        dash: {
          bg: "var(--dash-bg)",
          surface: "var(--dash-surface)",
          "surface-subtle": "var(--dash-surface-subtle)",
          "surface-raised": "var(--dash-surface-raised)",
          ink: "var(--dash-ink)",
          "ink-soft": "var(--dash-ink-soft)",
          muted: "var(--dash-muted)",
          border: "var(--dash-border)",
          "border-strong": "var(--dash-border-strong)",
          "sidebar-bg": "#17151c",
          "sidebar-surface": "#221f29",
          "sidebar-text": "#f4f1f8",
          "sidebar-muted": "#aaa4b3",
        },
        brand: {
          "500": "#6043f5",
          "600": "#5234e5",
          "700": "#4328ca",
          soft: "var(--dash-brand-soft)",
          lavender: "#d9ceff",
          lime: "#d9ff5f",
          "lime-soft": "var(--dash-brand-lime-soft)",
        },
        success: { DEFAULT: "var(--dash-success)", soft: "var(--dash-success-soft)" },
        warning: { DEFAULT: "var(--dash-warning)", soft: "var(--dash-warning-soft)" },
        danger: { DEFAULT: "var(--dash-danger)", soft: "var(--dash-danger-soft)" },
        info: { DEFAULT: "var(--dash-info)", soft: "var(--dash-info-soft)" },
      },
      borderRadius: {
        // Skala radius redesign (spec §6) -- nama diprefiks "j" supaya
        // tidak menimpa skala bawaan Tailwind (rounded-lg/xl dst) yang
        // masih dipakai ratusan tempat oleh halaman yang belum dimigrasi.
        jxs: "var(--radius-xs)",
        jsm: "var(--radius-sm)",
        jmd: "var(--radius-md)",
        jlg: "var(--radius-lg)",
        jxl: "var(--radius-xl)",
        jsection: "var(--radius-section)",
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
        // card/card-hover -- ikut bahasa visual homepage (permintaan pengguna
        // 1 September 2026). Dipetakan ke token, BUKAN nilai blur lama,
        // supaya kartu ber-`shadow-card` yang TIDAK memakai .glass tetap
        // seragam dengan yang memakai .glass.
        card: "var(--shadow-card-dash)",
        "card-hover": "6px 7px 0 rgba(17,17,17,0.9)",
        hero: "0 30px 90px -16px rgba(27,77,62,0.35)",
        glow: "0 0 0 1px rgba(255,255,255,0.4) inset, 0 8px 32px -8px rgba(27,77,62,0.25)",
        // refined/refined-lg -- redesain "Premium Refined": bayangan
        // BERLAPIS (dua-tiga stop tipis) menggantikan `card` yang satu
        // lapis datar -- dipakai StatCard & shell, bukan blanket ganti
        // `card` di seluruh app supaya perubahan tetap tertarget.
        refined: "0 1px 1px rgba(15,46,36,0.04), 0 6px 16px -8px rgba(15,46,36,0.14)",
        "refined-lg": "0 1px 1px rgba(15,46,36,0.04), 0 6px 16px -8px rgba(15,46,36,0.14), 0 24px 48px -20px rgba(15,46,36,0.18)",
        // Bayangan redesign (spec §6): "brutal" = outline+offset tegas
        // neo-brutalist utk kartu marketing; "jsoft"/"jfocus" utk
        // dashboard yang lebih tenang. Nilai via variable CSS supaya
        // varian dark mode (globals.css) ikut otomatis.
        brutal: "var(--shadow-card-brutal)",
        jsoft: "var(--shadow-soft)",
        jfocus: "var(--shadow-focus)",
        // Bayangan target redesign dashboard (spec §4.5) -- via var supaya
        // varian dark (globals.css) ikut; diprefiks "dash-" karena key
        // `card`/`focus` sudah dipakai keluarga lama.
        "dash-card": "var(--dash-shadow-card)",
        "dash-raised": "var(--dash-shadow-raised)",
        "dash-overlay": "var(--dash-shadow-overlay)",
        "dash-focus": "var(--dash-shadow-focus)",
      },
    },
  },
  plugins: [],
};
export default config;
