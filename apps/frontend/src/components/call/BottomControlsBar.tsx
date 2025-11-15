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
    <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-30 px-3 sm:px-4 lg:px-6" style={{ minHeight: 'calc(68px + env(safe-area-inset-bottom))' }}>
      <div className="mx-auto flex max-w-7xl flex-col gap-2 lg:flex-row lg:items-end lg:justify-between lg:gap-4" style={{ minHeight: 'calc(68px + env(safe-area-inset-bottom))' }}>
        {/* Main Controls Bar - Centered - Premium Design */}
        <div
          className="pointer-events-auto mx-auto flex flex-wrap items-center justify-center gap-2 rounded-full border border-gray-800/60 bg-gray-950/85 px-2.5 py-2 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.85)] backdrop-blur-md sm:gap-2.5 sm:px-3 sm:py-2.5 lg:px-4 lg:py-3"
          style={{ minHeight: 'calc(48px + 12px + env(safe-area-inset-bottom))', paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}
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
              {/* Mobile: Show in main bar - Premium Design */}
              <div className="flex items-center gap-1.5 lg:hidden">
                <div className="flex items-center gap-1 rounded-full border border-gray-800/40 bg-gray-950/60 p-1 backdrop-blur-sm">
                  <button
                    onClick={hostControls.audioForceAll ? onUnmuteAllAudio : onMuteAllAudio}
                     className={`flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200 ${
                       hostControls.audioForceAll
                         ? 'bg-rose-500 text-white shadow-sm hover:bg-rose-600'
                         : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/60'
                     }`}
                    aria-pressed={hostControls.audioForceAll}
                    title={hostControls.audioForceAll ? 'Unmute all' : 'Mute all'}
                  >
                    <MicMutedIcon className="h-4 w-4" />
                  </button>
                  <button
                    onClick={hostControls.videoForceAll ? onUnmuteAllVideo : onMuteAllVideo}
                     className={`flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200 ${
                       hostControls.videoForceAll
                         ? 'bg-rose-500 text-white shadow-sm hover:bg-rose-600'
                         : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/60'
                     }`}
                    aria-pressed={hostControls.videoForceAll}
                    title={hostControls.videoForceAll ? 'Enable all cams' : 'Disable all cams'}
                  >
                    <VideoMutedIcon className="h-4 w-4" />
                  </button>
                  <button
                    onClick={onToggleLock}
                     className={`flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200 ${
                       hostControls.locked
                         ? 'bg-rose-500 text-white shadow-sm hover:bg-rose-600'
                         : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/60'
                     }`}
                    aria-pressed={hostControls.locked}
                    title={hostControls.locked ? 'Unlock' : 'Lock'}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.5}>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M7 9V7a3 3 0 016 0v2m-6 0h6a2 2 0 012 2v5a2 2 0 01-2 2H7a2 2 0 01-2-2v-5a2 2 0 012-2z"
                      />
                    </svg>
                  </button>
                </div>
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

        {/* Admin Controls - Right Side (Desktop Only) - Premium Design */}
        {isAdmin && (
          <div
            className="pointer-events-auto hidden items-center justify-center gap-1.5 rounded-full border border-gray-800/60 bg-gray-950/80 px-2 py-2 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.8)] backdrop-blur-md lg:flex"
            style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}
          >
            <div className="flex items-center gap-1 rounded-l-full border-r border-gray-800/40 pr-1.5">
              <button
                onClick={hostControls.audioForceAll ? onUnmuteAllAudio : onMuteAllAudio}
                 className={`group relative flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200 ${
                   hostControls.audioForceAll
                     ? 'bg-rose-500 text-white shadow-sm hover:bg-rose-600'
                     : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/60 hover:text-gray-300'
                 }`}
                aria-pressed={hostControls.audioForceAll}
                title={hostControls.audioForceAll ? 'Unmute all microphones' : 'Mute all microphones'}
              >
                <MicMutedIcon className="h-4.5 w-4.5" />
              </button>

              <button
                onClick={hostControls.videoForceAll ? onUnmuteAllVideo : onMuteAllVideo}
                 className={`group relative flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200 ${
                   hostControls.videoForceAll
                     ? 'bg-rose-500 text-white shadow-sm hover:bg-rose-600'
                     : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/60 hover:text-gray-300'
                 }`}
                aria-pressed={hostControls.videoForceAll}
                title={hostControls.videoForceAll ? 'Enable all cameras' : 'Disable all cameras'}
              >
                <VideoMutedIcon className="h-4.5 w-4.5" />
              </button>
            </div>

            <div className="flex items-center gap-1 rounded-r-full pl-1.5">
              <button
                onClick={onToggleChat}
                 className={`group relative flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200 ${
                   hostControls.chatForceAll
                     ? 'bg-rose-500 text-white shadow-sm hover:bg-rose-600'
                     : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/60 hover:text-gray-300'
                 }`}
                aria-pressed={hostControls.chatForceAll}
                title={hostControls.chatForceAll ? 'Enable chat' : 'Disable chat'}
              >
                <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M7 8h10M7 12h6m7 0a9 9 0 11-4.219-7.516L21 4v8z"
                  />
                </svg>
              </button>

              <button
                onClick={onToggleLock}
                 className={`group relative flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200 ${
                   hostControls.locked
                     ? 'bg-rose-500 text-white shadow-sm hover:bg-rose-600'
                     : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/60 hover:text-gray-300'
                 }`}
                aria-pressed={hostControls.locked}
                title={hostControls.locked ? 'Unlock room' : 'Lock room'}
              >
                <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.5}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M7 9V7a3 3 0 016 0v2m-6 0h6a2 2 0 012 2v5a2 2 0 01-2 2H7a2 2 0 01-2-2v-5a2 2 0 012-2z"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

