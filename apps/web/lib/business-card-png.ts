import { CARD_THEMES, themeOf, type BusinessCardData } from "@/components/DigitalBusinessCard";

// Komposer PNG kartu nama -- digambar ulang di <canvas> (bukan screenshot
// DOM): tidak butuh dependency baru (html-to-image dkk mengubah lockfile,
// riwayat CI repo ini pernah pecah karenanya), dan hasilnya tajam di 1080px
// untuk dicetak/dibagikan. Layout mengikuti DigitalBusinessCard.tsx --
// kalau mengubah salah satu, ubah keduanya.
//
// Avatar lintas-origin bisa "menodai" canvas (toBlob melempar SecurityError
// kalau storage tidak mengirim header CORS). Strategi: coba dengan avatar
// (crossOrigin=anonymous); kalau gagal, gambar ulang dengan inisial.
export interface RenderCardInput {
  card: BusinessCardData;
  username: string;
  avatarUrl?: string;
  url: string;
  qrDataUrl: string;
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

async function draw(input: RenderCardInput, withAvatar: boolean): Promise<Blob> {
  const W = 1080;
  const H = 1560;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas tidak tersedia");
  const theme = CARD_THEMES[themeOf(input.card.card_theme)];
  const display = getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim() || "Helvetica Neue, Arial, sans-serif";
  const body = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
  const INK = "#111111";

  // Latar transparan di luar kartu, bayangan offset ala tema.
  const pad = 40;
  const cw = W - pad * 2;
  const ch = H - pad * 2;
  ctx.fillStyle = INK;
  roundRect(ctx, pad + 22, pad + 26, cw, ch, 44);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, pad, pad, cw, ch, 44);
  ctx.fill();
  ctx.save();
  roundRect(ctx, pad, pad, cw, ch, 44);
  ctx.clip();
  ctx.fillStyle = theme.hex;
  ctx.fillRect(pad, pad, cw, 250);
  ctx.restore();
  ctx.lineWidth = 6;
  ctx.strokeStyle = INK;
  roundRect(ctx, pad, pad, cw, ch, 44);
  ctx.stroke();

  // pil jeon.id
  ctx.font = `800 26px ${display}`;
  const pillW = ctx.measureText("jeon.id").width + 44;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, pad + cw - pillW - 36, pad + 30, pillW, 50, 25);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.textBaseline = "middle";
  ctx.fillText("jeon.id", pad + cw - pillW - 36 + 22, pad + 55);

  // avatar
  const ax = pad + 60;
  const ay = pad + 250;
  const ar = 100;
  ctx.save();
  ctx.beginPath();
  ctx.arc(ax + ar, ay, ar, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.clip();
  let drewAvatar = false;
  if (withAvatar && input.avatarUrl) {
    try {
      const img = await loadImage(input.avatarUrl, true);
      ctx.drawImage(img, ax, ay - ar, ar * 2, ar * 2);
      drewAvatar = true;
    } catch {
      drewAvatar = false;
    }
  }
  if (!drewAvatar) {
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
  const left = pad + 60;
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

  // baris kontak dengan kotak aksen kecil
  const rows: string[] = [];
  if (input.card.phone) rows.push(input.card.phone);
  if (input.card.whatsapp_number) rows.push(`WA ${input.card.whatsapp_number}`);
  if (input.card.email) rows.push(input.card.email);
  if (input.card.website) rows.push(input.card.website.replace(/^https?:\/\//, ""));
  if (input.card.address) rows.push(input.card.address);
  const socials: string[] = [];
  if (input.card.instagram) socials.push(`IG @${input.card.instagram}`);
  if (input.card.tiktok) socials.push(`TikTok @${input.card.tiktok}`);
  if (input.card.linkedin) socials.push(`LinkedIn ${input.card.linkedin.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//i, "")}`);
  y += 30;
  ctx.font = `500 30px ${body}`;
  for (const r of rows) {
    ctx.fillStyle = theme.hex === INK ? "#ffffff" : theme.hex;
    roundRect(ctx, left, y - 26, 34, 34, 8);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = INK;
    const lines = wrapText(ctx, r, maxW - 60, 2);
    lines.forEach((line, i) => ctx.fillText(line, left + 54, y + i * 36));
    y += 36 * lines.length + 16;
  }
  if (socials.length) {
    y += 6;
    ctx.font = `700 26px ${body}`;
    let x = left;
    for (const s of socials) {
      const w = ctx.measureText(s).width + 40;
      if (x + w > left + maxW) {
        x = left;
        y += 58;
      }
      ctx.fillStyle = "#ffffff";
      roundRect(ctx, x, y - 30, w, 46, 23);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.fillText(s, x + 20, y + 2);
      x += w + 12;
    }
    y += 40;
  }

  // QR di bagian bawah kartu
  const qrSize = 230;
  const qy = pad + ch - qrSize - 70;
  ctx.setLineDash([12, 12]);
  ctx.strokeStyle = "rgba(17,17,17,0.25)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(left, qy - 40);
  ctx.lineTo(left + maxW, qy - 40);
  ctx.stroke();
  ctx.setLineDash([]);
  const qr = await loadImage(input.qrDataUrl, false);
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, left, qy, qrSize + 24, qrSize + 24, 16);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.drawImage(qr, left + 12, qy + 12, qrSize, qrSize);
  ctx.fillStyle = INK;
  ctx.font = `700 30px ${body}`;
  ctx.fillText("Scan untuk simpan kontak", left + qrSize + 60, qy + 90);
  ctx.font = `400 26px ${body}`;
  ctx.fillStyle = "rgba(17,17,17,0.6)";
  wrapText(ctx, input.url.replace(/^https?:\/\//, ""), maxW - qrSize - 80, 2).forEach((line, i) => {
    ctx.fillText(line, left + qrSize + 60, qy + 140 + i * 32);
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("gagal membuat PNG"))), "image/png");
  });
}

export async function renderBusinessCardPNG(input: RenderCardInput): Promise<Blob> {
  try {
    return await draw(input, true);
  } catch {
    // Kemungkinan besar canvas ternoda avatar lintas-origin -- ulangi tanpa avatar.
    return draw(input, false);
  }
}
