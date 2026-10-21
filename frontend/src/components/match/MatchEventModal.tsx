import { Minus, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/format';
import type { EventType, Match, MatchStatus, TeamWithSquad } from '../../types';
import { ErrorMessage } from '../common/StateMessage';
import { Modal } from '../common/Modal';
import { StatusBadge } from '../common/StatusBadge';

export type SquadMatch = Match<TeamWithSquad>;

interface MatchEventModalProps {
  match: SquadMatch;
  onClose: () => void;
  onChange: (match: SquadMatch) => void;
}

type Side = 'local' | 'visitor';

const EVENT_LABELS: Record<EventType, string> = {
  GOAL: 'Gol',
  YELLOW_CARD: 'Tarjeta amarilla',
  RED_CARD: 'Tarjeta roja',
};

const EVENT_STYLES: Record<EventType, string> = {
  GOAL: 'bg-emerald-100 text-emerald-700',
  YELLOW_CARD: 'bg-yellow-100 text-yellow-800',
  RED_CARD: 'bg-red-100 text-red-700',
};

export function MatchEventModal({ match, onClose, onChange }: MatchEventModalProps) {
  const [type, setType] = useState<EventType>('GOAL');
  const [side, setSide] = useState<Side>('local');
  const [playerId, setPlayerId] = useState('');
  const [minute, setMinute] = useState(1);
  const [penalties, setPenalties] = useState({
    local: match.penalties?.local ?? 0,
    visitor: match.penalties?.visitor ?? 0,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finished = match.status === 'Finished';
  const showPenalties =
    match.stage === 'Eliminación directa' && (match.goalsLocal === match.goalsVisitor || match.penalties !== undefined);
  const team = side === 'local' ? match.localTeam : match.visitorTeam;

  const playerNames = useMemo(
    () =>
      new Map(
        [...match.localTeam.players, ...match.visitorTeam.players].map((player): [string, string] => [
          player._id,
          player.name,
        ]),
      ),
    [match],
  );

  const run = async (action: () => Promise<SquadMatch>) => {
    setBusy(true);
    setError(null);
    try {
      onChange(await action());
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const base = `/matches/${match._id}`;

  const addEvent = () =>
    run(async () => {
      const updated = await api.post<SquadMatch>(`${base}/events`, { type, team: team._id, player: playerId, minute });
      setPlayerId('');
      return updated;
    });

  const setScore = (goalsLocal: number, goalsVisitor: number) =>
    run(() =>
      api.patch<SquadMatch>(`${base}/score`, {
        goalsLocal: Math.max(0, goalsLocal),
        goalsVisitor: Math.max(0, goalsVisitor),
      }),
    );

  const setStatus = (status: MatchStatus) => run(() => api.patch<SquadMatch>(`${base}/status`, { status }));
  const savePenalties = () =>
    run(() =>
      api.patch<SquadMatch>(`${base}/score`, {
        goalsLocal: match.goalsLocal,
        goalsVisitor: match.goalsVisitor,
        penalties,
      }),
    );

  const removeEvent = (eventId: string) => run(() => api.delete<SquadMatch>(`${base}/events/${eventId}`));

  const stepper = (label: string, value: number, onStep: (delta: number) => void) => (
    <div className="flex flex-col items-center gap-1">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-2">
        <button
          disabled={busy || finished || value === 0}
          onClick={() => onStep(-1)}
          aria-label={`Restar gol a ${label}`}
          className="rounded-full border border-slate-300 p-1.5 hover:bg-slate-100 disabled:opacity-40"
        >
          <Minus size={14} />
        </button>
        <span className="w-10 text-center text-3xl font-bold tabular-nums">{value}</span>
        <button
          disabled={busy || finished}
          onClick={() => onStep(1)}
          aria-label={`Sumar gol a ${label}`}
          className="rounded-full border border-slate-300 p-1.5 hover:bg-slate-100 disabled:opacity-40"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );

  return (
    <Modal title={`${match.localTeam.name} vs ${match.visitorTeam.name}`} onClose={onClose}>
      <div className="space-y-6">
        <section className="flex items-center justify-around rounded-xl bg-slate-50 py-4">
          {stepper(match.localTeam.name, match.goalsLocal, (d) => void setScore(match.goalsLocal + d, match.goalsVisitor))}
          <StatusBadge status={match.status} />
          {stepper(match.visitorTeam.name, match.goalsVisitor, (d) =>
            void setScore(match.goalsLocal, match.goalsVisitor + d),
          )}
        </section>

        <div className="flex flex-wrap gap-2">
          {match.status === 'Scheduled' && (
            <button
              disabled={busy}
              onClick={() => void setStatus('Live')}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              Iniciar partido
            </button>
          )}
          {match.status === 'Live' && (
            <button
              disabled={busy}
              onClick={() => void setStatus('Finished')}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Finalizar partido
            </button>
          )}
          {finished && (
            <button
              disabled={busy}
              onClick={() => void setStatus('Live')}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
            >
              Reabrir partido
            </button>
          )}
        </div>

        {showPenalties && (
          <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <h3 className="text-sm font-semibold">Definición por penales</h3>
            <div className="flex flex-wrap items-end gap-3">
              {(['local', 'visitor'] as const).map((key) => (
                <label key={key} className="space-y-1 text-sm">
                  <span className="block text-slate-600">
                    {key === 'local' ? match.localTeam.name : match.visitorTeam.name}
                  </span>
                  <input
                    type="number"
                    min={0}
                    disabled={finished}
                    value={penalties[key]}
                    onChange={(event) => setPenalties((current) => ({ ...current, [key]: Number(event.target.value) }))}
                    className="w-24 rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                  />
                </label>
              ))}
              {!finished && (
                <button
                  disabled={busy || penalties.local === penalties.visitor}
                  onClick={() => void savePenalties()}
                  className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  Guardar penales
                </button>
              )}
            </div>
          </section>
        )}

        {!finished && (
          <section className="space-y-3 rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-semibold">Registrar evento</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-slate-600">Tipo</span>
                <select
                  value={type}
                  onChange={(event) => setType(event.target.value as EventType)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  {(Object.keys(EVENT_LABELS) as EventType[]).map((key) => (
                    <option key={key} value={key}>
                      {EVENT_LABELS[key]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-slate-600">Equipo</span>
                <select
                  value={side}
                  onChange={(event) => {
                    setSide(event.target.value as Side);
                    setPlayerId('');
                  }}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  <option value="local">{match.localTeam.name}</option>
                  <option value="visitor">{match.visitorTeam.name}</option>
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-slate-600">Jugador</span>
                <select
                  value={playerId}
                  onChange={(event) => setPlayerId(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  <option value="">Selecciona…</option>
                  {team.players.map((player) => (
                    <option key={player._id} value={player._id}>
                      {player.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-slate-600">Minuto</span>
                <input
                  type="number"
                  min={0}
                  max={130}
                  value={minute}
                  onChange={(event) => setMinute(Number(event.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
            </div>
            <button
              disabled={busy || !playerId}
              onClick={() => void addEvent()}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Añadir evento
            </button>
          </section>
        )}

        {error && <ErrorMessage message={error} />}

        <section>
          <h3 className="mb-2 text-sm font-semibold">Eventos del partido</h3>
          {match.events.length === 0 ? (
            <p className="text-sm text-slate-500">Sin eventos registrados.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {[...match.events]
                .sort((a, b) => a.minute - b.minute)
                .map((event) => (
                  <li key={event._id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="w-10 font-mono text-slate-500">{event.minute}'</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${EVENT_STYLES[event.type]}`}>
                      {EVENT_LABELS[event.type]}
                    </span>
                    <span className="flex-1">{playerNames.get(event.player) ?? 'Jugador'}</span>
                    {!finished && (
                      <button
                        disabled={busy}
                        onClick={() => void removeEvent(event._id)}
                        aria-label="Eliminar evento"
                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </li>
                ))}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  );
}
