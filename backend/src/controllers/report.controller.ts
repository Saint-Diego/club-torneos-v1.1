import type { Response } from 'express';
import { z } from 'zod';
import { Team } from '../models/Team';
import {
  buildAuditReport,
  buildPlayerReport,
  buildSanctionsReport,
  buildSponsorsReport,
  buildTeamReport,
  buildTournamentReport,
} from '../reports/builders';
import { renderXlsx } from '../reports/excel.exporter';
import { renderPdf } from '../reports/pdf.exporter';
import type { ReportData, ReportFormat } from '../reports/types';
import { HttpError } from '../utils/HttpError';
import { asyncHandler } from '../utils/asyncHandler';
import { objectId, paramId } from '../utils/validation';
import { auditFilters } from './audit.controller';

const query = z.object({
  format: z.enum(['json', 'pdf', 'xlsx']).default('json'),
  tournament: objectId.optional(),
});

const slug = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

async function deliver(res: Response, report: ReportData, format: ReportFormat): Promise<void> {
  switch (format) {
    case 'json':
      res.json(report);
      return;
    case 'pdf':
      res.attachment(`${slug(report.title)}.pdf`).send(await renderPdf(report));
      return;
    case 'xlsx':
      res.attachment(`${slug(report.title)}.xlsx`).send(await renderXlsx(report));
      return;
  }
}

export const tournamentReport = asyncHandler(async (req, res) => {
  const { format } = query.parse(req.query);
  await deliver(res, await buildTournamentReport(paramId(req)), format);
});

export const sanctionsReport = asyncHandler(async (req, res) => {
  const { format } = query.parse(req.query);
  await deliver(res, await buildSanctionsReport(paramId(req)), format);
});

export const teamReport = asyncHandler(async (req, res) => {
  const { format, tournament } = query.parse(req.query);
  const teamId = paramId(req);

  if (req.user?.role === 'Delegado') {
    const ownsTeam = await Team.exists({ _id: teamId, delegate: req.user.id });
    if (!ownsTeam) throw new HttpError(403, 'Solo puedes consultar reportes de tu equipo');
  }
  await deliver(res, await buildTeamReport(teamId, tournament), format);
});

export const playerReport = asyncHandler(async (req, res) => {
  const { format, tournament } = query.parse(req.query);
  await deliver(res, await buildPlayerReport(paramId(req), tournament), format);
});

export const auditReport = asyncHandler(async (req, res) => {
  const { format } = query.parse(req.query);
  await deliver(res, await buildAuditReport(auditFilters.parse(req.query)), format);
});

export const sponsorsReport = asyncHandler(async (req, res) => {
  const { format } = query.parse(req.query);
  await deliver(res, await buildSponsorsReport(), format);
});
