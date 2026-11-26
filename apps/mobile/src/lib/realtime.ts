// WebSocket com reconexão automática para receber o mapa em tempo real.
import { useEffect, useRef } from 'react';
import { wsUrl } from './api';

export type ServerMessage =
  | { type: 'hello'; userId: string }
  | { type: 'territories_changed'; userIds: string[]; by: string }
  | { type: 'runner'; userId: string; username: string; color: string; lat: number; lng: number; trail: [number, number][] }
  | { type: 'runner_stopped'; userId: string }
  | { type: 'territory_lost'; userId: string; by: string; byUsername: string; area: number };

export function useRealtime(enabled: boolean, onMessage: (m: ServerMessage) => void) {
  const handler = useRef(onMessage);
  handler.current = onMessage;

  useEffect(() => {
    if (!enabled) return;
    let ws: WebSocket | null = null;
    let stopped = false;
    let retry = 1000;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      ws = new WebSocket(wsUrl());
      ws.onopen = () => {
        retry = 1000;
      };
      ws.onmessage = (e) => {
        try {
          handler.current(JSON.parse(String(e.data)));
        } catch {
          /* mensagem inválida */
        }
      };
      ws.onclose = () => {
        if (stopped) return;
        timer = setTimeout(connect, retry);
        retry = Math.min(retry * 2, 30_000);
      };
    };
    connect();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      ws?.close();
    };
  }, [enabled]);
}
