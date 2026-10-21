import { MapPin, Pencil } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatMatchDate, venueLabel } from '../../lib/format';
import type { Match } from '../../types';
import { Empty } from '../common/StateMessage';
import { StatusBadge } from '../common/StatusBadge';
import { TeamBadge } from '../common/TeamBadge';

const defaultRound = (matches: readonly Match[], rounds: readonly number[]): number =>
  matches.find((match) => match.status !== 'Finished')?.round ?? rounds[rounds.length - 1];

interface FixtureListProps {
  matches: readonly Match[];
  onEditSchedule?: (match: Match) => void;
}

export function FixtureList({ matches, onEditSchedule }: FixtureListProps) {
  const rounds = useMemo(
    () => [...new Set(matches.map((match) => match.round))].sort((a, b) => a - b),
    [matches],
  );
  const [selected, setSelected] = useState<number | null>(null);

  if (rounds.length === 0) return <Empty message="El fixture aún no ha sido generado." />;

  const current = selected ?? defaultRound(matches, rounds);
  const visible = matches.filter((match) => match.round === current);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label htmlFor="round" className="text-sm font-medium text-slate-600">
          Jornada
        </label>
        <select
          id="round"
          value={current}
          onChange={(event) => setSelected(Number(event.target.value))}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
        >
          {rounds.map((round) => (
            <option key={round} value={round}>
              Jornada {round}
            </option>
          ))}
        </select>
      </div>

      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {visible.map((match) => (
          <li key={match._id} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-3">
            <div className="flex items-center justify-end gap-2 text-right">
              <span className="font-medium">{match.localTeam.name}</span>
              <TeamBadge team={match.localTeam} />
            </div>
            <div className="flex min-w-[96px] flex-col items-center gap-1">
              <span className="text-lg font-bold tabular-nums">
                {match.status === 'Scheduled' ? 'vs' : `${match.goalsLocal} - ${match.goalsVisitor}`}
              </span>
              <StatusBadge status={match.status} />
            </div>
            <div className="flex items-center gap-2">
              <TeamBadge team={match.visitorTeam} />
              <span className="font-medium">{match.visitorTeam.name}</span>
            </div>
            <div className="col-span-3 flex items-center justify-center gap-3 text-xs text-slate-500">
              <span>{formatMatchDate(match.date)}</span>
              <span className="flex items-center gap-1">
                <MapPin size={12} /> {venueLabel(match)}
              </span>
              {onEditSchedule && match.status !== 'Finished' && (
                <button
                  onClick={() => onEditSchedule(match)}
                  aria-label="Editar horario y cancha"
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <Pencil size={13} />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
