import { createElement } from "react";
import {
  IconAppleMusic,
  IconApplePodcasts,
  IconDiscord,
  IconFacebook,
  IconGithub,
  IconGoogleMaps,
  IconInstagram,
  IconLink,
  IconLinkedin,
  IconMail,
  IconShopee,
  IconSpotify,
  IconTelegram,
  IconTiktok,
  IconTwitch,
  IconWhatsapp,
  IconX,
  IconYoutube,
} from "@/components/icons";
import {
  siAppstore,
  siBandcamp,
  siBehance,
  siBukalapak,
  siBuymeacoffee,
  siCalendly,
  siDribbble,
  siDropbox,
  siEtsy,
  siGoogledrive,
  siGoogleplay,
  siKakaotalk,
  siKofi,
  siLine,
  siMedium,
  siNotion,
  siPatreon,
  siPaypal,
  siPinterest,
  siReddit,
  siSnapchat,
  siSoundcloud,
  siSubstack,
  siThreads,
  siTumblr,
  siVimeo,
  type SimpleIcon,
} from "simple-icons";

export type LinkIconComponent = typeof IconLink;

// simpleIconComponent -- susulan 22 September 2026 (permintaan langsung
// pengguna, screenshot daftar tautan: "bukankah lebih bagus kalo
// menyediakan tipe lain untuk icon blok blok ini" -- terlalu banyak baris
// jatuh ke ikon rantai generik). SEBELUM ini, SATU-SATUNYA cara menambah
// platform baru ke detectLinkIcon adalah menggambar tangan komponen SVG
// baru di components/icons.tsx (Simple Icons disalin manual satu per
// satu, lihat catatan IconGithub) -- lambat & satu-satunya alasan
// detectLinkIcon cuma mengenali 16 platform setelah berbulan-bulan.
// simple-icons (npm, CC0-1.0, ~3.460 logo brand asli) membuat penambahan
// SISANYA murni satu baris pola (regex + `path`), TANPA perlu
// menggambar apa pun -- fungsi generik ini yang mengubah data mentah
// `SimpleIcon.path` jadi komponen yang bentuknya identik dgn IconXxx
// hand-drawn (props {className} sama persis), supaya PATTERNS di bawah
// tidak perlu tahu bedanya. 16 platform LAMA SENGAJA tidak diikutkan ke
// sini -- beberapa (Instagram/Apple Music/Apple Podcasts) pakai gradient
// multi-warna yang tidak bisa direpresentasikan satu `hex` tunggal, jadi
// tetap hand-drawn; mengubahnya cuma menambah risiko tanpa manfaat nyata.
// createElement (BUKAN JSX) -- file ini ".ts" polos (data/logika murni,
// tidak pernah butuh JSX sebelum fungsi ini), mengubahnya ke ".tsx" cuma
// demi satu fungsi kecil ini tidak sepadan dengan risiko menyentuh semua
// pemakai import (`@/lib/link-icons`, 5 file).
function simpleIconComponent(icon: SimpleIcon): LinkIconComponent {
  return function SimpleIconGlyph({ className }: { className?: string }) {
    return createElement("svg", { viewBox: "0 0 24 24", fill: "currentColor", className, "aria-hidden": true }, createElement("path", { d: icon.path }));
  };
}

// rawPathIconComponent -- susulan 22 September 2026 (permintaan pengguna:
// "iya sekalian kerjakan" -- ikon DANA & GoPay, brand Indonesia yang tidak
// ada di simple-icons). Beda dari simpleIconComponent: sumbernya BUKAN
// simple-icons (viewBox 24x24 seragam), tapi logo resmi asli tiap brand
// (diunduh dari Wikimedia Commons utk DANA, dari file media resmi GoPay
// utk GoPay -- keduanya berlisensi bebas dipakai). `d` path DIBIARKAN
// PERSIS seperti aslinya (TIDAK dikonversi/diskalakan manual ke sistem
// 24x24 -- rawan salah), `viewBox` yang di-crop pas ke bounding box glyph
// (dihitung via getBBox() browser sungguhan, BUKAN dikira-kira) supaya
// tetap tampil benar & tidak terpotong. Hanya glyph BAGIAN DALAM logo
// (bendera DANA/dompet GoPay) yang diambil, BUKAN lingkaran latar
// resminya -- pola yang sama seperti semua ikon brand lain di file ini:
// lingkaran/latar warna disediakan EKSTERNAL oleh badgeClass (baris
// dashboard) atau iconColorClass langsung (halaman publik), bukan
// dibakar ke dalam komponen ikonnya sendiri.
//
// `transform` (opsional, 24 September 2026) -- utk sumber yang digambar
// dgn sumbu-y terbalik (ekspor Inkscape/PDF, mis. QRIS): path tetap
// PERSIS aslinya, cukup dibalik lewat scale(1,-1) + viewBox di koordinat
// yang sudah dibalik, alih-alih menulis ulang koordinat secara manual.
function rawPathIconComponent(path: string, viewBox: string, transform?: string): LinkIconComponent {
  return function RawPathIconGlyph({ className }: { className?: string }) {
    return createElement("svg", { viewBox, fill: "currentColor", className, "aria-hidden": true }, createElement("path", { d: path, transform }));
  };
}

// detectLinkIcon -- deteksi platform dari URL tautan, MURNI kosmetik sisi
// klien (tidak ada validasi/pembatasan seperti isValidVideoEmbedURL di
// backend links.go, cuma menentukan ikon apa yang ditampilkan). Sengaja
// tidak menyimpan hasil deteksi ke database -- dihitung ulang tiap render
// dari kolom `url` yang sudah ada, jadi berlaku RETROAKTIF untuk tautan
// lama tanpa migrasi data apa pun.
//
// badgeClass -- dipakai oleh dashboard/links/page.tsx (daftar tautan
// kreator, badge lingkaran berwarna BRAND asli per platform, TIDAK diubah
// oleh permintaan ini -- konteks berbeda, daftar manajemen bukan tampilan
// pengunjung).
//
// iconColorClass -- permintaan langsung pengguna: di halaman publik/
// pratinjau, ikon platform ditampilkan TANPA badge lingkaran, cuma ikonnya
// saja diwarnai warna brand (bukan putih polos di atas lingkaran berwarna).
// CATATAN JUJUR: TikTok & X pakai warna brand hitam -- kontras bisa kurang
// kalau kartu tautan kebetulan gelap (mis. tema Midnight/Noir), karena
// warna brand resminya memang dirancang di atas badge terang, bukan
// langsung di atas kartu. Belum ada penanganan otomatis per-tema untuk ini.
const PATTERNS: { test: RegExp; Icon: LinkIconComponent; label: string; badgeClass: string; iconColorClass: string }[] = [
  { test: /(^mailto:)/i, Icon: IconMail, label: "Email", badgeClass: "bg-slate-600 text-white", iconColorClass: "text-slate-600" },
  {
    test: /(youtube\.com|youtu\.be)/i,
    Icon: IconYoutube,
    label: "YouTube",
    badgeClass: "bg-[#FF0000] text-white",
    iconColorClass: "text-[#FF0000]",
  },
  { test: /tiktok\.com/i, Icon: IconTiktok, label: "TikTok", badgeClass: "bg-black text-white", iconColorClass: "text-black" },
  {
    test: /instagram\.com/i,
    Icon: IconInstagram,
    label: "Instagram",
    badgeClass: "bg-gradient-to-br from-[#FEDA75] via-[#D62976] to-[#4F5BD5] text-white",
    iconColorClass: "text-[#D62976]",
  },
  {
    test: /(wa\.me|api\.whatsapp\.com|whatsapp\.com)/i,
    Icon: IconWhatsapp,
    label: "WhatsApp",
    badgeClass: "bg-[#25D366] text-white",
    iconColorClass: "text-[#25D366]",
  },
  {
    test: /(t\.me|telegram\.me|telegram\.org)/i,
    Icon: IconTelegram,
    label: "Telegram",
    badgeClass: "bg-[#26A5E4] text-white",
    iconColorClass: "text-[#26A5E4]",
  },
  { test: /(twitter\.com|x\.com)/i, Icon: IconX, label: "X (Twitter)", badgeClass: "bg-black text-white", iconColorClass: "text-black" },
  {
    test: /facebook\.com|fb\.com/i,
    Icon: IconFacebook,
    label: "Facebook",
    badgeClass: "bg-[#1877F2] text-white",
    iconColorClass: "text-[#1877F2]",
  },
  { test: /spotify\.com/i, Icon: IconSpotify, label: "Spotify", badgeClass: "bg-[#1DB954] text-white", iconColorClass: "text-[#1DB954]" },
  {
    test: /linkedin\.com/i,
    Icon: IconLinkedin,
    label: "LinkedIn",
    badgeClass: "bg-[#0A66C2] text-white",
    iconColorClass: "text-[#0A66C2]",
  },
  // Susulan 20 Agustus 2026 (bareng penggantian ikon sosmed) -- platform
  // ini sudah lama direferensikan di tempat lain (PLATFORM_URL,
  // quick-setup-templates.ts) tapi belum pernah dikenali detectLinkIcon,
  // selalu jatuh ke IconLink generik.
  {
    test: /discord\.(gg|com)/i,
    Icon: IconDiscord,
    label: "Discord",
    badgeClass: "bg-[#5865F2] text-white",
    iconColorClass: "text-[#5865F2]",
  },
  { test: /twitch\.tv/i, Icon: IconTwitch, label: "Twitch", badgeClass: "bg-[#9146FF] text-white", iconColorClass: "text-[#9146FF]" },
  { test: /shopee\.co\.id|shopee\.com/i, Icon: IconShopee, label: "Shopee", badgeClass: "bg-[#EE4D2D] text-white", iconColorClass: "text-[#EE4D2D]" },
  {
    test: /music\.apple\.com/i,
    Icon: IconAppleMusic,
    label: "Apple Music",
    badgeClass: "bg-gradient-to-br from-[#FA5B93] to-[#FA233B] text-white",
    iconColorClass: "text-[#FA233B]",
  },
  {
    test: /podcasts\.apple\.com/i,
    Icon: IconApplePodcasts,
    label: "Apple Podcasts",
    badgeClass: "bg-gradient-to-br from-[#B247F2] to-[#7C4CE8] text-white",
    iconColorClass: "text-[#9433EB]",
  },
  {
    test: /(maps\.google\.|goo\.gl\/maps)/i,
    Icon: IconGoogleMaps,
    label: "Google Maps",
    badgeClass: "bg-[#4285F4] text-white",
    iconColorClass: "text-[#4285F4]",
  },
  // Susulan 24 Agustus 2026 (bareng platform sosial GitHub baru,
  // lib/social-links.ts) -- sama alasannya dengan Discord/Twitch/dst di
  // atas, tautan biasa ke github.com (bukan cuma baris ikon sosial)
  // sebelumnya selalu jatuh ke IconLink generik.
  { test: /github\.com/i, Icon: IconGithub, label: "GitHub", badgeClass: "bg-[#181717] text-white", iconColorClass: "text-[#181717]" },

  // Susulan 22 September 2026 (lihat catatan panjang simpleIconComponent
  // di atas) -- 25 platform baru sekaligus, dulu semuanya jatuh ke ikon
  // rantai generik karena menggambar tangan tiap logo terlalu lambat.
  // Hex diambil LANGSUNG dari `icon.hex` tiap paket (SATU sumber
  // kebenaran, disalin literal ke sini -- BUKAN interpolasi `${icon.hex}`,
  // Tailwind JIT butuh string utuh statis supaya kelasnya benar-benar
  // ikut ter-generate, lihat CLAUDE.md soal kelas Tailwind yang diam-diam
  // no-op). 3 warna brand terang (Snapchat/Buy Me a Coffee/KakaoTalk,
  // kuning) SENGAJA pakai teks gelap, bukan `text-white` seperti yang
  // lain -- kontrasnya gagal total di atas kuning terang.
  { test: /threads\.net/i, Icon: simpleIconComponent(siThreads), label: "Threads", badgeClass: "bg-[#000000] text-white", iconColorClass: "text-[#000000]" },
  { test: /(pinterest\.com|pin\.it)/i, Icon: simpleIconComponent(siPinterest), label: "Pinterest", badgeClass: "bg-[#BD081C] text-white", iconColorClass: "text-[#BD081C]" },
  { test: /snapchat\.com/i, Icon: simpleIconComponent(siSnapchat), label: "Snapchat", badgeClass: "bg-[#FFFC00] text-black", iconColorClass: "text-[#FFFC00]" },
  { test: /behance\.net/i, Icon: simpleIconComponent(siBehance), label: "Behance", badgeClass: "bg-[#1769FF] text-white", iconColorClass: "text-[#1769FF]" },
  { test: /dribbble\.com/i, Icon: simpleIconComponent(siDribbble), label: "Dribbble", badgeClass: "bg-[#EA4C89] text-white", iconColorClass: "text-[#EA4C89]" },
  { test: /medium\.com/i, Icon: simpleIconComponent(siMedium), label: "Medium", badgeClass: "bg-[#000000] text-white", iconColorClass: "text-[#000000]" },
  { test: /substack\.com/i, Icon: simpleIconComponent(siSubstack), label: "Substack", badgeClass: "bg-[#FF6719] text-white", iconColorClass: "text-[#FF6719]" },
  { test: /ko-fi\.com/i, Icon: simpleIconComponent(siKofi), label: "Ko-fi", badgeClass: "bg-[#FF6433] text-white", iconColorClass: "text-[#FF6433]" },
  { test: /patreon\.com/i, Icon: simpleIconComponent(siPatreon), label: "Patreon", badgeClass: "bg-[#000000] text-white", iconColorClass: "text-[#000000]" },
  { test: /buymeacoffee\.com/i, Icon: simpleIconComponent(siBuymeacoffee), label: "Buy Me a Coffee", badgeClass: "bg-[#FFDD00] text-black", iconColorClass: "text-[#FFDD00]" },
  { test: /paypal\.(com|me)/i, Icon: simpleIconComponent(siPaypal), label: "PayPal", badgeClass: "bg-[#002991] text-white", iconColorClass: "text-[#002991]" },
  { test: /reddit\.com/i, Icon: simpleIconComponent(siReddit), label: "Reddit", badgeClass: "bg-[#FF4500] text-white", iconColorClass: "text-[#FF4500]" },
  { test: /tumblr\.com/i, Icon: simpleIconComponent(siTumblr), label: "Tumblr", badgeClass: "bg-[#36465D] text-white", iconColorClass: "text-[#36465D]" },
  { test: /vimeo\.com/i, Icon: simpleIconComponent(siVimeo), label: "Vimeo", badgeClass: "bg-[#1AB7EA] text-white", iconColorClass: "text-[#1AB7EA]" },
  { test: /soundcloud\.com/i, Icon: simpleIconComponent(siSoundcloud), label: "SoundCloud", badgeClass: "bg-[#FF5500] text-white", iconColorClass: "text-[#FF5500]" },
  { test: /bandcamp\.com/i, Icon: simpleIconComponent(siBandcamp), label: "Bandcamp", badgeClass: "bg-[#408294] text-white", iconColorClass: "text-[#408294]" },
  { test: /notion\.(so|site)/i, Icon: simpleIconComponent(siNotion), label: "Notion", badgeClass: "bg-[#000000] text-white", iconColorClass: "text-[#000000]" },
  { test: /calendly\.com/i, Icon: simpleIconComponent(siCalendly), label: "Calendly", badgeClass: "bg-[#006BFF] text-white", iconColorClass: "text-[#006BFF]" },
  { test: /drive\.google\.com/i, Icon: simpleIconComponent(siGoogledrive), label: "Google Drive", badgeClass: "bg-[#4285F4] text-white", iconColorClass: "text-[#4285F4]" },
  { test: /dropbox\.com/i, Icon: simpleIconComponent(siDropbox), label: "Dropbox", badgeClass: "bg-[#0061FF] text-white", iconColorClass: "text-[#0061FF]" },
  { test: /(line\.me|lin\.ee)/i, Icon: simpleIconComponent(siLine), label: "LINE", badgeClass: "bg-[#00C300] text-white", iconColorClass: "text-[#00C300]" },
  { test: /kakao\.com/i, Icon: simpleIconComponent(siKakaotalk), label: "KakaoTalk", badgeClass: "bg-[#FFCD00] text-black", iconColorClass: "text-[#FFCD00]" },
  { test: /play\.google\.com/i, Icon: simpleIconComponent(siGoogleplay), label: "Google Play", badgeClass: "bg-[#414141] text-white", iconColorClass: "text-[#414141]" },
  { test: /apps\.apple\.com/i, Icon: simpleIconComponent(siAppstore), label: "App Store", badgeClass: "bg-[#0D96F6] text-white", iconColorClass: "text-[#0D96F6]" },
  { test: /etsy\.com/i, Icon: simpleIconComponent(siEtsy), label: "Etsy", badgeClass: "bg-[#F16521] text-white", iconColorClass: "text-[#F16521]" },
  { test: /bukalapak\.com/i, Icon: simpleIconComponent(siBukalapak), label: "Bukalapak", badgeClass: "bg-[#E31E52] text-white", iconColorClass: "text-[#E31E52]" },

  // DANA & GoPay -- susulan 22 September 2026, lihat catatan panjang
  // rawPathIconComponent di atas. Warna diambil dari style resmi tiap
  // SVG sumber (DANA .cls-2{fill:#008ceb}, GoPay .st0{fill:#00AED6}).
  {
    test: /(link\.dana\.id|dana\.id)/i,
    Icon: rawPathIconComponent(
      "M86.43,54.84V70.21c0,1-.43,1.21-1.27.72a28.08,28.08,0,0,0-3.5-1.78,23.73,23.73,0,0,0-11.49-1.53,55.06,55.06,0,0,0-12.44,3.12c-4,1.35-7.92,2.81-12,3.94a33.41,33.41,0,0,1-10.42,1.37,22.12,22.12,0,0,1-11-3.43A2.71,2.71,0,0,1,23,70.2Q23,55.1,23,40c0-.49,0-1.07.44-1.32s.89.16,1.27.41a21,21,0,0,0,12.15,3.6A32.4,32.4,0,0,0,45.94,41c4.16-1.29,8.18-3,12.27-4.45a74.14,74.14,0,0,1,9.77-3,21.21,21.21,0,0,1,16.73,3.09,3.67,3.67,0,0,1,1.75,3.27c0,5,0,10,0,15Z",
      "18 28 73.46 53.07"
    ),
    label: "DANA",
    badgeClass: "bg-[#008ceb] text-white",
    iconColorClass: "text-[#008ceb]",
  },
  {
    test: /(gopay\.co\.id|gopay\.id)/i,
    Icon: rawPathIconComponent(
      "M122.9,81.4c-0.7-10.6-9.9-19.1-20.6-18.4H48.5c-2.1,0-3.5-1.4-3.5-3.5c0-2.1,1.4-3.5,3.5-3.5H103c-0.4-7.1-5.7-14.5-12.4-15.6c-15.9-2.8-32.2-2.8-47.8,0c-8.9,1.4-15.6,10.3-17,18.8c-2.5,16.7-2.5,33.6,0,50.3c1.8,9.6,9.6,17.4,19.5,18.8c19.8,2.5,39.7,2.5,59.2,0c8.9-1.1,14.5-9.2,16.3-17.7C122.5,100.6,123.2,91,122.9,81.4z M105.2,93.1v3.2c0,2.1-1.4,3.5-3.5,3.5s-3.5-1.4-3.5-3.5v-3.2c-1.1-1.1-1.8-2.5-1.8-3.9c0-2.8,2.5-5.3,5.3-5.3c2.8,0,5.3,2.5,5.3,5.3C106.9,90.6,106.2,92.1,105.2,93.1z",
      "84.98 33.42 111.04 103.87"
    ),
    label: "GoPay",
    badgeClass: "bg-[#00AED6] text-white",
    iconColorClass: "text-[#00AED6]",
  },

  // OVO & QRIS -- 24 September 2026 (permintaan pengguna: "OVO + QRIS
  // untuk deteksi ikon tautan"). Sumber: Wikimedia Commons --
  // Logo_ovo_purple.svg (CC BY-SA 4.0, wordmark "OVO" satu path, warna
  // resmi #4b2489) dan Logo_QRIS.svg (domain publik, karya pemerintah RI).
  // Keduanya WORDMARK (tidak ada simbol terpisah seperti bendera DANA),
  // jadi yang dipakai tulisannya utuh -- OVO cukup pendek utk badge bulat.
  // QRIS: 9 path sumber digabung jadi satu (subpath awal 'm' diubah ke
  // 'M' -- aman karena tiap path aslinya mulai dari titik (0,0)), sumbu-y
  // dibalik via transform, viewBox dari getBBox() browser sungguhan.
  // Domain QRIS: qris.id & qris.online sama-sama dialihkan ke
  // qris.interactive.co.id (layanan pendaftaran merchant QRIS).
  {
    test: /(^|[/.])ovo\.id/i,
    Icon: rawPathIconComponent(
      "M21.19,20.24a12.54,12.54,0,0,1-8.8,3.45,12.59,12.59,0,0,1-8.85-3.45,11.68,11.68,0,0,1,0-16.77A12.55,12.55,0,0,1,12.4,0a12.54,12.54,0,0,1,8.8,3.45,11.67,11.67,0,0,1,0,16.77M12.4,3.86a7.73,7.73,0,0,0-7.8,8,7.78,7.78,0,1,0,15.56,0,7.73,7.73,0,0,0-7.76-8m38-1.07L40.89,24l-.54-.1c-2.72-.49-3.27-1.17-4.54-3.93L28.68,4.44H26V.67H36.13V4.44H33.71l5.73,12.85L45,4.44H42V.67h8.4Zm23,17.45a13,13,0,0,1-17.64,0,11.68,11.68,0,0,1,0-16.77,13,13,0,0,1,17.64,0,11.65,11.65,0,0,1,0,16.77M64.65,3.86a7.74,7.74,0,0,0-7.81,8,7.78,7.78,0,1,0,15.56,0,7.72,7.72,0,0,0-7.75-8",
      "0 0 77 24"
    ),
    label: "OVO",
    badgeClass: "bg-[#4b2489] text-white",
    iconColorClass: "text-[#4b2489]",
  },
  {
    test: /(qris\.id|qris\.online|qris\.interactive\.co\.id)/i,
    Icon: rawPathIconComponent(
      "M 18.813,19.108 H 32.767 V 10.622 H 26.913 L 32.767,5.1912 H 27.794 L 22.053,10.622 V 5.1912 h -3.24 v 8.6268 h 10.231 v 2.065 H 18.813 Z M 34.216,5.1912 h 3.4103 v 13.945 H 34.216 Z M 6.9058,8.5572 V 19.108 H 4.2344 c -0.4831,0 -0.8526,-0.368 -0.8526,-0.82 0,-2.49 -0.0284,-9.8157 -0.0284,-12.2482 0,-0.4526 0.3695,-0.8486 0.8242,-0.8486 1.8472,0 7.1614,0 7.9284,0 v 3.366 z M 13.868,1.712 c 0.313,0 2.7,0 3.496,0 0,0 0,6.8735 0,6.9866 -1.137,0 -2.33,0 -3.496,0 0,-2.3194 0,-4.6388 0,-6.9866 z M 8.6109,19.108 c 0,-0.057 0,-3.479 0,-3.479 1.5631,0 3.5521,0 5.2571,0 0,-2.405 0,-5.205 0,-5.205 0.796,0 3.183,0 3.496,0 v 7.835 c 0,0.453 -0.37,0.821 -0.824,0.849 -1.705,0 -5.741,0 -7.9291,0 z M 8.6109,13.932 c 0,-1.16 0,-2.32 0,-3.536 0.2842,0 0.5968,0 0.881,0 0.7961,0 1.7901,0 2.5861,0 0,0 0,3.479 0,3.536 -1.137,0 -2.3019,0 -3.4671,0 z m 2.4441,-2.461 v 0 c -0.341,0 -0.739,0 -1.052,0 -0.1132,0 -0.2269,0 -0.369,0 0,0.481 0,0.933 0,1.414 0.483,0 0.938,0 1.421,0 0,-0.028 0,-1.414 0,-1.414 z M 54.365,8.6986 V 3.494 c 0,-0.4525 -0.398,-0.8203 -0.852,-0.8203 H 48.284 V 1.8252 h 6.081 0.029 c 0.426,0 0.795,0.3677 0.795,0.8203 v 0.0282 6.0249 z M 1.9325,15.657 v 5.205 c 0,0.452 0.341,0.792 0.7957,0.792 h 5.2291 c 0.0284,0 0.0284,0.028 0.0284,0.028 v 0.792 c 0,0 0,0.028 -0.0284,0.028 H 1.9325 c -0.4831,0 -0.8526,-0.368 -0.8526,-0.848 v -5.997 c 0,-0.028 0.0284,-0.028 0.0284,-0.028 h 0.7958 c 0,0 0.0284,0 0.0284,0.028 z M 52.887,15.657 v 3.451 H 39.104 v -5.176 -3.48 h 9.18 V 8.7269 h -9.18 V 5.2478 h 13.783 v 8.6552 h -9.179 v 1.754 z",
      "1.08 -22.502 54.109 20.79",
      "scale(1,-1)"
    ),
    label: "QRIS",
    badgeClass: "bg-black text-white",
    iconColorClass: "text-black",
  },
];

const FALLBACK_BADGE_CLASS = "bg-primary-subtle text-primary";
const FALLBACK_ICON_COLOR_CLASS = "text-primary";

// isFallback -- true kalau URL tidak cocok platform mana pun (ikon rantai
// generik). Dipakai baris blok dashboard (redesain 18 September 2026) utk
// memilih kulit tile: platform terdeteksi = warna mereknya, generik = tile
// putih bergaris (referensi gambar pengguna), BUKAN badgeClass fallback.
export function detectLinkIcon(
  url: string
): { Icon: LinkIconComponent; label: string; badgeClass: string; iconColorClass: string; isFallback: boolean } {
  for (const { test, Icon, label, badgeClass, iconColorClass } of PATTERNS) {
    if (test.test(url)) {
      return { Icon, label, badgeClass, iconColorClass, isFallback: false };
    }
  }
  return { Icon: IconLink, label: "Tautan", badgeClass: FALLBACK_BADGE_CLASS, iconColorClass: FALLBACK_ICON_COLOR_CLASS, isFallback: true };
}
