import { Check, Crown } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/format';
import type { Bracket, BracketMatch, TeamBrief } from '../../types';
import { Empty, ErrorMessage } from '../common/StateMessage';
import { TeamBadge } from '../common/TeamBadge';

interface BracketViewProps {
  tournamentId: string;
  bracket: Bracket;
  canManage: boolean;
  tournamentClosed: boolean;
  groupTeamCount: number;
  onChanged: () => void;
}

const QUALIFIER_OPTIONS = [2, 4, 8, 16, 32, 64] as const;

function TeamRow({
  team,
  goals,
  penalties,
  winner,
  played,
}: {
  team: TeamBrief;
  goals: number;
  penalties?: number;
  winner: boolean;
  played: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 ${winner ? 'bg-emerald-50 font-semibold' : ''}`}>
      <TeamBadge team={team} size={22} />
      <span className="flex-1 truncate text-sm">{team.name}</span>
      {winner && <Check size={14} className="text-emerald-600" />}
      <span className="w-10 text-right text-sm tabular-nums">
        {played ? goals : '-'}
        {penalties !== undefined && <span className="ml-1 text-xs text-slate-500">({penalties})</span>}
      </span>
    </div>
  );
}

function MatchCard({ match }: { match: BracketMatch }) {
  const played = match.status !== 'Scheduled';
  return (
    <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <TeamRow
        team={match.local}
        goals={match.goalsLocal}
        penalties={match.penalties?.local}
        winner={match.winnerId === match.local._id}
        played={played}
      />
      <TeamRow
        team={match.visitor}
        goals={match.goalsVisitor}
        penalties={match.penalties?.visitor}
        winner={match.winnerId === match.visitor._id}
        played={played}
      />
    </div>
  );
}

export function BracketView({
  tournamentId,
  bracket,
  canManage,
  tournamentClosed,
  groupTeamCount,
  onChanged,
}: BracketViewProps) {
  const options = QUALIFIER_OPTIONS.filter((value) => value <= groupTeamCount);
  const [qualifiers, setQualifiers] = useState<number>(options[options.length - 1] ?? 2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastRound = bracket.rounds[bracket.rounds.length - 1];
  const roundFinished = lastRound?.matches.every((match) => match.status === 'Finished') ?? false;
  const isFinal = lastRound?.matches.length === 1;

  const run = async (path: string, body?: unknown) => {
    setBusy(true);
    setError(null);
    try {
      await api.post<Bracket>(path, body);
      onChanged();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const button = 'rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50';

  return (
    <div className="space-y-5">
      {bracket.champion && (
        <div className="flex items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 text-amber-900">
          <Crown size={20} />
          <TeamBadge team={bracket.champion} />
          <p className="font-semibold">Campeón: {bracket.champion.name}</p>
        </div>
      )}

      {canManage && bracket.rounds.length === 0 && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <label className="space-y-1 text-sm">
            <span className="block text-slate-600">Equipos clasificados</span>
            <select
              value={qualifiers}
              onChange={(event) => setQualifiers(Number(event.target.value))}
              className="rounded-lg border border-slate-300 px-3 py-2"
            >
              {options.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={busy || options.length === 0}
            onClick={() => void run(`/tournaments/${tournamentId}/knockout`, { qualifiers })}
            className={button}
          >
            Generar llaves
          </button>
          <p className="text-xs text-slate-500">
            Requiere la fase de grupos finalizada. Se siembra por posición en la tabla (1° vs último).
          </p>
        </div>
      )}

      {canManage && lastRound && roundFinished && !tournamentClosed && (
        <button disabled={busy} onClick={() => void run(`/tournaments/${tournamentId}/knockout/advance`)} className={button}>
          {isFinal ? 'Cerrar torneo' : 'Avanzar a la siguiente ronda'}
        </button>
      )}

      {error && <ErrorMessage message={error} />}

      {bracket.rounds.length === 0 ? (
        <Empty message="Las llaves aún no han sido generadas." />
      ) : (
        <div className="flex gap-6 overflow-x-auto pb-2">
          {bracket.rounds.map((round) => (
            <section key={round.round} className="flex min-w-[240px] flex-col">
              <h3 className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                {round.label}
              </h3>
              <div className="flex flex-1 flex-col justify-around gap-4">
                {round.matches.map((match) => (
                  <MatchCard key={match._id} match={match} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
