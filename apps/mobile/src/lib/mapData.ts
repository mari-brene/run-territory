// Dados do mapa: territórios visíveis + corredores ao vivo, atualizados por WebSocket.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { api, type LiveRunner, type Territories } from './api';
import { useRealtime } from './realtime';
import { useSession } from './session';

type Bbox = [number, number, number, number];

export function useMapData(version = 0) {
  const { user } = useSession();
  const [territories, setTerritories] = useState<Territories | null>(null);
  const [live, setLive] = useState<LiveRunner[]>([]);
  const bbox = useRef<Bbox | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const reload = useCallback(async () => {
    try {
      const b = bbox.current;
      // busca com margem para não recarregar a cada pequeno movimento
      const padded: Bbox | undefined = b ? [b[0] - (b[2] - b[0]), b[1] - (b[3] - b[1]), b[2] + (b[2] - b[0]), b[3] + (b[3] - b[1])] : undefined;
      setTerritories(await api.territories(padded));
    } catch {
      /* mantém o último estado */
    }
  }, []);

  const setViewport = useCallback(
    (b: Bbox | null) => {
      bbox.current = b;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(reload, 400);
    },
    [reload],
  );

  useEffect(() => {
    if (!user) return;
    reload();
    api.live().then((l) => setLive(l.filter((r) => r.userId !== user.id))).catch(() => {});
  }, [user, version, reload]);

  useRealtime(!!user, (m) => {
    if (m.type === 'territories_changed') setViewport(bbox.current);
    else if (m.type === 'runner' && m.userId !== user?.id)
      setLive((old) => [...old.filter((r) => r.userId !== m.userId), { userId: m.userId, username: m.username, color: m.color, lat: m.lat, lng: m.lng, trail: m.trail }]);
    else if (m.type === 'runner_stopped') setLive((old) => old.filter((r) => r.userId !== m.userId));
    else if (m.type === 'territory_lost' && m.userId === user?.id)
      Alert.alert('Território invadido!', `${m.byUsername} tomou ${Math.round(m.area).toLocaleString('pt-BR')} m² do seu território.`);
    else if (m.type === 'challenge') {
      const text: Record<string, string> = {
        pending: `${m.byUsername} desafiou você! Veja na aba Missões.`,
        active: `${m.byUsername} aceitou seu desafio. Valendo!`,
        declined: `${m.byUsername} recusou seu desafio.`,
        cancelled: `${m.byUsername} cancelou o desafio.`,
      };
      if (text[m.status]) Alert.alert('Desafio', text[m.status]);
    }
  });

  return { territories, live, reload, setViewport };
}
