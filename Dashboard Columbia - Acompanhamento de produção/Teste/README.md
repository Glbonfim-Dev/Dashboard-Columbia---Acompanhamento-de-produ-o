# CMS - Dashboard Executivo de Performance de Nesting

## Visão geral

Este projeto entrega um dashboard web para acompanhar a performance de nesting de chapas da CMS/Columbia Machine.

A solução lê um arquivo `Dashboard.json`, transforma os registros em indicadores executivos e exibe uma tela com KPIs, gráficos, riscos e ações sugeridas para acompanhamento de produção.

Ela é útil para PCP, produção, engenharia, gestão e demais pessoas que precisam enxergar rapidamente:

- quais nests estão dentro ou fora da meta;
- onde há risco operacional;
- como está a eficiência por máquina;
- quais clientes, normas e origens de matéria-prima concentram mais volume;
- se o tempo realizado está coerente com o tempo teórico.

## Ideia do projeto

### O problema

Os dados de nesting ficam em um arquivo JSON com vários registros de produção. Abrir esse arquivo manualmente não ajuda muito na tomada de decisão, porque os dados precisam ser filtrados, somados, comparados com metas e apresentados de forma visual.

Além disso, se vários usuários acessarem o mesmo arquivo diretamente, podem aparecer problemas de cache, leitura parcial durante atualização do arquivo ou diferenças entre o dado visto por cada pessoa.

### A solução proposta

O projeto cria uma camada simples entre o arquivo de dados e o navegador:

1. Um servidor Python lê e valida o `Dashboard.json`.
2. O servidor expõe uma API em `/api/dashboard`.
3. O front-end consome essa API, processa os dados e monta o painel visual.
4. O usuário acessa o dashboard pelo navegador, sem precisar abrir ou entender o JSON.

### Fluxo geral de funcionamento

```text
Codigo/Dashboard.json
        |
        v
dashboard_server.py
        |
        v
GET /api/dashboard
        |
        v
Codigo/Script.js
        |
        v
Dashboard no navegador
```

### Exemplo de uso no mundo real

Um computador da rede interna fica responsável por rodar o servidor do dashboard. O processo que gera o `Dashboard.json` atualiza esse arquivo periodicamente. Gestores e usuários da produção acessam um link como:

```text
http://<ip-da-maquina>:8787/
```

Quando o JSON muda, o backend recarrega os dados e o painel passa a mostrar os indicadores atualizados.

## Funcionalidades

Funcionalidades identificadas no código atual:

- Servidor HTTP em Python usando apenas biblioteca padrão.
- Servimento dos arquivos estáticos da pasta `Codigo`.
- API `GET /api/dashboard` para entregar os dados do dashboard.
- API `GET /api/status` para diagnóstico do backend.
- Leitura do `Dashboard.json` com fallback de encoding: `utf-8-sig`, `utf-8`, `cp1252` e `latin-1`.
- Validação da estrutura do JSON antes de entregar os dados.
- Cache em memória do último JSON válido.
- Monitoramento do arquivo JSON por intervalo configurável.
- Bloqueio de acesso direto a `Dashboard.json` e `Dashboard.json.bak` quando servidos pelo backend.
- Cabeçalhos HTTP para evitar cache no navegador.
- Suporte a CORS com `Access-Control-Allow-Origin: *`.
- Atualização automática do dashboard a cada 5 minutos.
- Botão "Atualizar agora" criado dinamicamente pelo JavaScript.
- KPIs executivos:
  - aderência à meta;
  - risco fora da meta;
  - eficiência vs meta;
  - desvio de tempo;
  - volume processado;
  - gargalo de capacidade.
- Gráficos com Chart.js:
  - meta x risco;
  - capacidade por máquina;
  - clientes prioritários;
  - mix técnico por normas;
  - origem da matéria-prima.
- Tabela de priorização de riscos.
- Plano de ação imediato gerado a partir dos dados carregados.
- Layout responsivo para diferentes tamanhos de tela.

## Como o projeto funciona

### 1. Entrada de dados ou interação inicial

A entrada principal é o arquivo:

```text
Codigo/Dashboard.json
```

O backend aceita duas estruturas:

```json
[
  {
    "Cliente": "COLUMBIA MACHINE",
    "Pedido": "8871",
    "Nest": "20755"
  }
]
```

ou:

```json
{
  "principal": [
    {
      "Cliente": "COLUMBIA MACHINE",
      "Pedido": "8871",
      "Nest": "20755"
    }
  ]
}
```

No arquivo atual deste workspace, o JSON possui:

- `principal`: 1199 registros;
- `horas`: 3 registros.

O front-end atual usa os dados de `principal`. A chave `horas` existe no JSON, mas não foi encontrada como fonte de cálculo no JavaScript atual.

### 2. Processamento interno

O backend faz:

1. Localiza o arquivo JSON.
2. Lê o arquivo com tentativa de diferentes encodings.
3. Valida se a raiz é um array ou se existe `principal` como array.
4. Guarda o último JSON válido em memória.
5. Recarrega o arquivo quando detecta mudança de tamanho ou data de modificação.
6. Entrega os dados pela API `/api/dashboard`.

O front-end faz:

1. Busca os dados em `/api/dashboard`.
2. Filtra linhas sem dados de negócio.
3. Normaliza campos como cliente, pedido, nest, máquina, norma, matéria-prima, tempos, chapas e eficiência.
4. Converte tempos em dias do Excel para horas.
5. Calcula totais, médias, percentuais, desvios e agrupamentos.
6. Classifica os registros em dentro da meta, alerta ou crítico.
7. Renderiza KPIs, textos executivos, gráficos e tabela de riscos.

### 3. Saída esperada

Ao abrir o dashboard no navegador, o usuário vê:

- resumo executivo;
- ações recomendadas;
- indicadores principais;
- gráficos de status, máquinas, clientes, normas e matéria-prima;
- comparação entre tempo realizado e tempo teórico;
- lista de riscos operacionais.

### 4. Resultado final para o usuário

O usuário deixa de consultar o JSON manualmente e passa a usar uma tela executiva para tomar decisões de acompanhamento, priorização e cobrança operacional.

## Tecnologias utilizadas

- Python 3, usando biblioteca padrão:
  - `argparse`;
  - `json`;
  - `http.server`;
  - `threading`;
  - `pathlib`;
  - `datetime`;
  - `mimetypes`;
  - `urllib.parse`.
- PowerShell para script de inicialização.
- HTML5.
- CSS3.
- JavaScript puro.
- Chart.js via CDN.
- Google Fonts, fonte Inter, via CDN.
- JSON como formato de dados.

Não foram encontrados no projeto atual:

- `requirements.txt`;
- `package.json`;
- banco de dados;
- Dockerfile;
- framework Python como Flask, FastAPI ou Django;
- framework front-end como React, Vue ou Angular;
- chave de API obrigatória.

## Pré-requisitos

Para executar localmente:

- Windows com PowerShell, se for usar `Start-DashboardServer.ps1`.
- Python 3.10 ou superior recomendado.
- Navegador moderno, como Microsoft Edge, Chrome ou Firefox.
- Acesso à internet para carregar Chart.js e Google Fonts via CDN.
- Git, apenas se você for clonar o repositório.

Observação: o backend não precisa instalar pacotes Python externos. O projeto usa apenas a biblioteca padrão do Python.

## Instalação

Clone o projeto:

```bash
git clone <url-do-repositorio>
cd <nome-do-projeto>
```

Se você ainda não tem um ambiente virtual Python no projeto, crie um:

```powershell
py -3 -m venv .venv
```

Confirme se o Python do ambiente funciona:

```powershell
.\.venv\Scripts\python.exe --version
```

Não há dependências pip obrigatórias para instalar.

Se preferir usar o Python instalado no sistema sem ambiente virtual, também é possível, desde que o comando `python` ou `py` esteja disponível.

## Execução

### Opção recomendada no Windows

Abra o PowerShell na pasta raiz do projeto e execute:

```powershell
.\Start-DashboardServer.ps1
```

Depois acesse:

```text
http://localhost:8787/
```

Endpoints úteis:

```text
http://localhost:8787/api/dashboard
http://localhost:8787/api/status
```

### Se o PowerShell bloquear a execução do script

Use:

```powershell
powershell -ExecutionPolicy Bypass -File .\Start-DashboardServer.ps1
```

### Executar em outra porta

```powershell
.\Start-DashboardServer.ps1 -Port 8888
```

Acesse:

```text
http://localhost:8888/
```

### Usar um JSON em outro caminho

```powershell
.\Start-DashboardServer.ps1 -JsonPath "C:\caminho\para\Dashboard.json"
```

### Executar diretamente com Python

```powershell
.\.venv\Scripts\python.exe .\dashboard_server.py --host 0.0.0.0 --port 8787 --json .\Codigo\Dashboard.json
```

Parâmetros disponíveis:

```text
--host
--port
--json
--watch-interval
```

Também é possível configurar por variáveis de ambiente:

```text
DASHBOARD_HOST
DASHBOARD_PORT
DASHBOARD_JSON
```

## Colocando em prática na rede interna

1. Escolha uma máquina para hospedar o dashboard.
2. Coloque o projeto nessa máquina.
3. Garanta que o arquivo `Dashboard.json` esteja sendo gerado ou copiado para o caminho correto.
4. Execute:

```powershell
.\Start-DashboardServer.ps1 -Port 8787 -Bind 0.0.0.0
```

5. Descubra o IP da máquina.
6. Compartilhe o link:

```text
http://<ip-da-maquina>:8787/
```

7. Valide o status:

```powershell
Invoke-RestMethod http://localhost:8787/api/status
```

8. Mantenha o PowerShell aberto enquanto o dashboard precisar ficar disponível.

Para uso contínuo em produção, vale configurar a execução como tarefa agendada, serviço do Windows ou publicação atrás de IIS/Nginx/proxy interno. Essa configuração não aparece implementada no repositório atual.

## Estrutura do projeto

```text
.
├── ARQUITETURA_BACKEND.md
├── Start-DashboardServer.ps1
├── dashboard_server.py
└── Codigo
    ├── Dashboard.json
    ├── Dashboard.json.bak
    ├── README.md
    ├── Script.js
    ├── images.png
    ├── index.html
    └── sytle.css
```

Descrição dos principais arquivos:

| Arquivo | Função |
| --- | --- |
| `dashboard_server.py` | Servidor HTTP, API do dashboard, cache do JSON e arquivos estáticos. |
| `Start-DashboardServer.ps1` | Script PowerShell para iniciar o backend com o Python disponível. |
| `ARQUITETURA_BACKEND.md` | Documento técnico resumindo a arquitetura do backend. |
| `Codigo/index.html` | Estrutura HTML da tela do dashboard. |
| `Codigo/Script.js` | Lógica de busca, normalização, cálculos, KPIs e gráficos. |
| `Codigo/sytle.css` | Estilos visuais e responsividade. |
| `Codigo/Dashboard.json` | Fonte de dados usada pelo backend. |
| `Codigo/Dashboard.json.bak` | Arquivo de backup/fallback existente, mas vazio no workspace atual. |
| `Codigo/images.png` | Imagem usada como logo no cabeçalho. |

## Formato do JSON

O backend aceita:

- array direto de registros;
- objeto com a chave `principal` contendo array.

O JavaScript espera, por padrão, estes campos ou aliases:

| Uso no dashboard | Campos aceitos no JSON |
| --- | --- |
| Cliente | `Cliente` |
| Pedido | `Pedido` |
| Nest | `Nest` |
| Tempo por chapa | `Tempo/chapa` |
| Número de chapas | `Nº chapas`, `N chapas`, `No chapas` |
| Tempo total | `Tempo Total` |
| Tempo teórico | `Tempo Teorico`, `Tempo Teorico Nest`, `Tempo Teorico Cortado`, `Tempo Teórico` |
| Eficiência | `Eficiencia Nest`, `Eficiência Nest` |
| Status | `Status Nest` |
| Norma | `Norma` |
| Matéria-prima | `Materia Prima`, `Matéria Prima` |
| Máquina | `Máquina`, `Maquina` |
| Data de entrega | `Data Entrega Nesting` |
| Entregue para produção | `Entregue p/ Produção`, `Entregue p/ Producao` |

Exemplo simplificado:

```json
{
  "principal": [
    {
      "Entregue p/ Produção": "Sim",
      "Cliente": "COLUMBIA MACHINE",
      "Pedido": "8871",
      "Nest": "20755",
      "Tempo/chapa": "0.00578703703703704",
      "Nº chapas": "1",
      "Tempo Total": "0.0072337962962963",
      "Norma": "QUARD_550B",
      "Materia Prima": "MP CMB - Estoque",
      "Máquina": "3K",
      "Data Entrega Nesting": "46175",
      "Tempo Teórico": "0.00578703703703704",
      "Eficiencia Nest": "0.8",
      "Status Nest": "Dentro da Meta"
    }
  ]
}
```

Notas importantes sobre os dados:

- Campos de tempo vêm em formato numérico compatível com dias do Excel. O front-end multiplica por 24 para exibir horas.
- `Data Entrega Nesting` aceita número serial do Excel, data no formato `dd/mm/aaaa` ou data ISO.
- `Eficiencia Nest` aceita valor fracionário, como `0.8`, ou percentual textual, como `80%`.
- Se `Eficiencia Nest` não existir, o JavaScript tenta calcular eficiência usando `Tempo Teórico / Tempo Total`.
- Se `Status Nest` existir e estiver coerente com os cálculos, ele pode ser usado. Se houver divergência relevante, o JavaScript prefere classificar pelo cálculo de eficiência.

## Configurações principais

### Backend

No `dashboard_server.py`:

- porta padrão: `8787`;
- host padrão: `0.0.0.0`;
- JSON padrão: `Codigo/Dashboard.json`;
- intervalo de verificação do JSON: `2` segundos;
- endpoint de dados: `/api/dashboard`;
- endpoint de status: `/api/status`.

### Front-end

No `Codigo/Script.js`:

- `API_URL`: define a URL da API.
- `REFRESH_MS`: define a atualização automática. Valor atual: `5 * 60 * 1000`, ou 5 minutos.
- `METAS`: define as metas operacionais usadas nos KPIs.
- `FIELD_NAMES`: define os aliases de colunas aceitos.
- `COLORS`: define a paleta usada nos gráficos.

Metas atuais no JavaScript:

| Meta | Valor |
| --- | --- |
| Aderência mínima | `0.75` |
| Eficiência mínima | `0.8` |
| Risco máximo | `0.2` |
| Desvio máximo de tempo | `0.1` |
| Concentração máxima em uma máquina | `0.5` |

## Como desenvolver

### Alterar textos e estrutura da tela

Edite:

```text
Codigo/index.html
```

### Alterar estilos

Edite:

```text
Codigo/sytle.css
```

Observação: o nome do arquivo está como `sytle.css`, não `style.css`. O HTML aponta para esse nome, então renomear o arquivo exige ajustar o `index.html`.

### Alterar cálculos, metas ou campos aceitos

Edite:

```text
Codigo/Script.js
```

Procure por:

```text
METAS
FIELD_NAMES
REFRESH_MS
```

### Alterar porta, host ou caminho do JSON

Use os parâmetros do script:

```powershell
.\Start-DashboardServer.ps1 -Port 8787 -Bind 0.0.0.0 -JsonPath "C:\caminho\Dashboard.json"
```

ou os argumentos do Python:

```powershell
.\.venv\Scripts\python.exe .\dashboard_server.py --host 0.0.0.0 --port 8787 --json .\Codigo\Dashboard.json --watch-interval 2
```

## Validação rápida

Verifique se o servidor aceita os argumentos:

```powershell
.\.venv\Scripts\python.exe .\dashboard_server.py --help
```

Inicie o servidor:

```powershell
.\Start-DashboardServer.ps1
```

Teste o status:

```powershell
Invoke-RestMethod http://localhost:8787/api/status
```

Teste os dados:

```powershell
Invoke-RestMethod http://localhost:8787/api/dashboard
```

Abra o dashboard:

```text
http://localhost:8787/
```

Não foi encontrada uma suíte automatizada de testes no repositório atual.

## Boas práticas operacionais

- Atualize o `Dashboard.json` de forma atômica: grave primeiro em um arquivo temporário e depois renomeie para `Dashboard.json`.
- Evite usuários acessando o JSON diretamente. Use o endereço do dashboard ou `/api/dashboard`.
- Mantenha apenas uma instância oficial do backend para a equipe, evitando versões diferentes do mesmo painel.
- Monitore `/api/status` quando o dashboard parecer desatualizado.
- Se publicar na rede interna, confirme firewall, porta e permissões de acesso.
- Se o ambiente não permite CDN externo, hospede Chart.js e fontes localmente e ajuste o `index.html`.

## Problemas comuns

### `Python was not found`

Instale Python 3 ou confirme se `python` ou `py` está no PATH. No Windows, o script tenta usar:

1. `.venv\Scripts\python.exe`;
2. `python`;
3. `py -3`.

### O PowerShell não executa o script

Use:

```powershell
powershell -ExecutionPolicy Bypass -File .\Start-DashboardServer.ps1
```

### A porta já está em uso

Execute em outra porta:

```powershell
.\Start-DashboardServer.ps1 -Port 8888
```

### A tela abre, mas os gráficos não aparecem

Confira:

- se o backend está rodando;
- se `/api/dashboard` responde;
- se `Dashboard.json` é válido;
- se o navegador consegue carregar Chart.js pelo CDN;
- se há erros no console do navegador.

### O status mostra erro no JSON

Confira se o arquivo está em uma das estruturas aceitas:

- array direto;
- objeto com `principal` como array.

Também verifique se o arquivo não está sendo lido durante uma escrita parcial.

### Outros usuários da rede não conseguem acessar

Confira:

- se o servidor está com `-Bind 0.0.0.0`;
- se a porta está liberada no firewall;
- se o IP compartilhado é o IP correto da máquina;
- se o computador que hospeda o servidor continua ligado e com o PowerShell aberto.

## Segurança e acesso

O projeto atual não implementa autenticação, login ou controle de permissões.

Ao rodar com `0.0.0.0`, qualquer pessoa com acesso à rede e à porta configurada pode tentar abrir o dashboard. Antes de publicar fora da máquina local, confirme se os dados do JSON podem ser compartilhados nesse ambiente.

## Pontos a confirmar

Itens que não estão claros ou não aparecem implementados no código atual:

- Qual processo gera ou atualiza o `Codigo/Dashboard.json`.
- Se a chave `horas` do JSON deve virar indicador no dashboard.
- Qual será o endereço final de publicação do projeto.
- Se o dashboard deve rodar como serviço, tarefa agendada, IIS, Nginx ou apenas em PowerShell aberto.
- Se haverá autenticação ou restrição de acesso por usuário.
- Se Chart.js e Google Fonts poderão continuar vindo de CDN externo no ambiente final.
- Qual é a URL real do repositório para substituir `<url-do-repositorio>` na instalação.
- Se `.venv`, `Dashboard.json` e arquivos de cache devem ou não ser versionados quando o projeto estiver em Git.

## Resumo para uso rápido

```powershell
cd <nome-do-projeto>
.\Start-DashboardServer.ps1
```

Abra:

```text
http://localhost:8787/
```

Verifique o backend:

```text
http://localhost:8787/api/status
```
