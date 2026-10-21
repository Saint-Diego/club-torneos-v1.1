import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildRounds } from '../../src/services/berger';

const teamsOf = (count: number): string[] => Array.from({ length: count }, (_, index) => `T${index + 1}`);
const unordered = (a: string, b: string): string => [a, b].sort().join('|');

describe('buildRounds (rotación de Berger)', () => {
  for (const count of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 16, 17, 20]) {
    const odd = count % 2 === 1;
    const teams = teamsOf(count);

    describe(`${count} equipos`, () => {
      it('solo ida: jornadas, partidos y cruces únicos', () => {
        const rounds = buildRounds(teams, false);
        assert.equal(rounds.length, odd ? count : count - 1);

        const seen = new Map<string, number>();
        for (const round of rounds) {
          const playing = new Set<string>();
          assert.equal(round.pairings.length, Math.floor(count / 2));
          for (const { home, away } of round.pairings) {
            assert.notEqual(home, away);
            assert.ok(!playing.has(home) && !playing.has(away), `equipo repetido en la jornada ${round.number}`);
            playing.add(home).add(away);
            const key = unordered(home, away);
            seen.set(key, (seen.get(key) ?? 0) + 1);
          }
        }
        assert.equal(seen.size, (count * (count - 1)) / 2);
        assert.ok([...seen.values()].every((times) => times === 1));
      });

      it(odd ? 'un equipo libre por jornada, y todos descansan exactamente una vez' : 'sin equipos libres', () => {
        const rounds = buildRounds(teams, false);
        if (!odd) {
          assert.ok(rounds.every((round) => round.bye === null));
          return;
        }
        const byes = rounds.map((round) => round.bye);
        assert.ok(byes.every((bye): bye is string => bye !== null));
        assert.equal(new Set(byes).size, count);
        for (const round of rounds) {
          const playing = round.pairings.flatMap(({ home, away }) => [home, away]);
          assert.ok(!playing.includes(round.bye as string));
        }
      });

      it('ida y vuelta: duplica jornadas e invierte la localía', () => {
        const rounds = buildRounds(teams, true);
        const single = buildRounds(teams, false);
        assert.equal(rounds.length, single.length * 2);
        assert.deepEqual(rounds.map((round) => round.number), rounds.map((_, index) => index + 1));

        const directed = new Set<string>();
        for (const { pairings } of rounds) for (const { home, away } of pairings) directed.add(`${home}>${away}`);
        assert.equal(directed.size, count * (count - 1));

        single.forEach((leg1, index) => {
          const leg2 = rounds[single.length + index];
          assert.deepEqual(
            leg2.pairings,
            leg1.pairings.map(({ home, away }) => ({ home: away, away: home })),
          );
          assert.equal(leg2.bye, leg1.bye);
        });
      });
    });
  }

  it('el equipo fijo alterna localía entre jornadas', () => {
    const rounds = buildRounds(teamsOf(6), false);
    const fixedAtHome = rounds.map((round) => round.pairings.some(({ home }) => home === 'T1'));
    assert.deepEqual(fixedAtHome.slice(0, 4), [true, false, true, false]);
  });

  it('es determinista y no muta la lista de entrada', () => {
    const input = teamsOf(7);
    const snapshot = [...input];
    assert.deepEqual(buildRounds(input, true), buildRounds(input, true));
    assert.deepEqual(input, snapshot);
  });

  it('rechaza menos de 2 equipos y equipos duplicados', () => {
    assert.throws(() => buildRounds([], false), RangeError);
    assert.throws(() => buildRounds(['A'], false), RangeError);
    assert.throws(() => buildRounds(['A', 'B', 'A'], false), /duplicados/);
  });
});
