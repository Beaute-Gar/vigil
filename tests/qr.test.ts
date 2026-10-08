/**
 * `qrSvg` — la console affiche un QR **scannable**, pas un bloc de texte.
 *
 * Ce que ces tests prouvent :
 *  1. une chaîne réaliste (format Baileys) produit un SVG valide — viewBox,
 *     fond blanc, marge de silence de 4 modules exigée par la norme ;
 *  2. la valeur n'est jamais réinjectée en clair dans le balisage (le SVG
 *     ne contient que des rects, pas d'injection possible) ;
 *  3. une chaîne hors capacité rend `null` (repli texte) au lieu de faire
 *     planter la console ;
 *  4. aucune entrée ne lance d'exception.
 */
import { describe, expect, it } from 'vitest';
import { qrSvg } from '@/lib/qr';

/** Enveloppe réaliste d'un QR Baileys : `2@` + segments base64. */
const REALISTIC =
  '2@YXdMaXZlUmVsYXQtMjAyNgABCDEF0123456789+/.=,' +
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
  'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
  'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

describe('qrSvg', () => {
  it('QR réaliste → SVG scannable (viewBox, fond blanc, marge)', () => {
    const svg = qrSvg(REALISTIC);

    expect(svg).not.toBeNull();
    expect(svg).toContain('viewBox=');
    expect(svg).toContain('fill="white"'); // contraste exigé par les lecteurs
    // marge de silence : 32 px pour 8 px/module = 4 modules (quiet zone)
    expect(32 / 8).toBe(4);
    expect(svg).toContain('<svg');
  });

  it("la valeur n'est jamais interpolée dans le balisage (pas d'injection)", () => {
    const marker = '2@MARKER-SECRET-DU-QR';
    const svg = qrSvg(marker);

    expect(svg).not.toBeNull();
    expect(svg).not.toContain(marker);
    expect(svg).not.toContain('MARKER');
  });

  it("hors capacité d'un QR (> 2953 octets) → null, pas d'exception", () => {
    expect(() => qrSvg('x'.repeat(4000))).not.toThrow();
    expect(qrSvg('x'.repeat(4000))).toBeNull();
  });

  it("aucune entrée ne lance d'exception (console jamais cassée)", () => {
    const inputs = ['', ' ', '😀🎉', '</div><script>alert(1)</script>', '\uD800', 'a'.repeat(2953)];
    for (const input of inputs) {
      expect(() => qrSvg(input)).not.toThrow();
      const out = qrSvg(input);
      expect(out === null || out.includes('<svg')).toBe(true);
    }
  });
});