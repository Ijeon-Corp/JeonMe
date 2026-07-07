import { NextResponse } from "next/server";

// Dipanggil workflow deploy untuk memverifikasi container frontend
// benar-benar siap menerima trafik setelah deploy.
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
