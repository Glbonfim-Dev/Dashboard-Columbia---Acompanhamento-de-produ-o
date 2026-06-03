# Arquitetura do Dashboard com Backend

## Fluxo

```text
Codigo/Dashboard.json -> dashboard_server.py -> /api/dashboard -> Codigo/Script.js -> tela dos usuarios
```

O navegador nao acessa mais `Dashboard.json` diretamente. Ele chama a API REST
`/api/dashboard`, e o backend e o unico responsavel por ler, validar e entregar o
JSON mais recente.

## Backend

Arquivo principal: `dashboard_server.py`

Responsabilidades:

- Servir o frontend estatico da pasta `Codigo`.
- Bloquear acesso direto a `Dashboard.json` e `Dashboard.json.bak`.
- Ler o JSON com fallback de encoding (`utf-8-sig`, `utf-8`, `cp1252`, `latin-1`).
- Validar a estrutura esperada: array ou objeto com `principal: []`.
- Manter o ultimo JSON valido em memoria.
- Monitorar alteracoes no arquivo por polling a cada 2 segundos.
- Revalidar o arquivo tambem a cada chamada da API, garantindo dados atuais.
- Expor:
  - `GET /api/dashboard`: dados do dashboard.
  - `GET /api/status`: diagnostico do backend.

O servidor usa `ThreadingHTTPServer`, entao varias pessoas podem acessar ao mesmo
tempo sem que cada usuario force uma leitura completa do arquivo em disco.

## Frontend

Arquivo principal: `Codigo/Script.js`

Responsabilidades:

- Buscar dados somente em `/api/dashboard`.
- Usar `fetch(..., { cache: "no-store" })`.
- Acrescentar `?v=<timestamp>` para evitar cache intermediario.
- Atualizar a tela automaticamente a cada 5 minutos:

```js
const REFRESH_MS = 5 * 60 * 1000;
refreshTimer = window.setInterval(loadDashboard, REFRESH_MS);
```

## Cache

Estrategias aplicadas:

- Backend envia `Cache-Control: no-store, no-cache, must-revalidate, max-age=0`.
- Backend envia `Pragma: no-cache` e `Expires: 0`.
- API responde com `ETag`, `Last-Modified` e `X-Data-Version`.
- Frontend usa `cache: "no-store"`.
- Frontend adiciona query string com timestamp em cada requisicao.

## Como executar

No PowerShell, dentro da pasta do projeto:

```powershell
.\Start-DashboardServer.ps1
```

Depois abra:

```text
http://localhost:8787/
```

Para permitir acesso por outros usuarios na mesma rede, mantenha o servidor rodando
e compartilhe:

```text
http://<ip-da-maquina>:8787/
```

Se o JSON estiver em outro local:

```powershell
.\Start-DashboardServer.ps1 -JsonPath "C:\caminho\Dashboard.json"
```

## Boas praticas

- O processo que atualiza o JSON deve gravar em arquivo temporario e depois renomear
  para `Dashboard.json`, reduzindo risco de leitura durante escrita parcial.
- Rode apenas uma instancia oficial do backend para a equipe acessar.
- Publique atras de um proxy interno, IIS, Nginx ou similar se o uso crescer.
- Monitore `/api/status` para saber se o arquivo foi carregado e quantas linhas tem.
- Evite servir o arquivo JSON como estatico; use sempre `/api/dashboard`.
