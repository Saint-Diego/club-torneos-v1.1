import { MapPin, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useFetch } from '../../hooks/useFetch';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/format';
import type { Surface, Venue, VenueField } from '../../types';
import { Empty, ErrorMessage, Loading } from '../common/StateMessage';

const SURFACES: readonly Surface[] = ['Césped natural', 'Césped sintético', 'Cemento', 'Arena'];

const emptyField = (): VenueField => ({ name: '', surface: 'Césped sintético', isActive: true });

const input = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';

function VenueCard({ venue, onChanged }: { venue: Venue; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newField, setNewField] = useState('');

  const patch = async (body: Partial<Pick<Venue, 'isActive' | 'fields'>>) => {
    setBusy(true);
    setError(null);
    try {
      await api.patch<Venue>(`/venues/${venue._id}`, body);
      onChanged();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const toggleField = (index: number) =>
    patch({
      fields: venue.fields.map((field, i) => (i === index ? { ...field, isActive: !field.isActive } : field)),
    });

  const addField = async () => {
    await patch({ fields: [...venue.fields, { ...emptyField(), name: newField.trim() }] });
    setNewField('');
  };

  return (
    <li className={`space-y-3 rounded-xl border bg-white p-4 ${venue.isActive ? 'border-slate-200' : 'border-slate-200 opacity-60'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 font-semibold">
            <MapPin size={15} className="text-emerald-600" /> {venue.name}
          </p>
          <p className="text-sm text-slate-500">
            {venue.address}
            {venue.city ? `, ${venue.city}` : ''}
          </p>
        </div>
        <button
          disabled={busy}
          onClick={() => void patch({ isActive: !venue.isActive })}
          className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-50"
        >
          {venue.isActive ? 'Desactivar' : 'Activar'}
        </button>
      </div>

      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
        {venue.fields.map((field, index) => (
          <li key={field._id ?? index} className="flex items-center justify-between px-3 py-2">
            <span className={field.isActive ? '' : 'text-slate-400 line-through'}>
              {field.name} <span className="text-xs text-slate-500">· {field.surface}</span>
            </span>
            <button disabled={busy} onClick={() => void toggleField(index)} className="text-xs text-slate-500 hover:text-slate-800">
              {field.isActive ? 'Desactivar' : 'Activar'}
            </button>
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <input
          value={newField}
          onChange={(event) => setNewField(event.target.value)}
          placeholder="Nueva cancha"
          className={input}
        />
        <button
          disabled={busy || newField.trim() === ''}
          onClick={() => void addField()}
          className="rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          Añadir
        </button>
      </div>
      {error && <ErrorMessage message={error} />}
    </li>
  );
}

function VenueForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [fields, setFields] = useState<VenueField[]>([emptyField()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateField = (index: number, patch: Partial<VenueField>) =>
    setFields((current) => current.map((field, i) => (i === index ? { ...field, ...patch } : field)));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post<Venue>('/venues', {
        name,
        address,
        city: city || undefined,
        fields: fields.filter((field) => field.name.trim() !== ''),
      });
      setName('');
      setAddress('');
      setCity('');
      setFields([emptyField()]);
      onCreated();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold">Nueva sede</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" className={input} />
        <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Dirección" className={input} />
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ciudad (opcional)" className={input} />
      </div>

      <div className="space-y-2">
        {fields.map((field, index) => (
          <div key={index} className="flex gap-2">
            <input
              value={field.name}
              onChange={(e) => updateField(index, { name: e.target.value })}
              placeholder={`Cancha ${index + 1}`}
              className={input}
            />
            <select
              value={field.surface}
              onChange={(e) => updateField(index, { surface: e.target.value as Surface })}
              className={`${input} max-w-[180px]`}
            >
              {SURFACES.map((surface) => (
                <option key={surface}>{surface}</option>
              ))}
            </select>
            <button
              disabled={fields.length === 1}
              onClick={() => setFields((current) => current.filter((_, i) => i !== index))}
              aria-label="Quitar cancha"
              className="rounded p-2 text-slate-400 hover:text-red-600 disabled:opacity-30"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <button
          onClick={() => setFields((current) => [...current, emptyField()])}
          className="flex items-center gap-1 text-sm text-emerald-700 hover:underline"
        >
          <Plus size={14} /> Añadir cancha
        </button>
      </div>

      {error && <ErrorMessage message={error} />}
      <button
        disabled={busy || !name.trim() || !address.trim()}
        onClick={() => void submit()}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        Crear sede
      </button>
    </section>
  );
}

export function VenuesManager() {
  const { data, loading, error, reload } = useFetch<Venue[]>('/venues');

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Sedes y canchas</h1>
        <p className="text-sm text-slate-500">Administra los escenarios disponibles para programar partidos.</p>
      </header>

      <VenueForm onCreated={() => void reload()} />

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorMessage message={error} />
      ) : !data || data.length === 0 ? (
        <Empty message="Aún no hay sedes registradas." />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {data.map((venue) => (
            <VenueCard key={venue._id} venue={venue} onChanged={() => void reload()} />
          ))}
        </ul>
      )}
    </div>
  );
}
