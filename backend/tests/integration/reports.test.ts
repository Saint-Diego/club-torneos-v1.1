import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { TestContext, createTestContext } from '../helpers/context';
import { makeTeam, makeUser } from '../helpers/factories';
import { Scenario, leagueScenario, matchBetween } from '../helpers/scenarios';

type BinaryCallback = (error: Error | null, body: Buffer) => void;

const binary = (response: NodeJS.ReadableStream, callback: BinaryCallback): void => {
  const chunks: Buffer[] = [];
  response.on('data', (chunk: Buffer) => chunks.push(chunk));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
};

interface Report {
  title: string;
  subtitle?: string;
  sections: { title: string; columns: { key: string }[]; rows: Record<string, string | number>[] }[];
}

describe('reportes', () => {
  let ctx: TestContext;

  before(async () => {
    ctx = await createTestContext();
  });
  beforeEach(() => ctx.reset());
  after(() => ctx.close());

  const getJson = async (scenario: Scenario, path: string, query: object = {}): Promise<Report> => {
    const response = await request(ctx.app).get(`/api/reports/${path}`).query(query).set(scenario.organizer.headers);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return response.body as Report;
  };

  async function addEvent(scenario: Scenario, matchId: string, body: object) {
    const response = await request(ctx.app)
      .post(`/api/matches/${matchId}/events`)
      .set(scenario.organizer.headers)
      .send(body);
    assert.equal(response.status, 201, JSON.stringify(response.body));
  }

  describe('reporte general del torneo', () => {
    it('incluye posiciones, goleadores, valla y calendario', async () => {
      const scenario = await leagueScenario(ctx, { teams: 3 });
      const report = await getJson(scenario, `tournaments/${scenario.tournamentId}`);

      assert.deepEqual(
        report.sections.map((section) => section.title),
        ['Tabla de posiciones', 'Máximos anotadores', 'Valla menos vencida', 'Resultados y calendario'],
      );
      assert.equal(report.sections[0].rows.length, 3);
      assert.equal(report.sections[3].rows.length, 3);
      assert.match(report.title, /Copa de prueba/);
    });

    it('refleja goles y goleadores', async () => {
      const scenario = await leagueScenario(ctx, { teams: 3 });
      const [a, b] = scenario.teams;
      const match = await matchBetween(ctx, scenario, a, b);
      await addEvent(scenario, match.id as string, { type: 'GOAL', team: a.id, player: a.playerIds[0], minute: 10 });
      await addEvent(scenario, match.id as string, { type: 'GOAL', team: a.id, player: a.playerIds[0], minute: 55 });

      const report = await getJson(scenario, `tournaments/${scenario.tournamentId}`);
      assert.deepEqual(
        { player: report.sections[1].rows[0].player, goals: report.sections[1].rows[0].goals },
        { player: a.playerNames[0], goals: 2 },
      );
    });

    it('responde 404 para torneos inexistentes y 400 para formatos inválidos', async () => {
      const scenario = await leagueScenario(ctx, { teams: 3 });
      const missing = await request(ctx.app).get(`/api/reports/tournaments/${ctx.newId()}`).set(scenario.organizer.headers);
      const badFormat = await request(ctx.app)
        .get(`/api/reports/tournaments/${scenario.tournamentId}`)
        .query({ format: 'doc' })
        .set(scenario.organizer.headers);
      assert.equal(missing.status, 404);
      assert.equal(badFormat.status, 400);
    });
  });

  describe('exportación', () => {
    it('genera un PDF válido como adjunto', async () => {
      const scenario = await leagueScenario(ctx, { teams: 4 });
      const response = await request(ctx.app)
        .get(`/api/reports/tournaments/${scenario.tournamentId}`)
        .query({ format: 'pdf' })
        .set(scenario.organizer.headers)
        .buffer(true)
        .parse(binary);

      assert.equal(response.status, 200);
      assert.match(response.headers['content-type'], /application\/pdf/);
      assert.match(response.headers['content-disposition'], /attachment; filename="[^"]+\.pdf"/);
      const body = response.body as Buffer;
      assert.equal(body.subarray(0, 5).toString(), '%PDF-');
      assert.ok(body.length > 1000);
    });

    it('genera un Excel con una hoja por sección y los datos esperados', async () => {
      const scenario = await leagueScenario(ctx, { teams: 3 });
      const response = await request(ctx.app)
        .get(`/api/reports/tournaments/${scenario.tournamentId}`)
        .query({ format: 'xlsx' })
        .set(scenario.organizer.headers)
        .buffer(true)
        .parse(binary);

      assert.equal(response.status, 200);
      assert.match(response.headers['content-type'], /spreadsheetml/);
      assert.match(response.headers['content-disposition'], /\.xlsx"/);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(response.body as Buffer);
      assert.equal(workbook.worksheets.length, 4);
      assert.equal(workbook.worksheets[0].name, '1. Tabla de posiciones');
      assert.equal(workbook.worksheets[0].rowCount, 4); // cabecera + 3 equipos
      assert.equal(workbook.worksheets[0].getRow(1).getCell(2).value, 'Equipo');
    });
  });

  describe('sanciones y jugadores', () => {
    it('acumula tarjetas por jugador', async () => {
      const scenario = await leagueScenario(ctx, { teams: 3 });
      const [a, b] = scenario.teams;
      const match = await matchBetween(ctx, scenario, a, b);
      await addEvent(scenario, match.id as string, { type: 'YELLOW_CARD', team: a.id, player: a.playerIds[0], minute: 20 });
      await addEvent(scenario, match.id as string, { type: 'RED_CARD', team: a.id, player: a.playerIds[0], minute: 70 });

      const report = await getJson(scenario, `tournaments/${scenario.tournamentId}/sanctions`);
      assert.deepEqual(report.sections[0].rows, [
        { player: a.playerNames[0], team: a.name, yellow: 1, red: 1, total: 2 },
      ]);
    });

    it('el reporte de jugador resume goles y lista sus eventos', async () => {
      const scenario = await leagueScenario(ctx, { teams: 3 });
      const [a, b] = scenario.teams;
      const match = await matchBetween(ctx, scenario, a, b);
      await addEvent(scenario, match.id as string, { type: 'GOAL', team: a.id, player: a.playerIds[0], minute: 33 });

      const report = await getJson(scenario, `players/${a.playerIds[0]}`);
      assert.match(report.title, new RegExp(a.playerNames[0]));
      assert.equal(report.sections[0].rows[0].goals, 1);
      assert.equal(report.sections[0].rows[0].teams, a.name);
      assert.equal(report.sections[1].rows.length, 1);
      assert.equal(report.sections[1].rows[0].event, 'Gol');

      const notAPlayer = await request(ctx.app).get(`/api/reports/players/${scenario.organizer.id}`).set(scenario.organizer.headers);
      assert.equal(notAPlayer.status, 404);
    });
  });

  describe('permisos', () => {
    it('el Delegado solo consulta el reporte de su propio equipo', async () => {
      const scenario = await leagueScenario(ctx, { teams: 3 });
      const delegate = await makeUser(ctx, 'Delegado');
      const own = await makeTeam(ctx, 'Club del Delegado', { delegate: delegate.id });

      const ownReport = await request(ctx.app).get(`/api/reports/teams/${own.id}`).set(delegate.headers);
      assert.equal(ownReport.status, 200);
      assert.deepEqual(
        ownReport.body.sections.map((section: { title: string }) => section.title),
        ['Historial estadístico', 'Plantilla', 'Partidos disputados'],
      );
      assert.equal(ownReport.body.sections[1].rows.length, 2);

      const foreign = await request(ctx.app).get(`/api/reports/teams/${scenario.teams[0].id}`).set(delegate.headers);
      assert.equal(foreign.status, 403);

      const general = await request(ctx.app).get(`/api/reports/tournaments/${scenario.tournamentId}`).set(delegate.headers);
      assert.equal(general.status, 403);
    });

    it('los reportes exigen autenticación y el de auditoría es solo para Admin', async () => {
      const scenario = await leagueScenario(ctx, { teams: 3 });

      assert.equal((await request(ctx.app).get(`/api/reports/tournaments/${scenario.tournamentId}`)).status, 401);
      assert.equal((await request(ctx.app).get('/api/reports/audit').set(scenario.organizer.headers)).status, 403);

      const audit = await request(ctx.app).get('/api/reports/audit').set(scenario.admin.headers);
      assert.equal(audit.status, 200);
      assert.equal(audit.body.title, 'Registro de actividad');
    });
  });
});
