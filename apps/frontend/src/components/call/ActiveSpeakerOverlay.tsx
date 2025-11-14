import { useRef, useEffect } from 'react';
import type { ParticipantTile } from '../../types/call';

interface ActiveSpeakerOverlayProps {
  tile: ParticipantTile;
  hasLiveVideo: boolean;
  stream: MediaStream | null;
  facingMode?: string | undefined;
  isProbableScreenShare: boolean;
}

export default function ActiveSpeakerOverlay({
  tile,
  hasLiveVideo,
  stream,
  facingMode,
  isProbableScreenShare,
}: ActiveSpeakerOverlayProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) {
      return;
    }

    if (!stream) {
      if (videoElement.srcObject) {
        videoElement.srcObject = null;
      }
      return;
    }

    if (videoElement.srcObject !== stream) {
      videoElement.srcObject = stream;
    }

    videoElement.play().catch(error => {
      console.warn('Error playing active speaker overlay video:', error);
    });
  }, [stream, hasLiveVideo]);

  const shouldMirror =
    tile.isLocal ||
    facingMode === 'user' ||
    (!facingMode && !isProbableScreenShare);

  return (
    <div className="pointer-events-auto absolute bottom-6 right-6 flex w-[min(240px,35%)] flex-col gap-2 rounded-3xl border border-white/40 bg-white/90 p-3 shadow-[0_22px_45px_-28px_rgba(15,23,42,0.45)] backdrop-blur">
      <div className="relative aspect-video overflow-hidden rounded-2xl bg-slate-900/85">
        {hasLiveVideo ? (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className={`h-full w-full object-cover ${shouldMirror ? 'mirror-video' : ''}`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-slate-900/80 text-white/70">
            {tile.picture ? (
              <img
                src={tile.picture}
                alt={tile.name}
                className="h-12 w-12 rounded-full border border-white/40 object-cover"
              />
            ) : (
              <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            )}
          </div>
        )}
        <div className="absolute left-3 top-3 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-white">
          Speaker
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-600">
        <div className="flex items-center gap-2">
          <span className="truncate text-slate-700">
            {tile.name}
            {tile.isLocal ? ' (You)' : ''}
          </span>
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full ${
              tile.isAudioMuted
                ? 'bg-rose-100 text-rose-500'
                : 'bg-cyan-100 text-cyan-600'
            }`}
          >
            {tile.isAudioMuted ? (
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10v2a3 3 0 01-6 0V7m9 5a7 7 0 01-7 7m0 0a7 7 0 01-7-7v-2m7 7v4" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5a3 3 0 016 0v6a3 3 0 11-6 0V5z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10v2a7 7 0 0014 0v-2" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 17v4" />
              </svg>
            )}
          </span>
        </div>
        {tile.isHost && (
          <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-700">
            Host
          </span>
        )}
      </div>
    </div>
  );
}

