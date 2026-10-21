import { useState } from 'react';
import { useFetch } from '../../hooks/useFetch';
import { dayRange, formatMatchDate, todayInputValue, venueLabel } from '../../lib/format';
import { Empty, ErrorMessage, Loading } from '../common/StateMessage';
import { StatusBadge } from '../common/StatusBadge';
import { TeamBadge } from '../common/TeamBadge';
import { MatchEventModal, SquadMatch } from './MatchEventModal';

export function MatchCenter() {
  const [day, setDay] = useState(todayInputValue);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { from, to } = dayRange(day);
  const query = new URLSearchParams({ from, to, squads: '1' });
  const { data, loading, error, setData } = useFetch<SquadMatch[]>(`/matches?${query.toString()}`);

  const matches = data ?? [];
  const selected = matches.find((match) => match._id === selectedId) ?? null;

  const handleChange = (updated: SquadMatch) =>
    setData(matches.map((match) => (match._id === updated._id ? updated : match)));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Match Center</h1>
          <p className="text-sm text-slate-500">Gestiona marcador, goles y tarjetas en vivo.</p>
        </div>
        <label className="space-y-1 text-sm">
          <span className="block text-slate-600">Fecha</span>
          <input
            type="date"
            value={day}
            onChange={(event) => setDay(event.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5"
          />
        </label>
      </header>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorMessage message={error} />
      ) : matches.length === 0 ? (
        <Empty message="No hay partidos programados para esta fecha." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {matches.map((match) => (
            <li key={match._id}>
              <button
                onClick={() => setSelectedId(match._id)}
                className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-emerald-400 hover:shadow"
              >
                <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
                  <span>
                    {match.stage === 'Eliminación directa' ? 'Eliminatoria' : `Jornada ${match.round}`} · {formatMatchDate(match.date)}
                  </span>
                  <StatusBadge status={match.status} />
                </div>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <div className="flex items-center gap-2">
                    <TeamBadge team={match.localTeam} />
                    <span className="truncate font-medium">{match.localTeam.name}</span>
                  </div>
                  <span className="text-xl font-bold tabular-nums">
                    {match.goalsLocal} - {match.goalsVisitor}
                  </span>
                  <div className="flex items-center justify-end gap-2">
                    <span className="truncate font-medium">{match.visitorTeam.name}</span>
                    <TeamBadge team={match.visitorTeam} />
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-500">{venueLabel(match)}</p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <MatchEventModal match={selected} onClose={() => setSelectedId(null)} onChange={handleChange} />
      )}
    </div>
  );
}
