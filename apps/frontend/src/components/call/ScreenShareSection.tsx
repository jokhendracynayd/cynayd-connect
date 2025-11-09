import type { ScreenShare } from '../../types/screenShare';
import PinnedScreenShare from './PinnedScreenShare';
import ScreenShareThumbnail from './ScreenShareThumbnail';

interface ScreenShareSectionProps {
  screenShares: Map<string, ScreenShare>;
  pinnedUserId: string | null;
  onPin: (userId: string) => void;
  remoteStreams: Map<string, MediaStream>; // Screen share streams
  currentUserId?: string; // Current user's ID to hide their own screen share
}

export default function ScreenShareSection({
  screenShares,
  pinnedUserId,
  onPin,
  remoteStreams,
  currentUserId,
}: ScreenShareSectionProps) {
  // Filter out current user's screen share (they don't need to see their own)
  const filteredShares = Array.from(screenShares.values()).filter(
    s => s.userId !== currentUserId
  );
  
  const pinnedShare = pinnedUserId && pinnedUserId !== currentUserId 
    ? screenShares.get(pinnedUserId) 
    : null;
  const hasPinnedShare = Boolean(pinnedShare);
  const otherShares = filteredShares.filter(
    s => s.userId !== pinnedUserId
  );

  const maxVisibleThumbnails = 6;
  const visibleThumbnails = otherShares.slice(0, maxVisibleThumbnails);
  const overflowCount = Math.max(otherShares.length - visibleThumbnails.length, 0);

  if (filteredShares.length === 0) {
    return null; // Don't render if no screen shares (excluding current user's)
  }

  return (
    <div className="flex h-full flex-col gap-4 rounded-[28px] p-5">
      <div className="flex items-center justify-between gap-2 text-slate-500">
        <div className="flex items-center gap-2">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
          <h3 className="text-xs font-semibold uppercase tracking-[0.35em]">Screen Shares</h3>
        </div>
        <span className="hidden rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium tracking-widest text-slate-500 sm:inline-flex">
          {filteredShares.length} active
        </span>
      </div>

      {hasPinnedShare && pinnedShare ? (
        <div className="flex flex-1 flex-col gap-4">
          <div className="flex-1 overflow-hidden rounded-[24px] border border-slate-200 bg-slate-950/85 shadow-[0_22px_55px_-28px_rgba(15,23,42,0.6)]">
            <PinnedScreenShare
              share={pinnedShare}
              stream={remoteStreams.get(pinnedShare.userId)}
              onUnpin={() => onPin(pinnedShare.userId)}
            />
          </div>

          {visibleThumbnails.length > 0 && (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {visibleThumbnails.map(share => (
                <ScreenShareThumbnail
                  key={share.userId}
                  share={share}
                  stream={remoteStreams.get(share.userId)}
                  onPin={() => onPin(share.userId)}
                />
              ))}
              {overflowCount > 0 && (
                <div className="flex min-w-[160px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white/70 px-4 py-6 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                  +{overflowCount} more
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          <div className="grid auto-rows-[minmax(160px,1fr)] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 xl:pr-2">
            {filteredShares.map(share => (
              <ScreenShareThumbnail
                key={share.userId}
                share={share}
                stream={remoteStreams.get(share.userId)}
                onPin={() => onPin(share.userId)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

