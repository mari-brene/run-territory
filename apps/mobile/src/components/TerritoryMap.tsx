// Mapa central do jogo: territórios de todos os jogadores, corredores ao vivo, rastro e posição.
import { Camera, GeoJSONSource, Layer, Map, type CameraRef, type MapRef } from '@maplibre/maplibre-react-native';
import type { Feature, FeatureCollection, LineString, MultiPolygon, Point } from 'geojson';
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import type { GpsPoint, LiveRunner, Territories } from '../lib/api';
import { MAP_STYLE } from '../lib/theme';

export interface TerritoryMapHandle {
  flyTo: (lng: number, lat: number, zoom?: number) => void;
  fitBounds: (sw: [number, number], ne: [number, number]) => void;
  visibleBounds: () => Promise<[number, number, number, number] | null>;
}

interface Props {
  territories?: Territories | null;
  live?: LiveRunner[];
  myColor?: string;
  myTrail?: [number, number][];
  myPath?: [number, number][];
  position?: GpsPoint | null;
  highlight?: MultiPolygon[];
  initialCenter?: [number, number];
  initialZoom?: number;
  followUser?: boolean;
  onPress?: (lng: number, lat: number) => void;
  onRegionChange?: () => void;
}

const emptyFC: FeatureCollection = { type: 'FeatureCollection', features: [] };
const line = (coords: [number, number][]): FeatureCollection<LineString> => ({
  type: 'FeatureCollection',
  features: coords.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }] : [],
});

export const TerritoryMap = forwardRef<TerritoryMapHandle, Props>(function TerritoryMap(p, ref) {
  const camera = useRef<CameraRef>(null);
  const map = useRef<MapRef>(null);

  useImperativeHandle(ref, () => ({
    flyTo: (lng, lat, zoom = 16) => camera.current?.flyTo({ center: [lng, lat], zoom, duration: 800 }),
    fitBounds: (sw, ne) => camera.current?.fitBounds([sw[0], sw[1], ne[0], ne[1]], { padding: { top: 80, bottom: 220, left: 40, right: 40 }, duration: 600 }),
    visibleBounds: async () => {
      try {
        const b = await map.current?.getBounds();
        return b ? [b[0], b[1], b[2], b[3]] : null;
      } catch {
        return null;
      }
    },
  }));

  const runners = useMemo<FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: (p.live ?? []).flatMap((r): Feature[] => [
        { type: 'Feature', properties: { color: r.color, username: r.username }, geometry: { type: 'Point', coordinates: [r.lng, r.lat] } as Point },
        ...(r.trail.length > 1
          ? [{ type: 'Feature', properties: { color: r.color }, geometry: { type: 'LineString', coordinates: r.trail } } as Feature]
          : []),
      ]),
    }),
    [p.live],
  );

  const me = useMemo<FeatureCollection>(
    () =>
      p.position
        ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [p.position.lng, p.position.lat] } }] }
        : emptyFC,
    [p.position],
  );

  const highlight = useMemo<FeatureCollection>(
    () => ({ type: 'FeatureCollection', features: (p.highlight ?? []).map((g) => ({ type: 'Feature', properties: {}, geometry: g })) }),
    [p.highlight],
  );

  const color = p.myColor ?? '#7CFF4F';

  return (
    <Map
      ref={map}
      style={StyleSheet.absoluteFill}
      mapStyle={MAP_STYLE}
      compass={false}
      attribution
      logo={false}
      onPress={(e) => {
        const [lng, lat] = e.nativeEvent.lngLat;
        p.onPress?.(lng, lat);
      }}
      onRegionDidChange={() => p.onRegionChange?.()}
    >
      <Camera
        ref={camera}
        initialViewState={{ center: p.initialCenter ?? [-46.6576, -23.5874], zoom: p.initialZoom ?? 15 }}
        trackUserLocation={p.followUser ? 'course' : undefined}
      />

      {/* Territórios: preenchimento na cor do dono; contorno sólido (eu/rivais) ou tracejado (aliados) */}
      <GeoJSONSource id="territories" data={(p.territories as FeatureCollection) ?? emptyFC}>
        <Layer
          id="territory-fill"
          type="fill"
          paint={{
            'fill-color': ['get', 'color'],
            'fill-opacity': ['match', ['get', 'relation'], 'me', 0.45, 'friend', 0.3, 0.28],
          }}
        />
        <Layer
          id="territory-line"
          type="line"
          filter={['!=', ['get', 'relation'], 'friend']}
          paint={{ 'line-color': ['get', 'color'], 'line-width': ['match', ['get', 'relation'], 'me', 3, 2] }}
        />
        <Layer
          id="territory-line-friend"
          type="line"
          filter={['==', ['get', 'relation'], 'friend']}
          paint={{ 'line-color': ['get', 'color'], 'line-width': 2, 'line-dasharray': [2, 1.5] }}
        />
        <Layer
          id="territory-label"
          type="symbol"
          minzoom={14}
          layout={{ 'text-field': ['get', 'username'], 'text-size': 12, 'text-font': ['Noto Sans Bold'] }}
          paint={{ 'text-color': '#ffffff', 'text-halo-color': '#000000', 'text-halo-width': 1.5 }}
        />
      </GeoJSONSource>

      {/* Área recém-conquistada (resumo) */}
      <GeoJSONSource id="highlight" data={highlight}>
        <Layer id="highlight-fill" type="fill" paint={{ 'fill-color': '#FFFFFF', 'fill-opacity': 0.25 }} />
        <Layer id="highlight-line" type="line" paint={{ 'line-color': '#FFFFFF', 'line-width': 2 }} />
      </GeoJSONSource>

      {/* Percurso completo da corrida */}
      <GeoJSONSource id="my-path" data={line(p.myPath ?? [])}>
        <Layer id="my-path-line" type="line" paint={{ 'line-color': '#FFFFFF', 'line-width': 3, 'line-opacity': 0.7 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
      </GeoJSONSource>

      {/* Rastro de expansão (fora do território, ainda não fechado) */}
      <GeoJSONSource id="my-trail" data={line(p.myTrail ?? [])}>
        <Layer id="my-trail-glow" type="line" paint={{ 'line-color': color, 'line-width': 10, 'line-opacity': 0.25, 'line-blur': 4 }} />
        <Layer id="my-trail-line" type="line" paint={{ 'line-color': color, 'line-width': 4, 'line-dasharray': [1.5, 1] }} layout={{ 'line-cap': 'round' }} />
      </GeoJSONSource>

      {/* Outros corredores ao vivo */}
      <GeoJSONSource id="runners" data={runners}>
        <Layer id="runner-trails" type="line" filter={['==', ['geometry-type'], 'LineString']} paint={{ 'line-color': ['get', 'color'], 'line-width': 3, 'line-dasharray': [1.5, 1] }} />
        <Layer
          id="runner-dots"
          type="circle"
          filter={['==', ['geometry-type'], 'Point']}
          paint={{ 'circle-radius': 7, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#000', 'circle-stroke-width': 2 }}
        />
        <Layer
          id="runner-names"
          type="symbol"
          filter={['==', ['geometry-type'], 'Point']}
          layout={{ 'text-field': ['get', 'username'], 'text-size': 11, 'text-offset': [0, 1.4], 'text-font': ['Noto Sans Bold'] }}
          paint={{ 'text-color': '#fff', 'text-halo-color': '#000', 'text-halo-width': 1.5 }}
        />
      </GeoJSONSource>

      {/* Eu */}
      <GeoJSONSource id="me" data={me}>
        <Layer id="me-halo" type="circle" paint={{ 'circle-radius': 16, 'circle-color': color, 'circle-opacity': 0.25 }} />
        <Layer id="me-dot" type="circle" paint={{ 'circle-radius': 8, 'circle-color': color, 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 }} />
      </GeoJSONSource>
    </Map>
  );
});
