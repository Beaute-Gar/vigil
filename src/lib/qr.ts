import qrcode from 'qrcode-generator';

/**
 * QR brut (Baileys) → SVG scannable.
 *
 * Le bot pousse une **chaîne**, pas une image : sans cet encodage la
 * console n'affichait qu'un bloc de texte impossible à scanner avec un
 * téléphone — « QR de connexion » devenait un mensonge.
 *
 * - fond blanc + marge de silence de 4 modules (quiet zone imposée par
 *   la norme QR, `margin = 4 × cellSize`) ;
 * - `scalable` : pas de largeur figée, le CSS du composant pilote la
 *   taille finale ;
 * - `null` si la chaîne dépasse la capacité d'un QR (2953 octets) ou si
 *   l'entrée est illisible — le panneau retombe sur le texte brut.
 *   Jamais d'exception : la console ne doit pas planter pour un QR.
 *
 * Testé de bout en bout dans `tests/qr.test.ts`.
 */
export function qrSvg(value: string, cellSize = 8, margin = 32): string | null {
  try {
    const qr = qrcode(0, 'M'); // 0 = version automatique
    qr.addData(value);
    qr.make();
    return qr.createSvgTag({ cellSize, margin, scalable: true });
  } catch {
    return null;
  }
}
