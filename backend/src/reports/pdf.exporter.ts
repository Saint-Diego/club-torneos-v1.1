import PDFDocument from 'pdfkit';
import type { ReportColumn, ReportData, ReportSection } from './types';

const MARGIN = 40;
const ROW_HEIGHT = 20;
const COLORS = {
  header: '#047857',
  headerText: '#ffffff',
  stripe: '#f1f5f9',
  text: '#0f172a',
  muted: '#64748b',
} as const;

interface Layout {
  columns: ReportColumn[];
  widths: number[];
  total: number;
}

function layoutFor(doc: PDFKit.PDFDocument, columns: ReportColumn[]): Layout {
  const total = doc.page.width - MARGIN * 2;
  const weights = columns.map((column) => column.weight ?? 1);
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  return { columns, widths: weights.map((weight) => (weight / sum) * total), total };
}

function drawRow(
  doc: PDFKit.PDFDocument,
  layout: Layout,
  values: string[],
  y: number,
  style: 'header' | 'striped' | 'plain',
): void {
  if (style === 'header') doc.rect(MARGIN, y, layout.total, ROW_HEIGHT).fill(COLORS.header);
  if (style === 'striped') doc.rect(MARGIN, y, layout.total, ROW_HEIGHT).fill(COLORS.stripe);

  doc
    .fillColor(style === 'header' ? COLORS.headerText : COLORS.text)
    .font(style === 'header' ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(9);

  let x = MARGIN;
  layout.columns.forEach((column, index) => {
    doc.text(values[index], x + 4, y + 6, {
      width: layout.widths[index] - 8,
      height: ROW_HEIGHT - 8,
      align: column.align ?? 'left',
      ellipsis: true,
    });
    x += layout.widths[index];
  });
}

function drawSection(doc: PDFKit.PDFDocument, section: ReportSection, startY: number): number {
  const pageLimit = () => doc.page.height - MARGIN - ROW_HEIGHT;
  const layout = layoutFor(doc, section.columns);
  const labels = section.columns.map((column) => column.label);
  let y = startY;

  if (y > pageLimit() - ROW_HEIGHT * 3) {
    doc.addPage();
    y = MARGIN;
  }

  doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(12).text(section.title, MARGIN, y);
  y += 22;

  if (section.rows.length === 0) {
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9).text('Sin datos disponibles.', MARGIN, y);
    return y + 28;
  }

  drawRow(doc, layout, labels, y, 'header');
  y += ROW_HEIGHT;

  section.rows.forEach((row, index) => {
    if (y > pageLimit()) {
      doc.addPage();
      y = MARGIN;
      drawRow(doc, layout, labels, y, 'header');
      y += ROW_HEIGHT;
    }
    drawRow(
      doc,
      layout,
      section.columns.map((column) => String(row[column.key] ?? '')),
      y,
      index % 2 === 1 ? 'striped' : 'plain',
    );
    y += ROW_HEIGHT;
  });

  return y + 18;
}

function drawFooters(doc: PDFKit.PDFDocument): void {
  const { start, count } = doc.bufferedPageRange();
  for (let index = start; index < start + count; index++) {
    doc.switchToPage(index);
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .fillColor(COLORS.muted)
      .font('Helvetica')
      .fontSize(8)
      .text(`Página ${index + 1} de ${count}`, MARGIN, doc.page.height - 28, {
        width: doc.page.width - MARGIN * 2,
        align: 'center',
      });
    doc.page.margins.bottom = bottomMargin;
  }
}

export function renderPdf(report: ReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      bufferPages: true,
      info: { Title: report.title, Author: 'Club Deportivo' },
    });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(18).text(report.title, MARGIN, MARGIN);
    let y = doc.y + 2;
    if (report.subtitle) {
      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(10).text(report.subtitle, MARGIN, y);
      y = doc.y;
    }
    doc.fillColor(COLORS.muted).fontSize(8).text(`Generado: ${report.generatedAt}`, MARGIN, y + 2);
    y = doc.y + 18;

    for (const section of report.sections) y = drawSection(doc, section, y);

    drawFooters(doc);
    doc.end();
  });
}
