# Como rodar o Run Territory no seu celular (guia para iniciantes)

Este guia leva você do zero até o app aberto no seu celular, conversando com o servidor que roda
no seu computador. Não precisa saber programar: é só seguir os passos e copiar os comandos.

**Tempo total:** uns 40 minutos na primeira vez (a maior parte é esperar downloads e a geração do app).

---

## Como as peças se encaixam

```
 [ Celular ]  --- Wi-Fi --->  [ Seu computador ]
  app Run Territory            servidor (porta 3000)  --->  banco de dados (PostgreSQL + PostGIS)
```

- O **banco de dados** guarda contas, corridas e territórios.
- O **servidor** é quem decide as conquistas. Ele roda no seu computador.
- O **app** no celular manda o GPS para o servidor e mostra o mapa.

Por isso o celular e o computador precisam estar **no mesmo Wi-Fi** (até a gente publicar o servidor na
internet, que é a próxima etapa do projeto).

---

## O que você vai precisar

- Um computador (Windows ou Mac).
- Um **celular Android**. (iPhone também dá, mas é mais trabalhoso: veja o final do guia.)
- Celular e computador no mesmo Wi-Fi.
- Uma conta gratuita na Expo: crie em <https://expo.dev/signup>. É a Expo que vai "fabricar" o app
  para você na nuvem, sem precisar instalar Android Studio.

> **Por que não dá para usar o app "Expo Go"?** O mapa do jogo usa um componente nativo (MapLibre) que
> não vem dentro do Expo Go. Por isso vamos gerar um app próprio (um arquivo `.apk`) e instalar no celular.

---

## Passo 1. Instalar os programas no computador

Instale estes três programas (é só baixar e clicar em "Avançar"):

1. **Node.js 22 (versão LTS):** <https://nodejs.org>
2. **Git:** <https://git-scm.com/downloads>
3. **Docker Desktop:** <https://www.docker.com/products/docker-desktop/>
   Depois de instalar, **abra o Docker Desktop** e espere aparecer "Engine running". Ele precisa ficar aberto
   sempre que você for usar o servidor.

Para conferir, abra o **Terminal** (no Mac) ou o **PowerShell** (no Windows: menu Iniciar, digite
"PowerShell") e rode:

```bash
node -v      # deve mostrar v22.algumacoisa
git --version
docker --version
```

Se algum comando der "não reconhecido", feche e abra o terminal de novo (ou reinicie o computador).

---

## Passo 2. Baixar o código

No terminal:

```bash
git clone https://github.com/mari-brene/run-territory.git
cd run-territory
```

A partir de agora, todos os comandos são rodados **de dentro da pasta `run-territory`**.

---

## Passo 3. Ligar o banco de dados e o servidor

Com o Docker Desktop aberto, rode:

```bash
docker compose up --build
```

Na primeira vez demora alguns minutos (ele baixa o banco de dados e instala tudo). Quando estiver pronto,
você vai ver no meio das mensagens:

```
  Run Territory no ar!
  Neste computador: http://localhost:3000
```

**Deixe essa janela do terminal aberta.** Se fechar, o servidor para. Para desligar, aperte `Ctrl + C`.
Para ligar de novo outro dia, é só rodar `docker compose up` (sem o `--build`) dentro da pasta.

Teste no navegador do computador: abra <http://localhost:3000>. Deve aparecer o **mapa de espectador**.

### (Opcional) Colocar jogadores-robô no mapa

Para o mapa não ficar vazio, abra **outro** terminal, entre na pasta `run-territory` e rode:

```bash
docker compose exec server npm run simulate -w @run-territory/server
```

Isso cria as contas `ana`, `bia`, `caio` e `duda` com territórios perto do Parque Ibirapuera (São Paulo).
Para usar a sua cidade, passe a latitude e a longitude (pegue no Google Maps, clicando com o botão direito
no mapa):

```bash
docker compose exec server npm run simulate -w @run-territory/server -- --center -22.9068,-43.1729
```

---

## Passo 4. Descobrir o endereço do seu computador na rede

O celular não entende `localhost` (para ele, `localhost` é o próprio celular). Ele precisa do **IP** do
computador no Wi-Fi.

- **Windows:** no PowerShell, rode `ipconfig` e procure "Endereço IPv4" na parte do Wi-Fi
  (algo como `192.168.0.15`).
- **Mac:** no Terminal, rode `ipconfig getifaddr en0` (ou vá em Ajustes do Sistema > Wi-Fi > Detalhes).

O endereço do servidor vai ser `http://SEU-IP:3000`, por exemplo `http://192.168.0.15:3000`.

**Teste antes de seguir:** abra esse endereço no **navegador do celular**. Se aparecer o mapa de
espectador, está tudo certo. Se não abrir, veja "Problemas comuns" no final.

---

## Passo 5. Gerar o app (APK) na nuvem da Expo

Em um terminal novo, dentro da pasta `run-territory`:

```bash
cd apps/mobile
npm ci
npx eas-cli@latest login
```

Entre com o usuário e a senha da sua conta Expo. Depois rode:

```bash
npx eas-cli@latest build --platform android --profile preview
```

Ele vai fazer algumas perguntas na primeira vez. Responda **Y (sim)** para todas:

- "Would you like to automatically create an EAS project?" → **Y**
- "Generate a new Android Keystore?" → **Y**

Agora é esperar (de 10 a 30 minutos, a fila da Expo gratuita às vezes demora). Você pode acompanhar
em <https://expo.dev> > seu projeto > Builds. No final aparece um **link e um QR code**.

> A primeira vez que você roda, o EAS escreve um `projectId` no arquivo `app.json`. Isso é normal.

---

## Passo 6. Instalar o app no celular

1. No celular, abra o link (ou leia o QR code com a câmera) e baixe o arquivo `.apk`.
2. Toque no arquivo baixado. O Android vai pedir permissão para **"instalar apps desconhecidos"**:
   permita para o navegador que você usou.
3. Se aparecer um aviso do Play Protect, toque em **"Instalar mesmo assim"**. (É seu próprio app, que não
   está na Play Store.)

---

## Passo 7. Conectar o app ao servidor

1. Abra o **Run Territory** no celular.
2. Na tela inicial, toque em **"⚙ Configurar servidor"** (embaixo dos botões).
3. Em "Endereço da API", digite o endereço do Passo 4, por exemplo `http://192.168.0.15:3000`.
4. Toque em **"Salvar e testar conexão"**. Tem que aparecer **"Conectado!"**.
5. Volte e toque em **"Criar conta"**.
6. Quando o app pedir acesso à localização, permita.

Pronto, você está no jogo!

---

## Passo 8. Testar sem sair de casa: Modo simulação

1. No mapa, toque no ícone de configurações (ou vá em **Perfil > Configurações**).
2. Ligue **"Modo simulação"**.
3. Volte ao mapa e toque em **Correr**. A corrida começa no centro do mapa.
4. **Toque no mapa** e o corredor vai andando até o ponto tocado. Faça um "laço": saia do seu território,
   dê uma volta e volte para ele. A área fechada vira sua.
5. Para tomar território de um robô, faça o laço passando por cima da área dele.

Para correr de verdade com o GPS, é só desligar o Modo simulação. (Por enquanto o app precisa ficar aberto
durante a corrida; a tela fica acesa sozinha.)

---

## Problemas comuns

| O que acontece | O que fazer |
|---|---|
| "Não conectou" / "Sem conexão com o servidor" | Confira: (1) o terminal do `docker compose up` está aberto e sem erro; (2) celular e computador no **mesmo Wi-Fi** (não no 4G); (3) o endereço tem `http://` e `:3000` no final; (4) o IP é o do Passo 4. |
| Abre no computador mas não no celular | Provavelmente é o **firewall**. No Windows: quando aparecer o aviso "Permitir acesso" para o Docker ou Node, marque **Redes privadas** e permita. Confira também se o Wi-Fi está marcado como rede **Privada** (Configurações > Rede > Wi-Fi > propriedades). Redes de empresa, faculdade ou "Wi-Fi de convidados" costumam bloquear a conversa entre aparelhos: teste em casa ou use o roteador do celular. |
| O IP do computador mudou | Acontece quando você reinicia o roteador. Rode `ipconfig` de novo e atualize em "Configurar servidor". |
| `docker compose up` diz que a porta 5432 ou 3000 está em uso | Você já tem outro PostgreSQL ou outro programa usando a porta. Feche-o, ou no `docker-compose.yml` troque `"5432:5432"` por `"5433:5432"`. |
| `docker: command not found` ou erro de conexão com o Docker | O Docker Desktop não está aberto. Abra e espere "Engine running". |
| O mapa aparece todo preto/sem ruas | O celular precisa de internet para baixar o mapa (OpenFreeMap). Confira se o Wi-Fi tem internet. |
| O build da Expo falhou | Abra o link do build em <https://expo.dev>, role até o primeiro erro em vermelho e mande para o Claude no projeto. |
| Mudei o código e quero ver no celular | Rode de novo o comando do Passo 5 e instale o novo APK (ele substitui o antigo e mantém a conta). Mudanças só no servidor não precisam de novo APK: basta reiniciar o `docker compose up --build`. |

---

## E se meu celular for iPhone?

A Apple só deixa instalar apps fora da App Store de duas formas:

- **Com um Mac:** instale o Xcode (App Store do Mac), conecte o iPhone no cabo e rode, dentro de
  `apps/mobile`: `npm ci` e depois `npx expo run:ios --device`. Dá para usar o seu Apple ID gratuito
  (o app expira em 7 dias e precisa ser reinstalado).
- **Sem Mac:** é preciso a conta paga de desenvolvedor Apple (US$ 99 por ano). Com ela, o mesmo comando do
  Passo 5 funciona trocando `--platform android` por `--platform ios`.

---

## Para quem quer ir além (opcional)

- **Sem Docker:** instale PostgreSQL 16 com a extensão PostGIS, crie o banco `runterritory`, e rode na raiz
  do projeto `npm install` e depois `npm run dev:server`. Se o seu Postgres tem senha, defina a variável
  `DATABASE_URL`, por exemplo `postgres://postgres:SUASENHA@localhost:5432/runterritory`. Sem Docker, o
  servidor já mostra o endereço certo para o celular ao iniciar.
- **Deixar o endereço do servidor fixo dentro do app:** em `apps/mobile/eas.json`, dentro de `"preview"`,
  acrescente `"env": { "EXPO_PUBLIC_API_URL": "http://192.168.0.15:3000" }` e gere o APK de novo.
  Assim ninguém precisa digitar o endereço. Isso vai ser útil quando o servidor estiver na internet.
- **Ciclo rápido de desenvolvimento:** com Android Studio instalado e o celular no cabo (com "Depuração USB"
  ligada), `npx expo run:android` instala o app e recarrega a cada mudança no código, sem esperar a nuvem.
