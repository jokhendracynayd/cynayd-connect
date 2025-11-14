import { MicMutedIcon, VideoMutedIcon } from './icons';

interface HostControls {
  audioForceAll: boolean;
  videoForceAll: boolean;
  chatForceAll: boolean;
  locked: boolean;
}

interface AdminControlsBarProps {
  hostControls: HostControls;
  onMuteAllAudio: () => void;
  onUnmuteAllAudio: () => void;
  onMuteAllVideo: () => void;
  onUnmuteAllVideo: () => void;
  onToggleChat: () => void;
  onToggleLock: () => void;
  recordingIsRecording?: boolean;
  recordingPending?: boolean;
  onStartRecording?: () => void;
  onStopRecording?: () => void;
  recordingButtonClass?: string;
  recordingButtonDisabled?: boolean;
}

export default function AdminControlsBar({
  hostControls,
  onMuteAllAudio,
  onUnmuteAllAudio,
  onMuteAllVideo,
  onUnmuteAllVideo,
  onToggleChat,
  onToggleLock,
  recordingIsRecording = false,
  recordingPending = false,
  onStartRecording,
  onStopRecording,
  recordingButtonClass = '',
  recordingButtonDisabled = false,
}: AdminControlsBarProps) {
  return (
    <div
      className="fixed right-6 z-40 flex flex-col items-end gap-3"
      style={{
        bottom: 0,
        paddingBottom: `calc(12px + env(safe-area-inset-bottom))`,
      }}
    >
      <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-full border border-white/60 bg-white/90 px-3 py-2 shadow-[0_22px_45px_-28px_rgba(14,165,233,0.45)] sm:gap-3 sm:px-6 sm:py-3">
        <button
          onClick={hostControls.audioForceAll ? onUnmuteAllAudio : onMuteAllAudio}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition sm:px-3.5 sm:py-1.5 sm:text-sm ${
            hostControls.audioForceAll
              ? 'bg-rose-200 text-rose-700 shadow-sm hover:bg-rose-300'
              : 'bg-white text-slate-600 hover:bg-slate-100'
          }`}
          aria-pressed={hostControls.audioForceAll}
        >
          <MicMutedIcon className="h-4 w-4" />
          <span className="hidden sm:inline">Mic</span>
          <span className="sm:hidden">M</span>
        </button>

        <button
          onClick={hostControls.videoForceAll ? onUnmuteAllVideo : onMuteAllVideo}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition sm:px-3.5 sm:py-1.5 sm:text-sm ${
            hostControls.videoForceAll
              ? 'bg-rose-200 text-rose-700 shadow-sm hover:bg-rose-300'
              : 'bg-white text-slate-600 hover:bg-slate-100'
          }`}
          aria-pressed={hostControls.videoForceAll}
        >
          <VideoMutedIcon className="h-4 w-4" />
          <span className="hidden sm:inline">Camera</span>
          <span className="sm:hidden">Cam</span>
        </button>

        <button
          onClick={onToggleChat}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition sm:px-3.5 sm:py-1.5 sm:text-sm ${
            hostControls.chatForceAll
              ? 'bg-rose-200 text-rose-700 shadow-sm hover:bg-rose-300'
              : 'bg-white text-slate-600 hover:bg-slate-100'
          }`}
          aria-pressed={hostControls.chatForceAll}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 8h10M7 12h6m7 0a9 9 0 11-4.219-7.516L21 4v8z"
            />
          </svg>
          <span className="hidden sm:inline">Chat</span>
          <span className="sm:hidden">Chat</span>
        </button>

        <button
          onClick={onToggleLock}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition sm:px-3.5 sm:py-1.5 sm:text-sm ${
            hostControls.locked ? 'bg-rose-500 text-white' : 'bg-white/90 text-slate-600'
          }`}
          aria-pressed={hostControls.locked}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 20 20" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7 9V7a3 3 0 016 0v2m-6 0h6a2 2 0 012 2v5a2 2 0 01-2 2H7a2 2 0 01-2-2v-5a2 2 0 012-2z"
            />
          </svg>
          <span className="hidden sm:inline">Lock</span>
          <span className="sm:hidden">L</span>
        </button>

        {false && onStartRecording && onStopRecording && (
          <button
            onClick={recordingIsRecording ? onStopRecording : onStartRecording}
            disabled={recordingButtonDisabled}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition sm:px-3.5 sm:py-1.5 sm:text-sm ${
              recordingButtonDisabled ? `${recordingButtonClass} cursor-wait` : recordingButtonClass
            }`}
            aria-pressed={recordingIsRecording}
            title={
              recordingIsRecording
                ? 'Stop recording'
                : recordingPending
                ? 'Recording in progress'
                : 'Start recording'
            }
          >
            {recordingPending ? (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                />
              </svg>
            ) : recordingIsRecording ? (
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <rect x="6" y="6" width="8" height="8" rx="1.5" />
              </svg>
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <circle cx="10" cy="10" r="6" />
              </svg>
            )}
            <span className="hidden sm:inline">
              {recordingIsRecording ? 'Stop Rec' : 'Start Rec'}
            </span>
            <span className="sm:hidden">{recordingIsRecording ? 'Stop' : 'Rec'}</span>
          </button>
        )}
      </div>
    </div>
  );
}

