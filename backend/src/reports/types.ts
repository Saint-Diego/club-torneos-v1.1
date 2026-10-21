export type ReportFormat = 'json' | 'pdf' | 'xlsx';
export type Cell = string | number;
export type Row = Record<string, Cell>;

export interface ReportColumn {
  key: string;
  label: string;
  align?: 'left' | 'center' | 'right';
  weight?: number;
}

export interface ReportSection {
  title: string;
  columns: ReportColumn[];
  rows: Row[];
}

export interface ReportData {
  title: string;
  subtitle?: string;
  generatedAt: string;
  sections: ReportSection[];
}
