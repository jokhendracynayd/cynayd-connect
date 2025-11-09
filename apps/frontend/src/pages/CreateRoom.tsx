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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const response = await api.post('/api/rooms/', { name: roomName, isPublic });
      const room = response.data.data;
      toast.success(`Room created: ${room.roomCode}`);
      setRoomCodeStore(room.roomCode);
      navigate(`/pre-join/${room.roomCode}`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to create room');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f7f9fc] text-slate-900">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-[-80px] h-[520px] w-[520px] rounded-full bg-gradient-to-br from-cyan-100 via-sky-100 to-indigo-100 opacity-70 blur-[150px]" />
        <div className="absolute bottom-[-140px] right-[-60px] h-[460px] w-[460px] rounded-full bg-gradient-to-tl from-white via-cyan-100 to-indigo-100 opacity-60 blur-[150px]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-16 sm:px-8 lg:px-10">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-white px-4 py-1 text-xs uppercase tracking-[0.4em] text-cyan-500 shadow-[0_12px_32px_-20px_rgba(14,165,233,0.65)]">
              CYNAYD
              <span className="font-semibold tracking-[0.25em] text-slate-600">Connect Studio</span>
            </div>
            <div>
              <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
                Launch a signature CYNAYD session.
              </h1>
              <p className="mt-5 max-w-lg text-lg leading-relaxed text-slate-600">
                Name your room, choose the vibe, and generate a shareable space engineered for premium collaboration. Every detail feels crafted—because it is.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_18px_40px_-26px_rgba(14,165,233,0.45)]">
                <p className="text-xs uppercase tracking-[0.35em] text-cyan-500">Real-time orchestration</p>
                <p className="mt-2 text-sm text-slate-600">
                  Adaptive lobby flows, instant breakout creation, and moderation tools included by default.
                </p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_18px_40px_-26px_rgba(14,165,233,0.45)]">
                <p className="text-xs uppercase tracking-[0.35em] text-cyan-500">Crystal media</p>
                <p className="mt-2 text-sm text-slate-600">
                  4K-ready, low-latency streams tuned by CYNAYD Neural Presence™ for presence that feels tangible.
                </p>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-1 rounded-[40px] bg-gradient-to-br from-cyan-200 via-sky-200 to-indigo-200 opacity-50 blur-2xl" />
            <div className="relative rounded-[34px] border border-slate-200 bg-white p-8 shadow-[0_30px_70px_-34px_rgba(14,165,233,0.5)]">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.4em] text-cyan-500">Create Room</p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-900">Session blueprint</h2>
                </div>
                <span className="rounded-full border border-cyan-100 bg-cyan-50 px-3 py-1 text-xs text-cyan-600">
                  Step 1 of 2
                </span>
              </div>

              <form className="space-y-6" onSubmit={handleSubmit}>
                <div className="space-y-2">
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

                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-slate-700">Room access</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Tailor the entry flow that matches your session’s energy.
                    </p>
                  </div>
                  <div className="grid gap-3">
                    {privacyOptions.map(option => {
                      const selected = option.value === isPublic;
                      return (
                        <button
                          type="button"
                          key={option.label}
                          onClick={() => setIsPublic(option.value)}
                          className={`flex items-start gap-4 rounded-[22px] border px-5 py-4 text-left transition ${
                            selected
                              ? 'border-cyan-300 bg-cyan-50 shadow-[0_20px_50px_-26px_rgba(14,165,233,0.55)]'
                              : 'border-slate-200 bg-white hover:border-cyan-200 hover:bg-cyan-50'
                          }`}
                        >
                          <span className="mt-1">{option.icon}</span>
                          <div className="space-y-2">
                            <div className="flex items-center gap-3">
                              <p className="text-sm font-semibold text-slate-900">{option.label}</p>
                              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[10px] uppercase tracking-[0.3em] text-cyan-500">
                                {option.badge}
                              </span>
                            </div>
                            <p className="text-xs leading-relaxed text-slate-600">{option.description}</p>
                          </div>
                          <span className="ml-auto mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-cyan-200 text-[10px] text-cyan-500">
                            {selected ? '✓' : ''}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-[24px] bg-gradient-to-r from-cyan-300 via-sky-500 to-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-[0_20px_45px_-22px_rgba(14,165,233,0.65)] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="relative z-10">{isLoading ? 'Crafting room...' : 'Create premium room'}</span>
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
                  <p className="mt-3 text-center text-xs text-slate-500">
                    Next: Personalize waiting room & media preferences.
                  </p>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

