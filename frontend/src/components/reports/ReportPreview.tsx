import type { ReportData } from '../../types';
import { Empty } from '../common/StateMessage';

const ALIGN = { left: 'text-left', center: 'text-center', right: 'text-right' } as const;

export function ReportPreview({ report }: { report: ReportData }) {
  return (
    <article className="space-y-6 rounded-xl border border-slate-200 bg-white p-5 print:border-0 print:p-0">
      <header className="border-b border-slate-200 pb-3">
        <h2 className="text-xl font-bold">{report.title}</h2>
        {report.subtitle && <p className="text-sm text-slate-600">{report.subtitle}</p>}
        <p className="text-xs text-slate-400">Generado: {report.generatedAt}</p>
      </header>

      {report.sections.map((section) => (
        <section key={section.title} className="break-inside-avoid">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-emerald-700">{section.title}</h3>
          {section.rows.length === 0 ? (
            <Empty message="Sin datos disponibles." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    {section.columns.map((column) => (
                      <th key={column.key} className={`px-3 py-2 font-semibold ${ALIGN[column.align ?? 'left']}`}>
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {section.rows.map((row, index) => (
                    <tr key={index}>
                      {section.columns.map((column) => (
                        <td key={column.key} className={`px-3 py-1.5 ${ALIGN[column.align ?? 'left']}`}>
                          {row[column.key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </article>
  );
}
