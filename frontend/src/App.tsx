import { Route, Routes } from 'react-router-dom';
import { MatchCenter } from './components/match/MatchCenter';
import { Layout } from './components/layout/Layout';
import { ProtectedRoute } from './components/common/ProtectedRoute';
import { AuditPage } from './pages/AuditPage';
import { LoginPage } from './pages/LoginPage';
import { ReportsPage } from './pages/ReportsPage';
import { VenuesPage } from './pages/VenuesPage';
import { SponsorsPage } from './pages/SponsorsPage';
import { TournamentPage } from './pages/TournamentPage';
import { TournamentsPage } from './pages/TournamentsPage';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<TournamentsPage />} />
        <Route path="tournaments/:id" element={<TournamentPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route
          path="match-center"
          element={
            <ProtectedRoute roles={['Admin', 'Organizador']}>
              <MatchCenter />
            </ProtectedRoute>
          }
        />
        <Route
          path="sponsors"
          element={
            <ProtectedRoute roles={['Admin', 'Organizador']}>
              <SponsorsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="audit"
          element={
            <ProtectedRoute roles={['Admin']}>
              <AuditPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="venues"
          element={
            <ProtectedRoute roles={['Admin', 'Organizador']}>
              <VenuesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="reports"
          element={
            <ProtectedRoute roles={['Admin', 'Organizador', 'Delegado']}>
              <ReportsPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<p className="py-10 text-center text-slate-500">Página no encontrada.</p>} />
      </Route>
    </Routes>
  );
}
