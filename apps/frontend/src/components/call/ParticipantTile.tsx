import { useRef, useEffect } from 'react';
import { useCallStore, type ParticipantRole } from '../../store/callStore';
import NetworkIndicator from './NetworkIndicator';

interface ParticipantTileProps {
  participant: {
    userId: string;
    name: string;
    email: string;
    picture?: string;
    role: ParticipantRole;
    isAudioMuted: boolean;
    isVideoMuted: boolean;
    isSpeaking: boolean;
    isAdmin: boolean;
    hasRaisedHand: boolean;
  };
  stream?: MediaStream | null;
  isLocal?: boolean;
}

export default function ParticipantTile({ participant, stream, isLocal = false }: ParticipantTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { activeSpeakerId, qualityEntry } = useCallStore(state => ({
      activeSpeakerId: state.activeSpeakerId,
      qualityEntry: state.networkQuality.get(participant.userId),
  }));
  const isActiveSpeaker = activeSpeakerId === participant.userId;
  const upstreamSummary = qualityEntry?.upstream ?? null;
  const downstreamSummary = qualityEntry?.downstream ?? null;
  console.log('[ParticipantTile] qualityEntry', participant.userId, { upstreamSummary, downstreamSummary });
  const indicatorSummary = isLocal
    ? upstreamSummary ?? downstreamSummary
    : downstreamSummary ?? upstreamSummary;
  const indicatorDirection = isLocal ? 'upstream' : 'downstream';

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Get initials from name
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Determine what to display
  const showVideo = !participant.isVideoMuted && stream?.getVideoTracks().some(t => t.readyState === 'live');
  const firstVideoTrack = stream?.getVideoTracks()?.[0];
  const facingMode = firstVideoTrack?.getSettings?.().facingMode;
  const trackLabel = firstVideoTrack?.label?.toLowerCase() ?? '';
  const isProbableScreenShare = trackLabel.includes('screen') || trackLabel.includes('display') || trackLabel.includes('window');
  const isFrontFacingCamera =
    facingMode === 'user' ||
    (!facingMode && !isProbableScreenShare);
  const shouldMirrorVideo = isLocal || isFrontFacingCamera;

  return (
    <div
      className={`relative rounded-lg overflow-hidden bg-gray-900 aspect-video ${
        isActiveSpeaker ? 'ring-4 ring-blue-500 ring-opacity-75 shadow-lg' : ''
      } ${participant.hasRaisedHand ? 'ring-2 ring-yellow-400' : ''}`}
    >
      {/* Video or Avatar */}
      {showVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className={`w-full h-full object-cover ${shouldMirrorVideo ? 'mirror-video' : ''}`}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600">
          {participant.picture ? (
            <img
              src={participant.picture}
              alt={participant.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="text-4xl font-bold text-white">
              {getInitials(participant.name)}
            </div>
          )}
        </div>
      )}

      {/* Overlay with name and controls */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-white text-sm font-medium truncate">{participant.name}</span>
              {participant.role === 'HOST' && (
              <span className="px-1.5 py-0.5 text-xs font-semibold text-white bg-indigo-600 rounded">
                Host
              </span>
            )}
              {participant.role === 'COHOST' && (
                <span className="px-1.5 py-0.5 text-xs font-semibold text-white bg-indigo-500/80 rounded">
                  Co-host
              </span>
            )}
          </div>
          <div className="flex items-center space-x-1">
            {/* Audio mute indicator */}
            {participant.isAudioMuted && (
              <div className="bg-red-600 rounded-full p-1">
                <svg
                  className="w-4 h-4 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                  />
                </svg>
              </div>
            )}
            {/* Raised hand indicator */}
            {participant.hasRaisedHand && (
              <div className="bg-yellow-500 rounded-full p-1">
                <svg
                  className="w-4 h-4 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 0a1.5 1.5 0 00-3 0v2.5m6 0V11m0-5.5v-1a1.5 1.5 0 00-3 0v1m0 0V11m3-5.5a1.5 1.5 0 00-3 0v3m6 0V11"
                  />
                </svg>
              </div>
            )}
            {indicatorSummary && (
              <NetworkIndicator summary={indicatorSummary} direction={indicatorDirection} />
            )}
          </div>
        </div>
      </div>

      {/* Active speaker indicator (pulsing border) */}
      {isActiveSpeaker && (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 rounded-lg animate-pulse border-2 border-blue-400"></div>
        </div>
      )}
    </div>
  );
}

