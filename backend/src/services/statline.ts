import type { Types } from 'mongoose';
import type { ScoringRules, StatLine } from '../types/domain';

export interface ScoredMatch {
  localTeam: Types.ObjectId;
  visitorTeam: Types.ObjectId;
  goalsLocal: number;
  goalsVisitor: number;
}

export const emptyLine = (): StatLine => ({
  played: 0,
  won: 0,
  drawn: 0,
  lost: 0,
  goalsFor: 0,
  goalsAgainst: 0,
  goalDifference: 0,
  points: 0,
});

export function computeStatLine(
  teamId: Types.ObjectId | string,
  matches: readonly ScoredMatch[],
  scoring: ScoringRules,
): StatLine {
  const line = emptyLine();

  for (const match of matches) {
    const isLocal = match.localTeam.equals(teamId);
    if (!isLocal && !match.visitorTeam.equals(teamId)) continue;

    const goalsFor = isLocal ? match.goalsLocal : match.goalsVisitor;
    const goalsAgainst = isLocal ? match.goalsVisitor : match.goalsLocal;

    line.played += 1;
    line.goalsFor += goalsFor;
    line.goalsAgainst += goalsAgainst;

    if (goalsFor > goalsAgainst) {
      line.won += 1;
      line.points += scoring.win;
    } else if (goalsFor === goalsAgainst) {
      line.drawn += 1;
      line.points += scoring.draw;
    } else {
      line.lost += 1;
      line.points += scoring.loss;
    }
  }

  line.goalDifference = line.goalsFor - line.goalsAgainst;
  return line;
}
