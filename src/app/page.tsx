import Link from 'next/link';
import { Logo } from '@/components/logo';

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

const SOMMAIRE = [
  { n: '01', href: '#principe', title: 'Le principe', sub: 'Quatre décisions de conception' },
  { n: '02', href: '#cycle', title: 'Le cycle de vie', sub: 'De la détection au dossier' },
  { n: '03', href: '#pile', title: 'Ingénierie', sub: 'Une pile courte, choisie pour durer' },
  { n: '04', href: '#console', title: 'La console', sub: 'Ouvrez-la et soumettez un message' },
] as const;

/** Titre de rubrique : filet double, numéro de section, titre en serif. */
function SectionHead({
  num,
  label,
  title,
  intro,
}: {
  num: string;
  label: string;
  title: string;
  intro?: string;
}) {
  return (
    <div className="max-w-3xl">
      <div className="rule-double flex items-center gap-3 pt-3">
        <span className="label text-[var(--accent)]">{num}</span>
        <span className="label">{label}</span>
      </div>
      <h2 className="mt-3.5 text-[1.75rem] sm:text-[2.15rem] leading-[1.12]">{title}</h2>
      {intro && <p className="muted text-[0.95rem] leading-relaxed mt-3.5">{intro}</p>}
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* ── Bandeau-titre (nameplate) ──────────────────────────────── */}
      <header className="border-b-4 border-double border-[var(--text)]">
        <div className="mx-auto max-w-6xl px-6">
          {/* Ligne de service */}
          <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] py-2.5">
            <p className="label">Trust &amp; Safety · console de modération</p>
            <p className="label mono faint hidden sm:block">Next.js · TypeScript · PostgreSQL</p>
          </div>

          {/* Titre du journal + navigation */}
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 py-5 sm:py-6">
            <Link
              href="/"
              className="flex items-end gap-3 text-[var(--text)] hover:text-[var(--accent)] transition-colors"
            >
              <Logo size={30} withWordmark={false} />
              <span className="font-serif text-[2.3rem] sm:text-[2.8rem] leading-[0.9] font-bold tracking-[-0.015em]">
                Vigil
              </span>
              <span className="label hidden sm:block pb-1.5">Console de modération</span>
            </Link>
            <nav className="flex items-center gap-2.5 pb-1">
              <Link href="/login" className="btn btn-ghost btn-sm">
                Connexion
              </Link>
              <Link href="/register" className="btn btn-primary btn-sm">
                Ouvrir une console
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ── Une-une : article de tête + sommaire ─────────────────── */}
        <section className="border-b border-[var(--border-strong)]">
          <div className="mx-auto max-w-6xl px-6 py-9 sm:py-12 grid gap-9 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)] lg:gap-x-12">
            {/* Colonne principale */}
            <div className="anim-in">
              <p className="label text-[var(--accent)]">
                Dossier · décisions traçables
              </p>

              <h1 className="mt-4 text-[2.2rem] leading-[1.06] sm:text-[3rem] lg:text-[3.35rem]">
                Modérer une communauté,
                <br />
                <span className="italic text-[var(--accent)]">sans jamais perdre la trace.</span>
              </h1>

              <p className="drop-cap mt-6 text-[1.02rem] sm:text-[1.06rem] leading-[1.75] muted max-w-2xl">
                Vigil transforme des règles de modération en décisions traçables : ordre
                d’évaluation explicite, verdict justifié, file d’appels et journal d’audit en
                écriture seule.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
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
            </div>

            {/* Colonne : sommaire + note de service */}
            <aside className="anim-in lg:border-l lg:border-[var(--border)] lg:pl-10" style={{ animationDelay: '90ms' }}>
              <div className="border-y-[3px] border-double border-[var(--text)] py-2">
                <span className="label">Sommaire</span>
              </div>
              <ol className="mt-1">
                {SOMMAIRE.map((s) => (
                  <li key={s.n} className="border-b border-[var(--border)]">
                    <a href={s.href} className="group flex gap-4 py-3.5">
                      <span className="font-serif text-[1.1rem] leading-none text-[var(--accent)] w-6 pt-0.5">
                        {s.n}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[0.95rem] font-medium group-hover:text-[var(--accent)] transition-colors">
                          {s.title}
                        </span>
                        <span className="block muted text-[0.8rem] mt-1 leading-snug">{s.sub}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ol>

              <div className="mt-6 border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-4 py-3.5">
                <p className="label">Compte de démonstration</p>
                <code className="mono block mt-2 text-[0.8rem] leading-relaxed text-[var(--text-muted)]">
                  demo@vigil.app
                  <br />
                  vigil-demo-2026
                </code>
                <p className="faint text-[0.75rem] mt-2 leading-snug">
                  Identifiants pré-remplis sur la page de connexion.
                </p>
              </div>
            </aside>
          </div>
        </section>

        {/* ── § 01 · Le principe ───────────────────────────────────── */}
        <section id="principe" className="mx-auto max-w-6xl px-6 py-14 sm:py-20 scroll-mt-6">
          <SectionHead
            num="§ 01"
            label="Le principe"
            title="Quatre décisions de conception qui tiennent tout le produit"
          />

          <div className="mt-9 grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {FEATURES.map((f, i) => (
              <article
                key={f.step}
                className="border-t border-[var(--border-strong)] pt-5 anim-in"
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-serif text-[1.7rem] leading-none text-[var(--accent)]">
                    {f.step}
                  </span>
                  <span className="label text-right">{f.detail}</span>
                </div>
                <h3 className="mt-3.5 text-[1.18rem]">{f.title}</h3>
                <p className="muted text-[0.9rem] leading-relaxed mt-2.5">{f.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ── § 02 · Le cycle de vie ───────────────────────────────── */}
        <section id="cycle" className="border-y border-[var(--border-strong)] bg-[var(--surface)]">
          <div className="mx-auto max-w-6xl px-6 py-14 sm:py-20">
            <SectionHead
              num="§ 02"
              label="Le cycle de vie"
              title="De la détection au dossier"
              intro="Un incident ne change d’état que par une transition déclarée. Rien ne se
                réouvre en silence : chaque révision passe par un appel motivé, donc par une
                ligne de journal."
            />

            {/* Exergue — l’engagement, entre deux filets */}
            <figure className="mt-8 border-t border-b border-[var(--border-strong)] py-5 max-w-3xl">
              <blockquote className="pull text-[1.1rem] sm:text-[1.25rem] leading-snug">
                «&nbsp;Aucune requête du projet ne met à jour ni ne supprime une ligne du
                journal d’audit.&nbsp;»
              </blockquote>
              <figcaption className="label mt-2.5">
                Vérifiable en lisant le dépôt
              </figcaption>
            </figure>

            {/* Quatre colonnes, filets verticaux — la maquette du journal */}
            <ol className="mt-9 grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-4">
              {LIFECYCLE.map((l, i) => (
                <li
                  key={l.k}
                  className={[
                    'border-t-2 border-[var(--text)] pt-4 anim-in',
                    i > 0 ? 'lg:border-t-2' : '',
                  ].join(' ')}
                  style={{ animationDelay: `${i * 70}ms` }}
                >
                  <span className="font-serif text-[2.1rem] leading-none text-[var(--accent)]">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className="mt-2.5 text-[1.05rem]">{l.k}</h3>
                  <p className="muted text-[0.865rem] leading-relaxed mt-1.5">{l.v}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── § 03 · Ingénierie (fiche technique) ──────────────────── */}
        <section id="pile" className="mx-auto max-w-6xl px-6 py-14 sm:py-20">
          <SectionHead
            num="§ 03"
            label="Ingénierie"
            title="Une pile courte, choisie pour durer"
            intro="Pas de framework maison : des briques qu’une équipe canadienne utilise déjà
              au quotidien, assemblées avec des garanties testées."
          />

          <div className="mt-9 border-t border-[var(--border-strong)]">
            <div className="hidden sm:grid grid-cols-[11rem_minmax(0,1fr)] gap-6 border-b border-[var(--border)] py-2.5">
              <span className="label">Rubrique</span>
              <span className="label">Éléments</span>
            </div>
            {STACK.map((s) => (
              <dl
                key={s.group}
                className="grid gap-1 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-6 border-b border-[var(--border)] py-4 sm:py-4.5"
              >
                <dt className="label text-[var(--accent)] sm:pt-1">{s.group}</dt>
                <dd className="mono text-[0.85rem] leading-relaxed text-[var(--text)]">
                  {s.items.join('  ·  ')}
                </dd>
              </dl>
            ))}
          </div>
        </section>

        {/* ── § 04 · Encart d’appel ────────────────────────────────── */}
        <section id="console" className="mx-auto max-w-6xl px-6 pb-16 sm:pb-20">
          <div className="border-4 border-double border-[var(--text)] bg-[var(--bg-elevated)] px-6 py-10 sm:px-12 sm:py-12 text-center anim-in">
            <p className="label text-[var(--accent)]">Pour commencer</p>
            <h2 className="mt-3 text-[1.7rem] sm:text-[2.1rem] leading-tight max-w-2xl mx-auto">
              Ouvrez la console et soumettez un message au moteur
            </h2>
            <p className="muted text-[0.95rem] leading-relaxed mt-4 max-w-xl mx-auto">
              Compte de démonstration pré-rempli, règles et incidents déjà chargés. Aucune
              carte bancaire, aucune configuration.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
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

      {/* ── Colophon ─────────────────────────────────────────────── */}
      <footer className="border-t-4 border-double border-[var(--text)]">
        <div className="mx-auto max-w-6xl px-6 py-8 grid gap-7 sm:grid-cols-3">
          <div>
            <p className="font-serif text-[1.2rem] font-semibold">Vigil</p>
            <p className="muted text-[0.85rem] mt-1.5 leading-relaxed">
              Console de confiance et de sécurité.
            </p>
          </div>
          <div>
            <p className="label">Navigation</p>
            <ul className="mt-2.5 space-y-1.5 text-[0.85rem]">
              <li>
                <Link href="/" className="muted hover:text-[var(--accent)] transition-colors">
                  Accueil
                </Link>
              </li>
              <li>
                <Link href="/login" className="muted hover:text-[var(--accent)] transition-colors">
                  Connexion
                </Link>
              </li>
              <li>
                <Link href="/register" className="muted hover:text-[var(--accent)] transition-colors">
                  Ouvrir une console
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="label">Compte de démonstration</p>
            <p className="mono faint text-[0.78rem] mt-2.5 leading-relaxed">
              demo@vigil.app
              <br />
              vigil-demo-2026
            </p>
          </div>
        </div>
        <div className="border-t border-[var(--border)]">
          <div className="mx-auto max-w-6xl px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
            <span className="faint text-[0.78rem]">
              Vigil — console de confiance et de sécurité.
            </span>
            <span className="faint text-[0.78rem] mono">
              Next.js · TypeScript · PostgreSQL · Vitest
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
