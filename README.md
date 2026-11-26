# Run Territory — MVP

Jogo de corrida com conquista de territórios: você corre pela cidade com GPS, sai do seu território
desenhando um rastro e, ao voltar, a área fechada vira sua. Áreas de outros jogadores podem ser tomadas.

> **Quer rodar no seu celular?** Siga o guia passo a passo para iniciantes:
> [docs/COMO-RODAR-NO-CELULAR.md](docs/COMO-RODAR-NO-CELULAR.md).

Tudo em **TypeScript**:

| Parte | Pasta | Tecnologia |
|---|---|---|
| Motor de conquista (regras do jogo) | `packages/engine` | TypeScript puro + Turf.js (testes e referência) |
| Backend | `apps/server` | Fastify 5, WebSocket, PostgreSQL 16 + PostGIS 3.4 |
| App | `apps/mobile` | Expo SDK 58 (React Native), Expo Router, MapLibre, expo-location |
| Espectador web | `apps/server/public` | MapLibre GL JS, servido em `http://localhost:3000/` |

## Como a conquista funciona

1. **Base:** na primeira corrida o jogador ganha um círculo de 30 m no ponto de partida (sem roubar de ninguém).
2. **Rastro:** ao sair do próprio território, o percurso vira um rastro (linha tracejada no mapa).
3. **Fechar área:** ao voltar ao território, o jogador ganha a faixa do rastro (10 m) **mais toda a área
   fechada** entre o rastro e o território. Tecnicamente: `território ∪ faixa`, preenchendo os buracos
   *novos* (buracos que já existiam, por exemplo uma área tomada por outro, continuam buracos).
4. **Laço longe de casa:** cruzar o próprio rastro (ou voltar a menos de 20 m de um ponto dele depois de
   150 m) conquista o laço. Isso permite expandir em outras regiões da cidade.
5. **Tomada:** toda área conquistada é retirada de quem a possuía. Cercar a ilha de outro jogador
   toma ela inteira. **Invariante:** territórios nunca se sobrepõem.
6. **Rastro aberto** no fim da corrida é perdido.
7. **Filtros de GPS:** descarta precisão pior que 35 m, saltos acima de 45 km/h e micro-movimentos < 3 m.
   Após uma pausa, a distância percorrida parada não conta; um salto > 200 m quebra o rastro.

O servidor é a autoridade: o app envia os pontos de GPS a cada 3 s e o backend roda a regra dentro de
uma transação do PostgreSQL (polígonos, interseções, diferenças e área geodésica em m² via PostGIS).
A mesma máquina de estados (`RunTracker`) roda sobre duas implementações de `World`:
`TurfWorld` (memória) e `PgWorld` (PostGIS) — os testes comparam as duas.

## Rodar localmente

Pré-requisitos: Node 22+, PostgreSQL 16 com PostGIS (ou Docker).

```bash
# banco + servidor com Docker
docker compose up --build

# ou sem Docker (com Postgres/PostGIS local em postgres://postgres@localhost:5432/runterritory)
npm install
npm run dev:server          # aplica as migrações e sobe em http://localhost:3000

# popular o mapa com jogadores-robô (contas ana, bia, caio, duda)
npm run simulate -w @run-territory/server              # instantâneo
npm run simulate -w @run-territory/server -- --live    # correndo "ao vivo"
npm run simulate -w @run-territory/server -- --center -22.9068,-43.1729   # outra cidade
```

Abra `http://localhost:3000/` para ver o mapa de espectador.

### Testes

```bash
createdb runterritory_test && psql -d runterritory_test -c 'create extension postgis'
npm test        # 14 testes do motor + 10 testes de API contra PostGIS
```

### App

O MapLibre usa código nativo, então o app roda num **development build** (não no Expo Go):

```bash
cd apps/mobile
npm install --legacy-peer-deps
npm ci
npx expo run:android        # ou: npx expo run:ios  /  npx eas-cli@latest build -p android --profile preview (APK na nuvem)
```

No celular, toque em **⚙ Configurar servidor** na tela inicial (ou **Configurações** depois de entrar) e coloque o endereço do servidor (ex.: `http://192.168.0.10:3000`,
o IP do computador na mesma rede). Para testar sem sair de casa, ligue o **Modo simulação**: durante a
corrida, toque no mapa e o corredor vai até o ponto.

Telas: inicial, cadastro, login, mapa principal, corrida em andamento, resumo, ranking, amigos (aliados),
histórico (corridas e conquistas/perdas), perfil (nível, XP e medalhas), perfil de outro jogador e configurações.

## API (resumo)

| Método | Rota | O que faz |
|---|---|---|
| POST | `/api/auth/register`, `/api/auth/login`, `/api/auth/logout` | contas (token Bearer) |
| GET/PATCH | `/api/me` | usuário logado / trocar cor |
| GET | `/api/territories?bbox=minLng,minLat,maxLng,maxLat` | territórios (relação `me`/`friend`/`rival`) |
| GET | `/api/live` | corredores ativos agora |
| POST | `/api/runs` · `/api/runs/:id/points` · `/pause` · `/resume` · `/finish` | ciclo da corrida |
| GET | `/api/runs` · `/api/runs/:id` | histórico e resumo (percurso, áreas, tomadas) |
| GET | `/api/events` | histórico de conquistas e perdas |
| GET | `/api/rankings?by=area\|distance\|conquests&period=week\|month\|all&scope=all\|friends` | ranking |
| GET | `/api/users/:id` | perfil, nível, totais e medalhas |
| GET/POST/DELETE | `/api/friends` | aliados |
| WS | `/ws?token=…` | `territories_changed`, `runner`, `runner_stopped`, `territory_lost` |

## Pontos de atenção e próximos passos

- **GPS em segundo plano:** hoje o rastreamento é com o app aberto (tela fica acesa durante a corrida).
  Próximo passo: `expo-task-manager` + permissão "sempre" para rastrear com a tela bloqueada.
- **Escala:** as conquistas são serializadas por um lock global no Postgres (simples e correto). Para
  muitos usuários: locks por célula de grade (geohash) e Redis pub/sub no lugar do hub de WebSocket em memória.
- **Ainda não implementado:** desafios entre amigos, missões diárias/semanais, ranking por bairro/cidade
  (precisa de geocodificação reversa ou polígonos de bairros no PostGIS), cortar o rastro de outro jogador.
- **Mapa:** estilo gratuito do OpenFreeMap (`apps/mobile/src/lib/theme.ts`), sem chave de API.
