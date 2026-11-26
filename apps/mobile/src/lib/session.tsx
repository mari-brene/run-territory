// Sessão do usuário (token salvo no SecureStore) e preferências do app.
import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, getBaseUrl, setBaseUrl, setToken, type User } from './api';

interface Settings {
  /** Modo simulação: toque no mapa para "correr" até o ponto — para testar sem sair de casa. */
  simulation: boolean;
  /** Endereço do servidor (útil para testar no celular apontando para o computador). */
  apiUrl: string;
}

interface SessionValue {
  ready: boolean;
  user: User | null;
  settings: Settings;
  signIn: (login: string, password: string) => Promise<void>;
  signUp: (username: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateSettings: (s: Partial<Settings>) => Promise<void>;
}

const Ctx = createContext<SessionValue | null>(null);
const TOKEN_KEY = 'rt.token';
const SETTINGS_KEY = 'rt.settings';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<Settings>({ simulation: false, apiUrl: getBaseUrl() });

  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(SETTINGS_KEY);
        if (raw) {
          const s = { ...settings, ...JSON.parse(raw) } as Settings;
          setSettings(s);
          setBaseUrl(s.apiUrl);
        }
        const t = await SecureStore.getItemAsync(TOKEN_KEY);
        if (t) {
          setToken(t);
          setUser(await api.me());
        }
      } catch {
        setToken(null);
      } finally {
        setReady(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finishAuth = useCallback(async (r: { token: string; user: User }) => {
    setToken(r.token);
    await SecureStore.setItemAsync(TOKEN_KEY, r.token);
    setUser(r.user);
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      ready,
      user,
      settings,
      signIn: async (login, password) => finishAuth(await api.login(login, password)),
      signUp: async (username, email, password) => finishAuth(await api.register(username, email, password)),
      signOut: async () => {
        await api.logout().catch(() => {});
        setToken(null);
        await SecureStore.deleteItemAsync(TOKEN_KEY);
        setUser(null);
      },
      refreshUser: async () => setUser(await api.me()),
      updateSettings: async (patch) => {
        const s = { ...settings, ...patch };
        setSettings(s);
        setBaseUrl(s.apiUrl);
        await SecureStore.setItemAsync(SETTINGS_KEY, JSON.stringify(s));
      },
    }),
    [ready, user, settings, finishAuth],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession fora do SessionProvider');
  return v;
}
