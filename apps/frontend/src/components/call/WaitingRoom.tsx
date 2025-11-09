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
    <div className="relative min-h-screen flex items-center justify-center bg-[#f7f9fc] overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-120px] top-[-80px] h-[360px] w-[360px] rounded-full bg-gradient-to-br from-cyan-100 via-sky-100 to-indigo-100 opacity-70 blur-[120px]" />
        <div className="absolute right-[-140px] bottom-[-120px] h-[420px] w-[420px] rounded-full bg-gradient-to-tl from-white via-cyan-100 to-indigo-100 opacity-60 blur-[150px]" />
      </div>

      <div className="relative max-w-md w-full space-y-8 p-8 bg-white/90 border border-slate-200 rounded-[28px] shadow-[0_28px_70px_-38px_rgba(14,165,233,0.45)] backdrop-blur">
        <div className="text-center text-slate-700">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-cyan-50 border border-cyan-100 mb-4">
            <svg
              className="h-8 w-8 text-cyan-500 animate-spin"
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
          <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Waiting for approval</h2>
          <p className="mt-2 text-slate-500">
            {roomName ? `Requesting to join "${roomName}"` : `Requesting to join room: ${roomCode}`}
          </p>
          <p className="mt-4 text-sm text-slate-400">
            The room host will review your request shortly.
          </p>
        </div>

        <div className="space-y-4 text-slate-500">
          <div className="flex items-center justify-center gap-2 text-sm">
            <div className="h-2 w-2 bg-cyan-500 rounded-full animate-pulse"></div>
            <span>Request pending...</span>
          </div>

          <button
            onClick={onCancel}
            className="w-full px-4 py-2 text-sm font-semibold text-slate-500 bg-slate-100 rounded-full hover:bg-slate-200 transition"
          >
            Cancel Request
          </button>
        </div>
      </div>
    </div>
  );
}

