import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Types } from 'mongoose';
import { computeStatLine, emptyLine } from '../../src/services/statline';

class FakeId {
  readonly value: string;
  constructor(value: string) {
    this.value = value;
  }
  equals(other: unknown): boolean {
    return other instanceof FakeId ? other.value === this.value : other === this.value;
  }
}

const id = (value: string): Types.ObjectId => new FakeId(value) as unknown as Types.ObjectId;
const game = (local: string, visitor: string, goalsLocal: number, goalsVisitor: number) => ({
  localTeam: id(local),
  visitorTeam: id(visitor),
  goalsLocal,
  goalsVisitor,
});

const STANDARD = { win: 3, draw: 1, loss: 0 };

describe('computeStatLine', () => {
  it('sin partidos devuelve ceros', () => {
    assert.deepEqual(computeStatLine('A', [], STANDARD), emptyLine());
  });

  it('acumula victorias, empates y derrotas con goles a favor y en contra', () => {
    const matches = [game('A', 'B', 2, 1), game('C', 'A', 1, 1), game('A', 'D', 0, 3)];
    assert.deepEqual(computeStatLine('A', matches, STANDARD), {
      played: 3,
      won: 1,
      drawn: 1,
      lost: 1,
      goalsFor: 3,
      goalsAgainst: 5,
      goalDifference: -2,
      points: 4,
    });
  });

  it('calcula desde la perspectiva de visitante', () => {
    const line = computeStatLine('B', [game('A', 'B', 0, 2)], STANDARD);
    assert.equal(line.won, 1);
    assert.equal(line.goalsFor, 2);
    assert.equal(line.goalsAgainst, 0);
    assert.equal(line.points, 3);
  });

  it('ignora los partidos en los que el equipo no participa', () => {
    assert.equal(computeStatLine('Z', [game('A', 'B', 5, 0)], STANDARD).played, 0);
  });

  it('aplica reglas de puntuación personalizadas', () => {
    const matches = [game('A', 'B', 1, 0), game('A', 'C', 0, 0), game('D', 'A', 2, 0)];
    assert.equal(computeStatLine('A', matches, { win: 2, draw: 1, loss: 0 }).points, 3);
    assert.equal(computeStatLine('A', matches, { win: 3, draw: 1, loss: -1 }).points, 3);
  });

  it('acepta el identificador como cadena', () => {
    assert.equal(computeStatLine('A', [game('A', 'B', 1, 0)], STANDARD).won, 1);
  });
});
