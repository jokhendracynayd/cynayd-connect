import { createPortal } from 'react-dom';
import { useState } from 'react';
import { useCallStore } from '../../store/callStore';
import { updateRoomSettings } from '../../lib/api';
import { toast } from 'react-hot-toast';

interface RoomSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  roomCode: string;
  currentIsPublic: boolean;
  participantCount: number;
}

export default function RoomSettings({
  isOpen,
  onClose,
  roomCode,
  currentIsPublic,
  participantCount,
}: RoomSettingsProps) {
  const [isPublic, setIsPublic] = useState(currentIsPublic);
  const [isSaving, setIsSaving] = useState(false);
  const { setRoomIsPublic } = useCallStore();

  if (!isOpen) return null;

  const portalTarget = typeof document !== 'undefined' ? document.body : null;

  if (!portalTarget) {
    return null;
  }

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const result = await updateRoomSettings(roomCode, { isPublic });
      if (result.success) {
        setRoomIsPublic(isPublic);
        toast.success('Room settings updated');
        onClose();
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to update room settings');
    } finally {
      setIsSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm">
      <div className="relative max-w-md w-full rounded-[28px] border border-slate-200 bg-white/95 shadow-[0_38px_80px_-40px_rgba(14,165,233,0.45)] p-8">
        <div className="flex items-center justify-between mb-6 text-slate-700">
          <h2 className="text-xl font-semibold tracking-tight">Room Settings</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-cyan-500 hover:bg-cyan-50 transition"
            aria-label="Close settings"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-6 text-slate-600">
          {/* Room Code */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-500">Room Code</label>
            <div className="flex items-center gap-2">
              <code className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-lg font-mono text-slate-900">
                {roomCode}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(roomCode);
                  toast.success('Room code copied!');
                }}
                className="p-2 text-slate-500 hover:text-cyan-500 hover:bg-cyan-50 rounded-full transition"
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

          {/* Participant Count */}
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-500">Participants</label>
            <p className="text-slate-900 text-sm">
              {participantCount} participant{participantCount !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Privacy Setting */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-500">Room Privacy</label>
            <div className="space-y-3">
              <label className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition cursor-pointer ${
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
              <label className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition cursor-pointer ${
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

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-slate-500 bg-slate-100 rounded-full hover:bg-slate-200 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || isPublic === currentIsPublic}
              className="px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-cyan-400 via-sky-500 to-indigo-500 rounded-full shadow-[0_18px_40px_-24px_rgba(14,165,233,0.7)] hover:from-cyan-500 hover:via-sky-600 hover:to-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {isSaving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    portalTarget
  );
}

