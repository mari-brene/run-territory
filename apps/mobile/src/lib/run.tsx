// Corrida em andamento: GPS (ou simulação), envio dos pontos em lotes para o servidor
// (que decide as conquistas), pausa/retomada/fim e eventos de conquista para a interface.
import * as Location from 'expo-location';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, type GpsPoint, type Run, type RunEvent, type RunSummary } from './api';
import { haversine } from './format';
import { useSession } from './session';

const FLUSH_MS = 3000;
const SIM_STEP_M = 10;
const SIM_SPEED_MPS = 3.2; // ~5:12 min/km
const SIM_TICK_MS = 250; // 1 passo de 10 m a cada 250 ms (relógio virtual acelerado)

export interface Toast {
  id: number;
  kind: 'gain' | 'steal' | 'info' | 'warn';
  text: string;
}

interface RunValue {
  run: Run | null;
  position: GpsPoint | null;
  path: [number, number][];
  trail: [number, number][];
  distanceM: number;
  movingTimeS: number;
  elapsedS: number;
  areaGainedM2: number;
  captures: number;
  toasts: Toast[];
  territoryVersion: number;
  error: string | null;
  start: (fallback?: { lat: number; lng: number }) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  finish: () => Promise<RunSummary | null>;
  /** Modo simulação: corre em linha reta até o ponto tocado. */
  simulateTo: (lng: number, lat: number) => void;
  bumpTerritories: () => void;
}

const Ctx = createContext<RunValue | null>(null);
let toastId = 1;

export function RunProvider({ children }: { children: ReactNode }) {
  const { user, settings } = useSession();
  const [run, setRun] = useState<Run | null>(null);
  const [position, setPosition] = useState<GpsPoint | null>(null);
  const [path, setPath] = useState<[number, number][]>([]);
  const [trail, setTrail] = useState<[number, number][]>([]);
  const [stats, setStats] = useState({ distanceM: 0, movingTimeS: 0, areaGainedM2: 0, captures: 0 });
  const [elapsedS, setElapsedS] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [territoryVersion, setTerritoryVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const runRef = useRef<Run | null>(null);
  const buffer = useRef<GpsPoint[]>([]);
  const flushing = useRef(false);
  const watcher = useRef<Location.LocationSubscription | null>(null);
  const simQueue = useRef<{ lat: number; lng: number }[]>([]);
  const simClock = useRef(0);
  const lastPos = useRef<GpsPoint | null>(null);
  runRef.current = run;

  const pushToast = useCallback((kind: Toast['kind'], text: string) => {
    const id = toastId++;
    setToasts((t) => [...t.slice(-2), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const handleEvents = useCallback(
    (events: RunEvent[]) => {
      let changed = false;
      for (const e of events) {
        const a = Math.round(e.area ?? 0).toLocaleString('pt-BR');
        if (e.type === 'base') {
          pushToast('gain', `Base criada! +${a} m²`);
          changed = true;
        } else if (e.type === 'capture' || e.type === 'loop_capture') {
          pushToast('gain', `Território conquistado! +${a} m²`);
          for (const s of e.stolen ?? []) pushToast('steal', `Você tomou ${Math.round(s.area).toLocaleString('pt-BR')} m² de ${s.username}`);
          setStats((s) => ({ ...s, areaGainedM2: s.areaGainedM2 + (e.area ?? 0), captures: s.captures + 1 }));
          changed = true;
        } else if (e.type === 'trail_start') {
          pushToast('info', 'Você saiu do seu território — volte para fechar a área!');
        } else if (e.type === 'trail_broken') {
          pushToast('warn', 'Rastro perdido: você se moveu demais durante a pausa');
        }
      }
      if (changed) setTerritoryVersion((v) => v + 1);
    },
    [pushToast],
  );

  const flush = useCallback(async () => {
    const r = runRef.current;
    if (!r || r.status !== 'active' || flushing.current || !buffer.current.length) return;
    flushing.current = true;
    const batch = buffer.current.splice(0, 200);
    try {
      const res = await api.sendPoints(r.id, batch);
      setTrail(res.trail);
      setStats((s) => ({ ...s, distanceM: res.stats.distanceM, movingTimeS: res.stats.movingTimeS }));
      handleEvents(res.events);
      setError(null);
    } catch (e: any) {
      if (e?.status === 0) buffer.current.unshift(...batch); // sem rede: tenta de novo
      setError(e?.message ?? 'Erro ao enviar GPS');
    } finally {
      flushing.current = false;
    }
  }, [handleEvents]);

  const onPoint = useCallback((p: GpsPoint) => {
    lastPos.current = p;
    setPosition(p);
    if (runRef.current?.status !== 'active') return;
    buffer.current.push(p);
    setPath((old) => [...old, [p.lng, p.lat]]);
  }, []);

  // Envio periódico + cronômetro
  useEffect(() => {
    if (!run || run.status !== 'active') return;
    const f = setInterval(flush, FLUSH_MS);
    const c = setInterval(() => setElapsedS((s) => s + 1), 1000);
    return () => {
      clearInterval(f);
      clearInterval(c);
    };
  }, [run, flush]);

  // Simulação: anda em direção ao próximo alvo da fila
  useEffect(() => {
    if (!run || !settings.simulation) return;
    const id = setInterval(() => {
      const target = simQueue.current[0];
      const cur = lastPos.current;
      if (!target || !cur || runRef.current?.status !== 'active') return;
      const d = haversine(cur, target);
      const k = d <= SIM_STEP_M ? 1 : SIM_STEP_M / d;
      if (k === 1) simQueue.current.shift();
      simClock.current = Math.max(simClock.current, Date.now()) + (Math.min(d, SIM_STEP_M) / SIM_SPEED_MPS) * 1000;
      onPoint({
        lat: cur.lat + (target.lat - cur.lat) * k,
        lng: cur.lng + (target.lng - cur.lng) * k,
        t: Math.round(simClock.current),
        acc: 5,
      });
    }, SIM_TICK_MS);
    return () => clearInterval(id);
  }, [run, settings.simulation, onPoint]);

  const startGps = useCallback(async () => {
    if (settings.simulation || watcher.current) return;
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') throw new Error('Permita o acesso à localização para correr');
    watcher.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 4 },
      (loc) => onPoint({ lat: loc.coords.latitude, lng: loc.coords.longitude, t: loc.timestamp, acc: loc.coords.accuracy }),
    );
  }, [settings.simulation, onPoint]);

  const stopGps = useCallback(() => {
    watcher.current?.remove();
    watcher.current = null;
  }, []);

  // Recupera corrida aberta (ex.: app fechado no meio da corrida)
  useEffect(() => {
    if (!user) return;
    api
      .currentRun()
      .then((r) => {
        if (!r) return;
        setRun(r);
        setTrail(r.trail ?? []);
        setStats((s) => ({ ...s, distanceM: r.distanceM, movingTimeS: r.movingTimeS, areaGainedM2: r.areaGainedM2, captures: r.captures }));
        if (r.status === 'active') startGps().catch(() => {});
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const reset = () => {
    buffer.current = [];
    simQueue.current = [];
    setPath([]);
    setTrail([]);
    setStats({ distanceM: 0, movingTimeS: 0, areaGainedM2: 0, captures: 0 });
    setElapsedS(0);
    setError(null);
  };

  const value = useMemo<RunValue>(
    () => ({
      run,
      position,
      path,
      trail,
      ...stats,
      elapsedS,
      toasts,
      territoryVersion,
      error,
      start: async (fallback) => {
        reset();
        if (settings.simulation) {
          const p = lastPos.current ?? (fallback ? { ...fallback, t: Date.now(), acc: 5 } : null);
          if (!p) throw new Error('Sem posição inicial para simular');
          simClock.current = Date.now();
          const r = await api.startRun();
          runRef.current = r;
          setRun(r);
          onPoint({ ...p, t: Date.now() });
        } else {
          await startGps();
          const r = await api.startRun();
          runRef.current = r;
          setRun(r);
          if (lastPos.current) onPoint({ ...lastPos.current, t: Date.now() });
        }
        activateKeepAwakeAsync().catch(() => {});
        setTimeout(flush, 300);
      },
      pause: async () => {
        if (!run) return;
        await flush();
        setRun(await api.pauseRun(run.id));
      },
      resume: async () => {
        if (!run) return;
        setRun(await api.resumeRun(run.id));
      },
      finish: async () => {
        if (!run) return null;
        await flush();
        const summary = await api.finishRun(run.id);
        stopGps();
        deactivateKeepAwake();
        setRun(null);
        reset();
        setTerritoryVersion((v) => v + 1);
        if (summary.trailLost) pushToast('warn', 'O rastro aberto foi perdido — volte ao território antes de finalizar');
        return summary;
      },
      simulateTo: (lng, lat) => {
        simQueue.current.push({ lat, lng });
      },
      bumpTerritories: () => setTerritoryVersion((v) => v + 1),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [run, position, path, trail, stats, elapsedS, toasts, territoryVersion, error, settings.simulation, flush, startGps, stopGps, onPoint],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRun() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useRun fora do RunProvider');
  return v;
}
