import { CARD_THEMES, themeOf, type BusinessCardData } from "@/components/DigitalBusinessCard";

// Komposer PNG kartu nama -- digambar ulang di <canvas> (bukan screenshot
// DOM): tidak butuh dependency baru (html-to-image dkk mengubah lockfile,
// riwayat CI repo ini pernah pecah karenanya), dan hasilnya tajam di 1080px
// untuk dicetak/dibagikan. Layout mengikuti DigitalBusinessCard.tsx --
// kalau mengubah salah satu, ubah keduanya.
//
// Revisi 3 September 2026 (laporan pengguna, membandingkan PNG dengan
// pratinjau): (1) ikon baris & QR diambil dari SVG yang SAMA dengan yang
// tampil di kartu (diserialisasi ke data URL oleh pemanggil) -- bukan
// kotak aksen kosong; (2) tinggi kanvas MENGIKUTI ISI: dua lintasan, ukur
// dulu di kanvas coba-coba lalu gambar di kanvas berukuran pas, supaya
// tidak ada ruang kosong besar sebelum QR; (3) semua gambar (foto, QR,
// ikon) dimuat DULUAN, penggambaran sinkron.
//
// Foto: dimuat dengan crossOrigin=anonymous dari proxy API (same-origin +
// CORS). Kalau gagal, jatuh ke inisial -- unduhan tidak pernah gagal
// karena foto.
export interface RenderCardInput {
  card: BusinessCardData;
  username: string;
  avatarUrl?: string;
  // backgroundImageUrl -- SAMA seperti avatarUrl di atas: pemanggil yang
  // bertanggung jawab meresolusi ke URL proxy API (cardBackgroundProxyURL)
  // supaya CORS same-origin, bukan card.background_image_url mentah --
  // dibaca terpisah dari `card` (bukan card.background_image_url) persis
  // karena alasan itu (permintaan langsung pengguna, 7 September 2026).
  backgroundImageUrl?: string;
  url: string;
  qrDataUrl: string;
  // icons: kunci data-icon di kartu (phone/whatsapp/email/website/address)
  // -> data URL SVG. Boleh kosong; baris tanpa ikon digambar kotak polos.
  icons?: Record<string, string>;
}

function loadImage(src: string, cors: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("gagal memuat gambar"));
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines) break;
    } else {
      cur = test;
    }
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  return lines;
}

interface Assets {
  avatar: HTMLImageElement | null;
  background: HTMLImageElement | null;
  qr: HTMLImageElement;
  icons: Record<string, HTMLImageElement>;
}

const W = 1080;
const PAD = 40;
const INK = "#111111";

// paint -- menggambar seluruh kartu ke canvas setinggi H dan mengembalikan
// tinggi yang sebenarnya dibutuhkan. Dipanggil dua kali: ukur, lalu final.
function paint(canvas: HTMLCanvasElement, H: number, input: RenderCardInput, a: Assets): number {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas tidak tersedia");
  const theme = CARD_THEMES[themeOf(input.card.card_theme)];
  const display = getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim() || "Helvetica Neue, Arial, sans-serif";
  const body = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
  const cw = W - PAD * 2;
  const ch = H - PAD * 2 - 26; // sisakan ruang bayangan offset di bawah

  // bayangan offset + badan kartu + pita aksen
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = INK;
  roundRect(ctx, PAD + 22, PAD + 26, cw, ch, 44);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, PAD, PAD, cw, ch, 44);
  ctx.fill();
  ctx.save();
  roundRect(ctx, PAD, PAD, cw, ch, 44);
  ctx.clip();
  if (a.background) {
    // Background kustom (permintaan langsung pengguna, 7 September 2026):
    // gambar menutupi SELURUH kartu (bukan cuma pita 250px seperti
    // theme.hex), sama seperti DOM (DigitalBusinessCard.tsx) -- cover-fit
    // sama seperti avatar di bawah. Panel putih tembus pandang menutupi
    // badan kartu (di bawah pita) supaya teks tetap terbaca, pita atas
    // dibiarkan menampilkan gambar apa adanya.
    const s = Math.max(cw / a.background.width, ch / a.background.height);
    const dw = a.background.width * s;
    const dh = a.background.height * s;
    ctx.drawImage(a.background, PAD + cw / 2 - dw / 2, PAD + ch / 2 - dh / 2, dw, dh);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(PAD, PAD + 250, cw, ch - 250);
  } else {
    ctx.fillStyle = theme.hex;
    ctx.fillRect(PAD, PAD, cw, 250);
  }
  ctx.restore();
  ctx.lineWidth = 6;
  ctx.strokeStyle = INK;
  roundRect(ctx, PAD, PAD, cw, ch, 44);
  ctx.stroke();

  // pil jeon.id
  ctx.font = `800 26px ${display}`;
  const pillW = ctx.measureText("jeon.id").width + 44;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, PAD + cw - pillW - 36, PAD + 30, pillW, 50, 25);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.textBaseline = "middle";
  ctx.fillText("jeon.id", PAD + cw - pillW - 36 + 22, PAD + 55);

  // avatar
  const ax = PAD + 60;
  const ay = PAD + 250;
  const ar = 100;
  ctx.save();
  ctx.beginPath();
  ctx.arc(ax + ar, ay, ar, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.clip();
  if (a.avatar) {
    // cover: skala supaya sisi terpendek memenuhi lingkaran, lalu tengah
    const s = Math.max((ar * 2) / a.avatar.width, (ar * 2) / a.avatar.height);
    const dw = a.avatar.width * s;
    const dh = a.avatar.height * s;
    ctx.drawImage(a.avatar, ax + ar - dw / 2, ay - dh / 2, dw, dh);
  } else {
    ctx.fillStyle = INK;
    ctx.font = `800 90px ${display}`;
    ctx.textAlign = "center";
    ctx.fillText((input.card.full_name || input.username).charAt(0).toUpperCase() || "?", ax + ar, ay + 4);
    ctx.textAlign = "left";
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(ax + ar, ay, ar, 0, Math.PI * 2);
  ctx.lineWidth = 6;
  ctx.strokeStyle = INK;
  ctx.stroke();

  // teks
  const left = PAD + 60;
  const maxW = cw - 120;
  let y = ay + ar + 70;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK;
  ctx.font = `800 64px ${display}`;
  for (const line of wrapText(ctx, input.card.full_name || input.username, maxW, 2)) {
    ctx.fillText(line, left, y);
    y += 70;
  }
  const sub = [input.card.job_title, input.card.company].filter(Boolean).join(" · ");
  if (sub) {
    ctx.font = `600 32px ${body}`;
    ctx.fillStyle = "rgba(17,17,17,0.72)";
    for (const line of wrapText(ctx, sub, maxW, 2)) {
      ctx.fillText(line, left, y);
      y += 40;
    }
  }
  if (input.card.tagline) {
    y += 8;
    ctx.font = `400 30px ${body}`;
    ctx.fillStyle = "rgba(17,17,17,0.75)";
    for (const line of wrapText(ctx, input.card.tagline, maxW, 3)) {
      ctx.fillText(line, left, y);
      y += 38;
    }
  }

  // baris kontak: lencana aksen 52px + ikon dari SVG kartu
  const rows: { key: string; text: string }[] = [];
  if (input.card.phone) rows.push({ key: "phone", text: input.card.phone });
  if (input.card.whatsapp_number) rows.push({ key: "whatsapp", text: input.card.whatsapp_number });
  if (input.card.email) rows.push({ key: "email", text: input.card.email });
  if (input.card.website) rows.push({ key: "website", text: input.card.website.replace(/^https?:\/\//, "") });
  if (input.card.address) rows.push({ key: "address", text: input.card.address });
  y += 26;
  ctx.font = `500 30px ${body}`;
  for (const r of rows) {
    const badge = 52;
    const by = y - 36;
    ctx.fillStyle = theme.chip === "bg-white" ? "#ffffff" : theme.hex;
    roundRect(ctx, left, by, badge, badge, 12);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.stroke();
    const icon = a.icons[r.key];
    if (icon) ctx.drawImage(icon, left + 12, by + 12, badge - 24, badge - 24);
    ctx.fillStyle = INK;
    const lines = wrapText(ctx, r.text, maxW - badge - 24, 2);
    lines.forEach((line, i) => ctx.fillText(line, left + badge + 24, y - 2 + i * 36));
    y += Math.max(badge + 16, 36 * lines.length + 16);
  }

  // chip sosial: ikon (dari SVG kartu, kunci data-icon) + @handle -- sama
  // dengan pratinjau, bukan label teks "IG ..." (laporan pengguna 3
  // September 2026).
  const socials: { key: string; label: string }[] = [];
  if (input.card.instagram) socials.push({ key: "instagram", label: `@${input.card.instagram}` });
  if (input.card.tiktok) socials.push({ key: "tiktok", label: `@${input.card.tiktok}` });
  if (input.card.linkedin) socials.push({ key: "linkedin", label: input.card.linkedin.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//i, "") });
  if (socials.length) {
    y += 10;
    ctx.font = `700 26px ${body}`;
    const chipH = 50;
    const iconSz = 28;
    let x = left;
    for (const s of socials) {
      const icon = a.icons[s.key];
      const textW = ctx.measureText(s.label).width;
      const w = 20 + (icon ? iconSz + 10 : 0) + textW + 20;
      if (x + w > left + maxW) {
        x = left;
        y += chipH + 12;
      }
      ctx.fillStyle = "#ffffff";
      roundRect(ctx, x, y - 32, w, chipH, chipH / 2);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = INK;
      ctx.stroke();
      let tx = x + 20;
      if (icon) {
        ctx.drawImage(icon, tx, y - 32 + (chipH - iconSz) / 2, iconSz, iconSz);
        tx += iconSz + 10;
      }
      ctx.fillStyle = INK;
      ctx.fillText(s.label, tx, y + 2);
      x += w + 12;
    }
    y += 44;
  }

  // pembatas putus-putus + QR, LANGSUNG setelah isi (bukan dipatok di bawah)
  y += 30;
  ctx.setLineDash([12, 12]);
  ctx.strokeStyle = "rgba(17,17,17,0.25)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(left, y);
  ctx.lineTo(left + maxW, y);
  ctx.stroke();
  ctx.setLineDash([]);
  const qrSize = 230;
  const qy = y + 40;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, left, qy, qrSize + 24, qrSize + 24, 16);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.drawImage(a.qr, left + 12, qy + 12, qrSize, qrSize);
  ctx.fillStyle = INK;
  ctx.font = `700 30px ${body}`;
  ctx.fillText("Scan untuk simpan kontak", left + qrSize + 60, qy + 100);
  ctx.font = `400 26px ${body}`;
  ctx.fillStyle = "rgba(17,17,17,0.6)";
  wrapText(ctx, input.url.replace(/^https?:\/\//, ""), maxW - qrSize - 80, 2).forEach((line, i) => {
    ctx.fillText(line, left + qrSize + 60, qy + 150 + i * 32);
  });

  // tinggi yang dibutuhkan: bawah QR + padding kartu + bayangan
  return qy + qrSize + 24 + 60 + PAD + 26;
}

export async function renderBusinessCardPNG(input: RenderCardInput): Promise<Blob> {
  let avatar: HTMLImageElement | null = null;
  if (input.avatarUrl) {
    try {
      avatar = await loadImage(input.avatarUrl, true);
    } catch {
      avatar = null;
    }
  }
  let background: HTMLImageElement | null = null;
  if (input.backgroundImageUrl) {
    try {
      background = await loadImage(input.backgroundImageUrl, true);
    } catch {
      background = null;
    }
  }
  const qr = await loadImage(input.qrDataUrl, false);
  const icons: Record<string, HTMLImageElement> = {};
  await Promise.all(
    Object.entries(input.icons ?? {}).map(async ([k, src]) => {
      try {
        icons[k] = await loadImage(src, false);
      } catch {
        /* baris tanpa ikon digambar kotak polos */
      }
    }),
  );
  const assets: Assets = { avatar, background, qr, icons };

  const canvas = document.createElement("canvas");
  // lintasan 1: ukur di kanvas tinggi, lintasan 2: gambar pas
  const needed = paint(canvas, 4000, input, assets);
  paint(canvas, Math.ceil(needed), input, assets);

  const toBlob = () =>
    new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("gagal membuat PNG"))), "image/png");
    });
  try {
    return await toBlob();
  } catch {
    // canvas ternoda gambar lintas-origin -> ulangi tanpa foto/background
    assets.avatar = null;
    assets.background = null;
    const h = paint(canvas, 4000, input, assets);
    paint(canvas, Math.ceil(h), input, assets);
    return toBlob();
  }
}
