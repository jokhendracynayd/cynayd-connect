import type { NetworkQualitySummary } from '../../store/callStore';
import type { NetworkQualityLevel } from '../../lib/networkMonitor';

const QUALITY_LABEL: Record<NetworkQualityLevel, string> = {
  excellent: 'Excellent connection',
  good: 'Good connection',
  fair: 'Fair connection',
  poor: 'Poor connection',
  unknown: 'No data',
};

const QUALITY_COLOR: Record<NetworkQualityLevel, string> = {
  excellent: 'text-emerald-500',
  good: 'text-green-500',
  fair: 'text-amber-500',
  poor: 'text-rose-500',
  unknown: 'text-slate-400',
};

const QUALITY_BG: Record<NetworkQualityLevel, string> = {
  excellent: 'bg-emerald-500/15',
  good: 'bg-green-500/15',
  fair: 'bg-amber-500/15',
  poor: 'bg-rose-500/15',
  unknown: 'bg-slate-500/10',
};

interface NetworkIndicatorProps {
  summary?: NetworkQualitySummary | null;
  direction: 'upstream' | 'downstream';
}

export default function NetworkIndicator({ summary, direction }: NetworkIndicatorProps) {
  const level = summary?.level ?? 'unknown';
  const label = QUALITY_LABEL[level];
  const iconColor = QUALITY_COLOR[level];
  const badgeColor = QUALITY_BG[level];
  console.log('[NetworkIndicator] render', { summary, direction, level });
  const tooltip = summary
    ? `${label} • ${summary.kind} ${direction === 'upstream' ? 'outbound' : 'inbound'}
Bitrate: ${summary.bitrateKbps} kbps
Loss: ${summary.packetLoss.toFixed(2)}%
Jitter: ${summary.jitter.toFixed(2)} ms
RTT: ${summary.rtt} ms`
    : 'No network data';

  return (
    <div
      className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${badgeColor}`}
      title={tooltip}
    >
      <svg
        className={`h-3.5 w-3.5 ${iconColor}`}
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M2 13a1 1 0 011-1h1a1 1 0 011 1v2a1 1 0 01-1 1H3a1 1 0 01-1-1v-2z" />
        <path d="M7 9a1 1 0 011-1h1a1 1 0 011 1v6a1 1 0 01-1 1H8a1 1 0 01-1-1V9z" />
        <path d="M12 5a1 1 0 011-1h1a1 1 0 011 1v10a1 1 0 01-1 1h-1a1 1 0 01-1-1V5z" />
        <path d="M17 3a1 1 0 011-1h1a1 1 0 011 1v12a1 1 0 01-1 1h-1a1 1 0 01-1-1V3z" />
      </svg>
      <span className={`text-[10px] font-medium ${iconColor}`}>
        {direction === 'upstream' ? 'Up' : 'Down'} • {level === 'unknown' ? 'No Data' : level}
      </span>
    </div>
  );
}


