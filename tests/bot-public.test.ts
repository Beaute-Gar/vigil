/**
 * État PUBLIC du pont — ce que la page « Connecter mon WhatsApp » voit.
 *
 * Deux garanties vérifiées ici, parce qu'une fuite sur une route sans
 * authentification ne se rattrape pas :
 *  1. la sortie ne contient QUE les six champs prévus (jamais logs,
 *     pairingCode, numéro en clair, commandes) ;
 *  2. un bot muet depuis 30 s ne présente ni QR ni connexion — un QR
 *     dont le bot est mort ne se scanne plus.
 */
import { describe, expect, it } from 'vitest';
import { maskNumber, publicBotState } from '@/lib/bot';

const FRESH = new Date(); // à l'intérieur de la fenêtre des 30 s

const FAT_PAYLOAD = {
  connected: true,
  number: '237652746693',
  uptimeMs: 123456,
  version: '4.0.0',
  prefix: '.',
  commands: 309,
  groups: 12,
  engine: 'sqlite',
  connectMethod: 'qr' as const,
  qr: '2@TAILLE-ET-CONTENU-DU-QR',
  pairingCode: 'SECRE-1234',
  pairingFor: '237693978044',
  logs: [{ t: 1, line: 'journal privé qui ne doit jamais sortir' }],
};

describe('publicBotState', () => {
  it('ne expose que les sept champs prévus, jamais le journal ni le pairing', () => {
    const state = publicBotState('online', FRESH, FAT_PAYLOAD);

    expect(Object.keys(state).sort()).toEqual([
      'connectMethod',
      'connected',
      'lastSeenAt',
      'numberMasked',
      'online',
      'qr',
    ]);
    // les données sensibles du payload ne traversent pas le filtre
    const serialized = JSON.stringify(state);
    expect(serialized).not.toContain('journal privé');
    expect(serialized).not.toContain('SECRE-1234');
    expect(serialized).not.toContain('237652746693'); // numéro en clair
    expect(serialized).not.toContain('237693978044'); // numéro visé par le pairing
    expect(serialized).not.toContain('uptimeMs');
  });

  it('bot en ligne, QR en attente : le QR sort tel quel', () => {
    const state = publicBotState('online', FRESH, {
      ...FAT_PAYLOAD,
      connected: false,
      qr: '2@QR-DE-SCAN',
    });

    expect(state).toEqual({
      online: true,
      connected: false,
      qr: '2@QR-DE-SCAN',
      connectMethod: 'qr',
      numberMasked: null,
      lastSeenAt: FRESH.toISOString(),
    });
  });

  it('bot connecté : numéro masqué, jamais en clair', () => {
    const state = publicBotState('online', FRESH, FAT_PAYLOAD);

    expect(state.connected).toBe(true);
    expect(state.numberMasked).toBe('+237 6••••••93');
    expect(state.online).toBe(true);
  });

  it('bot muet depuis 30 s : ni QR ni connexion annoncés, même si le payload dit le contraire', () => {
    const stale = new Date(Date.now() - 60_000);
    const state = publicBotState('offline', stale, FAT_PAYLOAD);

    expect(state.online).toBe(false);
    expect(state.connected).toBe(false);
    expect(state.qr).toBeNull();
    expect(state.connectMethod).toBeNull();
    expect(state.numberMasked).toBeNull();
    expect(state.lastSeenAt).toBe(stale.toISOString());
  });

  it('aucun nœud jamais vu : état neutre, lastSeenAt null', () => {
    expect(publicBotState('offline', null, null)).toEqual({
      online: false,
      connected: false,
      qr: null,
      connectMethod: null,
      numberMasked: null,
      lastSeenAt: null,
    });
  });
});

describe('maskNumber', () => {
  it('garde indicatif, premier chiffre et dernière paire', () => {
    expect(maskNumber('237652746693')).toBe('+237 6••••••93');
    expect(maskNumber('+237 6527 466 93')).toBe('+237 6••••••93');
  });

  it('refuse ce qui est trop court pour être masqué proprement', () => {
    expect(maskNumber('12345')).toBeNull();
    expect(maskNumber(null)).toBeNull();
    expect(maskNumber(undefined)).toBeNull();
    expect(maskNumber('')).toBeNull();
  });
});
