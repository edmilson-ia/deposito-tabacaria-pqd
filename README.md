# Depósito e Tabacaria do PQD — catálogo e pedidos pelo WhatsApp

App mobile-first: o cliente monta o pedido no catálogo, o pedido é **salvo no Supabase** e a mensagem pronta abre no **WhatsApp**. Tem painel admin (`/admin`) e já fica preparado para o **n8n** (via webhook do Supabase).

**Stack:** React + TypeScript + Vite + Tailwind CSS v4 · React Router · TanStack Query · Zod · Supabase (Postgres, Storage, Auth) · sonner (avisos).

> Venda proibida para menores de 18 anos — o site pede a confirmação na primeira visita.

---

## 1. Rodar no seu computador

Pré-requisito: Node.js **20.19 ou superior** (ou 22).

```bash
npm install
cp .env.example .env      # no Windows: copy .env.example .env
# preencha o .env (seção 2)
npm run dev               # http://localhost:5173
```

Outros comandos:

| Comando | O que faz |
|---|---|
| `npm run build` | gera a pasta `dist/` para publicar |
| `npm run preview` | testa o build local |
| `npm run lint` | análise estática (oxlint) |
| `npm run import:dry` | simula a importação da planilha (não grava) |
| `npm run import:apply` | importa a planilha de verdade |

## 2. Variáveis de ambiente (`.env`)

| Variável | Onde é usada | Observação |
|---|---|---|
| `VITE_SUPABASE_URL` | navegador | URL do projeto, ex.: `https://xxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | navegador | chave **publishable** (`sb_publishable_…`). É pública por natureza; quem protege os dados é o RLS. |
| `VITE_SITE_URL` | navegador (og:image) | endereço final do site, ex.: `https://loja.seudominio.com`. **Defina antes do build de produção** para a imagem de compartilhamento funcionar. |
| `SUPABASE_SERVICE_KEY` | **só scripts locais** | chave secreta (`sb_secret_…`), usada apenas por `scripts/import-catalogo.ts`. |

Regras de segurança:
- A `SUPABASE_SERVICE_KEY` **nunca** leva o prefixo `VITE_`, nunca vai para o navegador e nunca é commitada (`.env` está no `.gitignore`). No servidor da VPS ela nem precisa existir.
- Se uma chave ou senha vazar (por exemplo, colada em um chat), gere outra: Supabase → Project Settings → API Keys (chaves) ou Database (senha).

## 3. Banco de dados (Supabase)

1. Abra o **SQL Editor** do projeto.
2. Cole **todo** o conteúdo de `supabase/migrations/0001_init.sql` (só o SQL, sem o caminho do arquivo) e clique em **Run**.

Isso cria as tabelas `categorias`, `produtos`, `clientes`, `pedidos`, `itens_pedido`, `configuracoes`, `admins`, a função `criar_pedido`, as regras de acesso (RLS) e o bucket público `produtos`.

**Regras de acesso (RLS) em resumo**

| Quem | Pode |
|---|---|
| Visitante (anon) | ler categorias, produtos **ativos** e as configurações públicas; **criar pedido apenas** pela função `criar_pedido` |
| Visitante | **não** lê pedidos, itens nem clientes; não altera nada direto |
| Admin (usuário listado em `admins`) | CRUD de produtos e categorias, ler e atualizar pedidos, editar configurações, enviar imagens |

A função `criar_pedido` **recalcula preços e total no servidor** — um cliente mal-intencionado não consegue mandar preço adulterado.

Multi-tenant no futuro: os pontos onde entraria `tenant_id` estão comentados na migration (`-- tenant_id (futuro)`). Não implementado.

## 4. Importar a planilha de produtos

A planilha (Google Sheets) precisa estar compartilhada como **"qualquer pessoa com o link"** e ter as colunas `produto, categoria, valor, imagem, link, descricao`. O ID da planilha está no topo de `scripts/import-catalogo.ts`.

```bash
# 1º: simula e mostra o que é NOVO, o que MUDOU de preço e o que ficou igual (não grava nada)
npm run import:dry -- --sheet="https://docs.google.com/spreadsheets/d/SEU_ID/edit"
# 2º: grava de verdade (usa SUPABASE_SERVICE_KEY do .env)
npm run import:apply -- --sheet="https://docs.google.com/spreadsheets/d/SEU_ID/edit"

# Também aceita um arquivo CSV salvo no computador:
npm run import:dry -- --csv=dados/catalogo-atual.csv
# Planilha com várias abas: acrescente --gid=<número que aparece na URL depois de #gid=>
```

- A planilha precisa estar compartilhada como **"qualquer pessoa com o link"** (leitor). Se o Google responder 410/404, ela foi apagada ou o link está errado.
- **Colunas aceitas** (maiúsculas e acentos não importam): `produto` (ou `nome`), `valor` (ou `preço`), `categoria` (ou `grupo`), `descricao` (ou `detalhes`) e, opcionalmente, `unidade` (`un`, `pack`, `caixa`, `fardo`). Preço pode vir como `R$ 1.234,56`, `12,5` ou `12.50`.
- O relatório mostra: **NOVOS**, **ALTERADOS** (com preço antes → depois), **sem mudança** e produtos que estão no banco mas **não na planilha** (nada é apagado nem desativado — se saíram do catálogo, desative no admin).
- Sem a coluna `unidade`, a unidade é inferida do texto: `pack`, `caixa`, `cx` ou `c/12` → **pack**; `fardo` → fardo; senão unidade.
- Categorias novas são criadas no fim da ordem; as que já existem mantêm a ordem que você definiu no admin.
- Em cima de `dados/`: `catalogo-atual.csv` é a cópia do catálogo como está no banco (já no formato da planilha; serve de modelo) e `catalogo-original.csv` é a planilha original recuperada.

Regras do script:
- Cada linha vira **um produto**; a unidade é inferida da descrição (`c/12`, `caixa` → `cx`; senão `un`).
- Reexecutar **não duplica** (chave = nome + unidade) e **não sobrescreve** estoque, ativo nem imagem — só preço, descrição e categoria.
- Estoque inicial dos produtos novos: 999 (ajuste no admin).
- Categorias são normalizadas (`Cigarros`, `Acessórios`, isqueiros e carvão viram **Tabacaria**; `outros` → **Diversos**). Edite `CATEGORIA_MAP` no script para mudar.
- Linhas com preço não numérico (ex.: `4 por R$1,00`) são **puladas** e listadas para decisão.
- O dry-run também avisa de preços suspeitos (caixa mais barata que a unidade, etc.).

**Imagens em massa (pasta pública do Google Drive):**

```bash
npm run imagens:dry     # 1º: lista correspondências, conflitos e o que ficou sem par (não baixa nem grava)
npm run imagens:apply   # 2º: baixa, reduz a 900 px, converte p/ WebP, envia ao bucket e grava imagem_url
```

- O ID da pasta está no topo de `scripts/import-imagens.ts`. Só associa quando o **nome do arquivo é igual ao nome do produto** (sem acento/maiúscula). Sem "chute".
- `pack`, `fardo`, `caixa`, `com 18` no nome do arquivo = caixa (cx); `und`/`unid` = unidade (un). Arquivo sem indicação vale para as duas variantes, exceto onde a outra variante tem foto própria.
- O que não casar (ou for ambíguo) aparece com sugestões: resolva em `scripts/imagens-mapa.json`, ex.: `{ "Brahma Lata 350ml und.jfif": "Brahma Lata|un", "Foto para dois.jfif": ["Produto A|un", "Produto A|cx"] }`.
- Por padrão não troca fotos que já existem (use `-- --force`). Rodar de novo não duplica (mesmo nome de arquivo no Storage).
- Também dá para enviar foto produto a produto no admin (o filtro **Sem foto** mostra o que falta).

## 5. Criar o administrador (login por e-mail ou telefone, com "Esqueci minha senha")

O login do painel (`/admin`) aceita **e-mail** ou **telefone**; a senha e a recuperação sempre usam o **e-mail real cadastrado na conta**. O telefone fica salvo em `admins.telefone` e é traduzido para esse e-mail pela função `email_login_por_telefone` (migration `0004_admin_login_telefone_email_real.sql`) — dá para trocar o e-mail da conta a qualquer momento (Authentication → Users → editar) sem mexer em código nem quebrar o login por telefone.

1. Supabase → **Authentication → Users → Add user → Create new user**.
   - Email: o e-mail **real** do administrador (precisa receber mensagens; pode ser provisório e trocado depois)
   - Password: uma senha forte (defina na hora, não deixe escrita em nenhum arquivo)
   - Marque **Auto Confirm User**
2. No **SQL Editor**, autorize esse usuário como admin e, se quiser permitir login por telefone, salve o telefone (troque pelo e-mail e telefone reais):

```sql
insert into public.admins (user_id, telefone)
select id, '21999998888' from auth.users where email = 'admin@seudominio.com';
```

3. Acesse `/admin` e entre com esse e-mail (ou o telefone salvo) e a senha.

**Contas antigas** (criadas antes da 0004, com e-mail interno `<DDD+número>@admin.example.com`): continuam entrando por telefone normalmente, mas **não recebem e-mail de recuperação** até o e-mail da conta virar um e-mail real — troque em Authentication → Users → editar e-mail, sem precisar recriar a conta.

**Esqueci minha senha:** clique no link na tela de login (`/admin/esqueci`), informe o e-mail e siga o link recebido — ele abre `/admin/redefinir`, onde se define a nova senha. Válido só no mesmo navegador/aparelho que pediu a recuperação.

**Configure antes (uma vez), em Supabase → Authentication → URL Configuration:**
- **Site URL:** `https://loja.seudominio.com` (em desenvolvimento, `http://localhost:5173`)
- **Redirect URLs:** adicione `http://localhost:5173/admin/redefinir` e `https://loja.seudominio.com/admin/redefinir`. Sem isso o Supabase recusa o link de recuperação.
- O envio de e-mail padrão do Supabase é limitado (poucos por hora). Para uso real, configure um SMTP próprio em Authentication → Emails → SMTP Settings.

## 5.1 Período de teste e mensalidade — painel do dono (`/master`)

Você (dono do sistema) controla, num painel só seu, quando a loja do cliente funciona. **Se o cliente não pagar, a loja trava sozinha no vencimento e só volta quando você autorizar.** Vem das migrations `0002_licenca_teste.sql` e `0003_master_mensalidade.sql` (aplique **nessa ordem**).

**Regras**
- **Plano `teste`**: vale até o vencimento e trava sozinho depois (sem carência).
- **Plano `mensal`**: vale até o vencimento + **carência** (padrão 3 dias, você muda). Passou disso, **trava sozinho** — a conta é feita pelo banco a cada pedido, sem tarefa agendada e sem depender de ninguém lembrar.
- **Plano `isento`**: nunca vence (parceiros / cliente que paga por fora).
- **Bloqueio manual**: trava na hora, mesmo com prazo válido.
- **Travado = só novos pedidos são recusados** (o servidor recusa, não só a tela). Nada é apagado: produtos, fotos, categorias e pedidos ficam, e o admin da loja continua abrindo e exportando tudo.
- **Quem destrava é só você**: registrar pagamento, definir novo vencimento ou remover o bloqueio. O admin da loja não tem nenhum caminho para isso (o banco recusa).
- Quem compra no site não vê nada durante o teste/mensalidade; só vê "Estamos sem receber novos pedidos" quando trava (o carrinho dele fica salvo). O **admin da loja** vê uma faixa: dias do teste, mensalidade perto de vencer, em carência, ou "pausada".

**Criar o seu acesso de dono (uma vez)**
1. Supabase → Authentication → Users → Add user com **o SEU e-mail** e senha (Auto Confirm). Use uma conta **diferente** da do dono da loja.
2. No SQL Editor:

```sql
insert into public.superadmins (user_id)
select id from auth.users where email = 'voce@email.com';
```

3. Entre em `/master/login`.

**O que o painel `/master` faz**
- **Situação** da loja em destaque (Em teste, Mensalidade em dia, Vencida — em carência, TRAVADA, BLOQUEADA, Isento), vencimento, dias restantes, último pagamento e cliente.
- **Registrar pagamento** (+30 dias, ou o que informar; valor e observação): reativa. Pagou em dia soma ao vencimento; pagou atrasado conta a partir de hoje.
- **Bloqueio manual** (com motivo que só você vê) e **Remover bloqueio**.
- **Iniciar teste** (dias).
- **Vencimento e carência** (data/hora, ou "sem data").
- **Plano** (teste / mensal / isento).
- **Cliente e mensalidade** (nome e valor).
- **Histórico** de tudo (pagamentos, bloqueios, alterações).

Se o `/admin` for aberto por uma conta que é só de dono, ela é levada para `/master`.

**Sem o painel, pelo SQL Editor** (equivalente): iniciar teste `select public.master_iniciar_teste(7);` só funciona logado como dono; para operar direto no banco use a tabela: `update public.licenca set valido_ate = now() + interval '30 days', plano = 'mensal', bloqueada = false where id = 1;`.

**Segurança:** a tabela `licenca` não tem policy nenhuma; tudo passa por funções `master_*` que checam `is_superadmin()` no servidor. Visitante e admin da loja recebem "permission denied"/"Sem permissão". Se a consulta de estado falhar (sem internet, migration não aplicada), o site trata como liberado: erro de checagem nunca trava vendas.

## 6. Configurar a loja

Em `/admin` → **Loja**:
- **WhatsApp da loja** (obrigatório): DDI+DDD+número, só dígitos — ex.: `5521999999999`. É para onde o pedido é enviado. **Enquanto estiver vazio o checkout recusa enviar** (para não criar pedido sem destino).
- **Taxa de entrega**: **0 = "a combinar com o cliente"** (padrão, pois depende da distância). Com 0, o carrinho mostra "Entrega: A combinar" e "Total (sem entrega)", a mensagem do WhatsApp diz "Entrega: a combinar" e o pedido é gravado só com o valor dos produtos; o valor da entrega você combina na conversa. Se informar um valor fixo (ex.: 8), ele é somado ao total de todo pedido.
- **Nome da loja**.

## 7. Usando o painel `/admin`

- **Produtos:** edite preço e estoque direto na lista (botão *Salvar* ou Enter), ative/desative com a chave, edite tudo no lápis, envie a foto (é reduzida e convertida para WebP automaticamente) e crie/exclua produtos. **Exportar JSON** baixa o catálogo inteiro.
- **Pedidos:** veja itens, pagamento e troco, toque no telefone para chamar o cliente no WhatsApp e mude o status (novo → confirmado → em entrega → entregue / cancelado).
- **Categorias:** crie, renomeie, reordene (a ordem vira a ordem dos botões no catálogo) e exclua. Uma categoria só pode ser excluída quando não tem produtos.
- **Loja:** configurações acima.

## 8. Publicar na VPS Hostinger (Ubuntu + Nginx + SSL)

Convenção: cada app roda numa **porta própria** (aqui `3010`) atrás do Nginx, com um **subdomínio próprio** e certificado do Certbot.

**8.1 DNS** — no painel do domínio, crie um registro **A**: `loja` → IP da VPS. Aguarde propagar.

**8.2 Preparar a VPS (uma vez)**

```bash
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx
# Node 22 (se ainda não houver) e PM2
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
sudo npm i -g pm2
sudo ufw allow 'Nginx Full'
```

**8.3 Enviar o projeto e gerar o build**

```bash
sudo mkdir -p /var/www/pqd && sudo chown $USER /var/www/pqd
# do seu computador (exclui node_modules e .env). No Windows use WinSCP/FileZilla ou
# `scp -r` (envie tudo, exceto node_modules, dist e .env):
rsync -av --exclude node_modules --exclude .env --exclude dist ./ usuario@IP_DA_VPS:/var/www/pqd/

# na VPS:
cd /var/www/pqd
cat > .env <<'ENV'
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
VITE_SITE_URL=https://loja.seudominio.com
ENV
npm ci && npm run build
```

> Não coloque `SUPABASE_SERVICE_KEY` na VPS. O site só precisa das duas chaves públicas.

**8.4 Subir com PM2 (porta 3010)**

```bash
pm2 start deploy/ecosystem.config.cjs
pm2 save && pm2 startup      # rode o comando que o pm2 mostrar, para religar no boot
curl -I http://127.0.0.1:3010   # deve responder 200
```

**8.5 Nginx + SSL**

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/pqd
sudo nano /etc/nginx/sites-available/pqd     # troque loja.seudominio.com (e a porta, se mudou)
sudo ln -s /etc/nginx/sites-available/pqd /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d loja.seudominio.com  # aceite o redirecionamento para HTTPS
```

**8.6 Supabase** — em Authentication → URL Configuration, defina *Site URL* como `https://loja.seudominio.com`.

**8.7 Atualizar depois de mudanças**

```bash
rsync -av --exclude node_modules --exclude .env --exclude dist ./ usuario@IP_DA_VPS:/var/www/pqd/
ssh usuario@IP_DA_VPS 'cd /var/www/pqd && npm ci && npm run build && pm2 restart pqd-catalogo'
```

**8.8 Conferência final:** abra o site no celular, passe pelo aviso 18+, adicione itens, finalize um pedido de teste (e depois cancele/exclua no admin) e confira que o WhatsApp abre com a mensagem.

## 9. Preparação para o n8n (webhook, sem polling)

O n8n fica ocioso e só roda quando o Supabase avisa por **webhook**. Nada no app faz polling.

**9.1 No n8n:** crie um workflow com o nó **Webhook** (método `POST`, caminho `pedido-novo`). Copie a *Production URL* (algo como `https://n8n.seudominio.com/webhook/pedido-novo`). Proteja com **Header Auth** (ex.: cabeçalho `x-webhook-secret` com um segredo longo).

**9.2 No Supabase:** Database → **Webhooks → Create a new hook**

| Campo | Valor |
|---|---|
| Name | `pedido_novo` |
| Table | `public.pedidos` |
| Events | **Insert** |
| Type | HTTP Request · Method `POST` |
| URL | a Production URL do n8n |
| Headers | `Content-Type: application/json` e `x-webhook-secret: <o mesmo segredo>` |

**9.3 Payload que o n8n recebe** (no corpo da requisição):

```json
{
  "type": "INSERT",
  "table": "pedidos",
  "schema": "public",
  "record": {
    "id": 42,
    "cliente_id": 7,
    "nome_cliente": "Maria",
    "telefone": "21999998888",
    "endereco": "Rua A, 10 - Centro",
    "status": "novo",
    "total": 66.00,
    "taxa_entrega": 0,
    "forma_pagamento": "dinheiro",
    "troco_para": 100.00,
    "observacoes": "Sem gelo",
    "criado_em": "2026-09-21T21:32:40.74037+00:00",
    "atualizado_em": "2026-09-21T21:32:40.74037+00:00"
  },
  "old_record": null
}
```

Os **itens** não vão no payload (ficam em `itens_pedido`). No n8n, busque-os com um nó HTTP/Supabase usando a chave secreta **guardada nas credenciais do n8n** (nunca no app):
`GET {SUPABASE_URL}/rest/v1/itens_pedido?pedido_id=eq.{{ $json.body.record.id }}&select=nome_produto,quantidade,preco_unitario`.
O webhook do Supabase é enviado depois do commit da transação, então os itens já existem; se algum dia vier vazio, adicione uma espera curta e tente de novo.

**9.4 Mudanças de status (opcional):** crie um segundo webhook em `pedidos` com evento **Update**. O payload traz `record` e `old_record`; no n8n compare `record.status` com `old_record.status` para avisar o cliente (ex.: "seu pedido saiu para entrega"). O painel admin já grava `status` e `atualizado_em`.

Status possíveis: `novo`, `confirmado`, `em_entrega`, `entregue`, `cancelado`.

## 10. Estrutura do projeto

```
src/
  components/   Layout, ProductCard, CartSheet, AgeGate, ErrorBoundary, ui/ …
  pages/        Home, Catalogo, Info (Contato/Empresa), admin/ (carregado só em /admin)
  hooks/        useCatalogo (público), useAdmin (painel), usePageTitle
  lib/          supabase, cart (localStorage), schemas (Zod), pedido (RPC), whatsapp, auth, login, imagem
scripts/        import-catalogo.ts (planilha), branding.ts (cores e ícones a partir da logo)
supabase/migrations/0001_init.sql
deploy/         ecosystem.config.cjs (PM2), nginx.conf.example
public/branding logo, favicon, ícones PWA, og:image, hero
```

Cores e ícones saem da logo: `npx tsx scripts/branding.ts` amostra as cores e regenera `public/branding/*`.

## 11. Limitações conhecidas e dicas

- **Total da mensagem × total gravado:** o valor gravado é sempre o do servidor. Se um preço mudar entre o cliente abrir a página e enviar o pedido, o total escrito na mensagem do WhatsApp pode ficar diferente. (Correção possível: a função devolver `{id, total}`.)
- **Compartilhamento (og:image):** por ser um site de página única, o preview no WhatsApp/Facebook usa as meta tags do `index.html` (a de imagem depende de `VITE_SITE_URL` no build).
- **Sem recuperação de senha do admin** por e-mail (veja a seção 5).
- **Bloqueio de pop-up:** se o navegador bloquear a abertura automática do WhatsApp, a tela de confirmação tem o botão "Abrir WhatsApp".
- O carrinho fica no `localStorage` do navegador; se o cliente limpar os dados do site, perde o carrinho.
