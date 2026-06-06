import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoom, joinRoom } from '../../../src/services/multiplayer/MultiplayerAPI';
import { useAuthStore } from '../../../src/stores/authStore';
import { useSettingsStore } from '../../../src/stores/settingsStore';
import { resetClientStores } from '../../utils/resetStores';

describe('MultiplayerAPI', () => {
  beforeEach(() => {
    resetClientStores();
    useSettingsStore.setState((state) => ({
      ...state,
      server: { ...state.server, endpoint: 'https://service.test' },
    }));
    useAuthStore.getState().setToken('jwt-token');
  });

  afterEach(() => {
    resetClientStores();
  });

  it('sends the bearer token when creating rooms and normalizes snake_case payloads', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      room_id: 'room-1',
      host_player_id: 'host-1',
      config: {
        room_name: '测试房间',
        max_players: 4,
      },
      mode: 'new',
      created_at: '2025-01-01T00:00:00Z',
      started_at: null,
      state: {
        phase: 'waiting',
        world_day: 1,
        current_round: 0,
        players_acted: [],
        round_start_time: null,
        common_backstory: null,
      },
      players: [{
        player_id: 'host-1',
        player_name: 'Alice',
        is_host: true,
        is_ready: false,
        is_online: true,
        last_heartbeat: '2025-01-01T00:00:00Z',
        status: 'waiting',
        joined_at_round: 0,
      }],
      character_slots: [],
      room_notifications: [],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const room = await createRoom({ roomName: '测试房间', maxPlayers: 4 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://service.test/api/v1/multiplayer/rooms',
      expect.objectContaining({ method: 'POST' }),
    );

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(request.headers).toMatchObject({
      Authorization: 'Bearer jwt-token',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String(request.body))).toEqual({
      mode: 'new',
      config: { roomName: '测试房间', maxPlayers: 4 },
    });

    expect(room.roomId).toBe('room-1');
    expect(room.config.roomName).toBe('测试房间');
    expect(room.players[0]?.playerName).toBe('Alice');
  });

  it('sends the bearer token when joining rooms', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      room_id: 'room-1',
      host_player_id: 'host-1',
      config: { room_name: '测试房间', max_players: 4 },
      mode: 'new',
      created_at: '2025-01-01T00:00:00Z',
      started_at: null,
      state: {
        phase: 'waiting',
        world_day: 1,
        current_round: 0,
        players_acted: [],
        round_start_time: null,
        common_backstory: null,
      },
      players: [],
      character_slots: [],
      room_notifications: [],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await joinRoom('room-1', 'secret', 'slot-2');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://service.test/api/v1/multiplayer/rooms/room-1/join',
      expect.objectContaining({ method: 'POST' }),
    );

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(request.headers).toMatchObject({ Authorization: 'Bearer jwt-token' });
    expect(JSON.parse(String(request.body))).toEqual({
      password: 'secret',
      claimed_slot_id: 'slot-2',
    });
  });
});