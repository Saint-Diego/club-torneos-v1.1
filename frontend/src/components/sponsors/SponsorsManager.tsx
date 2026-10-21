import { ExternalLink, FileSpreadsheet, FileText, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { useFetch } from '../../hooks/useFetch';
import { api } from '../../lib/api';
import { saveBlob } from '../../lib/download';
import { errorMessage } from '../../lib/format';
import type { Sponsor, SponsorTier, Tournament } from '../../types';
import { Modal } from '../common/Modal';
import { Empty, ErrorMessage, Loading } from '../common/StateMessage';

const TIERS: readonly SponsorTier[] = ['Principal', 'Oro', 'Plata', 'Bronce'];

const TIER_STYLES: Record<SponsorTier, string> = {
  Principal: 'bg-amber-100 text-amber-800',
  Oro: 'bg-yellow-100 text-yellow-800',
  Plata: 'bg-slate-200 text-slate-700',
  Bronce: 'bg-orange-100 text-orange-800',
};

interface FormState {
  name: string;
  tier: SponsorTier;
  logo: string;
  website: string;
  description: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contractValue: string;
  currency: string;
  startDate: string;
  endDate: string;
  tournaments: string[];
  isActive: boolean;
}

const dayOf = (iso?: string | null): string => (iso ? iso.slice(0, 10) : '');
const orNull = (value: string): string | null => value.trim() || null;
const startOfDay = (day: string): string | null => (day ? new Date(`${day}T00:00:00`).toISOString() : null);
const endOfDay = (day: string): string | null => (day ? new Date(`${day}T23:59:59`).toISOString() : null);

const toForm = (sponsor?: Sponsor): FormState => ({
  name: sponsor?.name ?? '',
  tier: sponsor?.tier ?? 'Bronce',
  logo: sponsor?.logo ?? '',
  website: sponsor?.website ?? '',
  description: sponsor?.description ?? '',
  contactName: sponsor?.contact?.name ?? '',
  contactEmail: sponsor?.contact?.email ?? '',
  contactPhone: sponsor?.contact?.phone ?? '',
  contractValue: sponsor?.contractValue?.toString() ?? '',
  currency: sponsor?.currency ?? 'COP',
  startDate: dayOf(sponsor?.startDate),
  endDate: dayOf(sponsor?.endDate),
  tournaments: sponsor?.tournaments.map((item) => item._id) ?? [],
  isActive: sponsor?.isActive ?? true,
});

const toBody = (form: FormState) => ({
  name: form.name,
  tier: form.tier,
  logo: orNull(form.logo),
  website: orNull(form.website),
  description: orNull(form.description),
  contact: { name: orNull(form.contactName), email: orNull(form.contactEmail), phone: orNull(form.contactPhone) },
  contractValue: form.contractValue === '' ? null : Number(form.contractValue),
  currency: form.currency.toUpperCase(),
  startDate: startOfDay(form.startDate),
  endDate: endOfDay(form.endDate),
  tournaments: form.tournaments,
  isActive: form.isActive,
});

const field = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';

function SponsorForm({
  sponsor,
  tournaments,
  onClose,
  onSaved,
}: {
  sponsor?: Sponsor;
  tournaments: Tournament[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => toForm(sponsor));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  const toggleTournament = (id: string) =>
    set('tournaments', form.tournaments.includes(id) ? form.tournaments.filter((item) => item !== id) : [...form.tournaments, id]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (sponsor) await api.patch(`/sponsors/${sponsor._id}`, toBody(form));
      else await api.post('/sponsors', toBody(form));
      onSaved();
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={sponsor ? `Editar ${sponsor.name}` : 'Nuevo patrocinador'} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-slate-600">Nombre</span>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} className={field} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-slate-600">Categoría</span>
            <select value={form.tier} onChange={(e) => set('tier', e.target.value as SponsorTier)} className={field}>
              {TIERS.map((tier) => (
                <option key={tier}>{tier}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-slate-600">URL del logo</span>
            <input value={form.logo} onChange={(e) => set('logo', e.target.value)} placeholder="https://…" className={field} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-slate-600">Sitio web</span>
            <input value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="https://…" className={field} />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="text-slate-600">Descripción (visible al público)</span>
            <input value={form.description} onChange={(e) => set('description', e.target.value)} className={field} />
          </label>
        </div>

        <fieldset className="space-y-3 rounded-xl border border-slate-200 p-3">
          <legend className="px-1 text-xs font-semibold uppercase text-slate-500">Contrato (solo staff)</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span className="text-slate-600">Aporte</span>
              <input type="number" min={0} value={form.contractValue} onChange={(e) => set('contractValue', e.target.value)} className={field} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600">Inicio</span>
              <input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} className={field} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600">Fin</span>
              <input type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} className={field} />
            </label>
            <input value={form.contactName} onChange={(e) => set('contactName', e.target.value)} placeholder="Contacto" className={field} />
            <input value={form.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} placeholder="Email" className={field} />
            <input value={form.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} placeholder="Teléfono" className={field} />
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm text-slate-600">Torneos (vacío = todo el club)</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {tournaments.map((tournament) => (
              <label key={tournament._id} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={form.tournaments.includes(tournament._id)} onChange={() => toggleTournament(tournament._id)} />
                {tournament.name}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} />
          Activo (visible al público dentro de su vigencia)
        </label>

        {error && <ErrorMessage message={error} />}
        <button
          disabled={busy || form.name.trim().length < 2}
          onClick={() => void save()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </Modal>
  );
}

export function SponsorsManager() {
  const sponsors = useFetch<Sponsor[]>('/sponsors/manage');
  const tournaments = useFetch<Tournament[]>('/tournaments');
  const [editing, setEditing] = useState<Sponsor | 'new' | null>(null);
  const [exporting, setExporting] = useState<'pdf' | 'xlsx' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const download = async (format: 'pdf' | 'xlsx') => {
    setExporting(format);
    setExportError(null);
    try {
      saveBlob(await api.blob(`/reports/sponsors?format=${format}`), `patrocinadores.${format}`);
    } catch (caught) {
      setExportError(errorMessage(caught));
    } finally {
      setExporting(null);
    }
  };

  const action =
    'flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50';

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Patrocinadores</h1>
          <p className="text-sm text-slate-500">Categorías, vigencia de contratos y torneos asociados.</p>
        </div>
        <div className="flex gap-2">
          <button disabled={exporting !== null} onClick={() => void download('pdf')} className={action}>
            <FileText size={15} /> PDF
          </button>
          <button disabled={exporting !== null} onClick={() => void download('xlsx')} className={action}>
            <FileSpreadsheet size={15} /> Excel
          </button>
          <button
            onClick={() => setEditing('new')}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            <Plus size={15} /> Nuevo
          </button>
        </div>
      </header>

      {exportError && <ErrorMessage message={exportError} />}

      {sponsors.loading ? (
        <Loading />
      ) : sponsors.error ? (
        <ErrorMessage message={sponsors.error} />
      ) : !sponsors.data || sponsors.data.length === 0 ? (
        <Empty message="Aún no hay patrocinadores registrados." />
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {sponsors.data.map((sponsor) => (
            <li key={sponsor._id} className={`flex items-center gap-3 px-4 py-3 ${sponsor.isActive ? '' : 'opacity-60'}`}>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TIER_STYLES[sponsor.tier]}`}>{sponsor.tier}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {sponsor.name}
                  {!sponsor.isActive && <span className="ml-2 text-xs text-slate-500">(inactivo)</span>}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {sponsor.tournaments.length > 0 ? sponsor.tournaments.map((item) => item.name).join(', ') : 'Todo el club'} ·{' '}
                  {sponsor.clicks} clic(s)
                  {sponsor.endDate ? ` · hasta ${dayOf(sponsor.endDate)}` : ''}
                </p>
              </div>
              {sponsor.website && (
                <a href={sponsor.website} target="_blank" rel="noopener noreferrer" aria-label="Abrir sitio" className="rounded p-1 text-slate-400 hover:bg-slate-100">
                  <ExternalLink size={15} />
                </a>
              )}
              <button onClick={() => setEditing(sponsor)} aria-label="Editar" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <Pencil size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <SponsorForm
          sponsor={editing === 'new' ? undefined : editing}
          tournaments={tournaments.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => void sponsors.reload()}
        />
      )}
    </div>
  );
}
