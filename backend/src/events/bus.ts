import { EventEmitter } from 'node:events';
import type { Stage } from '../types/domain';

export interface MatchResultChanged {
  matchId: string;
  tournamentId: string;
  stage: Stage;
  teamIds: [string, string];
}

type Listener = (payload: MatchResultChanged) => void | Promise<void>;

const MATCH_RESULT_CHANGED = 'match:resultChanged';

class DomainBus {
  private readonly emitter = new EventEmitter();

  emitMatchResultChanged(payload: MatchResultChanged): void {
    this.emitter.emit(MATCH_RESULT_CHANGED, payload);
  }

  onMatchResultChanged(listener: Listener): void {
    this.emitter.on(MATCH_RESULT_CHANGED, listener);
  }
}

export const bus = new DomainBus();
