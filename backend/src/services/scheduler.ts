import { zonedToUtc } from './timezone';

export interface BusyBlock {
  fieldId?: string;
  teams: string[];
  start: Date;
  end: Date;
}

export interface PlannableMatch {
  id: string;
  round: number;
  teams: [string, string];
  day: string;
}

export interface PlanInput {
  matches: readonly PlannableMatch[];
  fieldIds: readonly string[];
  slotTimes: readonly string[];
  durationMinutes: number;
  timeZone: string;
  busy: readonly BusyBlock[];
}

export interface Assignment {
  matchId: string;
  fieldId: string;
  start: Date;
}

export interface PlanResult {
  assignments: Assignment[];
  unscheduled: string[];
}

export const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean =>
  aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();

export function planSchedule(input: PlanInput): PlanResult {
  const busy: BusyBlock[] = [...input.busy];
  const times = [...new Set(input.slotTimes)].sort();
  const assignments: Assignment[] = [];
  const unscheduled: string[] = [];

  for (const match of [...input.matches].sort((a, b) => a.round - b.round)) {
    let placed = false;

    search: for (const time of times) {
      const start = zonedToUtc(match.day, time, input.timeZone);
      const end = new Date(start.getTime() + input.durationMinutes * 60_000);

      for (const fieldId of input.fieldIds) {
        const clash = busy.some(
          (block) =>
            overlaps(start, end, block.start, block.end) &&
            (block.fieldId === fieldId || block.teams.some((team) => match.teams.includes(team))),
        );
        if (clash) continue;

        assignments.push({ matchId: match.id, fieldId, start });
        busy.push({ fieldId, teams: match.teams, start, end });
        placed = true;
        break search;
      }
    }

    if (!placed) unscheduled.push(match.id);
  }

  return { assignments, unscheduled };
}
