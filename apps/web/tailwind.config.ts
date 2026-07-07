import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Warna identitas Jeonme, konsisten dengan dokumen PRD/TDD.
        primary: "#1B4D3E",
        accent: "#C9A24B",
      },
    },
  },
  plugins: [],
};
export default config;
