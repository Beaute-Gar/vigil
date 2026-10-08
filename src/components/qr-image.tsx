'use client';

import { useMemo } from 'react';
import { qrSvg } from '@/lib/qr';

/**
 * QR de connexion **scannable** dans la console.
 *
 * La chaîne brute devient un SVG blanc sur cadre (contraste requis pour
 * l'appareil photo). Si l'encodage échoue (chaîne trop longue, entrée
 * exotique), on retombe sur le texte d'origine : information conservée,
 * jamais d'écran cassé.
 */
export function QrImage({ value }: { value: string }) {
  const svg = useMemo(() => qrSvg(value), [value]);

  if (!svg) {
    return (
      <pre className="mono max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg)] p-3 text-[0.75rem] leading-relaxed text-[var(--text-muted)]">
        {value}
      </pre>
    );
  }

  return (
    <div
      role="img"
      aria-label="QR de connexion WhatsApp"
      className="h-40 w-40 rounded-[var(--radius-sm)] border border-[var(--border)] bg-white p-2 [&_svg]:h-full [&_svg]:w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
