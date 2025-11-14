import { formatDuration } from '../../utils/call';

interface RecordingIndicatorProps {
  isVisible: boolean;
  isRecording: boolean;
  isPending: boolean;
  statusText: string;
  elapsedSeconds: number;
}

export default function RecordingIndicator({
  isVisible,
  isRecording,
  isPending,
  statusText,
  elapsedSeconds,
}: RecordingIndicatorProps) {
  if (!isVisible) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed top-6 left-1/2 z-40 flex -translate-x-1/2 px-4">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-slate-900/85 px-4 py-2 text-xs font-semibold text-white shadow-[0_18px_40px_-28px_rgba(15,23,42,0.6)]">
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            isRecording ? 'bg-red-500 animate-pulse' : 'bg-amber-400 animate-pulse'
          }`}
        />
        <span>{statusText}</span>
        {isRecording && (
          <span className="font-mono text-sm">{formatDuration(elapsedSeconds)}</span>
        )}
      </div>
    </div>
  );
}

