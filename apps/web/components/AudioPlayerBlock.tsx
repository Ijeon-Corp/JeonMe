"use client";

import { useRef, useState } from "react";
import { IconPlayCircle, IconPauseCircle, IconMusicNote } from "@/components/icons";

// formatTime -- "-:--" utk durasi belum diketahui (belum termuat / NaN
// sebelum event loadedmetadata) supaya beda jelas dari "0:00" (posisi
// SUNGGUHAN di detik ke-0), pola sama seperti pemutar musik pada umumnya.
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "-:--";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Blok "audio" (hasil analisa galeri tema kompetitor, 17 Agustus 2026 --
// mockup "Music" dari galeri tema kompetitor Aug 4 menampilkan pemutar
// musik tertanam di bio, Jeonme belum punya padanannya sama sekali).
// Elemen <audio> NATIVE (bukan waveform kustom -- di luar lingkup, lihat
// diskusi fitur) dikendalikan lewat ref, kontrol play/pause + progress
// sendiri supaya tampilannya konsisten dengan tema (theme.card/cardTitle),
// bukan UI bawaan browser yang tidak bisa diberi warna.
//
// Susulan permintaan pengguna, 17 Agustus 2026: "saat diplay ada indikator
// berapa menit lagunya dll seperti aplikasi music biasanya" -- ditambah
// waktu berjalan/durasi total (format m:ss) + progress bar yang bisa
// digeser (seek), bukan cuma tombol play/pause polos. `preload="metadata"`
// (bukan "none" seperti sebelumnya) supaya durasi total sudah diketahui
// SEBELUM lagu diputar (perilaku pemutar musik pada umumnya), TANPA
// mengunduh seluruh file (cuma header/metadata, browser yang menentukan
// lewat range request).
export default function AudioPlayerBlock({
  title,
  audioUrl,
  coverUrl,
  cardClassName,
  titleClassName,
}: {
  title: string;
  audioUrl: string;
  coverUrl?: string;
  cardClassName: string;
  titleClassName: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(NaN);
  const [currentTime, setCurrentTime] = useState(0);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      void audio.play();
    }
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    const value = Number(e.target.value);
    if (audio) audio.currentTime = value;
    setCurrentTime(value);
  }

  if (!audioUrl) {
    return (
      <div className={cardClassName}>
        <p className="text-xs text-red-500">Audio belum diunggah.</p>
      </div>
    );
  }

  return (
    <div className={cardClassName}>
      <div className="flex items-center gap-3">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt="" className="h-11 w-11 flex-shrink-0 rounded-lg object-cover" />
        ) : (
          <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-current/10 ${titleClassName}`}>
            <IconMusicNote className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-semibold ${titleClassName}`}>{title || "Audio"}</p>
          <div className={`mt-1 flex items-center gap-2 ${titleClassName}`}>
            <span className="flex-shrink-0 text-[10px] tabular-nums opacity-70">{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={Number.isFinite(duration) && duration > 0 ? duration : 0}
              step={0.1}
              value={Math.min(currentTime, Number.isFinite(duration) ? duration : currentTime)}
              onChange={handleSeek}
              disabled={!Number.isFinite(duration) || duration <= 0}
              aria-label="Posisi audio"
              className="h-1 w-full flex-1 cursor-pointer accent-current disabled:cursor-default"
            />
            <span className="flex-shrink-0 text-[10px] tabular-nums opacity-70">{formatTime(duration)}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? "Jeda" : "Putar"}
          className={`flex-shrink-0 ${titleClassName}`}
        >
          {isPlaying ? <IconPauseCircle className="h-8 w-8" /> : <IconPlayCircle className="h-8 w-8" />}
        </button>
      </div>
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        className="hidden"
      />
    </div>
  );
}
