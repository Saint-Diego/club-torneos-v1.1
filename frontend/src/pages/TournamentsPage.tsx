import { Link } from 'react-router-dom';
import { Empty, ErrorMessage, Loading } from '../components/common/StateMessage';
import { useFetch } from '../hooks/useFetch';
import type { Tournament } from '../types';

export function TournamentsPage() {
  const { data, loading, error } = useFetch<Tournament[]>('/tournaments');

  if (loading) return <Loading />;
  if (error) return <ErrorMessage message={error} />;
  if (!data || data.length === 0) return <Empty message="No hay torneos creados todavía." />;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Torneos</h1>
      <ul className="grid gap-3 sm:grid-cols-2">
        {data.map((tournament) => (
          <li key={tournament._id}>
            <Link
              to={`/tournaments/${tournament._id}`}
              className="block rounded-xl border border-slate-200 bg-white p-4 transition hover:border-emerald-400"
            >
              <p className="font-semibold">{tournament.name}</p>
              <p className="text-sm text-slate-500">
                {tournament.type} · {tournament.status}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
