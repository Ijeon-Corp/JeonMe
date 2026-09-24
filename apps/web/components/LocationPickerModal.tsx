"use client";

import { useEffect, useRef, useState } from "react";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import type { Map as LeafletMap } from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { IconClose, IconMapPin, IconSearch, IconTarget } from "@/components/icons";
import { useLocale } from "@/lib/locale-context";
import { useModalA11y } from "@/lib/use-modal-a11y";

// LocationPickerModal -- permintaan langsung pengguna, 25 Agustus 2026:
// "untuk blok maps user bisa memilih langsung lokasi dia saat ini lewat
// blok nya langsung jadi bisa pop up gmaps dan bisa memilih". Peta pakai
// OpenStreetMap/Leaflet (dikonfirmasi lewat AskUserQuestion, BUKAN Google
// Maps JS API asli) -- Google Maps JS API butuh API key baru dengan
// billing GCP aktif (biaya berjalan), sementara Leaflet+OSM 100% gratis
// tanpa API key sama sekali, konsisten dengan resolveMapsEmbedCoords
// (links.go) yang juga sengaja menghindari API berbayar.
//
// Hasil akhir TETAP tautan Google Maps biasa ("https://www.google.com/
// maps/@<lat>,<lng>,17z") -- diverifikasi langsung lewat curl (25 Agustus
// 2026): URL bentuk ini di-serve Google APA ADANYA (200, tanpa redirect
// yang menghilangkan koordinatnya), jadi lolos mapsCoordPattern &
// allowedMapsHosts (links.go) TANPA perlu ubah backend sama sekali --
// alur create/update blok "maps" yang sudah ada (isi field URL lalu
// submit form seperti biasa) tetap satu-satunya jalur yang dipakai,
// modal ini cuma cara lain MENGISI field itu.
//
// Marker pakai divIcon SVG inline (bukan L.Icon.Default -- path gambar
// bawaan Leaflet PECAH di bundler apa pun tanpa konfigurasi tambahan,
// masalah umum yang sudah dikenal) -- konsisten dengan gaya ikon lain di
// repo ini (components/icons.tsx, semua inline SVG, TIDAK ada aset
// gambar/CDN eksternal).
const markerIcon = L.divIcon({
  className: "",
  html: `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter drop-shadow(0 2px 3px rgba(0,0,0,0.35))">
    <path d="M12 2C7.58 2 4 5.58 4 10c0 5.25 6.72 11.19 7.01 11.44a1.5 1.5 0 0 0 1.98 0C13.28 21.19 20 15.25 20 10c0-4.42-3.58-8-8-8Z" fill="#7657ff"/>
    <circle cx="12" cy="10" r="3.4" fill="white"/>
  </svg>`,
  iconSize: [34, 34],
  iconAnchor: [17, 32],
});

const DEFAULT_CENTER: [number, number] = [-6.2088, 106.8456]; // Jakarta -- titik awal netral, kreator tinggal geser/cari.

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

function ClickToPick({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function LocationPickerModal({ onSelect, onClose }: { onSelect: (url: string) => void; onClose: () => void }) {
  // useModalA11y -- 24 September 2026 (audit aksesibilitas): Escape
  // sebelumnya tidak menutup modal ini, fokus tidak dikurung (lolos ke
  // balik scrim setelah belasan Tab), dan fokus tidak kembali ke pemicu.
  // Komponen ini hanya di-mount saat terbuka, jadi open cukup true --
  // cleanup saat unmount yang mengembalikan fokus. Lihat
  // lib/use-modal-a11y.ts.
  const modalRef = useModalA11y(true, onClose);
  const { t } = useLocale();
  const [position, setPosition] = useState<[number, number]>(DEFAULT_CENTER);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pencarian alamat -- Nominatim (OpenStreetMap), gratis tanpa API key.
  // Debounce 600ms -- kebijakan pemakaian wajar Nominatim membatasi
  // maks. 1 permintaan/detik.
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    // Semua setState terjadi DI DALAM callback setTimeout (async, bukan
    // sinkron di badan efek) -- termasuk cabang "query terlalu pendek",
    // supaya lolos aturan react-hooks/set-state-in-effect (lihat CLAUDE.md).
    searchTimer.current = setTimeout(async () => {
      const query = search.trim();
      if (query.length < 3) {
        setResults([]);
        return;
      }
      setSearching(true);
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=id&q=${encodeURIComponent(query)}`);
        const data = (await res.json()) as NominatimResult[];
        setResults(data);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 600);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search]);

  function flyTo(lat: number, lng: number) {
    setPosition([lat, lng]);
    mapRef.current?.flyTo([lat, lng], 17);
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setError(t("dashboard.components.locationPickerModal.geolocationUnsupported"));
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        flyTo(pos.coords.latitude, pos.coords.longitude);
        setLocating(false);
      },
      () => {
        setError(t("dashboard.components.locationPickerModal.geolocationFailed"));
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function confirm() {
    const [lat, lng] = position;
    onSelect(`https://www.google.com/maps/@${lat},${lng},17z`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-8 sm:items-center" onClick={onClose}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Pilih lokasi" className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-jlg border-2 border-jeon-ink bg-app-surface shadow-brutal" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-shrink-0 items-center justify-between border-b border-app-border px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-bold text-app-ink">{t("dashboard.components.locationPickerModal.title")}</h2>
            <p className="text-xs text-app-muted">{t("dashboard.components.locationPickerModal.subtitle")}</p>
          </div>
          <button type="button" onClick={onClose} className="text-app-muted hover:text-app-ink">
            <IconClose className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-shrink-0 border-b border-app-border p-3">
          <div className="flex gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-gray-100 px-4 py-2.5">
              <IconSearch className="h-4 w-4 flex-shrink-0 text-app-muted" />
              <input
                type="text"
                autoFocus
                placeholder={t("dashboard.components.locationPickerModal.searchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full min-w-0 bg-transparent text-sm outline-none"
              />
            </div>
            <button
              type="button"
              onClick={useCurrentLocation}
              disabled={locating}
              className="flex flex-shrink-0 items-center gap-1.5 rounded-full border-2 border-jeon-ink px-3.5 py-2 text-xs font-bold text-app-ink hover:border-jeon-purple hover:text-jeon-purple disabled:opacity-60"
            >
              <IconTarget className="h-3.5 w-3.5" />
              {locating ? t("dashboard.components.locationPickerModal.searching") : t("dashboard.components.locationPickerModal.myLocation")}
            </button>
          </div>
          {results.length > 0 && (
            <ul className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-app-border">
              {results.map((r, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => {
                      flyTo(parseFloat(r.lat), parseFloat(r.lon));
                      setResults([]);
                      setSearch(r.display_name);
                    }}
                    className="flex w-full items-start gap-2 border-b border-app-border px-3 py-2 text-left text-xs text-app-ink last:border-b-0 hover:bg-jeon-purple/10"
                  >
                    <IconMapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-app-muted" />
                    {r.display_name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {searching && <p className="mt-1.5 text-[11px] text-app-muted">{t("dashboard.components.locationPickerModal.searching")}</p>}
          {error && <p className="mt-1.5 text-[11px] font-semibold text-red-600">{error}</p>}
        </div>

        <div className="relative h-[360px] w-full flex-shrink-0">
          <MapContainer
            center={position}
            zoom={13}
            style={{ height: "100%", width: "100%" }}
            ref={mapRef}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Marker
              position={position}
              icon={markerIcon}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const m = e.target.getLatLng();
                  setPosition([m.lat, m.lng]);
                },
              }}
            />
            <ClickToPick onPick={(lat, lng) => setPosition([lat, lng])} />
          </MapContainer>
        </div>

        <div className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-app-border px-5 py-4">
          <p className="text-[11px] text-app-muted">
            {position[0].toFixed(5)}, {position[1].toFixed(5)}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border-2 border-jeon-ink px-4 py-2 text-sm font-bold text-app-muted hover:border-ink/30">
              {t("dashboard.components.locationPickerModal.cancel")}
            </button>
            <button type="button" onClick={confirm} className="btn-primary rounded-lg px-4 py-2 text-sm font-bold text-white">
              {t("dashboard.components.locationPickerModal.confirm")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
