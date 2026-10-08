import Link from 'next/link';
import { Logo } from '@/components/logo';
import { Note } from '@/components/ui';

const FEATURES = [
  {
    step: '01',
    title: 'Des règles ordonnées',
    body: 'Chaque règle porte une priorité et une sévérité. L’ordre est le contrat : réordonner deux règles change exactement ce qui doit changer, et rien d’autre.',
    detail: 'Évaluation déterministe',
  },
  {
    step: '02',
    title: 'Une décision explicable',
    body: 'Toutes les règles sont évaluées, pas seulement la première qui matche. Le verdict désigne la règle décisionnaire — on peut répondre « pourquoi » à chaque signalement.',
    detail: 'Sévérité maximale, présentation par priorité',
  },
  {
    step: '03',
    title: 'Une chaîne qui ne casse pas',
    body: 'Une expression régulière cassée est isolée et remontée, jamais bloquante. Une règle défaillante doit se voir : elle ne fait pas tomber la modération.',
    detail: 'Dégradation contrôlée',
  },
  {
    step: '04',
    title: 'Un historique défendable',
    body: 'Un incident tranché ne se réouvre pas silencieusement : cela passe par un appel, motivé, tranché, et journalisé. L’audit est en écriture seule.',
    detail: 'append-only · machines à états',
  },
] as const;

const STACK = [
  { group: 'Interface', items: ['Next.js 16 (App Router)', 'React 19', 'TypeScript strict', 'Tailwind CSS v4'] },
  { group: 'Données', items: ['PostgreSQL', 'Drizzle ORM', 'Migrations versionnées', 'PGlite en local', 'Postgres managé (DATABASE_URL)'] },
  { group: 'Confiance', items: ['scrypt (RFC 7914)', 'Sessions opaques hachées', 'Cookies HTTP-only', 'Journal immuable'] },
  { group: 'Qualité', items: ['Vitest — 124 tests', 'ESLint', 'Typecheck strict', 'GitHub Actions'] },
] as const;

const LIFECYCLE = [
  { k: 'Détection', v: 'Le message traverse le moteur ; la règle la plus sévère décide.' },
  { k: 'Décision', v: 'Un modérateur écarte ou confirme — une seule fois.' },
  { k: 'Appel', v: 'Le sujet conteste, avec motivation obligatoire.' },
  { k: 'Traçabilité', v: 'Chaque étape produit une ligne de journal inaltérable.' },
] as const;

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* ── Navigation ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--bg)]/85 backdrop-blur-md">
        <nav className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-[var(--text)] hover:text-[var(--accent)] transition-colors">
            <Logo />
          </Link>
          <div className="flex items-center gap-2.5">
            <Link href="/login" className="btn btn-ghost btn-sm">
              Connexion
            </Link>
            <Link href="/register" className="btn btn-primary btn-sm">
              Ouvrir une console
            </Link>
          </div>
        </nav>
      </header>

      <main className="flex-1">
        {/* ── Hero ─────────────────────────────────────────────── */}
        <section className="relative grid-bg overflow-hidden border-b border-[var(--border)]">
          <div className="mx-auto max-w-6xl px-6 pt-20 pb-16 sm:pt-28 sm:pb-24">
            <div className="max-w-3xl anim-in">
              <span className="badge ring-1 ring-inset bg-[var(--accent-dim)] text-[var(--accent)] ring-[var(--accent)]/30 mono">
                <span className="dot" />
                Trust &amp; Safety · console de modération
              </span>

              <h1 className="mt-6 text-[2.15rem] leading-[1.08] sm:text-[3rem] tracking-tight">
                Modérer une communauté,
                <br />
                <span className="text-[var(--accent)]">sans jamais perdre la trace.</span>
              </h1>

              <p className="mt-5 text-[1.02rem] sm:text-[1.1rem] leading-relaxed muted max-w-2xl">
                Vigil transforme des règles de modération en décisions traçables : ordre
                d’évaluation explicite, verdict justifié, file d’appels et journal d’audit en
                écriture seule.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href="/register" className="btn btn-primary">
                  Essayer la console
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M5 12h14M13 6l6 6-6 6"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </Link>
                <Link href="/login" className="btn btn-ghost">
                  Se connecter au compte démo
                </Link>
              </div>

              <p className="mt-4 faint text-[0.8rem] mono">
                démo : demo@vigil.app · vigil-demo-2026
              </p>
            </div>
          </div>
        </section>

        {/* ── Principe de fonctionnement ───────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
          <div className="max-w-2xl">
            <p className="label mono text-[var(--accent)]">LE PRINCIPE</p>
            <h2 className="mt-3 text-[1.7rem] sm:text-[2rem] leading-tight">
              Quatre décisions de conception qui tiennent tout le produit
            </h2>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {FEATURES.map((f, i) => (
              <article
                key={f.step}
                className="panel p-6 flex flex-col anim-in"
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <div className="flex items-baseline justify-between gap-4">
                  <span className="mono text-[var(--accent)] text-sm">{f.step}</span>
                  <span className="faint text-[0.7rem] mono uppercase tracking-[0.14em] text-right">
                    {f.detail}
                  </span>
                </div>
                <h3 className="mt-4 text-[1.05rem]">{f.title}</h3>
                <p className="muted text-[0.885rem] leading-relaxed mt-2.5">{f.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ── Cycle de vie ─────────────────────────────────────── */}
        <section className="border-y border-[var(--border)] bg-[var(--bg-elevated)]">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
              <div>
                <p className="label mono text-[var(--accent)]">LE CYCLE DE VIE</p>
                <h2 className="mt-3 text-[1.7rem] leading-tight">
                  De la détection au dossier
                </h2>
                <p className="muted text-[0.92rem] leading-relaxed mt-4">
                  Un incident ne change d’état que par une transition déclarée. Rien ne se
                  réouvre en silence : chaque révision passe par un appel motivé, donc par une
                  ligne de journal.
                </p>
                <div className="mt-6">
                  <Note>
                    Aucune requête du projet ne met à jour ni ne supprime une ligne du journal
                    d’audit. C’est vérifiable en lisant le dépôt.
                  </Note>
                </div>
              </div>

              <ol className="space-y-px rounded-[var(--radius)] overflow-hidden border border-[var(--border)]">
                {LIFECYCLE.map((l, i) => (
                  <li
                    key={l.k}
                    className="flex gap-4 px-5 py-4 bg-[var(--bg)] table-row-hover"
                  >
                    <span className="mono text-[var(--accent)] text-sm flex-none pt-0.5 w-6">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[0.95rem] font-medium">{l.k}</div>
                      <div className="muted text-[0.85rem] leading-relaxed mt-1">{l.v}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* ── Pile technique ───────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
          <div className="max-w-2xl">
            <p className="label mono text-[var(--accent)]">INGÉNIERIE</p>
            <h2 className="mt-3 text-[1.7rem] sm:text-[2rem] leading-tight">
              Une pile courte, choisie pour durer
            </h2>
            <p className="muted text-[0.95rem] leading-relaxed mt-4">
              Pas de framework maison : des briques qu’une équipe canadienne utilise déjà au
              quotidien, assemblées avec des garanties testées.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STACK.map((s) => (
              <div key={s.group} className="card card-pad">
                <div className="label mono">{s.group}</div>
                <ul className="mt-3.5 space-y-2">
                  {s.items.map((item) => (
                    <li
                      key={item}
                      className="text-[0.855rem] flex items-start gap-2.5 text-[var(--text)]"
                    >
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                        className="text-[var(--accent)] flex-none mt-1"
                      >
                        <path
                          d="M20 6 9 17l-5-5"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span className="leading-snug">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* ── Appel à l'action ─────────────────────────────────── */}
        <section className="border-t border-[var(--border)]">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20 text-center">
            <h2 className="text-[1.7rem] sm:text-[2.1rem] leading-tight max-w-2xl mx-auto">
              Ouvrez la console et soumettez un message au moteur
            </h2>
            <p className="muted text-[0.95rem] leading-relaxed mt-4 max-w-xl mx-auto">
              Compte de démonstration pré-rempli, règles et incidents déjà chargés. Aucune
              carte bancaire, aucune configuration.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/register" className="btn btn-primary">
                Créer un compte
              </Link>
              <Link href="/login" className="btn btn-ghost">
                Utiliser le compte démo
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* ── Pied de page ──────────────────────────────────────── */}
      <footer className="border-t border-[var(--border)]">
        <div className="mx-auto max-w-6xl px-6 py-8 flex flex-wrap items-center justify-between gap-4">
          <span className="faint text-[0.8rem]">
            Vigil — console de confiance et de sécurité.
          </span>
          <span className="faint text-[0.8rem] mono">
            Next.js · TypeScript · PostgreSQL · Vitest
          </span>
        </div>
      </footer>
    </div>
  );
}
