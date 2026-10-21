import { useState } from 'react';
import { useFetch } from '../../hooks/useFetch';
import { api } from '../../lib/api';
import { errorMessage, fromLocalInput, toLocalInput } from '../../lib/format';
import type { Match, Venue } from '../../types';
import { Modal } from '../common/Modal';
import { ErrorMessage, Loading } from '../common/StateMessage';

interface ScheduleModalProps {
  match: Match;
  onClose: () => void;
  onSaved: () => void;
}

export function ScheduleModal({ match, onClose, onSaved }: ScheduleModalProps) {
  const venues = useFetch<Venue[]>('/venues');
  const [venueId, setVenueId] = useState(match.venue?._id ?? '');
  const [fieldId, setFieldId] = useState(match.field ?? '');
  const [date, setDate] = useState(toLocalInput(match.date));
  const [duration, setDuration] = useState(match.durationMinutes ?? 90);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedVenue = venues.data?.find((venue) => venue._id === venueId);

  const save = async (clearVenue: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/matches/${match._id}/schedule`, {
        date: fromLocalInput(date),
        durationMinutes: duration,
        ...(clearVenue ? { venueId: null } : venueId ? { venueId, fieldId } : {}),
      });
      onSaved();
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const field = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';

  return (
    <Modal title={`Programar: ${match.localTeam.name} vs ${match.visitorTeam.name}`} onClose={onClose}>
      {venues.loading ? (
        <Loading />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-slate-600">Sede</span>
              <select
                value={venueId}
                onChange={(event) => {
                  setVenueId(event.target.value);
                  setFieldId('');
                }}
                className={field}
              >
                <option value="">Sin sede</option>
                {(venues.data ?? [])
                  .filter((venue) => venue.isActive || venue._id === venueId)
                  .map((venue) => (
                    <option key={venue._id} value={venue._id}>
                      {venue.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600">Cancha</span>
              <select value={fieldId} onChange={(event) => setFieldId(event.target.value)} disabled={!selectedVenue} className={field}>
                <option value="">Selecciona…</option>
                {selectedVenue?.fields
                  .filter((item) => item.isActive || item._id === fieldId)
                  .map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600">Fecha y hora</span>
              <input type="datetime-local" value={date} onChange={(event) => setDate(event.target.value)} className={field} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600">Duración (min)</span>
              <input
                type="number"
                min={30}
                max={240}
                value={duration}
                onChange={(event) => setDuration(Number(event.target.value))}
                className={field}
              />
            </label>
          </div>

          {error && <ErrorMessage message={error} />}

          <div className="flex flex-wrap gap-2">
            <button
              disabled={busy || !date || (venueId !== '' && fieldId === '')}
              onClick={() => void save(false)}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Guardar
            </button>
            {match.venue && (
              <button
                disabled={busy}
                onClick={() => void save(true)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
              >
                Quitar cancha
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
