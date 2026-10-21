import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { TestContext, createTestContext } from '../helpers/context';
import { Scenario, leagueScenario } from '../helpers/scenarios';

interface VenueBody {
  _id: string;
  fields: { _id: string; name: string; isActive: boolean }[];
}

describe('sedes, canchas y programación', () => {
  let ctx: TestContext;

  before(async () => {
    ctx = await createTestContext();
  });
  beforeEach(() => ctx.reset());
  after(() => ctx.close());

  const createVenue = async (scenario: Scenario, fields = ['Cancha 1', 'Cancha 2'], name = 'Estadio Central') => {
    const response = await request(ctx.app)
      .post('/api/venues')
      .set(scenario.organizer.headers)
      .send({ name, address: 'Calle 10 # 5-20', fields: fields.map((field) => ({ name: field })) });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    return response.body as VenueBody;
  };

  const schedule = (scenario: Scenario, matchId: string, body: object) =>
    request(ctx.app).patch(`/api/matches/${matchId}/schedule`).set(scenario.organizer.headers).send(body);

  const roundMatches = (scenario: Scenario, round: number) =>
    ctx.models.Match.find({ tournament: scenario.tournamentId, round }).sort({ date: 1, _id: 1 });

  describe('sedes', () => {
    it('crea sedes con canchas y evita nombres repetidos', async () => {
      const scenario = await leagueScenario(ctx, { teams: 4 });
      const venue = await createVenue(scenario);
      assert.equal(venue.fields.length, 2);
      assert.ok(venue.fields.every((field) => field.isActive));

      const duplicate = await request(ctx.app)
        .post('/api/venues')
        .set(scenario.organizer.headers)
        .send({ name: 'Estadio Central', address: 'Otra dirección', fields: [{ name: 'A' }] });
      assert.equal(duplicate.status, 409);
    });

    it('exige al menos una cancha y nombres de cancha únicos', async () => {
      const scenario = await leagueScenario(ctx, { teams: 4 });
      const send = (body: object) => request(ctx.app).post('/api/venues').set(scenario.organizer.headers).send(body);

      assert.equal((await send({ name: 'Sede A', address: 'Calle 1 # 2-3', fields: [] })).status, 400);
      const repeated = await send({ name: 'Sede B', address: 'Calle 1 # 2-3', fields: [{ name: 'Uno' }, { name: 'uno' }] });
      assert.equal(repeated.status, 400);
    });

    it('no permite eliminar canchas, solo desactivarlas', async () => {
      const scenario = await leagueScenario(ctx, { teams: 4 });
      const venue = await createVenue(scenario);
      const patch = (fields: object[]) =>
        request(ctx.app).patch(`/api/venues/${venue._id}`).set(scenario.organizer.headers).send({ fields });

      assert.equal((await patch([{ _id: venue.fields[0]._id, name: 'Cancha 1' }])).status, 400);
      const deactivated = await patch([
        { _id: venue.fields[0]._id, name: 'Cancha 1' },
        { _id: venue.fields[1]._id, name: 'Cancha 2', isActive: false },
      ]);
      assert.equal(deactivated.status, 200);
      assert.equal(deactivated.body.fields[1].isActive, false);
      assert.equal(deactivated.body.fields[1]._id, venue.fields[1]._id);
    });
  });

  describe('programación manual', () => {
    it('detecta cancha ocupada, permite horarios contiguos y detecta equipos con doble partido', async () => {
      const scenario = await leagueScenario(ctx, { teams: 4 });
      const venue = await createVenue(scenario);
      const [field1, field2] = venue.fields.map((field) => field._id);
      const [m1, m2] = await roundMatches(scenario, 1);

      const first = await schedule(scenario, m1.id as string, {
        venueId: venue._id,
        fieldId: field1,
        date: '2026-11-07T14:00:00.000Z',
        durationMinutes: 90,
      });
      assert.equal(first.status, 200, JSON.stringify(first.body));

      const overlap = await schedule(scenario, m2.id as string, {
        venueId: venue._id,
        fieldId: field1,
        date: '2026-11-07T14:30:00.000Z',
      });
      assert.equal(overlap.status, 409);
      assert.match(overlap.body.message, /cancha/i);

      const adjacent = await schedule(scenario, m2.id as string, {
        venueId: venue._id,
        fieldId: field1,
        date: '2026-11-07T15:30:00.000Z',
      });
      assert.equal(adjacent.status, 200);

      const [r2match] = await ctx.models.Match.find({
        tournament: scenario.tournamentId,
        round: 2,
        $or: [{ localTeam: m1.localTeam }, { visitorTeam: m1.localTeam }],
      });
      const sameTeam = await schedule(scenario, r2match.id as string, {
        venueId: venue._id,
        fieldId: field2,
        date: '2026-11-07T14:30:00.000Z',
      });
      assert.equal(sameTeam.status, 409);
      assert.match(sameTeam.body.message, /equipos/i);
    });

    it('rechaza canchas inactivas o de otra sede y no reprograma partidos finalizados', async () => {
      const scenario = await leagueScenario(ctx, { teams: 4 });
      const venue = await createVenue(scenario);
      const other = await createVenue(scenario, ['Campo A'], 'Polideportivo Norte');
      const [m1, m2] = await roundMatches(scenario, 1);

      await request(ctx.app)
        .patch(`/api/venues/${venue._id}`)
        .set(scenario.organizer.headers)
        .send({
          fields: [
            { _id: venue.fields[0]._id, name: 'Cancha 1' },
            { _id: venue.fields[1]._id, name: 'Cancha 2', isActive: false },
          ],
        });

      const inactive = await schedule(scenario, m1.id as string, { venueId: venue._id, fieldId: venue.fields[1]._id });
      const foreign = await schedule(scenario, m1.id as string, { venueId: venue._id, fieldId: other.fields[0]._id });
      const missingField = await schedule(scenario, m1.id as string, { venueId: venue._id });
      assert.equal(inactive.status, 400);
      assert.equal(foreign.status, 400);
      assert.equal(missingField.status, 400);

      await ctx.models.Match.updateOne({ _id: m2.id }, { status: 'Finished' });
      const finished = await schedule(scenario, m2.id as string, { date: '2026-12-01T14:00:00.000Z' });
      assert.equal(finished.status, 409);
    });

    it('permite quitar la cancha de un partido', async () => {
      const scenario = await leagueScenario(ctx, { teams: 4 });
      const venue = await createVenue(scenario);
      const [m1] = await roundMatches(scenario, 1);

      await schedule(scenario, m1.id as string, { venueId: venue._id, fieldId: venue.fields[0]._id });
      const cleared = await schedule(scenario, m1.id as string, { venueId: null });
      assert.equal(cleared.status, 200);

      const stored = await ctx.models.Match.findById(m1.id).lean();
      assert.equal(stored?.venue, undefined);
      assert.equal(stored?.field, undefined);
    });
  });

  describe('programación automática', () => {
    const auto = (scenario: Scenario, body: object) =>
      request(ctx.app).post(`/api/tournaments/${scenario.tournamentId}/schedule`).set(scenario.organizer.headers).send(body);

    it('programa todos los partidos cuando hay capacidad, sin choques de cancha', async () => {
      const scenario = await leagueScenario(ctx, { teams: 4 });
      const venue = await createVenue(scenario, ['Cancha 1']);

      const response = await auto(scenario, { fieldIds: [venue.fields[0]._id], slotTimes: ['09:00', '11:00'] });
      assert.equal(response.status, 200, JSON.stringify(response.body));
      assert.deepEqual(response.body, { scheduled: 6, unscheduled: [] });

      const matches = await ctx.models.Match.find({ tournament: scenario.tournamentId }).lean();
      assert.ok(matches.every((match) => match.field && match.venue));
      assert.deepEqual(
        [...new Set(matches.map((match) => match.date.getUTCHours()))].sort((a, b) => a - b),
        [14, 16], // 09:00 y 11:00 en Bogotá (UTC-5)
      );
      const slots = matches.map((match) => `${match.field}|${match.date.toISOString()}`);
      assert.equal(new Set(slots).size, slots.length);
    });

    it('informa los partidos sin cupo y es idempotente', async () => {
      const scenario = await leagueScenario(ctx, { teams: 4 });
      const venue = await createVenue(scenario, ['Cancha 1']);

      const limited = await auto(scenario, { fieldIds: [venue.fields[0]._id], slotTimes: ['09:00'] });
      assert.equal(limited.body.scheduled, 3);
      assert.equal(limited.body.unscheduled.length, 3);

      const second = await auto(scenario, { fieldIds: [venue.fields[0]._id], slotTimes: ['09:00', '11:00', '13:00'] });
      assert.equal(second.body.scheduled, 3);
      assert.equal(second.body.unscheduled.length, 0);

      const third = await auto(scenario, { fieldIds: [venue.fields[0]._id], slotTimes: ['09:00'] });
      assert.deepEqual(third.body, { scheduled: 0, unscheduled: [] });
    });

    it('valida franjas horarias, canchas y permisos', async () => {
      const scenario = await leagueScenario(ctx, { teams: 4 });
      const venue = await createVenue(scenario, ['Cancha 1']);
      const fieldIds = [venue.fields[0]._id];

      assert.equal((await auto(scenario, { fieldIds, slotTimes: ['9am'] })).status, 400);
      assert.equal((await auto(scenario, { fieldIds, slotTimes: [] })).status, 400);
      assert.equal((await auto(scenario, { fieldIds: [ctx.newId()], slotTimes: ['09:00'] })).status, 400);

      const anonymous = await request(ctx.app)
        .post(`/api/tournaments/${scenario.tournamentId}/schedule`)
        .send({ fieldIds, slotTimes: ['09:00'] });
      assert.equal(anonymous.status, 401);
    });
  });
});
