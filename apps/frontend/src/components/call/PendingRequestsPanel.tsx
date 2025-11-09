import { createPortal } from 'react-dom';
import { useCallStore } from '../../store/callStore';
import { socketManager } from '../../lib/socket';
import { approveJoinRequest, rejectJoinRequest } from '../../lib/api';
import { toast } from 'react-hot-toast';

interface PendingRequestsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  roomCode: string;
}

export default function PendingRequestsPanel({ isOpen, onClose, roomCode }: PendingRequestsPanelProps) {
  const { pendingRequests, removePendingRequest } = useCallStore();

  const handleApprove = async (requestId: string) => {
    try {
      // Try socket first, fallback to API
      try {
        await socketManager.approveJoinRequest(requestId);
      } catch {
        const result = await approveJoinRequest(roomCode, requestId);
        if (result.success) {
          toast.success('Join request approved');
        }
      }
      removePendingRequest(requestId);
    } catch (error: any) {
      toast.error(error.message || 'Failed to approve request');
    }
  };

  const handleReject = async (requestId: string) => {
    try {
      // Try socket first, fallback to API
      try {
        await socketManager.rejectJoinRequest(requestId);
      } catch {
        const result = await rejectJoinRequest(roomCode, requestId);
        if (result.success) {
          toast.success('Join request rejected');
        }
      }
      removePendingRequest(requestId);
    } catch (error: any) {
      toast.error(error.message || 'Failed to reject request');
    }
  };

  if (!isOpen) return null;

  const portalTarget = typeof document !== 'undefined' ? document.body : null;

  if (!portalTarget) {
    return null;
  }

  return createPortal(
    <div className="fixed right-0 top-0 z-50 h-full w-[25rem] overflow-y-auto border-l border-slate-200 bg-white/92 shadow-[0_32px_65px_-34px_rgba(14,165,233,0.4)] backdrop-blur-xl">
      <div className="px-5 py-4 border-b border-slate-200">
        <div className="flex items-center justify-between text-slate-700">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">Join Requests</h2>
            {pendingRequests.length > 0 && (
              <span className="px-2 py-0.5 text-xs font-semibold text-white bg-rose-500 rounded-full shadow-sm">
                {pendingRequests.length}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-500 hover:text-cyan-500 hover:bg-cyan-50 transition"
            aria-label="Close requests panel"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="px-5 py-4">
        {pendingRequests.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-sm">
            <p>No pending requests right now.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pendingRequests.map((request) => (
              <div
                key={request.id}
                className="p-5 border border-slate-200 rounded-2xl bg-white shadow-[0_22px_45px_-32px_rgba(14,165,233,0.45)] hover:border-cyan-200 hover:bg-cyan-50/40 transition"
              >
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  {request.picture ? (
                    <img
                      src={request.picture}
                      alt={request.name}
                      className="w-12 h-12 rounded-full border border-white shadow-sm"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-400 via-sky-500 to-indigo-500 flex items-center justify-center text-white font-semibold shadow-sm">
                      {request.name
                        .split(' ')
                        .map(n => n[0])
                        .join('')
                        .toUpperCase()
                        .slice(0, 2)}
                    </div>
                  )}

                  {/* User info */}
                  <div className="flex-1 min-w-0 text-slate-600">
                    <p className="font-semibold text-slate-900">{request.name}</p>
                    <p className="text-sm text-slate-500">{request.email}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Requested {new Date(request.requestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-4">
                  <button
                    onClick={() => handleApprove(request.id)}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-600 rounded-full shadow-[0_16px_30px_-24px_rgba(16,185,129,0.7)] hover:from-emerald-500 hover:via-emerald-600 hover:to-emerald-700 transition"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleReject(request.id)}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-rose-400 via-rose-500 to-rose-600 rounded-full shadow-[0_16px_30px_-24px_rgba(244,63,94,0.65)] hover:from-rose-500 hover:via-rose-600 hover:to-rose-700 transition"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    portalTarget
  );
}

