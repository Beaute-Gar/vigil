import Link from 'next/link';

/** Marque Vigil — bouclier + pupille, tracé unique en `currentColor`. */
export function Logo({ size = 22, withWordmark = true }: { size?: number; withWordmark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        style={{ flex: 'none' }}
      >
        <path
          d="M12 2.5 4 5.6v5.9c0 4.6 3.2 8.6 8 9.9 4.8-1.3 8-5.3 8-9.9V5.6L12 2.5Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          opacity="0.55"
        />
        <path
          d="M7.4 12s1.9-3.1 4.6-3.1S16.6 12 16.6 12s-1.9 3.1-4.6 3.1S7.4 12 7.4 12Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      </svg>
      {withWordmark && (
        <span
          className="text-[0.95rem] font-semibold tracking-tight"
          style={{ letterSpacing: '-0.02em' }}
        >
          Vigil
        </span>
      )}
    </span>
  );
}

export function LogoLink({ className = '' }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-2 text-[var(--text)] hover:text-[var(--accent)] transition-colors ${className}`}
    >
      <Logo />
    </Link>
  );
}
