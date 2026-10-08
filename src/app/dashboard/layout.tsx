import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { Logo } from '@/components/logo';
import { Sidebar } from '@/components/sidebar';
import { LogoutButton } from '@/components/logout-button';
import { getCurrentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: { default: 'Console', template: '%s · Vigil' },
};

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const initials = user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div className="flex min-h-screen flex-col">
      {/* Barre haute */}
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur-md">
        <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            href="/dashboard"
            className="text-[var(--text)] hover:text-[var(--accent)] transition-colors"
          >
            <Logo size={19} />
          </Link>

          <div className="flex items-center gap-3 min-w-0">
            <span className="hidden md:block badge mono ring-1 ring-inset bg-white/[0.03] text-[var(--text-muted)] ring-[var(--border-strong)]">
              console · espace djousse
            </span>

            <div className="hidden sm:flex items-center gap-2.5 min-w-0">
              <span
                aria-hidden="true"
                className="grid h-7 w-7 flex-none place-items-center rounded-[5px] bg-[var(--accent-dim)] text-[var(--accent)] text-[0.7rem] font-semibold mono ring-1 ring-inset ring-[var(--accent)]/30"
              >
                {initials || 'V'}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[0.85rem] leading-tight">{user.name}</span>
                <span className="block truncate faint mono text-[0.7rem] leading-tight">
                  {user.email}
                </span>
              </span>
            </div>

            <div className="w-[9.5rem]">
              <LogoutButton />
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 flex-col sm:flex-row">
        {/* Rail de navigation : colonne sur grand écran, bandeau sur petit */}
        <aside className="w-full sm:w-60 flex-none border-b sm:border-b-0 sm:border-r border-[var(--border)] bg-[var(--bg-elevated)]">
          <div className="sm:sticky sm:top-14">
            <Sidebar />
          </div>
        </aside>

        <main className="flex-1 min-w-0 px-4 sm:px-8 py-7 sm:py-9">{children}</main>
      </div>
    </div>
  );
}
