import { CalendarDays, GitFork, Medal, Trophy } from 'lucide-react';
import { useState } from 'react';
import { useFetch } from '../../hooks/useFetch';
import { useTournamentSocket } from '../../hooks/useTournamentSocket';
import { useAuthStore } from '../../store/authStore';
import type { Bracket, Leaders, Match, StandingRow, Tournament } from '../../types';
import { Empty, ErrorMessage, Loading } from '../common/StateMessage';
import { TabItem, Tabs } from '../common/Tabs';
import { AutoSchedulePanel } from './AutoSchedulePanel';
import { BracketView } from './BracketView';
import { FixtureList } from './FixtureList';
import { LeadersTables } from './LeadersTables';
import { ScheduleModal } from './ScheduleModal';
import { SponsorsBar } from '../sponsors/SponsorsBar';
import { StandingsTable } from './StandingsTable';

type TabKey = 'standings' | 'fixture' | 'leaders' | 'bracket';

const BASE_TABS: readonly TabItem<TabKey>[] = [
  { key: 'standings', label: 'Posiciones', icon: Trophy },
  { key: 'fixture', label: 'Fixture', icon: CalendarDays },
  { key: 'leaders', label: 'Goleadores', icon: Medal },
];

const BRACKET_TAB: TabItem<TabKey> = { key: 'bracket', label: 'Llaves', icon: GitFork };
const GROUP_STAGE = encodeURIComponent('Fase de grupos');

export function TournamentDashboard({ tournamentId }: { tournamentId: string }) {
  const [tab, setTab] = useState<TabKey>('standings');
  const [editing, setEditing] = useState<Match | null>(null);
  const role = useAuthStore((state) => state.user?.role);
  const canManage = role === 'Admin' || role === 'Organizador';

  const tournament = useFetch<Tournament>(`/tournaments/${tournamentId}`);
  const standings = useFetch<StandingRow[]>(`/tournaments/${tournamentId}/standings`);
  const matches = useFetch<Match[]>(`/tournaments/${tournamentId}/matches?stage=${GROUP_STAGE}`);
  const leaders = useFetch<Leaders>(`/tournaments/${tournamentId}/leaders`);

  const isMixed = tournament.data?.type === 'Mixto';
  const bracket = useFetch<Bracket>(isMixed ? `/tournaments/${tournamentId}/bracket` : null);

  const refreshMatchData = () => {
    void matches.reload();
    void leaders.reload();
    if (isMixed) void bracket.reload();
  };

  useTournamentSocket(tournamentId, {
    onStandings: (table) => {
      standings.setData(table);
      refreshMatchData();
    },
    onMatch: refreshMatchData,
    onBracket: () => {
      void bracket.reload();
      void tournament.reload();
    },
  });

  if (tournament.loading) return <Loading />;
  if (tournament.error || !tournament.data) return <ErrorMessage message={tournament.error ?? 'Torneo no encontrado'} />;

  const { name, type, status, scoring, teams } = tournament.data;
  const tabs = isMixed ? [...BASE_TABS, BRACKET_TAB] : BASE_TABS;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">{name}</h1>
        <p className="text-sm text-slate-500">
          {type} · {status} · Puntuación {scoring.win}-{scoring.draw}-{scoring.loss}
        </p>
      </header>

      <Tabs items={tabs} active={tab} onChange={setTab} />

      {tab === 'standings' &&
        (standings.loading ? (
          <Loading />
        ) : standings.error ? (
          <ErrorMessage message={standings.error} />
        ) : (
          <StandingsTable rows={standings.data ?? []} />
        ))}

      {tab === 'fixture' &&
        (matches.loading ? (
          <Loading />
        ) : matches.error ? (
          <ErrorMessage message={matches.error} />
        ) : (
          <div className="space-y-4">
            {canManage && <AutoSchedulePanel tournamentId={tournamentId} stage="Fase de grupos" onDone={() => void matches.reload()} />}
            <FixtureList matches={matches.data ?? []} onEditSchedule={canManage ? setEditing : undefined} />
          </div>
        ))}

      {tab === 'leaders' &&
        (leaders.loading ? (
          <Loading />
        ) : leaders.error ? (
          <ErrorMessage message={leaders.error} />
        ) : leaders.data ? (
          <LeadersTables leaders={leaders.data} />
        ) : (
          <Empty message="Sin datos." />
        ))}

      {tab === 'bracket' &&
        (bracket.loading ? (
          <Loading />
        ) : bracket.error ? (
          <ErrorMessage message={bracket.error} />
        ) : bracket.data ? (
          <BracketView
            tournamentId={tournamentId}
            bracket={bracket.data}
            canManage={canManage}
            tournamentClosed={status === 'Finalizado'}
            groupTeamCount={teams?.length ?? 0}
            onChanged={() => {
              void bracket.reload();
              void tournament.reload();
            }}
          />
        ) : (
          <Empty message="Sin datos." />
        ))}

      <SponsorsBar tournamentId={tournamentId} title="Patrocinadores del torneo" />

      {editing && (
        <ScheduleModal match={editing} onClose={() => setEditing(null)} onSaved={() => void matches.reload()} />
      )}
    </div>
  );
}
