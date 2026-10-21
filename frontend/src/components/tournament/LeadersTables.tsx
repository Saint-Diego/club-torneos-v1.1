import type { ReactNode } from 'react';
import type { Leaders } from '../../types';
import { Empty } from '../common/StateMessage';

const Card = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
    <h3 className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold">{title}</h3>
    {children}
  </section>
);

export function LeadersTables({ leaders }: { leaders: Leaders }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Máximos anotadores">
        {leaders.topScorers.length === 0 ? (
          <Empty message="Sin goles registrados." />
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {leaders.topScorers.map((scorer, index) => (
                <tr key={scorer.playerId}>
                  <td className="w-10 px-4 py-2.5 text-center font-semibold text-slate-500">{index + 1}</td>
                  <td className="py-2.5">
                    <p className="font-medium">{scorer.playerName}</p>
                    <p className="text-xs text-slate-500">{scorer.teamName}</p>
                  </td>
                  <td className="px-4 py-2.5 text-right text-base font-bold text-emerald-700">{scorer.goals}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Valla menos vencida">
        {leaders.bestDefense.length === 0 ? (
          <Empty message="Aún no hay partidos jugados." />
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="w-10 px-4 py-2 text-center">#</th>
                <th className="py-2 text-left">Equipo</th>
                <th className="px-2 py-2 text-center">GC</th>
                <th className="px-2 py-2 text-center">PJ</th>
                <th className="px-4 py-2 text-right">Prom.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leaders.bestDefense.map((row, index) => (
                <tr key={row.teamId}>
                  <td className="px-4 py-2.5 text-center font-semibold text-slate-500">{index + 1}</td>
                  <td className="py-2.5 font-medium">{row.teamName}</td>
                  <td className="px-2 py-2.5 text-center">{row.goalsAgainst}</td>
                  <td className="px-2 py-2.5 text-center">{row.played}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-emerald-700">{row.average.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
