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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Room Settings</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
            aria-label="Close settings"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-6">
          {/* Room Code */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Room Code</label>
            <div className="flex items-center space-x-2">
              <code className="px-3 py-2 bg-gray-100 rounded-md text-lg font-mono">
                {roomCode}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(roomCode);
                  toast.success('Room code copied!');
                }}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded"
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Participants</label>
            <p className="text-gray-900">{participantCount} participant{participantCount !== 1 ? 's' : ''}</p>
          </div>

          {/* Privacy Setting */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Room Privacy</label>
            <div className="space-y-3">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="privacy"
                  checked={isPublic}
                  onChange={() => setIsPublic(true)}
                  className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <div className="font-medium text-gray-900">Public</div>
                  <div className="text-sm text-gray-500">Anyone with the room code can join immediately</div>
                </div>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="privacy"
                  checked={!isPublic}
                  onChange={() => setIsPublic(false)}
                  className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <div className="font-medium text-gray-900">Private</div>
                  <div className="text-sm text-gray-500">You must approve join requests</div>
                </div>
              </label>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || isPublic === currentIsPublic}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

