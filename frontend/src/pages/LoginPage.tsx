import { FormEvent, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ErrorMessage } from '../components/common/StateMessage';
import { api } from '../lib/api';
import { errorMessage } from '../lib/format';
import { useAuthStore } from '../store/authStore';
import type { Session } from '../types';

export function LoginPage() {
  const user = useAuthStore((state) => state.user);
  const setSession = useAuthStore((state) => state.setSession);
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={redirectTo} replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setSession(await api.post<Session>('/auth/login', { email, password }));
      navigate(redirectTo, { replace: true });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
      <h1 className="text-xl font-bold">Iniciar sesión</h1>
      <label className="block space-y-1 text-sm">
        <span className="text-slate-600">Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-slate-600">Contraseña</span>
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      {error && <ErrorMessage message={error} />}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {busy ? 'Ingresando…' : 'Ingresar'}
      </button>
    </form>
  );
}
