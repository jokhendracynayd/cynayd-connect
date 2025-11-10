import { createPortal } from 'react-dom';
import { useCallStore } from '../../store/callStore';
import { useAuthStore } from '../../store/authStore';

interface ParticipantListProps {
  isOpen: boolean;
  onClose: () => void;
  canModerate?: boolean;
  canManageRoles?: boolean;
  currentUserId?: string | null;
  onForceMute?: (userId: string, targets: { audio?: boolean; video?: boolean }, mute: boolean) => void;
  onRemoveParticipant?: (userId: string) => void;
  onPromoteToCoHost?: (userId: string) => void;
  onDemoteFromCoHost?: (userId: string) => void;
}

export default function ParticipantList({
  isOpen,
  onClose,
  canModerate = false,
  canManageRoles = false,
  currentUserId,
  onForceMute,
  onRemoveParticipant,
  onPromoteToCoHost,
  onDemoteFromCoHost,
}: ParticipantListProps) {
  const { participants, activeSpeakerId } = useCallStore();
  const { user } = useAuthStore();
  const isActiveSpeaker = (userId: string) => activeSpeakerId === userId;

  if (!isOpen) return null;

  const portalTarget = typeof document !== 'undefined' ? document.body : null;

  if (!portalTarget) {
    return null;
  }

  return createPortal(
    <div className="fixed right-0 top-0 z-50 h-full w-[22rem] overflow-y-auto border-l border-slate-200 bg-white/90 shadow-[0_28px_60px_-32px_rgba(14,165,233,0.35)] backdrop-blur-xl">
      <div className="px-5 py-4 border-b border-slate-200">
        <div className="flex items-center justify-between text-slate-700">
          <h2 className="text-lg font-semibold tracking-tight">
            Participants <span className="text-sm text-slate-400">({participants.length})</span>
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-500 hover:text-cyan-500 hover:bg-cyan-50 transition"
            aria-label="Close participant list"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="px-5 py-4 space-y-3">
        {participants.map((participant) => (
          <div
            key={participant.userId}
            className={`flex items-center space-x-3 p-3 rounded-2xl transition ${
              isActiveSpeaker(participant.userId)
                ? 'border border-cyan-200 bg-cyan-50 shadow-[0_16px_35px_-28px_rgba(14,165,233,0.6)]'
                : 'border border-transparent hover:border-cyan-100 hover:bg-cyan-50/40'
            }`}
          >
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              {participant.picture ? (
                <img
                  src={participant.picture}
                  alt={participant.name}
                  className="w-11 h-11 rounded-full border border-white shadow-sm"
                />
              ) : (
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-cyan-400 via-sky-500 to-indigo-500 flex items-center justify-center text-white font-semibold shadow-sm">
                  {participant.name
                    .split(' ')
                    .map(n => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2)}
                </div>
              )}
              {/* Active speaker indicator */}
              {isActiveSpeaker(participant.userId) && (
                <div className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 bg-cyan-500 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(6,182,212,0.25)]"></div>
              )}
            </div>

            {/* Name and status */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <span className="text-sm font-semibold text-slate-900 truncate">
                  {participant.name}
                  {participant.userId === user?.id && ' (You)'}
                </span>
                {participant.role === 'HOST' && (
                  <span className="px-2 py-0.5 text-[11px] font-semibold text-cyan-700 bg-cyan-100 rounded-full tracking-wide uppercase">
                    Host
                  </span>
                )}
                {participant.role === 'COHOST' && participant.role !== 'HOST' && (
                  <span className="px-2 py-0.5 text-[11px] font-semibold text-indigo-700 bg-indigo-100 rounded-full tracking-wide uppercase">
                    Co-host
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {participant.isAudioMuted && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-500">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Muted
                  </span>
                )}
                {participant.isAudioForceMuted && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 20 20" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M7 8V6a3 3 0 116 0v2m0 0v2a3 3 0 106 0V8m-6 0h6"
                      />
                    </svg>
                    Host muted
                  </span>
                )}
                {participant.isVideoMuted && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                    </svg>
                    Camera off
                  </span>
                )}
                {participant.isVideoForceMuted && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 20 20" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M4 5a2 2 0 012-2h4a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V5zM16 7l3-2v10l-3-2"
                      />
                    </svg>
                    Host disabled video
                  </span>
                )}
                {participant.hasRaisedHand && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 0a1.5 1.5 0 00-3 0v2.5m6 0V11m0-5.5v-1a1.5 1.5 0 00-3 0v1m0 0V11m3-5.5a1.5 1.5 0 00-3 0v3m6 0V11" />
                    </svg>
                    Raised hand
                  </span>
                )}
                {participant.forceMuteReason && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 20 20" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h1m-2 0h-1v4h1M5 8h10M6 5h8M5 11h10" />
                    </svg>
                    {participant.forceMuteReason}
                  </span>
                )}
              </div>
              {canModerate && participant.userId !== currentUserId && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {canManageRoles && participant.role !== 'HOST' && (
                    <button
                      onClick={() =>
                        (participant.role === 'COHOST'
                          ? onDemoteFromCoHost
                          : onPromoteToCoHost)?.(participant.userId)
                      }
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                        participant.role === 'COHOST'
                          ? 'border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300 hover:text-amber-800'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-600'
                      }`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 20 20" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      {participant.role === 'COHOST' ? 'Remove co-host' : 'Make co-host'}
                    </button>
                  )}
                  <button
                    onClick={() =>
                      onForceMute?.(
                        participant.userId,
                        { audio: true },
                        !participant.isAudioForceMuted
                      )
                    }
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                      participant.isAudioForceMuted
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-600 hover:border-emerald-300 hover:text-emerald-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-cyan-200 hover:text-cyan-600'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 20 20" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M7 8V6a3 3 0 116 0v2m0 0v2a3 3 0 106 0V8m-6 0h6"
                      />
                    </svg>
                    {participant.isAudioForceMuted ? 'Release mic' : 'Force mute'}
                  </button>
                  <button
                    onClick={() =>
                      onForceMute?.(
                        participant.userId,
                        { video: true },
                        !participant.isVideoForceMuted
                      )
                    }
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                      participant.isVideoForceMuted
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-600 hover:border-emerald-300 hover:text-emerald-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-cyan-200 hover:text-cyan-600'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 20 20" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M4 5a2 2 0 012-2h4a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V5zM16 7l3-2v10l-3-2"
                      />
                    </svg>
                    {participant.isVideoForceMuted ? 'Enable video' : 'Disable video'}
                  </button>
                  <button
                    onClick={() => onRemoveParticipant?.(participant.userId)}
                    className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-600 transition hover:border-rose-300 hover:text-rose-700"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 20 20" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M6 18L14 6m0 0v6m0-6H8"
                      />
                    </svg>
                    Remove
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>,
    portalTarget
  );
}

