// Mapa central do jogo: territórios de todos os jogadores (com padrão e emblema), corredores ao vivo, rastro e o avatar.
import { Camera, GeoJSONSource, Images, Layer, Map, Marker, type CameraRef, type MapRef } from '@maplibre/maplibre-react-native';
import type { Feature, FeatureCollection, LineString, MultiPolygon, Point } from 'geojson';
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import type { GpsPoint, LiveRunner, Territories } from '../lib/api';
import type { Look } from '../lib/look';
import { MAP_STYLE, theme } from '../lib/theme';
import { Avatar } from './Avatar';

// Padrões são brancos translúcidos (a cor do dono fica na camada de baixo). Emblemas são selos prontos.
const MAP_IMAGES = {
  'pattern-listras': require('../../assets/map/pattern-listras.png'),
  'pattern-bolinhas': require('../../assets/map/pattern-bolinhas.png'),
  'pattern-hexagonos': require('../../assets/map/pattern-hexagonos.png'),
  'pattern-xadrez': require('../../assets/map/pattern-xadrez.png'),
  'emblem-estrela': require('../../assets/map/emblem-estrela.png'),
  'emblem-raio': require('../../assets/map/emblem-raio.png'),
  'emblem-chama': require('../../assets/map/emblem-chama.png'),
  'emblem-coroa': require('../../assets/map/emblem-coroa.png'),
};
const hasPattern = ['all', ['has', 'pattern'], ['!=', ['get', 'pattern'], 'liso']];
const hasEmblem = ['all', ['has', 'emblem'], ['!=', ['get', 'emblem'], 'inicial']];

export interface TerritoryMapHandle {
  flyTo: (lng: number, lat: number, zoom?: number) => void;
  fitBounds: (sw: [number, number], ne: [number, number]) => void;
  visibleBounds: () => Promise<[number, number, number, number] | null>;
}

interface Props {
  territories?: Territories | null;
  live?: LiveRunner[];
  myColor?: string;
  /** Com o visual, a posição aparece como o avatar do corredor em vez de um ponto. */
  myLook?: Look;
  running?: boolean;
  /** Inclinação da câmera (graus). Padrão 45, como num jogo; use 0 para visão de cima. */
  pitch?: number;
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
    flyTo: (lng, lat, zoom = 16) => camera.current?.flyTo({ center: [lng, lat], zoom, pitch: p.pitch ?? 45, duration: 800 }),
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

  const color = p.myColor ?? theme.run;

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
        initialViewState={{ center: p.initialCenter ?? [-46.6576, -23.5874], zoom: p.initialZoom ?? 15, pitch: p.pitch ?? 45 }}
        trackUserLocation={p.followUser ? 'course' : undefined}
      />

      <Images images={MAP_IMAGES} />

      {/* Territórios: brilho, preenchimento na cor do dono, padrão por cima, contorno sólido (eu/rivais) ou tracejado (aliados) */}
      <GeoJSONSource id="territories" data={(p.territories as FeatureCollection) ?? emptyFC}>
        <Layer id="territory-glow" type="line" paint={{ 'line-color': ['get', 'color'], 'line-width': 12, 'line-blur': 8, 'line-opacity': 0.55 }} />
        <Layer
          id="territory-fill"
          type="fill"
          paint={{
            'fill-color': ['get', 'color'],
            'fill-opacity': ['match', ['get', 'relation'], 'me', 0.45, 'friend', 0.32, 0.3],
          }}
        />
        <Layer id="territory-pattern" type="fill" filter={hasPattern as any} paint={{ 'fill-pattern': ['concat', 'pattern-', ['get', 'pattern']], 'fill-opacity': 0.85 }} />
        <Layer
          id="territory-line"
          type="line"
          filter={['!=', ['get', 'relation'], 'friend']}
          paint={{ 'line-color': ['get', 'color'], 'line-width': ['match', ['get', 'relation'], 'me', 4, 3] }}
          layout={{ 'line-join': 'round' }}
        />
        <Layer
          id="territory-line-friend"
          type="line"
          filter={['==', ['get', 'relation'], 'friend']}
          paint={{ 'line-color': ['get', 'color'], 'line-width': 3, 'line-dasharray': [2, 1.5] }}
        />
        <Layer
          id="territory-label"
          type="symbol"
          minzoom={14}
          layout={{
            'text-field': ['get', 'username'],
            'text-size': 12,
            'text-font': ['Noto Sans Bold'],
            'icon-image': ['case', hasEmblem as any, ['concat', 'emblem-', ['get', 'emblem']], ''],
            'icon-size': 0.55,
            'text-offset': ['case', hasEmblem as any, ['literal', [0, 1.6]], ['literal', [0, 0]]],
            'icon-allow-overlap': true,
          }}
          paint={{ 'text-color': theme.text, 'text-halo-color': '#FFFFFF', 'text-halo-width': 2 }}
        />
      </GeoJSONSource>

      {/* Área recém-conquistada (resumo) */}
      <GeoJSONSource id="highlight" data={highlight}>
        <Layer id="highlight-fill" type="fill" paint={{ 'fill-color': theme.xp, 'fill-opacity': 0.35 }} />
        <Layer id="highlight-line" type="line" paint={{ 'line-color': theme.xpDeep, 'line-width': 3 }} />
      </GeoJSONSource>

      {/* Percurso completo da corrida */}
      <GeoJSONSource id="my-path" data={line(p.myPath ?? [])}>
        <Layer id="my-path-line" type="line" paint={{ 'line-color': theme.text, 'line-width': 3, 'line-opacity': 0.6 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
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
          paint={{ 'circle-radius': 7, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 3 }}
        />
        <Layer
          id="runner-names"
          type="symbol"
          filter={['==', ['geometry-type'], 'Point']}
          layout={{ 'text-field': ['get', 'username'], 'text-size': 11, 'text-offset': [0, 1.4], 'text-font': ['Noto Sans Bold'] }}
          paint={{ 'text-color': theme.text, 'text-halo-color': '#FFFFFF', 'text-halo-width': 2 }}
        />
      </GeoJSONSource>

      {/* Eu: anel no chão + avatar (ou um ponto, quando não há visual) */}
      <GeoJSONSource id="me" data={me}>
        <Layer id="me-halo" type="circle" paint={{ 'circle-radius': 22, 'circle-color': color, 'circle-opacity': 0.22, 'circle-stroke-color': color, 'circle-stroke-width': 2, 'circle-stroke-opacity': 0.6, 'circle-pitch-alignment': 'map' }} />
        {!p.myLook && <Layer id="me-dot" type="circle" paint={{ 'circle-radius': 8, 'circle-color': color, 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 }} />}
      </GeoJSONSource>
      {p.myLook && p.position && (
        <Marker id="me-avatar" lngLat={[p.position.lng, p.position.lat]} anchor="bottom">
          <View>
            <Avatar look={p.myLook} size={46} running={p.running} />
          </View>
        </Marker>
      )}
    </Map>
  );
});
