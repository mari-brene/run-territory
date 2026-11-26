// Formatação para a interface (pt-BR).
export function formatDistance(m: number) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2).replace('.', ',')} km`;
}

export function formatArea(m2: number) {
  if (m2 >= 1_000_000) return `${(m2 / 1_000_000).toFixed(2).replace('.', ',')} km²`;
  return `${Math.round(m2).toLocaleString('pt-BR')} m²`;
}

export function formatDuration(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Ritmo médio em min/km. */
export function formatPace(distanceM: number, movingTimeS: number) {
  if (distanceM < 10 || movingTimeS <= 0) return '--:--';
  const secPerKm = movingTimeS / (distanceM / 1000);
  const m = Math.floor(secPerKm / 60);
  const s = Math.min(59, Math.round(secPerKm % 60));
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatSpeed(distanceM: number, movingTimeS: number) {
  const v = movingTimeS > 0 ? distanceM / 1000 / (movingTimeS / 3600) : 0;
  return `${v.toFixed(1).replace('.', ',')} km/h`;
}

export function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) + ' · ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** Distância haversine (m) — usada no modo simulação. */
export function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371008.8;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
