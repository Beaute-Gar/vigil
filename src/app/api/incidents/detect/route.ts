import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { getOrCreateWorkspace, detect } from '@/lib/repository';
import { getCurrentUser } from '@/lib/session';

export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';

const MAX_CONTENT = 2000;

/**
 * Fait passer un message dans le moteur de règles.
 *
 * C'est l'endpoint que l'UI « Simuler un message » appelle : il montre
 * le verdict complet (règle décisionnaire, sévérité, action, règles
 * cassées éventuelles) avant même de créer l'incident.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }

  const { content, subject, channel } = (body ?? {}) as Record<string, unknown>;

  const rawContent = typeof content === 'string' ? content.trim() : '';
  const rawSubject = typeof subject === 'string' && subject.trim() ? subject.trim() : '@anonyme';
  const rawChannel = typeof channel === 'string' && channel.trim() ? channel.trim() : '#general';

  if (!rawContent) {
    return NextResponse.json(
      { errors: { content: 'Le message ne peut pas être vide.' } },
      { status: 422 },
    );
  }
  if (rawContent.length > MAX_CONTENT) {
    return NextResponse.json(
      { errors: { content: `Message trop long (max ${MAX_CONTENT} caractères).` } },
      { status: 422 },
    );
  }

  const db = await getDb();
  const workspace = await getOrCreateWorkspace(db);

  const result = await detect(db, {
    workspaceId: workspace.id,
    subject: rawSubject,
    channel: rawChannel,
    content: rawContent,
  });

  if (result.clean) {
    return NextResponse.json({
      clean: true,
      incident: null,
      rule: null,
      severity: null,
      action: null,
      invalidRules: result.invalidRules,
    });
  }

  return NextResponse.json({
    clean: false,
    incident: result.created,
    // Récupérables depuis `incident`, mais remontés tels quels : un appelant
    // machine (le bot) n'a pas à reconstruire le verdict depuis la ligne.
    rule: result.decidedBy,
    severity: result.created?.severity ?? null,
    action: result.created?.actionTaken ?? null,
    matchedRuleIds: result.matchedRuleIds,
    invalidRules: result.invalidRules,
  });
}
