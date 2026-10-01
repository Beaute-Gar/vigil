'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/logo';

type Mode = 'login' | 'register';

type ApiError = {
  error?: string;
  errors?: Record<string, string>;
};

/**
 * Formulaire d'authentification.
 *
 * Gère les trois familles de réponse du serveur :
 *   422 → erreurs par champ        409 → email déjà pris
 *   401 → identifiants incorrects  500 → message générique
 */
export function AuthForm({ mode }: { mode: Mode }) {
  const isRegister = mode === 'register';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setFieldErrors({});
    setFormError(null);

    try {
      const res = await fetch(`/api/auth/${isRegister ? 'register' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isRegister ? { name, email, password } : { email, password }),
      });

      const data = (await res.json().catch(() => ({}))) as ApiError;

      if (!res.ok) {
        if (res.status === 422 && data.errors) {
          setFieldErrors(data.errors);
        } else if (data.errors?.form) {
          setFormError(data.errors.form);
        } else if (data.error) {
          setFormError(data.error);
        } else {
          setFormError('Une erreur est survenue. Réessayez.');
        }
        return;
      }

      // Rechargement complet volontaire : après connexion, la mise en page
      // du tableau de bord doit relire le cookie de session côté serveur.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = '/dashboard';
    } catch {
      setFormError('Connexion impossible. Vérifiez votre réseau.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen grid-bg flex flex-col">
      <header className="relative z-10 border-b border-[var(--border)]">
        <nav className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-[var(--text)] hover:text-[var(--accent)] transition-colors">
            <Logo />
          </Link>
          <Link
            href={isRegister ? '/login' : '/register'}
            className="text-[0.85rem] muted hover:text-[var(--accent)] transition-colors"
          >
            {isRegister ? 'J’ai déjà un compte' : 'Créer un compte'}
          </Link>
        </nav>
      </header>

      <main className="flex-1 flex items-start justify-center px-6 py-12 sm:py-16">
        <div className="w-full max-w-[26rem]">
          <div className="text-center mb-8">
            <h1 className="text-[1.6rem] leading-tight">
              {isRegister ? 'Ouvrir une console' : 'Se connecter'}
            </h1>
            <p className="muted text-[0.9rem] mt-2.5 leading-relaxed">
              {isRegister
                ? 'Votre espace de travail est créé automatiquement.'
                : 'Accédez à vos incidents, appels et au journal d’audit.'}
            </p>
          </div>

          <form onSubmit={onSubmit} className="card card-pad space-y-4" noValidate>
            {isRegister && (
              <div className="field">
                <label className="label" htmlFor="name">
                  Nom affiché
                </label>
                <input
                  id="name"
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  placeholder="Beaute Gar"
                  required
                  minLength={2}
                />
                {fieldErrors.name && <p className="form-error">{fieldErrors.name}</p>}
              </div>
            )}

            <div className="field">
              <label className="label" htmlFor="email">
                Adresse e-mail
              </label>
              <input
                id="email"
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="vous@exemple.ca"
                required
              />
              {fieldErrors.email && <p className="form-error">{fieldErrors.email}</p>}
            </div>

            <div className="field">
              <label className="label" htmlFor="password">
                Mot de passe
              </label>
              <input
                id="password"
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                placeholder={isRegister ? '10 caractères minimum' : '••••••••••'}
                required
                minLength={10}
              />
              {fieldErrors.password && <p className="form-error">{fieldErrors.password}</p>}
              {isRegister && !fieldErrors.password && (
                <p className="faint text-[0.76rem] leading-snug">
                  Scrypt avec sel aléatoire — aucun mot de passe en clair n’atteint la base.
                </p>
              )}
            </div>

            {formError && <p className="form-error" role="alert">{formError}</p>}

            <button type="submit" className="btn btn-primary w-full" disabled={pending}>
              {pending ? 'Patientez…' : isRegister ? 'Créer le compte' : 'Se connecter'}
            </button>
          </form>

          {mode === 'login' && (
            <div className="mt-5 card card-pad">
              <div className="label mono mb-2.5">COMPTE DE DÉMONSTRATION</div>
              <code className="mono block text-[0.82rem] leading-relaxed text-[var(--text-muted)]">
                demo@vigil.app
                <br />
                vigil-demo-2026
              </code>
              <button
                type="button"
                className="btn btn-ghost btn-sm w-full mt-3.5"
                onClick={() => {
                  setEmail('demo@vigil.app');
                  setPassword('vigil-demo-2026');
                  setFormError(null);
                  setFieldErrors({});
                }}
              >
                Pré-remplir le formulaire
              </button>
            </div>
          )}

          <p className="faint text-[0.78rem] text-center mt-6 leading-relaxed">
            {isRegister ? (
              <>
                Déjà enregistré ?{' '}
                <Link href="/login" className="text-[var(--accent)] hover:underline">
                  Se connecter
                </Link>
              </>
            ) : (
              <>
                Pas encore de console ?{' '}
                <Link href="/register" className="text-[var(--accent)] hover:underline">
                  Créer un compte
                </Link>
              </>
            )}
          </p>
        </div>
      </main>
    </div>
  );
}
