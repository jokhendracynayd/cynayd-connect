import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { socketManager } from '../../lib/socket';
import { toast } from 'react-hot-toast';

interface WaitingRoomProps {
  roomCode: string;
  roomName?: string;
  onCancel: () => void;
  onApproved?: () => void; // Callback to retry joining
}

export default function WaitingRoom({ roomCode, roomName, onCancel, onApproved }: WaitingRoomProps) {
  const navigate = useNavigate();

  useEffect(() => {
    // Listen for approval/rejection events
    const handleApproved = (data: { roomCode: string; message: string; requestId?: string }) => {
      toast.success(data.message || 'Your join request has been approved!');
      
      // Small delay to ensure toast is visible
      setTimeout(() => {
        // If callback provided, use it (for in-page retry)
        if (onApproved) {
          onApproved();
        } else {
          // Otherwise navigate (fallback)
          const targetRoomCode = data.roomCode || roomCode;
          navigate(`/call/${targetRoomCode}`, { replace: true });
        }
      }, 500);
    };

    const handleRejected = (data: { roomCode: string; message: string }) => {
      toast.error(data.message || 'Your join request has been rejected.');
      onCancel();
    };

    socketManager.on('join-approved', handleApproved);
    socketManager.on('join-rejected', handleRejected);

    return () => {
      socketManager.off('join-approved', handleApproved);
      socketManager.off('join-rejected', handleRejected);
    };
  }, [roomCode, navigate, onCancel, onApproved]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-lg">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-indigo-100 mb-4">
            <svg
              className="h-8 w-8 text-indigo-600 animate-spin"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Waiting for Approval</h2>
          <p className="mt-2 text-gray-600">
            {roomName ? `Requesting to join "${roomName}"` : `Requesting to join room: ${roomCode}`}
          </p>
          <p className="mt-4 text-sm text-gray-500">
            The room host will review your request shortly.
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-center space-x-2 text-sm text-gray-500">
            <div className="h-2 w-2 bg-indigo-500 rounded-full animate-pulse"></div>
            <span>Request pending...</span>
          </div>

          <button
            onClick={onCancel}
            className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
          >
            Cancel Request
          </button>
        </div>
      </div>
    </div>
  );
}

