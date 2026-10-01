/**
 * Jeu de démonstration — npm run db:seed
 *
 * Les incidents ne sont pas écrits à la main : ils sont produits en
 * faisant passer des messages réels dans le moteur de règles (`detect`).
 * Le tableau de bord montre donc exactement ce que le code fait — et le
 * journal d'audit se remplit tout seul au passage.
 *
 * Idempotent : on repart d'une base propre à chaque exécution.
 */
import { createDb } from '../src/db';
import { appeals, auditLog, incidents, rules, sessions, users, workspaces, workspaceMembers } from '../src/db/schema';
import { detect, resolveIncident, decideAppeal, getOrCreateWorkspace, listAudit } from '../src/lib/repository';
import { hashPassword } from '../src/lib/auth';
import { eq } from 'drizzle-orm';

const SEED_RULES = [
  {
    name: 'Spam commercial',
    description: 'Messages promotionnels et sollicitations commerciales non sollicitées.',
    pattern: '\\b(achetez|promo|solde|gagnez|offre exclusive)\\b',
    severity: 'low' as const,
    action: 'flag' as const,
    priority: 10,
    enabled: true,
  },
  {
    name: 'Liens raccourcis',
    description: 'Les raccourcisseurs masquent la destination réelle : à vérifier à la main.',
    pattern: '(bit\\.ly|tinyurl\\.com|t\\.co|goo\\.gl)/',
    severity: 'medium' as const,
    action: 'warn' as const,
    priority: 20,
    enabled: true,
  },
  {
    name: 'Hors sujet',
    description: 'Conversations détournées du canal principal.',
    pattern: '\\b(hors sujet|off topic)\\b',
    severity: 'low' as const,
    action: 'flag' as const,
    priority: 30,
    // Désactivée volontairement dans la démo : montre que l'état
    // « désactivé » est bien respecté par le moteur.
    enabled: false,
  },
  {
    name: 'Insultes',
    description: 'Attaques directes envers un membre de la communauté.',
    pattern: '\\b(idiot|imbécile|stupide|incompétent)\\b',
    severity: 'high' as const,
    action: 'mute' as const,
    priority: 50,
    enabled: true,
  },
  {
    name: 'Menaces',
    description: 'Menaces envers une personne : retrait immédiat et escalade.',
    pattern: '(je vais vous|je te vais|tu vas le payer)',
    severity: 'critical' as const,
    action: 'remove' as const,
    priority: 90,
    enabled: true,
  },
  {
    name: 'Hameçonnage',
    description: 'Tentatives d\'usurpation d\'identité et d\'accès aux comptes.',
    pattern: '(vérifiez votre compte|identifiants|mot de passe dans ce lien)',
    severity: 'critical' as const,
    action: 'escalate' as const,
    priority: 95,
    enabled: true,
  },
];

const MESSAGES: { subject: string; channel: string; content: string }[] = [
  { subject: '@lucas.dev', channel: '#general', content: 'Bonjour à tous, quelqu\'un a le sujet du cours de demain ?' },
  { subject: '@promo_bot', channel: '#annonces', content: 'ACHETEZ ma formation à -80%, offre exclusive ce soir !' },
  { subject: '@marie.qa', channel: '#general', content: 'Je viens de déployer la recette, tout est vert 🎉' },
  { subject: '@inconnu_42', channel: '#general', content: 'Regardez ça : bit.ly/3xKpZ ça vaut le détour' },
  { subject: '@troll_1', channel: '#general', content: 'Tu es vraiment imbécile, arrête de parler.' },
  { subject: '@samir', channel: '#aide', content: 'Merci beaucoup, j\'avais bloqué sur ce point depuis hier.' },
  { subject: '@arnaque', channel: '#annonces', content: 'Vérifiez votre compte ici, sinon il sera fermé sous 24h.' },
  { subject: '@noemie', channel: '#general', content: 'Quelqu\'un a réussi à faire tourner le script de build ?' },
  { subject: '@menace_7', channel: '#general', content: 'Je vais vous trouver, tu sais bien où j\'habite.' },
  { subject: '@kenza', channel: '#offtopic', content: 'Hors sujet : qui regarde le match ce soir ?' },
  { subject: '@vente_rapide', channel: '#annonces', content: 'Gagnez 5000€ par semaine sans rien faire, contactez moi.' },
  { subject: '@thomas', channel: '#aide', content: 'Solution trouvée : il manquait le bloc `await`.' },
  { subject: '@provocateur', channel: '#general', content: 'C\'est un truc d\'incompétent de le faire comme ça.' },
  { subject: '@phish_net', channel: '#general', content: 'Cliquez vite : mot de passe dans ce lien pour activer votre accès.' },
  { subject: '@amelie', channel: '#general', content: 'N\'oubliez pas de relire le README avant de poser une question 🙂' },
  { subject: '@off_topic_2', channel: '#general', content: 'Discussion complètement hors sujet, pardon !' },
];

async function main(): Promise<void> {
  const db = await createDb();

  console.log('· purge du jeu de démonstration');
  // Ordre : dépendances d'abord (clés étrangères)
  await db.delete(auditLog);
  await db.delete(appeals);
  await db.delete(incidents);
  await db.delete(rules);
  await db.delete(workspaceMembers);
  await db.delete(sessions);
  await db.delete(users);
  await db.delete(workspaces);

  console.log('· utilisateur + espace de travail');
  const passwordHash = await hashPassword('vigil-demo-2026');
  const [user] = await db
    .insert(users)
    .values({ email: 'demo@vigil.app', name: 'Beaute Gar', passwordHash })
    .returning();

  const ws = await getOrCreateWorkspace(db, 'Communauté DJOUSSE');
  await db.insert(workspaceMembers).values({
    workspaceId: ws.id,
    userId: user.id,
    role: 'owner',
  });

  console.log(`· ${SEED_RULES.length} règles`);
  await db.insert(rules).values(
    SEED_RULES.map((r) => ({ ...r, workspaceId: ws.id })),
  );

  console.log(`· ${MESSAGES.length} messages passés dans le moteur`);
  let created = 0;
  for (const m of MESSAGES) {
    const out = await detect(db, { workspaceId: ws.id, ...m });
    if (out.created) created += 1;
  }
  console.log(`  → ${created} incidents détectés`);

  // Décisions humaines : on tranche une partie des incidents ouverts
  const openIncidents = await db
    .select()
    .from(incidents)
    .where(eq(incidents.status, 'open'));

  const decisions: { at: number; to: 'dismissed' | 'confirmed'; note: string }[] = [
    { at: 1, to: 'dismissed', note: 'Message publicitaire accepté par la communauté (fil annonces).' },
    { at: 3, to: 'dismissed', note: 'Lien vérifié manuellement : destination légitime.' },
    { at: 5, to: 'confirmed', note: ' insulte envers un membre, sanction appliquée' },
    { at:8, to: 'confirmed', note: 'Menace explicite, compte retiré du canal.' },
  ];

  for (const d of decisions) {
    const target = openIncidents[d.at];
    if (!target) continue;
    await resolveIncident(db, {
      incidentId: target.id,
      to: d.to,
      actorId: user.id,
      note: d.note.trim(),
    });
  }

  console.log('· appels');
  const dismissed = await db
    .select()
    .from(incidents)
    .where(eq(incidents.status, 'dismissed'));

  if (dismissed[0]) {
    const [appeal] = await db
      .insert(appeals)
      .values({
        incidentId: dismissed[0].id,
        author: dismissed[0].subject,
        reason: 'C\'était une annonce autorisée dans ce canal, je confirme.',
      })
      .returning();
    await decideAppeal(db, {
      appealId: appeal.id,
      to: 'granted',
      actorId: user.id,
      note: 'Règle « Spam commercial » à adoucir sur #annonces.',
    });
  }

  const audit = await listAudit(db, ws.id, 500);
  const byEvent = audit.reduce<Record<string, number>>((acc, a) => {
    acc[a.event] = (acc[a.event] ?? 0) + 1;
    return acc;
  }, {});

  console.log('');
  console.log('✔ seed terminé');
  console.log(`  incidents : ${created}`);
  console.log(`  audit     : ${audit.length} entrées`, byEvent);
  console.log('');
  console.log('  connexion : demo@vigil.app / vigil-demo-2026');

  await close(db);
}

async function close(db: { $client?: { close?: () => Promise<void> } }): Promise<void> {
  await db.$client?.close?.();
}

main().catch((err) => {
  console.error('✖ échec du seed', err);
  process.exitCode = 1;
});
