"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import type { PublicAnalytics } from "@/lib/api-client";
import { onCookieConsentChange, readCookieConsent } from "@/lib/cookie-consent";

// AnalyticsScripts -- Modul Analitik Pihak Ketiga (permintaan langsung
// pengguna, 12 Agustus 2026, referensi tangkapan layar panel "Analytics"
// Linktree): menyisipkan kode dasar Meta Pixel & Google gtag.js (GA4) ke
// HALAMAN PUBLIK kreator (bukan dashboard -- lihat catatan di
// PublicPageFrame.tsx soal kenapa ini dipasang di rute halaman publik,
// bukan di app/layout.tsx yang membungkus semua rute termasuk dashboard).
//
// fb_pixel_id/ga_measurement_id AMAN disisipkan langsung ke dalam
// <script> inline di sini -- backend (fbPixelIDPattern/
// gaMeasurementIDPattern, analytics_settings.go) MEWAJIBKAN formatnya
// ketat (Pixel ID numerik murni, Measurement ID "G-" + alfanumerik)
// SEBELUM tersimpan, supaya kolom ini tidak bisa disalahgunakan jadi
// celah XSS tersimpan. TIDAK ADA fb_access_token di sini -- itu SECRET,
// cuma dipakai server-side (lihat publicAnalytics, page.go).
//
// PERSETUJUAN COOKIE (3 September 2026, benchmark Linktree "Cookie
// Preferences"): skrip HANYA dimuat setelah pengunjung menyetujui
// kategorinya -- GA = "analytics", Meta Pixel = "marketing" (lihat
// lib/cookie-consent.ts & CookieConsent.tsx). Sebelum ada pilihan, tidak
// ada yang dimuat. Karena itu komponen ini jadi client component: ia
// membaca localStorage dan bereaksi saat pilihan berubah, tanpa reload.
export default function AnalyticsScripts({ analytics }: { analytics: PublicAnalytics | null }) {
  const [allowAnalytics, setAllowAnalytics] = useState(false);
  const [allowMarketing, setAllowMarketing] = useState(false);

  useEffect(() => {
    const apply = (c: { analytics: boolean; marketing: boolean } | null) => {
      setAllowAnalytics(!!c?.analytics);
      setAllowMarketing(!!c?.marketing);
    };
    apply(readCookieConsent());
    return onCookieConsentChange(apply);
  }, []);

  if (!analytics) return null;

  return (
    <>
      {analytics.fb_pixel_id && allowMarketing && (
        <Script id="meta-pixel-base" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${analytics.fb_pixel_id}');
            fbq('track', 'PageView');
          `}
        </Script>
      )}
      {analytics.ga_measurement_id && allowAnalytics && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${analytics.ga_measurement_id}`} strategy="afterInteractive" />
          <Script id="ga4-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${analytics.ga_measurement_id}');
            `}
          </Script>
        </>
      )}
    </>
  );
}
