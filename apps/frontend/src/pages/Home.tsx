import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export default function Home() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState('');
  const slides = useMemo(
    () => [
      {
        src: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1600&q=80',
        alt: 'Creative team collaborating over video',
        headline: 'Creative Workshop',
        caption: 'Design, feedback, and workflow in one canvas.',
      },
      {
        src: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=1600&q=80',
        alt: 'Speaker presenting to a remote audience',
        headline: 'Keynote Broadcast',
        caption: 'Crystal-clear delivery with neural spotlighting.',
      },
      {
        src: 'https://images.unsplash.com/photo-1525182008055-f88b95ff7980?auto=format&fit=crop&w=1600&q=80',
        alt: 'Remote team collaborating over a shared screen',
        headline: 'Product Review',
        caption: 'Real-time walkthroughs with ultra-low latency sharing.',
      },
    ],
    []
  );
  const [activeSlide, setActiveSlide] = useState(0);

  const handleCreateRoom = () => {
    navigate('/rooms/create');
  };

  const handleJoinRoom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = joinCode.trim();
    if (!code) {
      return;
    }
    navigate(`/call/${code}`);
    setJoinCode('');
  };

  useEffect(() => {
    if (!slides.length) return;
    const timer = window.setInterval(() => {
      setActiveSlide(prev => (prev + 1) % slides.length);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [slides]);

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-[#f7f9fc] text-slate-900">
      <div className="relative flex flex-1 flex-col overflow-hidden lg:overflow-visible">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 left-1/4 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-gradient-to-r from-cyan-100 via-sky-100 to-indigo-100 opacity-80 blur-3xl" />
          <div className="absolute bottom-[-120px] right-0 h-[360px] w-[360px] translate-x-1/3 rounded-full bg-gradient-to-br from-white via-cyan-100 to-indigo-100 opacity-70 blur-[140px]" />
        </div>

        <header className="relative z-10 border-b border-slate-200 bg-white/70 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 sm:px-8">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 via-sky-400 to-indigo-400 text-lg font-semibold text-white shadow-[0_18px_45px_-18px_rgba(14,165,233,0.55)]">
                CY
              </span>
              <div>
                <p className="font-heading text-xs uppercase tracking-[0.45em] text-slate-500">CYNAYD</p>
                <h1 className="font-heading text-xl font-semibold tracking-wide text-slate-900">Connect</h1>
              </div>
            </div>

            <div className="flex items-center gap-5">
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Signed in as</p>
                <p className="text-sm font-medium text-slate-700">{user?.name ?? 'Guest'}</p>
              </div>
              <button
                onClick={logout}
                className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        <main className="relative z-10 flex flex-1 overflow-y-auto">
          <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-16 px-6 py-12 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:gap-24 lg:py-16">
            <div className="max-w-xl">
              <p className="font-heading inline-flex items-center rounded-full border border-cyan-200 bg-white px-4 py-1 text-xs font-medium uppercase tracking-[0.4em] text-cyan-500 shadow-[0_10px_30px_-18px_rgba(14,165,233,0.7)]">
                CYNAYD Connect
              </p>
              <h2 className="mt-6 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
                Premium meetings designed for elevated teams.
              </h2>
              <p className="mt-6 text-lg leading-relaxed text-slate-600">
                Experience cinematic video, lifelike audio, and built-in collaboration. CYNAYD Connect delivers a polished, dependable workspace so every session feels intentional.
              </p>
              <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
                <button
                  onClick={handleCreateRoom}
                  className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-gradient-to-r from-cyan-400 via-sky-500 to-indigo-500 px-6 py-3 text-sm font-medium uppercase tracking-[0.2em] text-white shadow-[0_18px_36px_-16px_rgba(14,165,233,0.65)] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
                >
                  <span className="relative z-10">Launch</span>
                  <span className="relative z-10 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-xs text-white">
                    +
                  </span>
                  <span className="absolute inset-0 opacity-0 transition group-hover:opacity-100 group-hover:blur-md">
                    <span className="absolute inset-0 bg-gradient-to-r from-cyan-200 via-sky-300 to-indigo-300" />
                  </span>
                </button>
                <form
                  onSubmit={handleJoinRoom}
                  className="flex w-full max-w-sm flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_10px_28px_-18px_rgba(14,165,233,0.35)] sm:w-auto sm:flex-row sm:items-center sm:gap-3 sm:rounded-full sm:px-4 sm:py-2.5"
                >
                  <input
                    type="text"
                    value={joinCode}
                    onChange={event => setJoinCode(event.target.value)}
                    placeholder="Enter room code"
                    className="flex-1 rounded-full border border-transparent bg-slate-50 px-4 py-2 text-sm text-slate-700 outline-none transition focus:border-cyan-200 focus:bg-white focus:ring-0 sm:w-48 sm:flex-none sm:bg-transparent"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-400 via-sky-500 to-indigo-500 px-4 py-2 text-sm font-medium uppercase tracking-[0.2em] text-white transition hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
                  >
                    Join
                    <svg className="h-4 w-4 text-white/80" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M10.293 3.293a1 1 0 011.414 0l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L13.586 10H4a1 1 0 110-2h9.586l-3.293-3.293a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                </form>
              </div>

              <div className="mt-12 grid grid-cols-3 gap-6 text-center text-slate-600 sm:max-w-md sm:text-left">
                <div>
                  <p className="font-heading text-3xl font-semibold text-slate-900">4K</p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
                    Adaptive video clarity
                  </p>
                </div>
                <div>
                  <p className="font-heading text-3xl font-semibold text-slate-900">99.9%</p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
                    uptime commitment
                  </p>
                </div>
                <div>
                  <p className="font-heading text-3xl font-semibold text-slate-900">TLS</p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
                    secure transport
                  </p>
                </div>
              </div>
            </div>

            <div className="relative w-full max-w-lg">
              <div className="absolute -inset-1 rounded-3xl bg-gradient-to-br from-cyan-200 via-sky-200 to-indigo-200 opacity-60 blur-2xl" />
              <div className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_25px_60px_-28px_rgba(15,118,110,0.35)]">
                <div className="absolute -top-24 right-[-30%] h-64 w-64 rounded-full bg-cyan-100 opacity-60 blur-3xl sm:right-[-15%]" />
                <div className="relative grid gap-6 p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-cyan-300 to-sky-400 text-sm font-semibold text-white shadow-[0_14px_28px_-16px_rgba(14,165,233,0.55)]">
                        LIVE
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Studio Lounge</p>
                        <p className="text-xs text-slate-500">Broadcasting in ultra clarity</p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-600">
                      <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
                      Live
                    </span>
                  </div>

                  <div className="relative overflow-hidden rounded-3xl border border-slate-100 bg-slate-900 shadow-[0_18px_36px_-18px_rgba(14,116,233,0.45)]">
                    <div className="relative h-56 w-full overflow-hidden">
                      {slides.map(({ src, alt }, index) => (
                        <img
                          key={src}
                          src={src}
                          alt={alt}
                          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
                            index === activeSlide ? 'opacity-100' : 'opacity-0'
                          }`}
                          loading={index === 0 ? 'eager' : 'lazy'}
                        />
                      ))}
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-900/20 to-transparent" />
                    </div>
                    <div className="absolute top-4 right-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white backdrop-blur">
                      <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-rose-400" />
                      Recording
                    </div>
                    <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center justify-between gap-4 text-white">
                      <div>
                        <p className="text-sm font-semibold">{slides[activeSlide]?.headline}</p>
                        <p className="text-xs text-white/80">{slides[activeSlide]?.caption}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="hidden items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium md:inline-flex">
                          <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                          18 Guests
                        </div>
                        <div className="flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-cyan-400/90 text-[11px] font-semibold">
                            HD
                          </span>
                          4K Presence on
                        </div>
                      </div>
                    </div>
                    <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
                      {slides.map((_, index) => (
                        <span
                          key={index}
                          className={`h-2 w-2 rounded-full ${
                            index === activeSlide ? 'bg-white' : 'bg-white/40'
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-100 bg-white/90 p-4 shadow-[0_14px_24px_-20px_rgba(15,118,110,0.45)] backdrop-blur">
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-500">Neural edits</p>
                      <p className="mt-2 text-sm font-medium text-slate-900">Auto scene cuts</p>
                      <p className="mt-2 text-xs leading-relaxed text-slate-600">
                        AI trims dead air, adds transitions, and keeps highlights on deck.
                      </p>
                    </div>
                    <div className="relative rounded-2xl border border-slate-100 bg-gradient-to-br from-cyan-50 via-sky-50 to-white p-4 shadow-[0_16px_30px_-18px_rgba(14,165,233,0.45)]">
                      <div className="absolute -top-4 right-4 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-[0_12px_30px_-18px_rgba(14,165,233,0.45)] animate-bounce">
                        <svg className="h-5 w-5 text-cyan-500" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M4 3a1 1 0 00-1 1v12a1 1 0 001.555.832L9 14.202V5.798L4.555 3.168A1 1 0 004 3zm7 3a1 1 0 011.447-.894l5 2.5a1 1 0 010 1.788l-5 2.5A1 1 0 0111 11.5v-5z" />
                        </svg>
                      </div>
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-600">Stage assist</p>
                      <p className="mt-2 text-sm font-medium text-slate-900">Auto spotlight</p>
                      <p className="mt-2 text-xs leading-relaxed text-slate-600">
                        Intelligent call layout promotes the active voice with cinematic depth.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

