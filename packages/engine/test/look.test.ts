import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK, LOOK_PRESETS, lockedChoices, sanitizeLook, unlockedItemNames } from '../src/look';

describe('visual do corredor', () => {
  it('limpa valores inválidos e mantém os válidos', () => {
    expect(sanitizeLook(null)).toEqual(DEFAULT_LOOK);
    const l = sanitizeLook({ hair: 'rabo', pattern: 'nao-existe', outfit: '#19c3b1', skin: '#123456', extra: 1 });
    expect(l.hair).toBe('rabo');
    expect(l.pattern).toBe(DEFAULT_LOOK.pattern);
    expect(l.outfit).toBe('#19C3B1');
    expect(l.skin).toBe(DEFAULT_LOOK.skin);
    expect(l).not.toHaveProperty('extra');
  });

  it('itens bloqueados dependem de nível e medalha', () => {
    const relampago = LOOK_PRESETS.find((p) => p.id === 'relampago')!.look;
    const names = (lvl: number, medals: string[]) => lockedChoices(relampago, { level: lvl, medals }).map((c) => c.option.name);
    expect(names(4, [])).toEqual(['Viseira', 'Hexágonos', 'Raio', 'Fogos']);
    expect(names(5, [])).toEqual(['Raio']);
    expect(names(5, ['thief'])).toEqual([]);
    expect(unlockedItemNames({ level: 1, medals: [] })).toEqual([]);
    expect(unlockedItemNames({ level: 5, medals: ['thief'] })).toContain('Hexágonos');
  });

  it('a cópia do app é igual à do engine', () => {
    const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
    expect(readFileSync(here('../../../apps/mobile/src/lib/look.ts'), 'utf8')).toBe(readFileSync(here('../src/look.ts'), 'utf8'));
  });
});
