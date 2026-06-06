import { getNarratives, getRoom, getRoundStatus, sendHeartbeat } from './MultiplayerAPI';
import { useGameStore } from '../../stores/gameStore';
import { useMultiplayerStore } from '../../stores/multiplayerStore';
import type { Message } from '../../types/game';
import type { NarrativeHistory, RoomPlayer, RoundResult } from '../../types/multiplayer';

export type ReconnectPhase = 'connected' | 'reconnecting' | 'offline';

export interface ReconnectState {
  phase: ReconnectPhase;
  attempts: number;
  lastError: string | null;
}

type Listener = (state: ReconnectState) => void;

function formatMultiplayerDiceSummary(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return '未公开判定';
  const dice = raw as Record<string, unknown>;
  if (dice.auto) return '无需检定';
  const outcome = String(dice.outcome ?? 'unknown');
  const outcomeLabel: Record<string, string> = {
    critical_success: '大成功',
    success: '成功',
    partial_success: '部分成功',
    failure: '失败',
    critical_failure: '大失败',
  };
  const diceValues = Array.isArray(dice.diceValues) ? dice.diceValues.join(', ') : '';
  const finalResult = dice.finalResult ?? '-';
  const difficulty = dice.difficultyLC ?? '-';
  return `2d6[${diceValues}] → ${outcomeLabel[outcome] || outcome} (${finalResult}/${difficulty})`;
}

function buildRoundMessages(
  roomId: string,
  round: number,
  narrative: string,
  playerActions: Record<string, string>,
  diceResults: Record<string, unknown>,
  players: RoomPlayer[],
  timestamp: number,
): Message[] {
  const details = Object.entries(playerActions).map(([playerId, action]) => {
    const player = players.find((item) => item.playerId === playerId);
    return {
      playerId,
      playerName: player?.characterName || player?.playerName || playerId,
      action,
      dice: formatMultiplayerDiceSummary(diceResults[playerId]),
    };
  });

  return [
    {
      id: `mp-${roomId}-round-summary-${round}`,
      type: 'round_summary',
      content: '行动与判定',
      timestamp,
      round,
      details,
    },
    {
      id: `mp-${roomId}-narrative-${round}`,
      type: 'pm',
      content: narrative,
      timestamp: timestamp + 1,
      round,
    },
  ];
}

function buildHistoryMessages(roomId: string, histories: NarrativeHistory[], players: RoomPlayer[]): Message[] {
  return histories
    .slice()
    .sort((left, right) => left.round - right.round)
    .flatMap((history) => {
      const timestamp = Number.isNaN(Date.parse(history.timestamp)) ? Date.now() : Date.parse(history.timestamp);
      return buildRoundMessages(
        roomId,
        history.round,
        history.narrative,
        history.playerActions,
        history.diceResults,
        players,
        timestamp,
      );
    });
}

class ReconnectService {
  private roomId: string | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<Listener>();
  private state: ReconnectState = {
    phase: 'connected',
    attempts: 0,
    lastError: null,
  };
  private isStarted = false;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): ReconnectState {
    return this.state;
  }

  start(roomId: string): void {
    if (this.isStarted && this.roomId === roomId) {
      return;
    }

    this.stop();
    this.roomId = roomId;
    this.isStarted = true;

    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
    }

    const isOnline = typeof navigator === 'undefined' || navigator.onLine;
    this.setState({
      phase: isOnline ? 'connected' : 'offline',
      attempts: 0,
      lastError: null,
    });

    if (!isOnline) {
      this.scheduleRetry(true);
    }
  }

  stop(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    if (this.isStarted && typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
    }

    this.roomId = null;
    this.isStarted = false;
    this.setState({
      phase: 'connected',
      attempts: 0,
      lastError: null,
    });
  }

  notifyTransportFailure(roomId: string, error: unknown): void {
    if (!this.isStarted || roomId !== this.roomId) {
      return;
    }

    const message = error instanceof Error ? error.message : String(error ?? '网络请求失败');
    const isOnline = typeof navigator === 'undefined' || navigator.onLine;
    this.setState({
      phase: isOnline ? 'reconnecting' : 'offline',
      lastError: message,
    });
    this.scheduleRetry(this.state.attempts === 0);
  }

  private handleOnline = (): void => {
    if (!this.roomId) {
      return;
    }
    this.setState({ phase: 'reconnecting' });
    this.scheduleRetry(true);
  };

  private handleOffline = (): void => {
    if (!this.roomId) {
      return;
    }
    this.setState({ phase: 'offline' });
  };

  private scheduleRetry(immediate = false): void {
    if (!this.roomId || this.retryTimer) {
      return;
    }

    const delay = immediate ? 0 : Math.min(15000, 2000 * Math.max(1, this.state.attempts + 1));
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.attemptReconnect();
    }, delay);
  }

  private async attemptReconnect(): Promise<void> {
    const roomId = this.roomId;
    if (!roomId) {
      return;
    }

    const isOnline = typeof navigator === 'undefined' || navigator.onLine;
    if (!isOnline) {
      this.setState({ phase: 'offline' });
      this.scheduleRetry();
      return;
    }

    const nextAttempt = this.state.attempts + 1;
    this.setState({
      phase: 'reconnecting',
      attempts: nextAttempt,
    });

    try {
      const storeBefore = useMultiplayerStore.getState();
      const lastKnownRound = storeBefore.narrativeHistory.reduce(
        (maxRound, history) => Math.max(maxRound, history.round),
        -1,
      );

      const [room, status, histories] = await Promise.all([
        getRoom(roomId),
        getRoundStatus(roomId),
        getNarratives(roomId, lastKnownRound),
        sendHeartbeat(roomId),
      ]);

      const multiplayer = useMultiplayerStore.getState();
      multiplayer.syncRoomSnapshot(room);
      multiplayer.updateRoundStatus(status);

      if (histories.length > 0) {
        const mergedHistories = [...useMultiplayerStore.getState().narrativeHistory];
        for (const history of histories) {
          if (!mergedHistories.some((existing) => existing.round === history.round)) {
            mergedHistories.push(history);
          }
        }
        mergedHistories.sort((left, right) => left.round - right.round);
        useMultiplayerStore.getState().setNarrativeHistory(mergedHistories);

        const game = useGameStore.getState();
        for (const message of buildHistoryMessages(roomId, histories, room.players)) {
          game.upsertMessage(message);
        }
      }

      let recoveredRounds = histories.length;
      const latestRoundResult: RoundResult | null | undefined = status.latestRoundResult;
      if (
        latestRoundResult
        && latestRoundResult.round > lastKnownRound
        && !histories.some((history) => history.round === latestRoundResult.round)
      ) {
        recoveredRounds += 1;
        const game = useGameStore.getState();
        for (const message of buildRoundMessages(
          roomId,
          latestRoundResult.round,
          latestRoundResult.narrative,
          latestRoundResult.playerActions,
          latestRoundResult.diceResults,
          room.players,
          Date.now(),
        )) {
          game.upsertMessage(message);
        }
      }

      const game = useGameStore.getState();
      game.clearStreaming();
      game.addMessage({
        id: `mp-${roomId}-reconnect-${Date.now()}`,
        type: 'system',
        content: recoveredRounds > 0
          ? `多人连接已恢复，已补拉 ${recoveredRounds} 个轮次的叙事。`
          : '多人连接已恢复。',
        timestamp: Date.now(),
      });

      this.setState({
        phase: 'connected',
        attempts: 0,
        lastError: null,
      });
    } catch (error) {
      this.setState({
        phase: 'reconnecting',
        attempts: nextAttempt,
        lastError: error instanceof Error ? error.message : String(error ?? '重连失败'),
      });
      this.scheduleRetry();
    }
  }

  private setState(next: Partial<ReconnectState>): void {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}

export const reconnectService = new ReconnectService();