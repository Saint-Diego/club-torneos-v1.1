import { CalendarClock } from 'lucide-react';
import { useState } from 'react';
import { useFetch } from '../../hooks/useFetch';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/format';
import type { ScheduleResult, Venue } from '../../types';
import { ErrorMessage } from '../common/StateMessage';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

interface AutoSchedulePanelProps {
  tournamentId: string;
  stage?: string;
  onDone: () => void;
}

export function AutoSchedulePanel({ tournamentId, stage, onDone }: AutoSchedulePanelProps) {
  const venues = useFetch<Venue[]>('/venues');
  const [open, setOpen] = useState(false);
  const [fieldIds, setFieldIds] = useState<string[]>([]);
  const [slots, setSlots] = useState('09:00, 11:00, 13:00');
  const [duration, setDuration] = useState(90);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScheduleResult | null>(null);

  const slotTimes = slots
    .split(',')
    .map((slot) => slot.trim())
    .filter(Boolean);
  const validSlots = slotTimes.length > 0 && slotTimes.every((slot) => TIME_PATTERN.test(slot));

  const toggle = (id: string) =>
    setFieldIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(
        await api.post<ScheduleResult>(`/tournaments/${tournamentId}/schedule`, {
          fieldIds,
          slotTimes,
          durationMinutes: duration,
          ...(stage ? { stage } : {}),
        }),
      );
      onDone();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
      >
        <CalendarClock size={15} /> Programar canchas y horarios
      </button>
    );
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold">Programación automática</h3>

      <div className="space-y-2">
        <p className="text-sm text-slate-600">Canchas disponibles</p>
        {(venues.data ?? [])
          .filter((venue) => venue.isActive)
          .map((venue) => (
            <fieldset key={venue._id} className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <legend className="sr-only">{venue.name}</legend>
              <span className="text-sm font-medium">{venue.name}:</span>
              {venue.fields
                .filter((field) => field.isActive && field._id)
                .map((field) => (
                  <label key={field._id} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={fieldIds.includes(field._id as string)}
                      onChange={() => toggle(field._id as string)}
                    />
                    {field.name}
                  </label>
                ))}
            </fieldset>
          ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="block text-slate-600">Franjas horarias (HH:MM, separadas por coma)</span>
          <input
            value={slots}
            onChange={(event) => setSlots(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-slate-600">Duración (minutos)</span>
          <input
            type="number"
            min={30}
            max={240}
            value={duration}
            onChange={(event) => setDuration(Number(event.target.value))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
      </div>

      {error && <ErrorMessage message={error} />}
      {result && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
          {result.scheduled} partido(s) programado(s).
          {result.unscheduled.length > 0 &&
            ` ${result.unscheduled.length} sin cupo (jornadas ${[...new Set(result.unscheduled.map((item) => item.round))].join(', ')}): agrega canchas o franjas.`}
        </p>
      )}

      <div className="flex gap-2">
        <button
          disabled={busy || fieldIds.length === 0 || !validSlots}
          onClick={() => void run()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? 'Programando…' : 'Programar partidos'}
        </button>
        <button onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
          Cerrar
        </button>
      </div>
      <p className="text-xs text-slate-500">
        Solo se programan partidos sin cancha asignada. Se evitan choques de cancha y equipos con dos partidos a la vez.
      </p>
    </section>
  );
}
