export default function BackgroundGradients() {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute -left-36 -top-24 h-[520px] w-[520px] rounded-full bg-gradient-to-br from-cyan-100 via-sky-100 to-indigo-100 opacity-70 blur-[170px]" />
      <div className="absolute right-[-160px] bottom-[-180px] h-[520px] w-[520px] rounded-full bg-gradient-to-tl from-white via-cyan-100 to-indigo-100 opacity-60 blur-[180px]" />
    </div>
  );
}

