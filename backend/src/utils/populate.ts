import type { PopulateOptions } from 'mongoose';

export const matchPopulate = (withSquads: boolean): PopulateOptions[] => [
  ...(['localTeam', 'visitorTeam'] as const).map<PopulateOptions>((path) => ({
    path,
    select: withSquads ? 'name shield colors players' : 'name shield colors',
    ...(withSquads ? { populate: { path: 'players', select: 'name' } } : {}),
  })),
  { path: 'venue', select: 'name fields' },
];
