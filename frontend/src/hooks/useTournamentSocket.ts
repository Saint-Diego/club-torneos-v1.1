import { useEffect, useRef } from 'react';
import { socket } from '../lib/socket';
import type { StandingRow } from '../types';

interface Handlers {
  onStandings?: (table: StandingRow[]) => void;
  onMatch?: () => void;
  onBracket?: () => void;
}

interface StandingsPayload {
  tournamentId: string;
  table: StandingRow[];
}

interface TournamentPayload {
  tournamentId: string;
}

export function useTournamentSocket(tournamentId: string, handlers: Handlers): void {
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const join = () => socket.emit('tournament:join', tournamentId);
    const onStandings = (payload: StandingsPayload) => {
      if (payload.tournamentId === tournamentId) handlersRef.current.onStandings?.(payload.table);
    };
    const onMatch = (payload: TournamentPayload) => {
      if (payload.tournamentId === tournamentId) handlersRef.current.onMatch?.();
    };
    const onBracket = (payload: TournamentPayload) => {
      if (payload.tournamentId === tournamentId) handlersRef.current.onBracket?.();
    };

    if (!socket.connected) socket.connect();
    socket.on('connect', join);
    socket.on('standings:updated', onStandings);
    socket.on('match:updated', onMatch);
    socket.on('bracket:updated', onBracket);
    join();

    return () => {
      socket.emit('tournament:leave', tournamentId);
      socket.off('connect', join);
      socket.off('standings:updated', onStandings);
      socket.off('match:updated', onMatch);
      socket.off('bracket:updated', onBracket);
    };
  }, [tournamentId]);
}
