import ExcelJS from 'exceljs';
import type { ReportData } from './types';

const INVALID_SHEET_CHARS = /[\\/*?:[\]]/g;

const sheetName = (title: string, index: number): string =>
  `${index + 1}. ${title}`.replace(INVALID_SHEET_CHARS, ' ').slice(0, 31);

export async function renderXlsx(report: ReportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Club Deportivo';
  workbook.created = new Date();
  workbook.title = report.title;
  workbook.subject = report.subtitle ?? '';

  report.sections.forEach((section, index) => {
    const sheet = workbook.addWorksheet(sheetName(section.title, index));

    sheet.columns = section.columns.map((column) => ({
      header: column.label,
      key: column.key,
      width: Math.max(10, (column.weight ?? 1) * 8),
      style: { alignment: { horizontal: column.align ?? 'left' } },
    }));
    sheet.addRows(section.rows);

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF047857' } };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: section.columns.length } };
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
