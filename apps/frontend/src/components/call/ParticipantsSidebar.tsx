import type { ParticipantTile } from '../../types/call';
import type { ReactElement } from 'react';

interface ParticipantsSidebarProps {
  totalParticipants: number;
  participantTiles: ParticipantTile[];
  renderParticipantTile: (tile: ParticipantTile, index: number) => ReactElement;
  onCollapse: () => void;
  maxHeight?: string;
}

export default function ParticipantsSidebar({
  totalParticipants,
  participantTiles,
  renderParticipantTile,
  onCollapse,
  maxHeight = 'calc(100vh - 140px)',
}: ParticipantsSidebarProps) {
  return (
    <aside
      className="flex w-full min-h-0 flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-white/80 backdrop-blur lg:basis-[22%] lg:max-w-[300px] xl:basis-[18%]"
      style={{ maxHeight }}
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <p className="text-[11px] uppercase tracking-[0.35em] text-slate-400">Participants</p>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
            {totalParticipants}
          </span>
          <button
            type="button"
            onClick={onCollapse}
            className="hidden rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 transition hover:border-cyan-200 hover:text-cyan-600 lg:inline-flex"
          >
            Hide
          </button>
        </div>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 pr-5 min-h-0">
        {participantTiles.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm font-medium text-slate-400">
            Waiting for participants…
          </div>
        ) : (
          participantTiles.map((tile, index) => renderParticipantTile(tile, index))
        )}
      </div>
    </aside>
  );
}

