// Cliente HTTP do backend Run Territory.
import Constants from 'expo-constants';
import type { FeatureCollection, MultiPolygon } from 'geojson';

const fromConfig = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;
let baseUrl = process.env.EXPO_PUBLIC_API_URL ?? fromConfig ?? 'http://localhost:3000';
let token: string | null = null;

export const getBaseUrl = () => baseUrl;
export const setBaseUrl = (u: string) => {
  baseUrl = u.replace(/\/+$/, '');
};
export const setToken = (t: string | null) => {
  token = t;
};
export const wsUrl = () => `${baseUrl.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(token ?? '')}`;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Sem conexão com o servidor');
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Erro ${res.status}`);
  return data as T;
}

// ---------- tipos ----------
export interface User {
  id: string;
  username: string;
  email: string;
  color: string;
  xp: number;
  level: number;
  xpIntoLevel: number;
  xpForNext: number;
}
export interface GpsPoint {
  lat: number;
  lng: number;
  t: number;
  acc?: number | null;
}
export interface Run {
  id: string;
  status: 'active' | 'paused' | 'finished';
  startedAt: string;
  endedAt: string | null;
  distanceM: number;
  movingTimeS: number;
  areaGainedM2: number;
  areaStolenM2: number;
  captures: number;
  xpEarned: number;
  trail?: [number, number][];
  pace?: string;
}
export interface RunEvent {
  type: 'base' | 'capture' | 'loop_capture' | 'trail_start' | 'trail_broken' | 'trail_lost';
  area?: number;
  geom?: MultiPolygon;
  stolen?: { victimId: string; username: string; area: number }[];
}
export interface PointsResponse {
  events: RunEvent[];
  rejected: number;
  trail: [number, number][];
  stats: { distanceM: number; movingTimeS: number };
}
export interface RunSummary extends Run {
  pace: string;
  avgSpeedKmh: number;
  path: [number, number][];
  conquests: { kind: string; areaM2: number; geom: MultiPolygon }[];
  steals: { victim: string; areaM2: number; geom: MultiPolygon }[];
  trailLost?: boolean;
}
export interface TerritoryProps {
  userId: string;
  username: string;
  color: string;
  areaM2: number;
  relation: 'me' | 'friend' | 'rival';
}
export type Territories = FeatureCollection<MultiPolygon, TerritoryProps>;
export interface LiveRunner {
  userId: string;
  username: string;
  color: string;
  lat: number;
  lng: number;
  trail: [number, number][];
}
export interface RankingRow {
  rank: number;
  userId: string;
  username: string;
  color: string;
  level: number;
  value: number;
}
export interface Medal {
  id: string;
  name: string;
  description: string;
  earned: boolean;
}
export interface Profile {
  id: string;
  username: string;
  color: string;
  memberSince: string;
  xp: number;
  level: number;
  xpIntoLevel: number;
  xpForNext: number;
  isFriend: boolean;
  totals: { areaM2: number; runs: number; distanceM: number; movingTimeS: number; captures: number; steals: number; losses: number; pace: string };
  medals: Medal[];
}
export interface ConquestLog {
  id: number;
  kind: 'base' | 'capture' | 'loop_capture' | 'steal';
  direction: 'gain' | 'loss';
  areaM2: number;
  createdAt: string;
  runId: string | null;
  byUsername: string;
  victimUsername: string | null;
}
export interface Friend {
  id: string;
  username: string;
  color: string;
  level: number;
  areaM2: number;
}

// ---------- endpoints ----------
export const api = {
  register: (username: string, email: string, password: string) =>
    req<{ token: string; user: User }>('POST', '/api/auth/register', { username, email, password }),
  login: (login: string, password: string) => req<{ token: string; user: User }>('POST', '/api/auth/login', { login, password }),
  logout: () => req<{ ok: true }>('POST', '/api/auth/logout'),
  me: () => req<User>('GET', '/api/me'),
  updateMe: (color: string) => req<User>('PATCH', '/api/me', { color }),
  palette: () => req<string[]>('GET', '/api/palette'),

  territories: (bbox?: [number, number, number, number]) =>
    req<Territories>('GET', `/api/territories${bbox ? `?bbox=${bbox.join(',')}` : ''}`),
  live: () => req<LiveRunner[]>('GET', '/api/live'),

  startRun: () => req<Run>('POST', '/api/runs'),
  currentRun: () => req<Run | null>('GET', '/api/runs/current'),
  sendPoints: (id: string, points: GpsPoint[]) => req<PointsResponse>('POST', `/api/runs/${id}/points`, { points }),
  pauseRun: (id: string) => req<Run>('POST', `/api/runs/${id}/pause`),
  resumeRun: (id: string) => req<Run>('POST', `/api/runs/${id}/resume`),
  finishRun: (id: string) => req<RunSummary>('POST', `/api/runs/${id}/finish`),
  runs: () => req<Run[]>('GET', '/api/runs'),
  run: (id: string) => req<RunSummary>('GET', `/api/runs/${id}`),

  events: () => req<ConquestLog[]>('GET', '/api/events'),
  rankings: (by: 'area' | 'distance' | 'conquests', period: 'week' | 'month' | 'all', scope: 'all' | 'friends' = 'all') =>
    req<RankingRow[]>('GET', `/api/rankings?by=${by}&period=${period}&scope=${scope}`),
  profile: (id: string) => req<Profile>('GET', `/api/users/${id}`),

  friends: () => req<Friend[]>('GET', '/api/friends'),
  addFriend: (username: string) => req<{ ok: true }>('POST', '/api/friends', { username }),
  removeFriend: (id: string) => req<{ ok: true }>('DELETE', `/api/friends/${id}`),
  searchUsers: (q: string) => req<{ id: string; username: string; color: string }[]>('GET', `/api/users?q=${encodeURIComponent(q)}`),
};
