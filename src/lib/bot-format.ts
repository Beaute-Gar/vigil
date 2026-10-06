/**
 * Formatage du pont WhatsApp — pur et sans dépendance.
 *
 * Le même module sert au composant serveur (page) et au composant
 * client (panneau) : aucune importation de Drizzle ni de Zod, donc rien
 * qui alourdisse le bundle navigateur.
 */

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * Uptime → `hh:mm:ss`. Les heures ne sont pas plafonnées à 24 : un bot
 * qui tourne depuis trois jours affiche 72:00:00, pas « 00:00:00 ».
 */
export function formatUptime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Âge d'un signalement → « à l'instant », « il y a 12 s », « il y a 4 min ».
 * La première minute est détaillée : c'est précisément là que se joue
 * la bascule online/offline à 30 s.
 */
export function formatLastSeen(elapsedMs: number): string {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return '—';
  const seconds = Math.floor(elapsedMs / 1000);
  if (seconds < 5) return "à l'instant";
  if (seconds < 60) return `il y a ${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h ${minutes % 60} min`;
  return `il y a ${Math.floor(hours / 24)} j`;
}

/** Horodatage d'une ligne de log (ms) → `HH:MM:SS` local. */
export function formatLogTime(t: number): string {
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return '--:--:--';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
