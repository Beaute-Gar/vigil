/**
 * Route PUBLICQUE `GET /api/bot/public` — la seule que le site statique
 * appelle sans identifiants.
 *
 * On exécute le VRAI handler (NextResponse compris) contre une base
 * simulée, pour vérifier ce qui compte en production :
 *  - CORS ouvert (`*`) puisque la page vit sur un autre domaine Vercel ;
 *  - la réponse ne porte QUE les champs publics, même quand le payload
 *    en base contient journal, pairing et numéro en clair ;
 *  - `no-store` : le QR tourne toutes les ~20 s, aucun cache intermédiaire.
 */
import { describe, expect, it, vi } from 'vitest';
import type { BotNode } from '@/db/schema';

/** Ligne de `bot_nodes` telle que la base la renvoie. */
function nodeRow(overrides: Partial<BotNode> = {}): BotNode {
  return {
    id: 'node-1',
    workspaceId: 'ws-1',
    name: 'DJOUSSE-TECH-MD',
    status: 'online',
    lastSeenAt: new Date(),
    createdAt: new Date(),
    payload: {
      connected: false,
      number: '237652746693',
      qr: '2@QR-VIVANT',
      connectMethod: 'qr',
      pairingCode: 'SECRE-1234',
      pairingFor: '237693978044',
      logs: [{ t: 1, line: 'ligne privée du journal' }],
    },
    ...overrides,
  } as BotNode;
}

/** Nœud contrôlable par test, lu par le handler à chaque appel. */
const current = vi.hoisted(() => ({ node: null as BotNode | null | undefined }));

vi.mock('@/db', () => ({
  getDb: vi.fn(async () => ({ fake: 'db' })),
}));

vi.mock('@/lib/repository', async (orig) => {
  const actual = await orig<typeof import('@/lib/repository')>();
  return {
    ...actual, // botNodeView reste le VRAI : c'est lui qui recalcule offline
    getOrCreateWorkspace: vi.fn(async () => ({ id: 'ws-1' })),
    getBotNode: vi.fn(async () => current.node ?? undefined),
  };
});

import { GET, OPTIONS } from '@/app/api/bot/public/route';

describe('GET /api/bot/public', () => {
  it('QR en attente : CORS ouvert, réponse minimale, aucun privé dedans', async () => {
    current.node = nodeRow();

    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('cache-control')).toContain('no-store');

    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      online: true,
      connected: false,
      qr: '2@QR-VIVANT',
      connectMethod: 'qr',
      numberMasked: null,
      lastSeenAt: current.node?.lastSeenAt?.toISOString() ?? null,
    });
    // rien de privé ne transite
    expect(JSON.stringify(body)).not.toContain('journal privé');
    expect(JSON.stringify(body)).not.toContain('SECRE-1234');
    expect(JSON.stringify(body)).not.toContain('237652746693');
  });

  it('bot muet depuis 30 s : QR et connexion supprimés (offline recalculé)', async () => {
    current.node = nodeRow({ lastSeenAt: new Date(Date.now() - 60_000) });

    const body = await (await GET()).json();
    expect(body.online).toBe(false);
    expect(body.connected).toBe(false);
    expect(body.qr).toBeNull();
    expect(body.numberMasked).toBeNull();
  });

  it('jamais de nœud : réponse neutre 200 (pas une erreur)', async () => {
    current.node = undefined;

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, online: false, qr: null });
  });
});

describe('OPTIONS /api/bot/public', () => {
  it('pré-vol CORS accepté sans authentification', async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-methods')).toContain('GET');
  });
});
