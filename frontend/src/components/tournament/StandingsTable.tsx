import { useMemo } from 'react';
import { signed } from '../../lib/format';
import type { StandingRow } from '../../types';
import { Empty } from '../common/StateMessage';
import { TeamBadge } from '../common/TeamBadge';

export function sortStandings(rows: readonly StandingRow[]): StandingRow[] {
  return [...rows]
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.goalDifference - a.goalDifference ||
        b.goalsFor - a.goalsFor ||
        a.team.name.localeCompare(b.team.name),
    )
    .map((row, index) => ({ ...row, position: index + 1 }));
}

const HEADERS = ['Pos', 'Equipo', 'PJ', 'PG', 'PE', 'PP', 'GF', 'GC', 'DG', 'PTS'] as const;

export function StandingsTable({ rows }: { rows: readonly StandingRow[] }) {
  const sorted = useMemo(() => sortStandings(rows), [rows]);

  if (sorted.length === 0) return <Empty message="Aún no hay equipos en la tabla." />;

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            {HEADERS.map((header, index) => (
              <th key={header} className={`px-3 py-2.5 font-semibold ${index === 1 ? 'text-left' : 'text-center'}`}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map((row) => (
            <tr key={row.team._id} className="hover:bg-slate-50">
              <td className="px-3 py-2.5 text-center font-semibold text-slate-500">{row.position}</td>
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <TeamBadge team={row.team} />
                  <span className="font-medium">{row.team.name}</span>
                </div>
              </td>
              <td className="px-3 py-2.5 text-center">{row.played}</td>
              <td className="px-3 py-2.5 text-center">{row.won}</td>
              <td className="px-3 py-2.5 text-center">{row.drawn}</td>
              <td className="px-3 py-2.5 text-center">{row.lost}</td>
              <td className="px-3 py-2.5 text-center">{row.goalsFor}</td>
              <td className="px-3 py-2.5 text-center">{row.goalsAgainst}</td>
              <td className="px-3 py-2.5 text-center">{signed(row.goalDifference)}</td>
              <td className="px-3 py-2.5 text-center font-bold text-emerald-700">{row.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
