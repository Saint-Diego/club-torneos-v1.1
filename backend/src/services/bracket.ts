export interface Pairing {
  home: string;
  away: string;
}

export interface Penalties {
  local: number;
  visitor: number;
}

export interface DecidedMatch {
  localTeam: string;
  visitorTeam: string;
  goalsLocal: number;
  goalsVisitor: number;
  penalties?: Partial<Penalties> | null;
}

export const isPowerOfTwo = (value: number): boolean =>
  Number.isInteger(value) && value >= 2 && (value & (value - 1)) === 0;

export function seedOrder(size: number): number[] {
  if (!isPowerOfTwo(size)) throw new RangeError('El tamaño del cuadro debe ser una potencia de 2');

  let order = [1, 2];
  while (order.length < size) {
    const total = order.length * 2;
    order = order.flatMap((seed) => [seed, total + 1 - seed]);
  }
  return order;
}

export function firstRoundPairings(seeds: readonly string[]): Pairing[] {
  const order = seedOrder(seeds.length);
  const pairings: Pairing[] = [];
  for (let i = 0; i < order.length; i += 2) {
    pairings.push({ home: seeds[order[i] - 1], away: seeds[order[i + 1] - 1] });
  }
  return pairings;
}

export function nextRoundPairings(winners: readonly string[]): Pairing[] {
  if (winners.length < 2 || winners.length % 2 !== 0) {
    throw new RangeError('Se requiere una cantidad par de ganadores');
  }
  const pairings: Pairing[] = [];
  for (let i = 0; i < winners.length; i += 2) pairings.push({ home: winners[i], away: winners[i + 1] });
  return pairings;
}

export function winnerOf(match: DecidedMatch): string | null {
  if (match.goalsLocal !== match.goalsVisitor) {
    return match.goalsLocal > match.goalsVisitor ? match.localTeam : match.visitorTeam;
  }
  const { local, visitor } = match.penalties ?? {};
  if (local === undefined || visitor === undefined || local === visitor) return null;
  return local > visitor ? match.localTeam : match.visitorTeam;
}

export function roundLabel(matchCount: number): string {
  switch (matchCount) {
    case 1:
      return 'Final';
    case 2:
      return 'Semifinales';
    case 4:
      return 'Cuartos de final';
    case 8:
      return 'Octavos de final';
    default:
      return `Ronda de ${matchCount * 2}`;
  }
}
