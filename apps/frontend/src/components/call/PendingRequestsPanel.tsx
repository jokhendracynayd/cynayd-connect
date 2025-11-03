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

  return (
    <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-xl z-50 overflow-y-auto">
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <h2 className="text-lg font-semibold">Join Requests</h2>
            {pendingRequests.length > 0 && (
              <span className="px-2 py-0.5 text-xs font-semibold text-white bg-red-500 rounded-full">
                {pendingRequests.length}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
            aria-label="Close requests panel"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="p-4">
        {pendingRequests.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No pending requests</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingRequests.map((request) => (
              <div
                key={request.id}
                className="p-4 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start space-x-3">
                  {/* Avatar */}
                  {request.picture ? (
                    <img
                      src={request.picture}
                      alt={request.name}
                      className="w-12 h-12 rounded-full"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-semibold">
                      {request.name
                        .split(' ')
                        .map(n => n[0])
                        .join('')
                        .toUpperCase()
                        .slice(0, 2)}
                    </div>
                  )}

                  {/* User info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900">{request.name}</p>
                    <p className="text-sm text-gray-500">{request.email}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Requested {new Date(request.requestedAt).toLocaleTimeString()}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-2 mt-3">
                  <button
                    onClick={() => handleApprove(request.id)}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleReject(request.id)}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

