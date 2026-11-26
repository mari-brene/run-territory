// Hub de tempo real: clientes conectados por WebSocket recebem atualizações de território
// e posições ao vivo. Uma instância só; para escalar horizontalmente, troque por Redis pub/sub
// (ou Postgres LISTEN/NOTIFY) mantendo esta mesma interface.
import type { WebSocket } from 'ws';

export type ServerMessage =
  | { type: 'territories_changed'; userIds: string[]; by: string }
  | { type: 'runner'; userId: string; username: string; color: string; lat: number; lng: number; trail: [number, number][] }
  | { type: 'runner_stopped'; userId: string }
  | { type: 'territory_lost'; userId: string; by: string; byUsername: string; area: number }
  | { type: 'challenge'; challengeId: string; status: string; byUsername: string };

export class Hub {
  private clients = new Map<WebSocket, string>();

  add(ws: WebSocket, userId: string) {
    this.clients.set(ws, userId);
    ws.on('close', () => this.clients.delete(ws));
  }

  broadcast(msg: ServerMessage) {
    const data = JSON.stringify(msg);
    for (const ws of this.clients.keys()) if (ws.readyState === 1) ws.send(data);
  }

  sendTo(userId: string, msg: ServerMessage) {
    const data = JSON.stringify(msg);
    for (const [ws, uid] of this.clients) if (uid === userId && ws.readyState === 1) ws.send(data);
  }
}
