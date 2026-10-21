import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isCurrent, sortByTier } from '../../src/services/sponsor.rules';

const now = new Date('2026-10-19T12:00:00Z');

describe('isCurrent', () => {
  it('sin fechas el contrato siempre está vigente', () => {
    assert.equal(isCurrent({}, now), true);
    assert.equal(isCurrent({ startDate: null, endDate: null }, now), true);
  });

  it('respeta inicio y fin (bordes inclusivos)', () => {
    assert.equal(isCurrent({ startDate: new Date('2026-10-20T00:00:00Z') }, now), false);
    assert.equal(isCurrent({ endDate: new Date('2026-10-18T23:59:59Z') }, now), false);
    assert.equal(isCurrent({ startDate: now, endDate: now }, now), true);
    assert.equal(isCurrent({ startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31') }, now), true);
  });
});

describe('sortByTier', () => {
  it('ordena por categoría y luego por nombre sin mutar la entrada', () => {
    const input = [
      { name: 'Zeta', tier: 'Bronce' as const },
      { name: 'Beta', tier: 'Oro' as const },
      { name: 'Alfa', tier: 'Oro' as const },
      { name: 'Delta', tier: 'Plata' as const },
      { name: 'Omega', tier: 'Principal' as const },
    ];
    const snapshot = input.map((item) => item.name);
    assert.deepEqual(
      sortByTier(input).map((item) => item.name),
      ['Omega', 'Alfa', 'Beta', 'Delta', 'Zeta'],
    );
    assert.deepEqual(input.map((item) => item.name), snapshot);
  });
});
