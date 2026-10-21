const dateFormatter = new Intl.DateTimeFormat('es-CO', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatMatchDate = (iso: string): string => dateFormatter.format(new Date(iso));

export const todayInputValue = (): string => new Date().toLocaleDateString('en-CA');

export function dayRange(day: string): { from: string; to: string } {
  return {
    from: new Date(`${day}T00:00:00`).toISOString(),
    to: new Date(`${day}T23:59:59.999`).toISOString(),
  };
}

export const signed = (value: number): string => (value > 0 ? `+${value}` : String(value));

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Ocurrió un error inesperado';

export const toLocalInput = (iso: string): string => {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export const fromLocalInput = (value: string): string => new Date(value).toISOString();

export function venueLabel(match: { venue?: { name: string; fields: { _id?: string; name: string }[] }; field?: string }): string {
  if (!match.venue) return 'Cancha por definir';
  const field = match.venue.fields.find((item) => item._id === match.field);
  return field ? `${match.venue.name} · ${field.name}` : match.venue.name;
}
