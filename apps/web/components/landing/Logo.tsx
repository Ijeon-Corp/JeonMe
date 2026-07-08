export default function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div
        className="flex h-8 w-8 items-center justify-center rounded-lg shadow-sm"
        style={{ background: "linear-gradient(135deg,#1B4D3E,#1F7A6C)" }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path
            d="M9 1.5C9 1.5 4 4 4 9C4 13 6.5 16.5 9 16.5C11.5 16.5 14 13 14 9C14 4 9 1.5 9 1.5Z"
            fill="white"
            opacity="0.9"
          />
          <circle cx="9" cy="9" r="2" fill="#1B4D3E" />
        </svg>
      </div>
      <span className="font-heading text-xl font-extrabold tracking-tight text-ink">Jeonme</span>
    </div>
  );
}
