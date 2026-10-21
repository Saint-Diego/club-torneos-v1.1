import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  firstRoundPairings,
  isPowerOfTwo,
  nextRoundPairings,
  roundLabel,
  seedOrder,
  winnerOf,
} from '../../src/services/bracket';

describe('isPowerOfTwo', () => {
  it('acepta solo potencias de 2 desde 2', () => {
    assert.deepEqual(
      [0, 1, 2, 3, 4, 6, 8, 12, 16, 2.5].map(isPowerOfTwo),
      [false, false, true, false, true, false, true, false, true, false],
    );
  });
});

describe('seedOrder', () => {
  it('produce el orden de siembra clásico', () => {
    assert.deepEqual(seedOrder(2), [1, 2]);
    assert.deepEqual(seedOrder(4), [1, 4, 2, 3]);
    assert.deepEqual(seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  });

  for (const size of [2, 4, 8, 16, 32]) {
    it(`${size}: cada cruce suma ${size + 1} y es una permutación`, () => {
      const order = seedOrder(size);
      assert.deepEqual([...order].sort((a, b) => a - b), Array.from({ length: size }, (_, i) => i + 1));
      for (let i = 0; i < size; i += 2) assert.equal(order[i] + order[i + 1], size + 1);
    });
  }

  it('los sembrados 1 y 2 quedan en mitades opuestas del cuadro', () => {
    for (const size of [4, 8, 16, 32]) {
      const order = seedOrder(size);
      assert.equal(order.indexOf(1) < size / 2, true);
      assert.equal(order.indexOf(2) >= size / 2, true);
    }
  });

  it('rechaza tamaños que no son potencia de 2', () => {
    for (const size of [0, 1, 3, 6, 12]) assert.throws(() => seedOrder(size), RangeError);
  });
});

describe('cruces', () => {
  it('primera ronda: mejor sembrado como local contra el peor', () => {
    assert.deepEqual(firstRoundPairings(['A', 'B', 'C', 'D']), [
      { home: 'A', away: 'D' },
      { home: 'B', away: 'C' },
    ]);
  });

  it('siguiente ronda: empareja ganadores adyacentes', () => {
    assert.deepEqual(nextRoundPairings(['A', 'B', 'C', 'D']), [
      { home: 'A', away: 'B' },
      { home: 'C', away: 'D' },
    ]);
    assert.throws(() => nextRoundPairings(['A']), RangeError);
    assert.throws(() => nextRoundPairings(['A', 'B', 'C']), RangeError);
  });

  it('un cuadro de 8 se resuelve en 4 + 2 + 1 partidos', () => {
    let round = firstRoundPairings(['1', '2', '3', '4', '5', '6', '7', '8']);
    const sizes: number[] = [];
    for (;;) {
      sizes.push(round.length);
      if (round.length === 1) break;
      round = nextRoundPairings(round.map((pairing) => pairing.home));
    }
    assert.deepEqual(sizes, [4, 2, 1]);
  });
});

describe('winnerOf', () => {
  const base = { localTeam: 'L', visitorTeam: 'V', goalsLocal: 1, goalsVisitor: 1 };

  it('gana quien anota más goles', () => {
    assert.equal(winnerOf({ ...base, goalsLocal: 2 }), 'L');
    assert.equal(winnerOf({ ...base, goalsVisitor: 3 }), 'V');
  });

  it('ignora los penales si no hubo empate', () => {
    assert.equal(winnerOf({ ...base, goalsLocal: 2, penalties: { local: 0, visitor: 5 } }), 'L');
  });

  it('el empate se decide por penales', () => {
    assert.equal(winnerOf({ ...base, penalties: { local: 4, visitor: 3 } }), 'L');
    assert.equal(winnerOf({ ...base, penalties: { local: 3, visitor: 5 } }), 'V');
  });

  it('empate sin penales válidos no tiene ganador', () => {
    assert.equal(winnerOf(base), null);
    assert.equal(winnerOf({ ...base, penalties: null }), null);
    assert.equal(winnerOf({ ...base, penalties: {} }), null);
    assert.equal(winnerOf({ ...base, penalties: { local: 3 } }), null);
    assert.equal(winnerOf({ ...base, penalties: { local: 3, visitor: 3 } }), null);
  });
});

describe('roundLabel', () => {
  it('nombra las rondas según la cantidad de partidos', () => {
    assert.deepEqual(
      [1, 2, 4, 8, 16].map(roundLabel),
      ['Final', 'Semifinales', 'Cuartos de final', 'Octavos de final', 'Ronda de 32'],
    );
  });
});
