import { Award, FileText, History, LogIn, LogOut, MapPin, Radio, Trophy } from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { SponsorsBar } from '../sponsors/SponsorsBar';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
    isActive ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-100'
  }`;

export function Layout() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const isStaff = user?.role === 'Admin' || user?.role === 'Organizador';
  const canViewReports = isStaff || user?.role === 'Delegado';

  return (
    <div className="min-h-screen">
      <nav className="no-print border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <Link to="/" className="mr-2 font-bold text-emerald-700">
              Club Deportivo
            </Link>
            <NavLink to="/" end className={linkClass}>
              <Trophy size={15} /> Torneos
            </NavLink>
            {isStaff && (
              <NavLink to="/match-center" className={linkClass}>
                <Radio size={15} /> Match Center
              </NavLink>
            )}
            {isStaff && (
              <NavLink to="/venues" className={linkClass}>
                <MapPin size={15} /> Sedes
              </NavLink>
            )}
            {isStaff && (
              <NavLink to="/sponsors" className={linkClass}>
                <Award size={15} /> Patrocinadores
              </NavLink>
            )}
            {user?.role === 'Admin' && (
              <NavLink to="/audit" className={linkClass}>
                <History size={15} /> Auditoría
              </NavLink>
            )}
            {canViewReports && (
              <NavLink to="/reports" className={linkClass}>
                <FileText size={15} /> Reportes
              </NavLink>
            )}
          </div>
          {user ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="hidden text-slate-600 sm:inline">
                {user.name} · {user.role}
              </span>
              <button onClick={logout} className="flex items-center gap-1 text-slate-500 hover:text-slate-800">
                <LogOut size={15} /> Salir
              </button>
            </div>
          ) : (
            <NavLink to="/login" className={linkClass}>
              <LogIn size={15} /> Ingresar
            </NavLink>
          )}
        </div>
      </nav>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-5xl px-4 pb-8">
        <SponsorsBar />
      </footer>
    </div>
  );
}
