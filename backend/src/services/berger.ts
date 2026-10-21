export interface Pairing {
  home: string;
  away: string;
}

export interface Round {
  number: number;
  pairings: Pairing[];
  bye: string | null;
}

export function buildRounds(teams: readonly string[], doubleLeg: boolean): Round[] {
  if (teams.length < 2) throw new RangeError('Se requieren al menos 2 equipos');
  if (new Set(teams).size !== teams.length) throw new RangeError('La lista contiene equipos duplicados');

  const slots: (string | null)[] = [...teams];
  if (slots.length % 2 !== 0) slots.push(null);

  const size = slots.length;
  const roundCount = size - 1;
  const half = size / 2;
  const firstLeg: Round[] = [];

  for (let r = 0; r < roundCount; r++) {
    const pairings: Pairing[] = [];
    let bye: string | null = null;

    for (let i = 0; i < half; i++) {
      const a = slots[i];
      const b = slots[size - 1 - i];

      if (a === null || b === null) {
        bye = a ?? b;
        continue;
      }

      const swap = i === 0 && r % 2 === 1;
      pairings.push(swap ? { home: b, away: a } : { home: a, away: b });
    }

    firstLeg.push({ number: r + 1, pairings, bye });
    slots.splice(1, 0, slots.pop() ?? null);
  }

  if (!doubleLeg) return firstLeg;

  const secondLeg = firstLeg.map<Round>((round) => ({
    number: round.number + roundCount,
    pairings: round.pairings.map(({ home, away }) => ({ home: away, away: home })),
    bye: round.bye,
  }));

  return [...firstLeg, ...secondLeg];
}
