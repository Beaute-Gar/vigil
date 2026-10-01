'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type IconName = 'grid' | 'alert' | 'shield' | 'gavel' | 'list';

type NavItem = { href: string; label: string; icon: IconName; end?: boolean };

const NAV: readonly NavItem[] = [
  { href: '/dashboard', label: 'Vue d’ensemble', icon: 'grid', end: true },
  { href: '/dashboard/incidents', label: 'Incidents', icon: 'alert' },
  { href: '/dashboard/rules', label: 'Règles', icon: 'shield' },
  { href: '/dashboard/appeals', label: 'Appels', icon: 'gavel' },
  { href: '/dashboard/audit', label: 'Journal d’audit', icon: 'list' },
];

function Icon({ name }: { name: IconName }) {
  const paths: Record<string, React.ReactNode> = {
    grid: (
      <>
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.4" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="1.4" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1.4" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="1.4" />
      </>
    ),
    alert: (
      <>
        <path d="M12 3.8 2.8 19.5h18.4L12 3.8Z" strokeLinejoin="round" />
        <path d="M12 10v4M12 17h.01" strokeLinecap="round" />
      </>
    ),
    shield: (
      <path d="M12 3 4.5 5.8v5.5c0 4.3 3 8.1 7.5 9.4 4.5-1.3 7.5-5.1 7.5-9.4V5.8L12 3Z" strokeLinejoin="round" />
    ),
    gavel: (
      <>
        <path d="m4 20 8.5-8.5M9.5 6.5l4 4M14 4.5l4 4M6.5 11.5l4 4" strokeLinecap="round" />
        <path d="m15.5 13.5 5 5M17.5 11.5l-2 2" strokeLinecap="round" />
      </>
    ),
    list: (
      <>
        <path d="M8 6.5h12M8 12h12M8 17.5h12" strokeLinecap="round" />
        <path d="M4 6.5h.01M4 12h.01M4 17.5h.01" strokeLinecap="round" strokeWidth="2.2" />
      </>
    ),
  };

  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
      className="flex-none"
    >
      {paths[name]}
    </svg>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 py-4" aria-label="Navigation du tableau de bord">
      {NAV.map((item) => {
        const active = item.end
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={[
              'flex items-center gap-3 px-4 py-2.5 text-[0.885rem] border-l-2 transition-colors',
              active
                ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent-dim)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/[0.03]',
            ].join(' ')}
          >
            <Icon name={item.icon} />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
