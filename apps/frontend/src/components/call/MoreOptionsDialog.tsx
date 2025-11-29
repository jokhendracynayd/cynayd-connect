import { createPortal } from 'react-dom';
import { useState, useEffect, type ReactElement } from 'react';
import { useCallStore } from '../../store/callStore';
import { updateRoomSettings } from '../../lib/api';
import { toast } from 'react-hot-toast';

interface MoreOptionsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  roomCode?: string | undefined;
  currentIsPublic?: boolean | undefined;
  participantCount?: number | undefined;
  isAdmin?: boolean;
}

type MenuOption = 'shortcuts' | 'settings';

export default function MoreOptionsDialog({
  isOpen,
  onClose,
  roomCode,
  currentIsPublic,
  participantCount,
  isAdmin = false,
}: MoreOptionsDialogProps) {
  const [selectedOption, setSelectedOption] = useState<MenuOption>('settings');
  const [isPublic, setIsPublic] = useState(currentIsPublic ?? false);
  const [isSaving, setIsSaving] = useState(false);
  const { setRoomIsPublic } = useCallStore();

  // Sync isPublic with currentIsPublic when it changes
  useEffect(() => {
    if (currentIsPublic !== undefined) {
      setIsPublic(currentIsPublic);
    }
  }, [currentIsPublic]);

  // Detect if user is on Mac to show Cmd instead of Ctrl
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/i.test(navigator.platform);
  const modifierKey = isMac ? 'Cmd' : 'Ctrl';

  if (!isOpen) return null;

  const portalTarget = typeof document !== 'undefined' ? document.body : null;

  if (!portalTarget) {
    return null;
  }

  const menuOptions: Array<{
    id: MenuOption;
    label: string;
    icon: ReactElement;
    description: string;
  }> = [
    {
      id: 'shortcuts',
      label: 'Keyboard Shortcuts',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ),
      description: 'Learn keyboard shortcuts',
    },
    {
      id: 'settings',
      label: 'Room Settings',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      description: 'Manage room preferences',
    },
  ];

  const handleSaveSettings = async () => {
    if (!roomCode) return;
    
    setIsSaving(true);
    try {
      const result = await updateRoomSettings(roomCode, { isPublic });
      if (result.success) {
        setRoomIsPublic(isPublic);
        toast.success('Room settings updated');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to update room settings');
    } finally {
      setIsSaving(false);
    }
  };

  const renderContent = () => {
    switch (selectedOption) {
      case 'shortcuts':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Keyboard Shortcuts</h3>
              <p className="text-sm text-slate-500">
                Use these keyboard shortcuts to quickly control your call. Shortcuts work when you're not typing in text fields.
              </p>
            </div>

            <div className="space-y-3">
              {/* Toggle Microphone */}
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-gradient-to-r from-white to-slate-50/50 px-5 py-4 hover:border-cyan-300 hover:bg-gradient-to-r hover:from-cyan-50/50 hover:to-cyan-50/30 transition-all duration-200 shadow-sm hover:shadow-md">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-100 text-cyan-600">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900">Toggle Microphone</div>
                    <div className="text-xs text-slate-500 mt-0.5">Mute or unmute your microphone</div>
                  </div>
                </div>
                <kbd className="px-4 py-2 text-sm font-semibold text-slate-700 bg-white border-2 border-slate-300 rounded-lg shadow-sm hover:border-cyan-400 hover:shadow-md transition">
                  {modifierKey}+D
                </kbd>
              </div>

              {/* Toggle Camera */}
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-gradient-to-r from-white to-slate-50/50 px-5 py-4 hover:border-cyan-300 hover:bg-gradient-to-r hover:from-cyan-50/50 hover:to-cyan-50/30 transition-all duration-200 shadow-sm hover:shadow-md">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-100 text-cyan-600">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900">Toggle Camera</div>
                    <div className="text-xs text-slate-500 mt-0.5">Turn your camera on or off</div>
                  </div>
                </div>
                <kbd className="px-4 py-2 text-sm font-semibold text-slate-700 bg-white border-2 border-slate-300 rounded-lg shadow-sm hover:border-cyan-400 hover:shadow-md transition">
                  {modifierKey}+F
                </kbd>
              </div>
            </div>

            {/* Note */}
            <div className="rounded-xl bg-amber-50/80 border border-amber-200/60 p-4">
              <div className="flex items-start gap-3">
                <svg className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-amber-800 leading-relaxed">
                  <strong className="font-semibold">Note:</strong> These shortcuts are disabled when typing in input fields, chat, or other text areas.
                </p>
              </div>
            </div>
          </div>
        );

      case 'settings':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Room Settings</h3>
              <p className="text-sm text-slate-500">
                Configure your room preferences and manage access settings.
              </p>
            </div>

            <div className="space-y-4">
              {/* Room Code */}
              {roomCode && (
                <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-white to-slate-50/50 p-5">
                  <label className="block text-sm font-medium text-slate-700 mb-2">Room Code</label>
                  <div className="flex items-center gap-2">
                    <code className="px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-lg text-base font-mono text-slate-900 font-semibold">
                      {roomCode}
                    </code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(roomCode);
                        toast.success('Room code copied!');
                      }}
                      className="p-2.5 text-slate-500 hover:text-cyan-500 hover:bg-cyan-50 rounded-lg transition"
                      aria-label="Copy room code"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              )}

              {/* Participant Count */}
              {participantCount !== undefined && (
                <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-white to-slate-50/50 p-5">
                  <label className="block text-sm font-medium text-slate-700 mb-2">Participants</label>
                  <p className="text-slate-900 text-base font-medium">
                    {participantCount} participant{participantCount !== 1 ? 's' : ''}
                  </p>
                </div>
              )}

              {/* Privacy Setting - Admin Only */}
              {isAdmin && (
                <>
                  <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-white to-slate-50/50 p-5">
                    <label className="block text-sm font-medium text-slate-700 mb-3">Room Privacy</label>
                    <div className="space-y-3">
                      <label className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition cursor-pointer ${
                        isPublic ? 'border-cyan-200 bg-cyan-50/60 shadow-[0_18px_40px_-30px_rgba(14,165,233,0.6)]' : 'border-slate-200 bg-white hover:border-cyan-200 hover:bg-cyan-50/40'
                      }`}>
                        <input
                          type="radio"
                          name="privacy"
                          checked={isPublic}
                          onChange={() => setIsPublic(true)}
                          className="w-4 h-4 text-cyan-500 focus:ring-cyan-300"
                        />
                        <div>
                          <div className="font-semibold text-slate-900">Public</div>
                          <div className="text-xs text-slate-500">Anyone with the room code can join immediately.</div>
                        </div>
                      </label>
                      <label className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition cursor-pointer ${
                        !isPublic ? 'border-emerald-200 bg-emerald-50/60 shadow-[0_18px_40px_-30px_rgba(16,185,129,0.55)]' : 'border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/40'
                      }`}>
                        <input
                          type="radio"
                          name="privacy"
                          checked={!isPublic}
                          onChange={() => setIsPublic(false)}
                          className="w-4 h-4 text-emerald-500 focus:ring-emerald-300"
                        />
                        <div>
                          <div className="font-semibold text-slate-900">Private</div>
                          <div className="text-xs text-slate-500">Approve each attendee before they enter the room.</div>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Save Button */}
                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      onClick={handleSaveSettings}
                      disabled={isSaving || isPublic === currentIsPublic}
                      className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-cyan-400 via-sky-500 to-indigo-500 rounded-xl shadow-[0_18px_40px_-24px_rgba(14,165,233,0.7)] hover:from-cyan-500 hover:via-sky-600 hover:to-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                    >
                      {isSaving ? 'Saving...' : 'Save changes'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl h-[85vh] max-h-[700px] rounded-[32px] border border-slate-200/80 bg-white/98 shadow-[0_38px_80px_-40px_rgba(14,165,233,0.45)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200/60 bg-gradient-to-r from-slate-50/50 to-white">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">More Options</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
            aria-label="Close dialog"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Split Pane Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar - Menu Options */}
          <div className="w-64 border-r border-slate-200/60 bg-slate-50/40 overflow-y-auto">
            <div className="p-4 space-y-2">
              {menuOptions.map((option) => (
                <button
                  key={option.id}
                  onClick={() => setSelectedOption(option.id)}
                  className={`w-full flex items-start gap-3 px-4 py-3.5 rounded-xl transition-all duration-200 text-left ${
                    selectedOption === option.id
                      ? 'bg-gradient-to-r from-cyan-500 to-sky-500 text-white shadow-lg shadow-cyan-500/30'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 shadow-sm'
                  }`}
                >
                  <div
                    className={`flex-shrink-0 mt-0.5 ${
                      selectedOption === option.id ? 'text-white' : 'text-slate-600'
                    }`}
                  >
                    {option.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`font-semibold text-sm ${selectedOption === option.id ? 'text-white' : 'text-slate-900'}`}>
                      {option.label}
                    </div>
                    <div
                      className={`text-xs mt-0.5 ${
                        selectedOption === option.id ? 'text-cyan-50' : 'text-slate-600'
                      }`}
                    >
                      {option.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Right Content Area */}
          <div className="flex-1 overflow-y-auto bg-white">
            <div className="p-8">{renderContent()}</div>
          </div>
        </div>
      </div>
    </div>,
    portalTarget
  );
}

