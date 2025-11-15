export default function BackgroundGradients() {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute -left-36 -top-24 h-[520px] w-[520px] rounded-full bg-gradient-to-br from-gray-900 via-gray-800 to-black opacity-50 blur-[170px]" />
      <div className="absolute right-[-160px] bottom-[-180px] h-[520px] w-[520px] rounded-full bg-gradient-to-tl from-black via-gray-900 to-gray-800 opacity-40 blur-[180px]" />
    </div>
  );
}

