import AudioControlGroup from './AudioControlGroup';
import VideoControlGroup from './VideoControlGroup';
import RaiseHandButton from './RaiseHandButton';
import ScreenShareButton from './ScreenShareButton';
import ChatButton from './ChatButton';
import ParticipantsButton from './ParticipantsButton';
import AdminBottomButtons from './AdminBottomButtons';
import LeaveButton from './LeaveButton';
import { MicMutedIcon, VideoMutedIcon } from './icons';

interface HostControls {
  audioForceAll: boolean;
  videoForceAll: boolean;
  chatForceAll: boolean;
  locked: boolean;
}

interface DeviceStatus {
  audio: { issueType: string };
  video: { issueType: string };
}

interface BottomControlsBarProps {
  // Audio control props
  isAudioMuted: boolean;
  audioForceActive: boolean;
  hostControls: HostControls;
  deviceStatus: DeviceStatus;
  showAudioDropdown: boolean;
  availableAudioDevices: MediaDeviceInfo[];
  selectedAudioDeviceId: string | null;
  onToggleAudio: () => void;
  onToggleAudioDropdown: () => void;
  onSelectAudioDevice: (deviceId: string) => void;
  onShowAudioDialog: () => void;

  // Video control props
  isVideoMuted: boolean;
  videoForceActive: boolean;
  showVideoDropdown: boolean;
  availableVideoDevices: MediaDeviceInfo[];
  selectedVideoDeviceId: string | null;
  onToggleVideo: () => void;
  onToggleVideoDropdown: () => void;
  onSelectVideoDevice: (deviceId: string) => void;
  onShowVideoDialog: () => void;

  // Action buttons props
  isHandRaised: boolean;
  onToggleRaiseHand: () => void;
  isScreenSharing: boolean;
  onToggleScreenShare: () => void;
  chatUnreadCount: number;
  onOpenChat: () => void;
  onShowParticipantList: () => void;

  // Admin props
  isAdmin: boolean;
  onMuteAllAudio: () => void;
  onUnmuteAllAudio: () => void;
  onMuteAllVideo: () => void;
  onUnmuteAllVideo: () => void;
  onToggleChat: () => void;
  onToggleLock: () => void;
  onShowRoomSettings: () => void;
  onShowPendingRequests: () => void;
  pendingRequestsCount: number;

  // Leave button props
  isLeaving: boolean;
  onLeave: () => void;
}

export default function BottomControlsBar({
  isAudioMuted,
  audioForceActive,
  hostControls,
  deviceStatus,
  showAudioDropdown,
  availableAudioDevices,
  selectedAudioDeviceId,
  onToggleAudio,
  onToggleAudioDropdown,
  onSelectAudioDevice,
  onShowAudioDialog,
  isVideoMuted,
  videoForceActive,
  showVideoDropdown,
  availableVideoDevices,
  selectedVideoDeviceId,
  onToggleVideo,
  onToggleVideoDropdown,
  onSelectVideoDevice,
  onShowVideoDialog,
  isHandRaised,
  onToggleRaiseHand,
  isScreenSharing,
  onToggleScreenShare,
  chatUnreadCount,
  onOpenChat,
  onShowParticipantList,
  isAdmin,
  onMuteAllAudio,
  onUnmuteAllAudio,
  onMuteAllVideo,
  onUnmuteAllVideo,
  onToggleChat,
  onToggleLock,
  onShowRoomSettings,
  onShowPendingRequests,
  pendingRequestsCount,
  isLeaving,
  onLeave,
}: BottomControlsBarProps) {
  return (
    <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-30 px-3 sm:px-4 lg:px-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 lg:flex-row lg:items-end lg:justify-between lg:gap-4">
        {/* Main Controls Bar - Centered */}
        <div
          className="pointer-events-auto mx-auto flex flex-wrap items-center justify-center gap-2 rounded-full border border-white/60 bg-white/90 px-3 py-2.5 shadow-[0_22px_45px_-28px_rgba(14,165,233,0.45)] backdrop-blur sm:gap-3 sm:px-5 sm:py-3 lg:px-6 lg:py-4"
          style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}
        >
          <AudioControlGroup
            isMuted={isAudioMuted}
            isForceActive={audioForceActive}
            hostControls={hostControls}
            deviceStatus={deviceStatus.audio}
            showDropdown={showAudioDropdown}
            availableDevices={availableAudioDevices}
            selectedDeviceId={selectedAudioDeviceId}
            onToggle={onToggleAudio}
            onToggleDropdown={onToggleAudioDropdown}
            onDeviceSelect={onSelectAudioDevice}
            onShowDialog={onShowAudioDialog}
          />

          <VideoControlGroup
            isMuted={isVideoMuted}
            isForceActive={videoForceActive}
            hostControls={hostControls}
            deviceStatus={deviceStatus.video}
            showDropdown={showVideoDropdown}
            availableDevices={availableVideoDevices}
            selectedDeviceId={selectedVideoDeviceId}
            onToggle={onToggleVideo}
            onToggleDropdown={onToggleVideoDropdown}
            onDeviceSelect={onSelectVideoDevice}
            onShowDialog={onShowVideoDialog}
          />

          <RaiseHandButton
            isRaised={isHandRaised}
            onToggle={onToggleRaiseHand}
          />

          <ScreenShareButton
            isScreenSharing={isScreenSharing}
            onToggle={onToggleScreenShare}
          />

          <ChatButton
            unreadCount={chatUnreadCount}
            onClick={onOpenChat}
          />

          <ParticipantsButton
            onClick={onShowParticipantList}
          />

          {/* Admin Quick Actions - Integrated in main bar on mobile, separate on desktop */}
          {isAdmin && (
            <>
              {/* Mobile: Show in main bar */}
              <div className="flex items-center gap-2 lg:hidden">
                <button
                  onClick={hostControls.audioForceAll ? onUnmuteAllAudio : onMuteAllAudio}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-semibold transition ${
                    hostControls.audioForceAll
                      ? 'bg-rose-200 text-rose-700 shadow-sm hover:bg-rose-300'
                      : 'bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                  aria-pressed={hostControls.audioForceAll}
                  title={hostControls.audioForceAll ? 'Unmute all' : 'Mute all'}
                >
                  <MicMutedIcon className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={hostControls.videoForceAll ? onUnmuteAllVideo : onMuteAllVideo}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-semibold transition ${
                    hostControls.videoForceAll
                      ? 'bg-rose-200 text-rose-700 shadow-sm hover:bg-rose-300'
                      : 'bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                  aria-pressed={hostControls.videoForceAll}
                  title={hostControls.videoForceAll ? 'Enable all cams' : 'Disable all cams'}
                >
                  <VideoMutedIcon className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={onToggleLock}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-semibold transition ${
                    hostControls.locked ? 'bg-rose-500 text-white shadow-sm hover:bg-rose-600' : 'bg-white/90 text-slate-600 hover:bg-slate-100'
                  }`}
                  aria-pressed={hostControls.locked}
                  title={hostControls.locked ? 'Unlock' : 'Lock'}
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 20 20" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M7 9V7a3 3 0 016 0v2m-6 0h6a2 2 0 012 2v5a2 2 0 01-2 2H7a2 2 0 01-2-2v-5a2 2 0 012-2z"
                    />
                  </svg>
                </button>
              </div>
              <AdminBottomButtons
                onShowRoomSettings={onShowRoomSettings}
                onShowPendingRequests={onShowPendingRequests}
                pendingRequestsCount={pendingRequestsCount}
              />
            </>
          )}

          <LeaveButton
            isLeaving={isLeaving}
            onLeave={onLeave}
          />
        </div>

        {/* Admin Controls - Right Side (Desktop Only) */}
        {isAdmin && (
          <div
            className="pointer-events-auto hidden flex-wrap items-center justify-center gap-2 rounded-full border border-white/60 bg-white/90 px-4 py-3 shadow-[0_22px_45px_-28px_rgba(14,165,233,0.45)] backdrop-blur lg:flex lg:px-5 lg:py-3.5"
            style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}
          >
            <button
              onClick={hostControls.audioForceAll ? onUnmuteAllAudio : onMuteAllAudio}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition sm:px-3.5 sm:py-2 sm:text-sm ${
                hostControls.audioForceAll
                  ? 'bg-rose-200 text-rose-700 shadow-sm hover:bg-rose-300'
                  : 'bg-white text-slate-600 hover:bg-slate-100'
              }`}
              aria-pressed={hostControls.audioForceAll}
              title={hostControls.audioForceAll ? 'Unmute all microphones' : 'Mute all microphones'}
            >
              <MicMutedIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Mic All</span>
              <span className="sm:hidden">Mic</span>
            </button>

            <button
              onClick={hostControls.videoForceAll ? onUnmuteAllVideo : onMuteAllVideo}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition sm:px-3.5 sm:py-2 sm:text-sm ${
                hostControls.videoForceAll
                  ? 'bg-rose-200 text-rose-700 shadow-sm hover:bg-rose-300'
                  : 'bg-white text-slate-600 hover:bg-slate-100'
              }`}
              aria-pressed={hostControls.videoForceAll}
              title={hostControls.videoForceAll ? 'Enable all cameras' : 'Disable all cameras'}
            >
              <VideoMutedIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Cam All</span>
              <span className="sm:hidden">Cam</span>
            </button>

            <button
              onClick={onToggleChat}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition sm:px-3.5 sm:py-2 sm:text-sm ${
                hostControls.chatForceAll
                  ? 'bg-rose-200 text-rose-700 shadow-sm hover:bg-rose-300'
                  : 'bg-white text-slate-600 hover:bg-slate-100'
              }`}
              aria-pressed={hostControls.chatForceAll}
              title={hostControls.chatForceAll ? 'Enable chat' : 'Disable chat'}
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
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition sm:px-3.5 sm:py-2 sm:text-sm ${
                hostControls.locked ? 'bg-rose-500 text-white shadow-sm hover:bg-rose-600' : 'bg-white/90 text-slate-600 hover:bg-slate-100'
              }`}
              aria-pressed={hostControls.locked}
              title={hostControls.locked ? 'Unlock room' : 'Lock room'}
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
          </div>
        )}
      </div>
    </div>
  );
}

