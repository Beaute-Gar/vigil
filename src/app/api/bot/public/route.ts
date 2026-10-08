import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { publicBotState } from '@/lib/bot';
import { botNodeView, getBotNode, getOrCreateWorkspace } from '@/lib/repository';

export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';

/**
 * État PUBLIC du pont — destiné à la page « Connecter mon WhatsApp »
 * du site DJOUSSE TECH MD (site statique sur un autre domaine).
 *
 * Lecture SANS authentification, mais strictement minimale : la page
 * n'a besoin que de savoir si le bot est en ligne et, pendant une
 * attente de scan, du QR lui-même. Journal, numéro en clair, commandes
 * et code d'appairage ne quittent jamais l'API authentifiée
 * (`/api/bot/state`) — le filtrage est `publicBotState`, couvert par
 * `tests/bot-public.test.ts`.
 *
 * CORS ouvert (`*`) : aucun cookie, aucune donnée personnelle, rien à
 * distinguer selon l'origine — et la page est statique côté Vercel.
 * `no-store` : le QR tourne toutes les ~20 s, jamais de cache intermédiaire.
 */
const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store, max-age=0',
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(): Promise<NextResponse> {
  const db = await getDb();
  const workspace = await getOrCreateWorkspace(db);
  const node = await getBotNode(db, workspace.id);
  const view = botNodeView(node);

  const state = publicBotState(
    view?.status ?? 'offline',
    view?.lastSeenAt ?? null,
    view?.payload ?? null,
  );

  return NextResponse.json({ ok: true, ...state }, { headers: CORS });
}
