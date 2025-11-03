import { useCallStore } from '../../store/callStore';
import { useAuthStore } from '../../store/authStore';

interface ParticipantListProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ParticipantList({ isOpen, onClose }: ParticipantListProps) {
  const { participants, activeSpeakerId } = useCallStore();
  const { user } = useAuthStore();
  const isActiveSpeaker = (userId: string) => activeSpeakerId === userId;

  if (!isOpen) return null;

  return (
    <div className="fixed right-0 top-0 h-full w-80 bg-white shadow-xl z-50 overflow-y-auto">
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Participants ({participants.length})</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
            aria-label="Close participant list"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="p-4 space-y-2">
        {participants.map((participant) => (
          <div
            key={participant.userId}
            className={`flex items-center space-x-3 p-3 rounded-lg ${
              isActiveSpeaker(participant.userId) ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'
            }`}
          >
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              {participant.picture ? (
                <img
                  src={participant.picture}
                  alt={participant.name}
                  className="w-10 h-10 rounded-full"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-semibold">
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
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full border-2 border-white"></div>
              )}
            </div>

            {/* Name and status */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium text-gray-900 truncate">
                  {participant.name}
                  {participant.userId === user?.id && ' (You)'}
                </span>
                {participant.isAdmin && (
                  <span className="px-1.5 py-0.5 text-xs font-semibold text-white bg-indigo-600 rounded">
                    Host
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-2 mt-1">
                {participant.isAudioMuted && (
                  <span className="text-xs text-red-600 flex items-center">
                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Muted
                  </span>
                )}
                {participant.isVideoMuted && (
                  <span className="text-xs text-gray-600 flex items-center">
                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                    </svg>
                    Camera off
                  </span>
                )}
                {participant.hasRaisedHand && (
                  <span className="text-xs text-yellow-600 flex items-center">
                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 0a1.5 1.5 0 00-3 0v2.5m6 0V11m0-5.5v-1a1.5 1.5 0 00-3 0v1m0 0V11m3-5.5a1.5 1.5 0 00-3 0v3m6 0V11" />
                    </svg>
                    Raised hand
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

