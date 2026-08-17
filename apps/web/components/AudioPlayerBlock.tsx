"use client";

import { useRef, useState } from "react";
import { IconPlayCircle, IconPauseCircle, IconMusicNote } from "@/components/icons";

// Blok "audio" (hasil analisa galeri tema kompetitor, 17 Agustus 2026 --
// mockup "Music" dari galeri tema kompetitor Aug 4 menampilkan pemutar
// musik tertanam di bio, Jeonme belum punya padanannya sama sekali).
// Elemen <audio> NATIVE (bukan waveform kustom -- di luar lingkup, lihat
// diskusi fitur) dikendalikan lewat ref, kontrol play/pause sendiri supaya
// tampilannya konsisten dengan tema (theme.card/cardTitle), bukan UI bawaan
// browser yang tidak bisa diberi warna.
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

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      void audio.play();
    }
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
        <p className={`min-w-0 flex-1 truncate text-sm font-semibold ${titleClassName}`}>{title || "Audio"}</p>
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
        preload="none"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        className="hidden"
      />
    </div>
  );
}
