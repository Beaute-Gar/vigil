'use client';

import { useState } from 'react';

/** Déconnexion : on appelle l'API puis on recharge entièrement la page. */
export function LogoutButton() {
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      // Rechargement complet : le garde de session doit voir le cookie retiré.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = '/login';
    }
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={pending}
      className="btn btn-ghost btn-sm w-full"
    >
      {pending ? 'Déconnexion…' : 'Se déconnecter'}
    </button>
  );
}
