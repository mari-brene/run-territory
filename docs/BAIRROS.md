# Disputas por bairro: como cadastrar os bairros da sua cidade

A disputa por bairro mostra **quem domina cada bairro** (quem tem a maior parte do bairro no território)
e um ranking por bairro: domínio agora, área conquistada na semana e no mês. No app, fica em
**Ranking > Bairros**.

O servidor não sabe sozinho onde ficam os bairros. Você precisa importar os contornos uma vez, como um
arquivo **GeoJSON**.

## Para testar já: setores de mentira

Cria uma grade de 3×3 quadrados de 600 m ("Setor A1" ... "Setor C3") em volta de um ponto:

```bash
# com Docker (servidor local)
docker compose exec server npm run regions -w @run-territory/server -- --demo --center -23.5874,-46.6576

# sem Docker, ou apontando para um banco online (defina DATABASE_URL antes)
npm run regions -w @run-territory/server -- --demo --center -23.5874,-46.6576 --size 600 --grid 3
```

Use o mesmo `--center` dos robôs (`npm run simulate`) para já ver disputa nos setores.

## Bairros de verdade

1. **Baixe os contornos dos bairros** da sua cidade. Algumas fontes:
   - O portal de dados ou o geoportal da prefeitura (por exemplo, o GeoSampa em São Paulo e o data.rio
     no Rio). Procure por "bairros" ou "distritos".
   - **IBGE:** a malha de bairros do Censo. Vem em shapefile (`.shp`).
   - **OpenStreetMap**, pelo site overpass-turbo.eu: procure os limites de bairro da sua cidade e exporte
     como GeoJSON.
2. **Converta para GeoJSON, se precisar,** e simplifique. No site <https://mapshaper.org>, arraste o
   arquivo (o `.zip` do shapefile serve), clique em **Simplify** (uns 10% já bastam) e depois em
   **Export > GeoJSON**.
3. **Veja qual campo tem o nome do bairro.** No mapshaper, clique num bairro e veja as propriedades,
   por exemplo `NOME`, `name` ou `NM_BAIRRO`.
4. **Importe:**

   ```bash
   npm run regions -w @run-territory/server -- --file bairros.geojson --city "São Paulo" --name-prop NOME
   ```

   Com Docker, copie o arquivo para dentro do contêiner antes:
   `docker compose cp bairros.geojson server:/tmp/bairros.geojson` e use `--file /tmp/bairros.geojson`.

Rodar de novo com o mesmo arquivo **atualiza** os bairros, sem duplicar (a chave é nome + cidade).
Se não passar `--name-prop`, o importador tenta `name`, `nome`, `NOME`, `NM_BAIRRO` e `NOME_DIST`.
Geometrias com defeito são corrigidas automaticamente.

## Regras

- **Domínio agora:** a área do território de cada jogador que fica dentro do bairro. Quem tem mais é o
  dono (👑) e aparece com a porcentagem do bairro.
- **Semana / mês:** a área conquistada dentro do bairro no período. "Esta semana" começa na segunda à
  meia-noite, no fuso `APP_TIMEZONE` (padrão: `America/Sao_Paulo`).
- Um território pode contar para mais de um bairro, se estiver na divisa.
