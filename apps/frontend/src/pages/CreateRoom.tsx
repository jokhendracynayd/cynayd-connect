import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { toast } from 'react-hot-toast';
import { useCallStore } from '../store/callStore';

export default function CreateRoom() {
  const navigate = useNavigate();
  const [roomName, setRoomName] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [meetingTiming, setMeetingTiming] = useState<'instant' | 'later'>('instant');
  const [scheduledRoom, setScheduledRoom] = useState<{ roomCode: string; name?: string } | null>(null);
  const [scheduledShareUrl, setScheduledShareUrl] = useState('');
  const setRoomCodeStore = useCallStore(state => state.setRoomCode);

  const privacyOptions = [
    {
      label: 'Public launch',
      value: true,
      badge: 'Instant access',
      description: 'Share the code and collaborators can join instantly. Perfect for open standups.',
      icon: (
        <svg className="h-5 w-5 text-cyan-500" viewBox="0 0 24 24" fill="none">
          <path
            d="M5.25 12C5.25 16.1421 8.60787 19.5 12.75 19.5C16.8921 19.5 20.25 16.1421 20.25 12C20.25 7.85787 16.8921 4.5 12.75 4.5C11.353 4.5 10.046 4.85151 8.925 5.46975"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M3.75 13.5V9"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M3.75 9L2.25 10.5M3.75 9L5.25 10.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
    },
    {
      label: 'Private lounge',
      value: false,
      badge: 'Admin approval',
      description: 'Keep the lobby curated. Approve each request before they enter the room.',
      icon: (
        <svg className="h-5 w-5 text-cyan-500" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 4L19.5 7.5V12.75C19.5 17.25 16.065 21.36 12 22.5C7.935 21.36 4.5 17.25 4.5 12.75V7.5L12 4Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M9.75 12.75L11.25 14.25L14.25 10.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
    },
  ];

  const meetingTimingOptions = [
    {
      label: 'Start now',
      value: 'instant' as const,
      badge: 'Go live',
      description: 'Drop straight into the studio and let collaborators join immediately.',
      icon: (
        <svg className="h-5 w-5 text-cyan-500" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 5v14M5 12h14"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
    },
    {
      label: 'Plan for later',
      value: 'later' as const,
      badge: 'Flex timing',
      description: 'Generate the room and share the code, then launch the session when you are ready.',
      icon: (
        <svg className="h-5 w-5 text-cyan-500" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 8v4l2.5 2.5M4.5 12A7.5 7.5 0 1112 19.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M3 3l3 3"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
    },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (scheduledRoom) {
      setScheduledRoom(null);
    }
    setIsLoading(true);
    
    try {
      const response = await api.post('/api/rooms/', { name: roomName, isPublic });
      const room = response.data.data;
      toast.success(
        meetingTiming === 'instant'
          ? `Room created: ${room.roomCode}`
          : `Room scheduled: ${room.roomCode}`
      );
      setRoomCodeStore(room.roomCode);
      if (meetingTiming === 'instant') {
        navigate(`/pre-join/${room.roomCode}`);
        return;
      }

      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const shareUrl = origin ? `${origin}/pre-join/${room.roomCode}` : `/pre-join/${room.roomCode}`;
      setScheduledShareUrl(shareUrl);
      setScheduledRoom({ roomCode: room.roomCode, name: room.name });
      setRoomName('');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to create room');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!scheduledShareUrl) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(scheduledShareUrl);
      } else if (typeof document !== 'undefined') {
        const textArea = document.createElement('textarea');
        textArea.value = scheduledShareUrl;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      toast.success('Link copied to clipboard');
    } catch (error) {
      console.error('Failed to copy link', error);
      toast.error('Unable to copy link');
    }
  };

  const handleStartNow = () => {
    if (!scheduledRoom) return;
    navigate(`/pre-join/${scheduledRoom.roomCode}`);
  };

  const handleCreateAnother = () => {
    setScheduledRoom(null);
    setScheduledShareUrl('');
    setMeetingTiming('instant');
  };

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-slate-50 text-slate-900">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-[-180px] h-[520px] w-[520px] rounded-full bg-gradient-to-br from-cyan-100 via-sky-100 to-indigo-100 opacity-60 blur-[160px]" />
        <div className="absolute bottom-[-220px] right-[-120px] h-[520px] w-[520px] rounded-full bg-gradient-to-tl from-white via-cyan-100 to-indigo-100 opacity-60 blur-[160px]" />
      </div>

      <main className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col justify-center gap-16 px-4 py-14 sm:px-6 lg:flex-row lg:items-stretch lg:gap-20 lg:px-10 xl:px-12">
        <section className="flex flex-1 flex-col justify-center gap-10">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-cyan-200/80 bg-white/80 px-4 py-1 text-[11px] uppercase tracking-[0.4em] text-cyan-500 shadow-[0_12px_32px_-20px_rgba(14,165,233,0.65)] backdrop-blur">
            CYNAYD
            <span className="font-semibold tracking-[0.25em] text-slate-600">Connect Studio</span>
          </div>
          <div className="space-y-6">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl xl:text-6xl">
              Launch a signature CYNAYD session.
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
              Name your room, tailor the experience, and craft a shareable space built for premium collaboration—elegant across every device.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:max-w-3xl">
            <article className="rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_18px_40px_-28px_rgba(14,165,233,0.45)] backdrop-blur">
              <p className="text-[11px] uppercase tracking-[0.35em] text-cyan-500">Real-time orchestration</p>
              <p className="mt-3 text-sm text-slate-600 sm:text-[15px]">
                Adaptive lobby flows, instant breakout creation, and moderation tools included by default.
              </p>
            </article>
            <article className="rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_18px_40px_-28px_rgba(14,165,233,0.45)] backdrop-blur">
              <p className="text-[11px] uppercase tracking-[0.35em] text-cyan-500">Crystal media</p>
              <p className="mt-3 text-sm text-slate-600 sm:text-[15px]">
                4K-ready, low-latency streams tuned by CYNAYD Neural Presence™ for presence that feels tangible.
              </p>
            </article>
          </div>
        </section>

        <section className="flex w-full max-w-md flex-col self-center">
          <div className="flex flex-col rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_60px_-36px_rgba(14,165,233,0.55)]">
            <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-[11px] uppercase tracking-[0.4em] text-cyan-500">
                  {scheduledRoom ? 'Room ready' : 'Create room'}
                </p>
                <h2 className="text-xl font-semibold text-slate-900 sm:text-2xl">
                  {scheduledRoom ? 'Your premium studio is on standby' : 'Session blueprint'}
                </h2>
              </div>
            </header>

            {scheduledRoom ? (
              <div className="flex flex-col gap-4">
                <div className="space-y-1.5">
                  <div className="rounded-2xl border border-cyan-200 bg-cyan-50/80 p-4 shadow-[0_14px_30px_-26px_rgba(14,165,233,0.55)]">
                    <p className="text-sm font-semibold text-slate-800">
                      {scheduledRoom.name
                        ? `"${scheduledRoom.name}" is saved and ready to launch.`
                        : 'Your room is saved and ready to launch.'}
                    </p>
                    <p className="mt-1.5 text-xs text-slate-600">
                      Share the link below when you are ready to go live.
                    </p>
                    <div className="mt-2.5 flex flex-col gap-1.5">
                      <div className="rounded-[16px] border border-cyan-200 bg-white px-4 py-2 text-xs text-slate-700">
                        <span className="text-[11px] uppercase tracking-[0.35em] text-cyan-500">Room code</span>{' '}
                        <span className="ml-3 text-base font-semibold tracking-[0.25em] text-slate-900">
                          {scheduledRoom.roomCode}
                        </span>
                      </div>
                      <div className="rounded-[16px] border border-cyan-200 bg-white px-4 py-2 text-xs text-slate-700">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] uppercase tracking-[0.35em] text-cyan-500">Room link</span>
                          <button
                            type="button"
                            onClick={handleCopyLink}
                            className="inline-flex items-center gap-1 rounded-2xl border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.25em] text-cyan-600 transition hover:border-cyan-300"
                          >
                            Copy
                          </button>
                        </div>
                        <p className="mt-1 break-all text-[13px] font-medium leading-5 text-slate-800">
                          http://localhost:5173/call/hbch-tcci-rrpn
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={handleStartNow}
                      className="inline-flex items-center justify-center gap-1.5 rounded-[22px] bg-gradient-to-r from-cyan-300 via-sky-500 to-indigo-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_40px_-24px_rgba(14,165,233,0.6)] transition hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
                    >
                      Start meeting now
                      <svg className="h-4 w-4 text-white/80" viewBox="0 0 20 20" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M3 10a1 1 0 011-1h9.586l-3.293-3.293A1 1 0 1111.707 4.3l5 5a1 1 0 010 1.4l-5 5a1 1 0 01-1.414-1.414L13.586 11H4a1 1 0 01-1-1z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateAnother}
                      className="inline-flex items-center justify-center gap-1.5 rounded-[22px] border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-cyan-200 hover:bg-cyan-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
                    >
                      Create another room
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <form className="flex flex-1 flex-col gap-5" onSubmit={handleSubmit}>
                <div className="space-y-1.5">
                  <label htmlFor="room-name" className="text-sm font-medium text-slate-700">
                    Room identity
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                      <svg className="h-4 w-4 text-cyan-500" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M2 6a2 2 0 012-2h8a2 2 0 012 2v1h2a2 2 0 012 2v1.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 01-1.414 0L3.293 11.293A1 1 0 013 10.586V9a2 2 0 012-2h2V6H4a2 2 0 00-2 2v8a2 2 0 002 2h3a1 1 0 010 2H4a4 4 0 01-4-4V8a4 4 0 014-4h8a4 4 0 014 4v1h-2V8a2 2 0 00-2-2H4a2 2 0 00-2 2v1h6a1 1 0 01.707.293l3 3a1 1 0 01.293.707V14l3-3V8h-2V6a2 2 0 00-2-2H4z" />
                      </svg>
                    </div>
                    <input
                      id="room-name"
                      name="roomName"
                      type="text"
                      required
                      value={roomName}
                      onChange={(e) => setRoomName(e.target.value)}
                      placeholder="E.g. Innovation Sprint, Client Review, Studio Lounge"
                      className="w-full rounded-[20px] border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-700">Room access</p>
                  <div className="grid gap-2.5">
                    {privacyOptions.map(option => {
                      const selected = option.value === isPublic;
                      return (
                        <button
                          type="button"
                          key={option.label}
                          onClick={() => setIsPublic(option.value)}
                          className={`flex items-center gap-3 rounded-[20px] border px-4 py-2.5 text-left transition sm:px-5 ${
                            selected
                              ? 'border-cyan-300 bg-cyan-50 shadow-[0_20px_50px_-26px_rgba(14,165,233,0.55)]'
                              : 'border-slate-200 bg-white hover:border-cyan-200 hover:bg-cyan-50'
                          }`}
                        >
                          <span className="shrink-0">{option.icon}</span>
                          <div className="flex flex-col gap-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-slate-900">{option.label}</p>
                              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[10px] uppercase tracking-[0.3em] text-cyan-500">
                                {option.badge}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600">{option.description}</p>
                          </div>
                          <span className="ml-auto inline-flex h-5 w-5 items-center justify-center rounded-full border border-cyan-200 text-[10px] text-cyan-500">
                            {selected ? '✓' : ''}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-700">Meeting timing</p>
                  <div className="grid gap-2.5">
                    {meetingTimingOptions.map(option => {
                      const selected = option.value === meetingTiming;
                      return (
                        <button
                          type="button"
                          key={option.label}
                          onClick={() => setMeetingTiming(option.value)}
                          className={`flex items-center gap-4 rounded-[20px] border px-4 py-3 text-left transition sm:px-5 ${
                            selected
                              ? 'border-cyan-300 bg-cyan-50 shadow-[0_20px_50px_-26px_rgba(14,165,233,0.55)]'
                              : 'border-slate-200 bg-white hover:border-cyan-200 hover:bg-cyan-50'
                          }`}
                        >
                          <span className="shrink-0">{option.icon}</span>
                          <div className="flex flex-col gap-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-slate-900">{option.label}</p>
                              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[10px] uppercase tracking-[0.3em] text-cyan-500">
                                {option.badge}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600">{option.description}</p>
                          </div>
                          <span className="ml-auto inline-flex h-5 w-5 items-center justify-center rounded-full border border-cyan-200 text-[10px] text-cyan-500">
                            {selected ? '✓' : ''}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-1">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="group relative flex w-full items-center justify-center gap-1.5 overflow-hidden rounded-[22px] bg-gradient-to-r from-cyan-300 via-sky-500 to-indigo-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_40px_-24px_rgba(14,165,233,0.6)] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="relative z-10">
                      {isLoading
                        ? 'Crafting room...'
                        : meetingTiming === 'instant'
                          ? 'Create premium room'
                          : 'Schedule premium room'}
                    </span>
                    <svg
                      className="relative z-10 h-4 w-4 text-white/80"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M3 10a1 1 0 011-1h9.586l-3.293-3.293A1 1 0 1111.707 4.3l5 5a1 1 0 010 1.4l-5 5a1 1 0 01-1.414-1.414L13.586 11H4a1 1 0 01-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="absolute inset-0 opacity-0 transition group-hover:opacity-100 group-hover:blur-md">
                      <span className="absolute inset-0 bg-gradient-to-r from-cyan-200 via-sky-300 to-indigo-300" />
                    </span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

