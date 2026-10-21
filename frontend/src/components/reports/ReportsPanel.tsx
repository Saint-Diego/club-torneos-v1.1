import { FileSpreadsheet, FileText, Printer, ShieldAlert, Trophy, User, Users } from 'lucide-react';
import { useState } from 'react';
import { useFetch } from '../../hooks/useFetch';
import { api } from '../../lib/api';
import { saveBlob, slugify } from '../../lib/download';
import { errorMessage } from '../../lib/format';
import { useAuthStore } from '../../store/authStore';
import type { Player, ReportData, TeamListItem, Tournament } from '../../types';
import { Empty, ErrorMessage, Loading } from '../common/StateMessage';
import { TabItem, Tabs } from '../common/Tabs';
import { ReportPreview } from './ReportPreview';

type ReportKind = 'tournament' | 'sanctions' | 'team' | 'player';
type ExportFormat = 'pdf' | 'xlsx';

interface Selection {
  tournamentId: string;
  teamId: string;
  playerId: string;
}

const KINDS: readonly TabItem<ReportKind>[] = [
  { key: 'tournament', label: 'General del torneo', icon: Trophy },
  { key: 'sanctions', label: 'Sanciones', icon: ShieldAlert },
  { key: 'team', label: 'Por equipo', icon: Users },
  { key: 'player', label: 'Por jugador', icon: User },
];

function reportPath(kind: ReportKind, { tournamentId, teamId, playerId }: Selection): string | null {
  const scope = tournamentId ? `?tournament=${tournamentId}` : '';
  switch (kind) {
    case 'tournament':
      return tournamentId ? `/reports/tournaments/${tournamentId}` : null;
    case 'sanctions':
      return tournamentId ? `/reports/tournaments/${tournamentId}/sanctions` : null;
    case 'team':
      return teamId ? `/reports/teams/${teamId}${scope}` : null;
    case 'player':
      return playerId ? `/reports/players/${playerId}${scope}` : null;
  }
}

const withFormat = (path: string, format: ExportFormat): string =>
  `${path}${path.includes('?') ? '&' : '?'}format=${format}`;

interface SelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: readonly { value: string; label: string }[];
}

function Select({ label, value, onChange, placeholder, options }: SelectProps) {
  return (
    <label className="space-y-1 text-sm">
      <span className="block text-slate-600">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-[200px] rounded-lg border border-slate-300 bg-white px-3 py-2"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ReportsPanel() {
  const user = useAuthStore((state) => state.user);
  const isDelegate = user?.role === 'Delegado';
  const kinds = isDelegate ? KINDS.filter((item) => item.key === 'team') : KINDS;

  const [kind, setKind] = useState<ReportKind>(kinds[0].key);
  const [selection, setSelection] = useState<Selection>({ tournamentId: '', teamId: '', playerId: '' });
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const tournaments = useFetch<Tournament[]>('/tournaments');
  const teams = useFetch<TeamListItem[]>(kind === 'team' ? '/teams' : null);
  const players = useFetch<Player[]>(kind === 'player' ? '/users?role=Jugador' : null);

  const path = reportPath(kind, selection);
  const report = useFetch<ReportData>(path);

  const update = (patch: Partial<Selection>) => setSelection((current) => ({ ...current, ...patch }));

  const visibleTeams = (teams.data ?? []).filter((team) => !isDelegate || team.delegate === user?._id);
  const tournamentOptions = (tournaments.data ?? []).map((item) => ({ value: item._id, label: item.name }));
  const optionalTournament = kind === 'team' || kind === 'player';

  const download = async (format: ExportFormat) => {
    if (!path || !report.data) return;
    setExporting(format);
    setExportError(null);
    try {
      saveBlob(await api.blob(withFormat(path, format)), `${slugify(report.data.title)}.${format}`);
    } catch (caught) {
      setExportError(errorMessage(caught));
    } finally {
      setExporting(null);
    }
  };

  const actionClass =
    'flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50';

  return (
    <div className="space-y-5">
      <header className="no-print">
        <h1 className="text-2xl font-bold">Reportes</h1>
        <p className="text-sm text-slate-500">Consulta, exporta a PDF o Excel e imprime.</p>
      </header>

      <div className="no-print space-y-4">
        {kinds.length > 1 && <Tabs items={kinds} active={kind} onChange={setKind} />}

        <div className="flex flex-wrap items-end gap-3">
          <Select
            label={optionalTournament ? 'Torneo (opcional)' : 'Torneo'}
            value={selection.tournamentId}
            onChange={(tournamentId) => update({ tournamentId })}
            placeholder={optionalTournament ? 'Todos los torneos' : 'Selecciona…'}
            options={tournamentOptions}
          />
          {kind === 'team' && (
            <Select
              label="Equipo"
              value={selection.teamId}
              onChange={(teamId) => update({ teamId })}
              placeholder="Selecciona…"
              options={visibleTeams.map((team) => ({ value: team._id, label: team.name }))}
            />
          )}
          {kind === 'player' && (
            <Select
              label="Jugador"
              value={selection.playerId}
              onChange={(playerId) => update({ playerId })}
              placeholder="Selecciona…"
              options={(players.data ?? []).map((player) => ({ value: player._id, label: player.name }))}
            />
          )}

          <div className="ml-auto flex gap-2">
            <button disabled={!report.data || !path || exporting !== null} onClick={() => void download('pdf')} className={actionClass}>
              <FileText size={15} /> {exporting === 'pdf' ? 'Generando…' : 'PDF'}
            </button>
            <button disabled={!report.data || !path || exporting !== null} onClick={() => void download('xlsx')} className={actionClass}>
              <FileSpreadsheet size={15} /> {exporting === 'xlsx' ? 'Generando…' : 'Excel'}
            </button>
            <button disabled={!report.data || !path} onClick={() => window.print()} className={actionClass}>
              <Printer size={15} /> Imprimir
            </button>
          </div>
        </div>

        {exportError && <ErrorMessage message={exportError} />}
      </div>

      {path === null ? (
        <Empty message="Selecciona los parámetros para generar el reporte." />
      ) : report.loading ? (
        <Loading label="Generando reporte…" />
      ) : report.error ? (
        <ErrorMessage message={report.error} />
      ) : report.data ? (
        <ReportPreview report={report.data} />
      ) : null}
    </div>
  );
}
