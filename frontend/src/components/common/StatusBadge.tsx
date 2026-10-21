import type { MatchStatus } from '../../types';

const STYLES: Record<MatchStatus, { label: string; className: string }> = {
  Scheduled: { label: 'Programado', className: 'bg-slate-100 text-slate-600' },
  Live: { label: 'En vivo', className: 'bg-red-100 text-red-700' },
  Finished: { label: 'Finalizado', className: 'bg-emerald-100 text-emerald-700' },
};

export function StatusBadge({ status }: { status: MatchStatus }) {
  const { label, className } = STYLES[status];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{label}</span>;
}
