import { ChevronDown, ChevronLeft, ChevronRight, FileSpreadsheet, FileText } from 'lucide-react';
import { useState } from 'react';
import { useFetch } from '../../hooks/useFetch';
import { api } from '../../lib/api';
import { saveBlob } from '../../lib/download';
import { errorMessage } from '../../lib/format';
import type { AuditEntityType, AuditItem, AuditPage } from '../../types';
import { Empty, ErrorMessage, Loading } from '../common/StateMessage';

type ExportFormat = 'pdf' | 'xlsx';

interface Filters {
  entityType: AuditEntityType | '';
  action: string;
  from: string;
  to: string;
}

const ENTITY_TYPES: readonly AuditEntityType[] = ['User', 'Team', 'Tournament', 'Match', 'Venue', 'Sponsor'];
const ENTITY_LABELS: Record<AuditEntityType, string> = {
  User: 'Usuarios',
  Team: 'Equipos',
  Tournament: 'Torneos',
  Match: 'Partidos',
  Venue: 'Sedes',
  Sponsor: 'Patrocinadores',
};

const PAGE_SIZE = 25;
const dateTime = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'medium' });

function buildQuery(filters: Filters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.entityType) params.set('entityType', filters.entityType);
  if (filters.action.trim()) params.set('action', filters.action.trim());
  if (filters.from) params.set('from', new Date(`${filters.from}T00:00:00`).toISOString());
  if (filters.to) params.set('to', new Date(`${filters.to}T23:59:59.999`).toISOString());
  return params;
}

function Row({ item }: { item: AuditItem }) {
  const [open, setOpen] = useState(false);
  const hasDetails = item.metadata !== undefined || item.ip !== undefined;

  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm">{item.summary}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {dateTime.format(new Date(item.createdAt))} · {item.actor?.name ?? 'Sistema / anónimo'}
            {item.actorRole ? ` (${item.actorRole})` : ''}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">
          {item.action}
        </span>
        {hasDetails && (
          <button
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label="Ver detalle"
            className="rounded p-1 text-slate-400 hover:bg-slate-100"
          >
            <ChevronDown size={16} className={open ? 'rotate-180' : ''} />
          </button>
        )}
      </div>
      {open && (
        <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
          {JSON.stringify({ metadata: item.metadata, ip: item.ip, entityId: item.entityId }, null, 2)}
        </pre>
      )}
    </li>
  );
}

export function AuditLogPanel() {
  const [filters, setFilters] = useState<Filters>({ entityType: '', action: '', from: '', to: '' });
  const [applied, setApplied] = useState<Filters>(filters);
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const query = buildQuery(applied);
  const listQuery = new URLSearchParams(query);
  listQuery.set('page', String(page));
  listQuery.set('limit', String(PAGE_SIZE));

  const { data, loading, error } = useFetch<AuditPage>(`/audit?${listQuery.toString()}`);

  const apply = () => {
    setApplied(filters);
    setPage(1);
  };

  const download = async (format: ExportFormat) => {
    setExporting(format);
    setExportError(null);
    try {
      const params = new URLSearchParams(query);
      params.set('format', format);
      saveBlob(await api.blob(`/reports/audit?${params.toString()}`), `registro-de-actividad.${format}`);
    } catch (caught) {
      setExportError(errorMessage(caught));
    } finally {
      setExporting(null);
    }
  };

  const field = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
  const action =
    'flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50';

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Registro de actividad</h1>
        <p className="text-sm text-slate-500">Historial inmutable de acciones sobre usuarios, torneos, partidos y sedes.</p>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span className="block text-slate-600">Entidad</span>
          <select
            value={filters.entityType}
            onChange={(event) => setFilters({ ...filters, entityType: event.target.value as AuditEntityType | '' })}
            className={field}
          >
            <option value="">Todas</option>
            {ENTITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {ENTITY_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-slate-600">Acción (prefijo)</span>
          <input
            value={filters.action}
            onChange={(event) => setFilters({ ...filters, action: event.target.value })}
            placeholder="match. / auth.login"
            className={field}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-slate-600">Desde</span>
          <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className={field} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-slate-600">Hasta</span>
          <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} className={field} />
        </label>
        <button onClick={apply} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
          Filtrar
        </button>

        <div className="ml-auto flex gap-2">
          <button disabled={exporting !== null} onClick={() => void download('pdf')} className={action}>
            <FileText size={15} /> {exporting === 'pdf' ? 'Generando…' : 'PDF'}
          </button>
          <button disabled={exporting !== null} onClick={() => void download('xlsx')} className={action}>
            <FileSpreadsheet size={15} /> {exporting === 'xlsx' ? 'Generando…' : 'Excel'}
          </button>
        </div>
      </div>

      {exportError && <ErrorMessage message={exportError} />}

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorMessage message={error} />
      ) : !data || data.items.length === 0 ? (
        <Empty message="No hay actividad que coincida con los filtros." />
      ) : (
        <>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {data.items.map((item) => (
              <Row key={item._id} item={item} />
            ))}
          </ul>

          <nav className="flex items-center justify-between text-sm text-slate-600" aria-label="Paginación">
            <span>
              {data.total} registro(s) · página {data.page} de {data.pages}
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
                aria-label="Página anterior"
                className="rounded-lg border border-slate-300 p-1.5 hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                disabled={page >= data.pages}
                onClick={() => setPage((current) => current + 1)}
                aria-label="Página siguiente"
                className="rounded-lg border border-slate-300 p-1.5 hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </nav>
        </>
      )}
    </div>
  );
}
