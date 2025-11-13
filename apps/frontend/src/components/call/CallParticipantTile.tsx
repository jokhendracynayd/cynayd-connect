import type { ParticipantTile } from '../../types/call';
import type { NonSplitLayoutConfig } from '../../utils/callLayout';
import { MicMutedIcon, HandRaisedIcon } from './icons';

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
  const tileStream = tile.stream ?? null;
  const videoTracks = tileStream?.getVideoTracks() ?? [];
  const hasLiveVideo = videoTracks.some(track => track.readyState === 'live');
  const shouldShowVideo = Boolean(tileStream && !tile.isVideoMuted && hasLiveVideo);
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

  const tileClasses = [
    'relative overflow-hidden rounded-3xl border border-slate-200 bg-white/90 shadow-[0_24px_60px_-35px_rgba(14,165,233,0.35)] transition-all',
    'w-full',
    tile.isSpeaking ? 'ring-2 ring-cyan-400 shadow-[0_0_0_4px_rgba(14,165,233,0.15)]' : '',
    tile.isLocal ? 'ring-1 ring-cyan-200/60' : '',
    showSplitLayout ? 'aspect-[4/3]' : isSoloLayout ? 'h-full' : '',
    layoutTileBaseClass,
    layoutTileIndexClass,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div key={`${tile.userId}-${tile.isLocal ? 'local' : 'remote'}`} className={tileClasses}>
      <video
        ref={tile.isLocal ? setLocalVideoRef : getRemoteVideoRef(tile.userId)}
        autoPlay
        playsInline
        muted={tile.isLocal}
        className={`h-full w-full bg-slate-950/90 object-cover ${shouldMirrorVideo ? 'mirror-video' : ''}`}
        style={{ visibility: shouldShowVideo ? 'visible' : 'hidden' }}
      />

      {!shouldShowVideo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 text-white/70">
          {tile.picture ? (
            <img
              src={tile.picture}
              alt={tile.name}
              className="h-16 w-16 rounded-[18px] border border-white/40 object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-[18px] border border-white/30 bg-gradient-to-br from-cyan-500/50 via-sky-500/40 to-indigo-500/40 shadow-[0_18px_35px_-24px_rgba(14,165,233,0.65)] backdrop-blur">
              <svg className="h-10 w-10 text-white/80" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.6}
                  d="M12 12.5c2.485 0 4.5-2.015 4.5-4.5S14.485 3.5 12 3.5 7.5 5.515 7.5 8s2.015 4.5 4.5 4.5zM5.25 20.5c.684-2.982 3.34-5.25 6.75-5.25s6.066 2.268 6.75 5.25"
                />
              </svg>
            </div>
          )}
          <span className="mt-3 text-sm font-medium capitalize">{tile.name}</span>
        </div>
      )}

      {tile.isAudioMuted && (
        <div className="absolute left-4 top-4 rounded-full bg-rose-200/90 p-2 text-rose-700 shadow-sm backdrop-blur">
          <MicMutedIcon className="h-4 w-4" />
        </div>
      )}

      {tile.hasRaisedHand && (
        <div className="absolute right-4 top-4 rounded-full bg-amber-300 p-2 text-amber-900 shadow">
          <HandRaisedIcon className="h-4 w-4" />
        </div>
      )}

      <div className="absolute bottom-4 left-4 flex flex-wrap items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white backdrop-blur">
        <span className="tracking-normal capitalize">
          {tile.name}
          {tile.isLocal ? ' (You)' : ''}
        </span>
        {tile.isHost && (
          <span className="rounded-full bg-cyan-200/80 px-2 py-0.5 text-[10px] font-semibold uppercase text-cyan-900">
            Host
          </span>
        )}
        {!tile.isHost && tile.role === 'COHOST' && (
          <span className="rounded-full bg-indigo-200/80 px-2 py-0.5 text-[10px] font-semibold uppercase text-indigo-900">
            Co-host
          </span>
        )}
      </div>
    </div>
  );
}

