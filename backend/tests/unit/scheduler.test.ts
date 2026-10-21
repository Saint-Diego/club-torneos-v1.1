import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { overlaps, planSchedule } from '../../src/services/scheduler';
import type { PlannableMatch } from '../../src/services/scheduler';
import { dayInZone, zonedToUtc } from '../../src/services/timezone';

const BOGOTA = 'America/Bogota';
const at = (iso: string): Date => new Date(iso);

const match = (id: string, teams: [string, string], round = 1, day = '2026-10-24'): PlannableMatch => ({
  id,
  round,
  teams,
  day,
});

describe('zonas horarias', () => {
  it('convierte hora local a UTC (Bogotá, sin horario de verano)', () => {
    assert.equal(zonedToUtc('2026-10-24', '09:00', BOGOTA).toISOString(), '2026-10-24T14:00:00.000Z');
  });

  it('respeta el cambio de horario de verano', () => {
    assert.equal(zonedToUtc('2026-10-24', '09:00', 'America/New_York').toISOString(), '2026-10-24T13:00:00.000Z');
    assert.equal(zonedToUtc('2026-11-07', '09:00', 'America/New_York').toISOString(), '2026-11-07T14:00:00.000Z');
  });

  it('obtiene el día calendario en la zona indicada', () => {
    assert.equal(dayInZone(at('2026-10-25T03:00:00Z'), BOGOTA), '2026-10-24');
    assert.equal(dayInZone(at('2026-10-25T06:00:00Z'), BOGOTA), '2026-10-25');
  });
});

describe('overlaps', () => {
  it('detecta solapamientos parciales, contención e identidad', () => {
    const a = [at('2026-01-01T10:00Z'), at('2026-01-01T11:30Z')] as const;
    assert.equal(overlaps(...a, at('2026-01-01T11:00Z'), at('2026-01-01T12:30Z')), true);
    assert.equal(overlaps(...a, at('2026-01-01T10:30Z'), at('2026-01-01T11:00Z')), true);
    assert.equal(overlaps(...a, ...a), true);
  });

  it('los intervalos que solo se tocan no se solapan', () => {
    assert.equal(
      overlaps(at('2026-01-01T10:00Z'), at('2026-01-01T11:30Z'), at('2026-01-01T11:30Z'), at('2026-01-01T13:00Z')),
      false,
    );
  });
});

describe('planSchedule', () => {
  const four = [
    match('m1', ['A', 'B']),
    match('m2', ['C', 'D']),
    match('m3', ['E', 'F']),
    match('m4', ['G', 'H']),
  ];

  it('llena las canchas en paralelo antes de pasar a la siguiente franja', () => {
    const result = planSchedule({
      matches: four,
      fieldIds: ['f1', 'f2'],
      slotTimes: ['11:00', '09:00'],
      durationMinutes: 90,
      timeZone: BOGOTA,
      busy: [],
    });
    assert.deepEqual(result.unscheduled, []);
    assert.deepEqual(
      result.assignments.map(({ matchId, fieldId, start }) => [matchId, fieldId, start.toISOString()]),
      [
        ['m1', 'f1', '2026-10-24T14:00:00.000Z'],
        ['m2', 'f2', '2026-10-24T14:00:00.000Z'],
        ['m3', 'f1', '2026-10-24T16:00:00.000Z'],
        ['m4', 'f2', '2026-10-24T16:00:00.000Z'],
      ],
    );
  });

  it('informa los partidos sin cupo cuando falta capacidad', () => {
    const result = planSchedule({
      matches: four,
      fieldIds: ['f1'],
      slotTimes: ['09:00', '11:00'],
      durationMinutes: 90,
      timeZone: BOGOTA,
      busy: [],
    });
    assert.equal(result.assignments.length, 2);
    assert.deepEqual(result.unscheduled, ['m3', 'm4']);
  });

  it('evita canchas ocupadas por otros partidos', () => {
    const result = planSchedule({
      matches: [four[0]],
      fieldIds: ['f1'],
      slotTimes: ['09:00', '11:00'],
      durationMinutes: 90,
      timeZone: BOGOTA,
      busy: [{ fieldId: 'f1', teams: ['X', 'Y'], start: at('2026-10-24T14:00Z'), end: at('2026-10-24T15:30Z') }],
    });
    assert.equal(result.assignments[0].start.toISOString(), '2026-10-24T16:00:00.000Z');
  });

  it('un equipo no juega dos partidos a la vez aunque haya otra cancha libre', () => {
    const result = planSchedule({
      matches: [four[0]],
      fieldIds: ['f1', 'f2'],
      slotTimes: ['09:00', '11:00'],
      durationMinutes: 90,
      timeZone: BOGOTA,
      busy: [{ fieldId: 'f9', teams: ['A', 'Z'], start: at('2026-10-24T14:00Z'), end: at('2026-10-24T15:30Z') }],
    });
    assert.deepEqual(
      [result.assignments[0].fieldId, result.assignments[0].start.toISOString()],
      ['f1', '2026-10-24T16:00:00.000Z'],
    );
  });

  it('una franja que empieza justo al terminar otro partido sí está libre', () => {
    const result = planSchedule({
      matches: [four[0]],
      fieldIds: ['f1'],
      slotTimes: ['10:30'],
      durationMinutes: 90,
      timeZone: BOGOTA,
      busy: [{ fieldId: 'f1', teams: ['X', 'Y'], start: at('2026-10-24T14:00Z'), end: at('2026-10-24T15:30Z') }],
    });
    assert.equal(result.assignments.length, 1);
  });

  it('programa por jornada y cada partido en el día de su jornada', () => {
    const result = planSchedule({
      matches: [match('r2', ['A', 'C'], 2, '2026-10-31'), match('r1', ['A', 'B'], 1, '2026-10-24')],
      fieldIds: ['f1'],
      slotTimes: ['09:00'],
      durationMinutes: 90,
      timeZone: BOGOTA,
      busy: [],
    });
    assert.deepEqual(
      result.assignments.map((item) => [item.matchId, item.start.toISOString()]),
      [
        ['r1', '2026-10-24T14:00:00.000Z'],
        ['r2', '2026-10-31T14:00:00.000Z'],
      ],
    );
  });

  it('no muta la entrada y deduplica franjas repetidas', () => {
    const busy = [{ fieldId: 'f1', teams: ['X'], start: at('2026-10-24T14:00Z'), end: at('2026-10-24T15:30Z') }];
    const result = planSchedule({
      matches: [four[0], four[1]],
      fieldIds: ['f1'],
      slotTimes: ['11:00', '11:00', '09:00'],
      durationMinutes: 90,
      timeZone: BOGOTA,
      busy,
    });
    assert.equal(busy.length, 1);
    assert.equal(result.assignments.length, 1);
    assert.deepEqual(result.unscheduled, ['m2']);
  });
});
