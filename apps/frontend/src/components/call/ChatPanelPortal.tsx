import { createPortal } from 'react-dom';
import ChatPanel from './ChatPanel';

interface CurrentUser {
  id: string;
  name: string;
  email: string;
  picture: string | null;
}

interface ChatPanelPortalProps {
  isOpen: boolean;
  currentUser: CurrentUser;
  onClose: () => void;
}

export default function ChatPanelPortal({ isOpen, currentUser, onClose }: ChatPanelPortalProps) {
  if (!isOpen || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 z-0 bg-slate-900/30 backdrop-blur-sm transition"
        aria-label="Close chat panel"
      />
      <div className="relative z-10 h-full w-full max-w-[28rem]">
        <ChatPanel
          currentUser={currentUser}
          onClose={onClose}
          className="h-full"
        />
      </div>
    </div>,
    document.body
  );
}

