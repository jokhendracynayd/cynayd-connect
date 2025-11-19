import { useCallback, useEffect, useRef } from 'react';
import type { ParticipantTile } from '../../types/call';
import type { NonSplitLayoutConfig } from '../../utils/callLayout';
import { MicMutedIcon, HandRaisedIcon } from './icons';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';

interface CallParticipantTileProps {
  tile: ParticipantTile;
  index: number;
  showSplitLayout: boolean;
  isSoloLayout: boolean;
  nonSplitLayoutConfig: NonSplitLayoutConfig | null;
  setLocalVideoRef: (element: HTMLVideoElement | null) => void;
  getRemoteVideoRef: (userId: string) => (element: HTMLVideoElement | null) => void;
}

export default function CallParticipantTile({
  tile,
  index,
  showSplitLayout,
  isSoloLayout,
  nonSplitLayoutConfig,
  setLocalVideoRef,
  getRemoteVideoRef,
}: CallParticipantTileProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastStreamRef = useRef<MediaStream | null>(null);
  const tileStream = tile.stream ?? null;
  const videoTracks = tileStream?.getVideoTracks() ?? [];
  const hasLiveVideo = videoTracks.some(track => track.readyState === 'live');
  const shouldShowVideo = Boolean(tileStream && !tile.isVideoMuted && hasLiveVideo);
  
  // Ensure stream is attached to video element whenever it changes
  useEffect(() => {
    if (videoRef.current && tileStream && !tile.isLocal) {
      // Only attach if stream reference actually changed (prevents unnecessary re-attachments)
      if (lastStreamRef.current !== tileStream) {
        videoRef.current.srcObject = tileStream;
        lastStreamRef.current = tileStream;
        // Ensure video plays
        if (videoRef.current.paused) {
          videoRef.current.play().catch(err => {
            console.error('Error playing video for user:', tile.userId, err);
          });
        }
      }
    } else if (!tileStream && lastStreamRef.current) {
      // Clear stream reference when tileStream becomes null
      lastStreamRef.current = null;
    }
  }, [tileStream, tile.userId, tile.isLocal]);
  const firstVideoTrack = videoTracks[0];
  const facingMode = firstVideoTrack?.getSettings?.().facingMode;
  const trackLabel = firstVideoTrack?.label?.toLowerCase() ?? '';
  const isProbableScreenShare = trackLabel.includes('screen') || trackLabel.includes('display') || trackLabel.includes('window');
  const isFrontFacingCamera =
    facingMode === 'user' ||
    (!facingMode && !isProbableScreenShare);
  const shouldMirrorVideo = tile.isLocal || isFrontFacingCamera;
  const layoutTileBaseClass = !showSplitLayout ? nonSplitLayoutConfig?.tileBaseClass ?? '' : '';
  const layoutTileIndexClass =
    !showSplitLayout && nonSplitLayoutConfig?.tileClassForIndex
      ? nonSplitLayoutConfig.tileClassForIndex(index)
      : '';
  
  // Check if this tile needs special width handling (e.g., centered third tile in 3-participant layout)
  const needsSpecialWidth = layoutTileIndexClass.includes('w-[') || layoutTileIndexClass.includes('!w-[');

  const tileClasses = [
    'relative overflow-hidden rounded-3xl border border-gray-700/50 bg-gray-900/80 backdrop-blur-sm shadow-[0_24px_60px_-35px_rgba(0,0,0,0.5)] transition-all',
    // Only apply w-full and min-w-full if not using special width
    needsSpecialWidth ? 'h-full min-h-full' : 'w-full h-full min-h-full min-w-full',
    // Don't apply aspect ratio when in a constrained container (sidebar), use max-height instead
    showSplitLayout && !nonSplitLayoutConfig ? 'aspect-[4/3]' : isSoloLayout ? 'h-full' : '',
    layoutTileBaseClass,
    layoutTileIndexClass,
  ]
    .filter(Boolean)
    .join(' ');

  // Handle ref assignment for both local and remote videos
  // Use useCallback to prevent recreating the ref callback on every render
  const handleVideoRef = useCallback((element: HTMLVideoElement | null) => {
    videoRef.current = element;
    if (tile.isLocal) {
      setLocalVideoRef(element);
    } else {
      getRemoteVideoRef(tile.userId)(element);
    }
  }, [tile.isLocal, tile.userId, setLocalVideoRef, getRemoteVideoRef]);

  // Different overlay colors for different participants - professional palette
  const overlayColors = [
    'bg-slate-900/80',
    'bg-slate-800/80',
    'bg-zinc-900/80',
    'bg-neutral-900/80',
    'bg-slate-700/85',
    'bg-zinc-800/80',
    'bg-neutral-800/80',
    'bg-gray-800/80',
  ];
  const badgeColors = [
    'bg-black/80',
    'bg-slate-950/85',
    'bg-zinc-950/85',
    'bg-neutral-950/85',
    'bg-slate-900/90',
    'bg-zinc-900/90',
    'bg-neutral-900/90',
    'bg-gray-900/90',
  ];
  const overlayColor = overlayColors[index % overlayColors.length];
  const badgeColor = badgeColors[index % badgeColors.length];

  return (
    <div key={`${tile.userId}-${tile.isLocal ? 'local' : 'remote'}`} className={tileClasses}>
      <video
        ref={handleVideoRef}
        autoPlay
        playsInline
        muted={tile.isLocal}
        className={`h-full w-full bg-slate-950/90 object-cover ${shouldMirrorVideo ? 'mirror-video' : ''}`}
        style={{ visibility: shouldShowVideo ? 'visible' : 'hidden' }}
      />

      {!shouldShowVideo && (
        <div className={`absolute inset-0 flex items-center justify-center ${overlayColor} text-white/70 min-h-full min-w-full h-full w-full`}>
          {tile.picture ? (
            <img
              src={tile.picture}
              alt={tile.name}
              className="h-20 w-20 rounded-full border border-white/40 object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/30 bg-gradient-to-br from-cyan-500/50 via-sky-500/40 to-indigo-500/40 shadow-[0_18px_35px_-24px_rgba(14,165,233,0.65)] backdrop-blur">
              <svg className="h-12 w-12 text-white/80" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.6}
                  d="M12 12.5c2.485 0 4.5-2.015 4.5-4.5S14.485 3.5 12 3.5 7.5 5.515 7.5 8s2.015 4.5 4.5 4.5zM5.25 20.5c.684-2.982 3.34-5.25 6.75-5.25s6.066 2.268 6.75 5.25"
                />
              </svg>
            </div>
          )}
        </div>
      )}

      {/* Audio mute/speaking indicator - only show for remote participants */}
      {!tile.isLocal && (
        <>
          {tile.isAudioMuted ? (
            <div className="absolute left-4 top-4 rounded-full bg-rose-700/50 p-2 text-white/80 shadow-md backdrop-blur-sm">
              <MicMutedIcon className="h-4 w-4" />
            </div>
          ) : (
            /* Show mic icon with Lottie animation when speaking */
            <div className="absolute left-4 top-4 rounded-full bg-gray-800/70 p-1.5 text-white/80 shadow-md backdrop-blur-sm">
              <div className="relative h-5 w-5 flex items-center justify-center">
                {/* Lottie mic animation - show when speaking, otherwise show static mic icon */}
                {tile.isSpeaking ? (
                  <DotLottieReact
                    src="/micanimation.json"
                    loop
                    autoplay
                    style={{
                      width: '20px',
                      height: '20px',
                    }}
                  />
                ) : (
                  <svg 
                    className="h-4 w-4 relative z-10" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" 
                    />
                  </svg>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {tile.hasRaisedHand && (
        <div className="absolute right-4 top-4 rounded-full bg-amber-500/90 p-2 text-white shadow-lg backdrop-blur animate-pulse">
          <HandRaisedIcon className="h-4 w-4" />
        </div>
      )}

      <div className={`absolute bottom-2 left-3 flex flex-wrap items-center gap-2 rounded-full ${badgeColor} px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white backdrop-blur-md border border-white/10`}>
        <span className="tracking-normal capitalize">
          {tile.name}
          {tile.isLocal ? ' (You)' : ''}
        </span>
        {tile.isHost && (
          <span className="rounded-full bg-cyan-500/90 px-2 py-0.5 text-[10px] font-semibold uppercase text-white">
            Host
          </span>
        )}
        {!tile.isHost && tile.role === 'COHOST' && (
          <span className="rounded-full bg-indigo-500/90 px-2 py-0.5 text-[10px] font-semibold uppercase text-white">
            Co-host
          </span>
        )}
      </div>
    </div>
  );
}

