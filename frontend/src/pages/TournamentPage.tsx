import { useParams } from 'react-router-dom';
import { TournamentDashboard } from '../components/tournament/TournamentDashboard';

export function TournamentPage() {
  const { id } = useParams<{ id: string }>();
  return id ? <TournamentDashboard key={id} tournamentId={id} /> : null;
}
