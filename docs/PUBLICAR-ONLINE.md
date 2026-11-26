# Como publicar o Run Territory na internet

Hoje o servidor roda no seu computador e só funciona no mesmo Wi-Fi. Publicando online, qualquer pessoa
com o app consegue jogar, de qualquer lugar, com conexão segura (HTTPS).

**Sugestão:** **Railway** para o servidor e o banco, tudo no mesmo lugar. Ele lê o `Dockerfile` e o
`railway.json` do projeto, então quase não tem configuração. Tem um teste gratuito; depois, o plano Hobby
custa por volta de US$ 5 por mês (confira em <https://railway.com/pricing>). No final tem uma alternativa
com banco no **Supabase**.

---

## Passo 1. Criar a conta e o banco de dados

1. Entre em <https://railway.com> e clique em **Login > GitHub** (use a mesma conta onde está o código).
2. Clique em **New Project > Deploy a Template**, procure **PostGIS** e escolha um template de PostGIS
   (o banco precisa ter a extensão PostGIS, um Postgres comum não serve). Clique em **Deploy**.
3. Espere o quadradinho do banco ficar verde.

## Passo 2. Colocar o servidor no ar

1. No mesmo projeto, clique em **+ Create > GitHub Repo** e escolha **run-territory**.
   (Se pedir, autorize o Railway a ver o repositório.)
2. Ele vai começar um build. Antes de esperar, clique no serviço **run-territory > Variables** e adicione:

   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | clique em **Add Reference** e escolha o `DATABASE_URL` do banco PostGIS |
   | `NODE_ENV` | `production` |

   As outras variáveis têm valores padrão seguros. A lista completa está em [`.env.example`](../.env.example).
3. Vá em **Settings > Networking > Generate Domain**. Se ele perguntar a porta, use `3000`.
   Você vai ganhar um endereço tipo `https://run-territory-production.up.railway.app`.
4. Espere o deploy ficar verde (**Deployments**). O Railway só considera pronto quando
   `/api/health` responde, ou seja, quando o servidor já conectou no banco.

**Teste:** abra `https://SEU-ENDERECO/api/health` no navegador. Tem que aparecer `{"ok":true}`.
Abrindo só `https://SEU-ENDERECO/`, aparece o mapa de espectador.

Cada vez que um PR for aprovado e entrar na `main`, o Railway publica a versão nova sozinho.

## Passo 3. Apontar o app para o servidor online

**Jeito rápido (não precisa gerar outro APK):** no app, vá em **Configurar servidor**, digite
`https://SEU-ENDERECO` e toque em **Salvar e testar conexão**. Como é um servidor novo, crie a conta de novo.

**Jeito definitivo (para distribuir para outras pessoas):** em `apps/mobile/eas.json`, troque
`https://SEU-SERVIDOR.up.railway.app` pelo seu endereço (no perfil `online`) e gere o APK:

```bash
cd apps/mobile
npx eas-cli@latest build --platform android --profile online
```

Esse APK já abre apontando para o servidor online, sem ninguém precisar digitar nada.

## Passo 4 (opcional). Robôs no servidor online

No seu computador, dentro da pasta `run-territory` (depois de `npm install`):

```bash
npm run simulate -w @run-territory/server -- --url https://SEU-ENDERECO --center -23.5874,-46.6576 --live
```

Use `--live` online: no modo instantâneo os robôs mandam pontos rápido demais e esbarram no limite de
chamadas (erro 429). As contas dos robôs têm uma senha conhecida (está no código), então use-as só para
testar e não num servidor com jogadores de verdade.

---

## Alternativa: banco no Supabase (plano grátis)

1. Crie um projeto em <https://supabase.com>. Guarde a senha do banco.
2. Em **Database > Extensions**, ative **postgis**. (O servidor tenta ativar sozinho, mas é bom garantir.)
3. Clique em **Connect** e copie a string do **Session pooler** (funciona em qualquer rede).
   Troque `[YOUR-PASSWORD]` pela senha.
4. No servidor (Railway, Render, etc.), use estas variáveis:

   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | a string do passo 3 |
   | `DATABASE_SSL` | `true` |
   | `DATABASE_POOL_MAX` | `5` |
   | `NODE_ENV` | `production` |

O plano grátis do Supabase **pausa o banco depois de uma semana sem uso**. Bom para testar, ruim para
um jogo com pessoas de verdade.

---

## O que foi revisado e corrigido para produção

| Área | Antes | Agora |
|---|---|---|
| Senhas | dava para tentar senhas sem limite | 10 tentativas de login ou cadastro por minuto por IP; 300 chamadas por minuto no geral |
| Descobrir contas | o login respondia mais rápido quando o usuário não existia | o tempo é o mesmo nos dois casos |
| Sessões | o login valia para sempre | expira após 60 dias sem uso (`SESSION_TTL_DAYS`) |
| Logs | o token do WebSocket aparecia nos logs (`/ws?token=...`) | o token é escondido |
| Erros | erros internos mostravam a mensagem do banco | aparece só "erro interno do servidor"; o detalhe fica no log |
| Privacidade | o mapa público, sem login, mostrava onde cada corredor estava **agora** | em produção, as posições ao vivo só aparecem para quem está logado (`PUBLIC_LIVE_RUNNERS`) |
| Cabeçalhos | nenhum cabeçalho de segurança | Helmet (nosniff, HSTS, etc.) |
| Excluir conta | não existia | **Configurações > Excluir conta**, pedindo a senha (exigido pela LGPD e pelas lojas) |
| Banco | sem SSL; uma conexão caída derrubava o servidor | `DATABASE_SSL`, tamanho do pool configurável, erro do pool tratado |
| Saúde | `/api/health` respondia "ok" mesmo sem banco | testa o banco, e o Railway usa isso para saber quando o deploy está pronto |
| Configuração | sem `DATABASE_URL`, tentava um banco local em silêncio | em produção, o servidor recusa subir sem `DATABASE_URL` |
| Contêiner | rodava como root | roda como usuário `node`, com `NODE_ENV=production` |
| Deploy | encerrava conexões no meio | desliga com calma quando o provedor reinicia |

## Riscos que continuam (decidir antes de abrir para o público)

1. **A base revela onde a pessoa mora.** A primeira corrida cria a base no ponto de partida, que muitas
   vezes é a casa da pessoa, e o território fica visível para todos. Ideias: começar a base só depois
   dos primeiros 200 m, ou deixar a pessoa esconder o território perto de casa.
2. **Sem "esqueci minha senha" e sem confirmar o e-mail.** Para isso o servidor precisa enviar e-mails
   (por exemplo com Resend ou SendGrid).
3. **Política de privacidade.** O app coleta localização. Para publicar na Play Store é obrigatório ter uma
   página de política de privacidade e declarar o uso de localização.
4. **Uma instância só.** O tempo real (WebSocket) vive na memória do servidor. Não aumente as réplicas no
   Railway; para crescer, é preciso Redis ou o LISTEN/NOTIFY do Postgres (veja o README).
5. **Limite por IP e 4G.** Operadoras às vezes colocam muitas pessoas atrás do mesmo IP. Se várias pessoas
   reclamarem de "muitas tentativas" ao mesmo tempo, aumente o limite ou desligue com `RATE_LIMIT=false`.
6. **Backup.** Ative backups do volume do banco no Railway (ou use o Supabase, que faz backup diário nos planos pagos).
7. **HTTP sem criptografia ainda é permitido no app**, para funcionar com o servidor local no Wi-Fi. Quando
   só for usar o servidor online, dá para tirar o `usesCleartextTraffic` do `app.json`.
