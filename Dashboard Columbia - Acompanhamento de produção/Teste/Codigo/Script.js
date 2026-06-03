// Script.js — lógica principal do dashboard
// -------------------------------------------------------------
// Passo a passo resumido:
// 1) Define a API do backend e parâmetros (EX: REFRESH_MS, METAS).
// 2) Ao carregar a página (`DOMContentLoaded`) configura gráficos e controles e chama `loadDashboard()`.
// 3) `fetchDashboardJson()` busca dados em `/api/dashboard`.
// 4) `buildDashboardData()` normaliza linhas e calcula métricas agregadas.
// 5) Funções `render*` atualizam o DOM e os gráficos com os resultados.
// 6) Um timer baseado em `REFRESH_MS` faz refresh automático.
// -------------------------------------------------------------
// O frontend nunca le diretamente o arquivo Dashboard.json.
// Ele consome apenas a API REST entregue pelo backend intermediario.
const API_URL = (typeof location !== 'undefined' && location.protocol && location.protocol.startsWith('http'))
  ? new URL('/api/dashboard', location.origin).toString()
  : 'http://localhost:8787/api/dashboard';

// Intervalo de atualização automática (milissegundos).
// Modifique aqui para alterar a frequência de atualização automática do dashboard.
// Ex.: 5 minutos = 5 * 60 * 1000
const REFRESH_MS = 5 * 60 * 1000; // 300000 ms

const COLORS = {
  meta: '#16a34a',
  alert: '#f59e0b',
  critical: '#dc2626',
  ink: '#172033',
  blue: '#2563eb',
  teal: '#0f766e',
  slate: '#64748b'
};

// Metas operacionais usadas para classificar e sinalizar registros
// - `aderencia`: proporção mínima de registros dentro da meta
// - `eficiencia`: referência de eficiência para considerar 'dentro da meta'
// - `riscoMaximo`: limite de risco aceitável (proporção)
// - `desvioTempoMaximo`: desvio máximo permitido entre realizado e teórico
// - `concentracaoMaxima`: limite para concentração em uma única máquina
const METAS = {
  aderencia: 0.75,
  eficiencia: 0.8,
  riscoMaximo: 0.2,
  desvioTempoMaximo: 0.1,
  concentracaoMaxima: 0.5
};

// Mapeamento de aliases de colunas para facilitar ingestão de planilhas com cabeçalhos variados.
// Se os seus dados usam nomes diferentes, adicione novos aliases aqui.
const FIELD_NAMES = {
  cliente: ['Cliente'],
  pedido: ['Pedido'],
  nest: ['Nest'],
  tempoChapa: ['Tempo/chapa'],
  chapas: ['Nº chapas', 'NÂº chapas', 'N chapas', 'No chapas'],
  tempoTotal: ['Tempo Total'],
  tempoTeorico: ['Tempo Teorico', 'Tempo Teorico Nest', 'Tempo Teorico Cortado', 'Tempo Teórico'],
  eficienciaNest: ['Eficiencia Nest', 'Eficiência Nest'],
  statusNest: ['Status Nest'],
  norma: ['Norma'],
  materiaPrima: ['Materia Prima', 'Matéria Prima'],
  maquina: ['Máquina', 'MÃ¡quina', 'Maquina'],
  dataEntrega: ['Data Entrega Nesting'],
  entregue: ['Entregue p/ Produção', 'Entregue p/ ProduÃ§Ã£o', 'Entregue p/ Producao']
};

// Helpers de formatação — números, percentuais e porcentagens formatadas em pt-BR
const NF = (n) => new Intl.NumberFormat('pt-BR').format(Number.isFinite(n) ? n : 0);
const NFdec = (n, d = 1) => new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: d,
  maximumFractionDigits: d
}).format(Number.isFinite(n) ? n : 0);
const pct = (part, total, d = 1) => total > 0 ? `${NFdec((part / total) * 100, d)}%` : '0,0%';
const asPct = (value, d = 1) => `${NFdec((Number.isFinite(value) ? value : 0) * 100, d)}%`;

let DATA = null;
let refreshTimer = null;
let lastGoodSource = null;
let attemptedUrls = [];
const charts = {};

// Inicia o dashboard quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', initDashboard);

async function initDashboard() {
  // Configura Chart.js, controla refresh manual e inicializa carga de dados
  configureCharts();
  addRefreshControls();
  await loadDashboard();
  // Dispara atualizações periódicas usando REFRESH_MS
  refreshTimer = window.setInterval(loadDashboard, REFRESH_MS);
}

function addRefreshControls() {
  const updatedEl = document.querySelector('.updated');
  if (!updatedEl) return;
  if (document.getElementById('refreshNow')) return;

  const btn = document.createElement('button');
  btn.id = 'refreshNow';
  btn.className = 'refresh-now';
  btn.type = 'button';
  btn.title = 'Forçar atualização agora';
  btn.textContent = 'Atualizar agora';

  btn.addEventListener('click', async () => {
    try {
      btn.disabled = true;
      const original = btn.textContent;
      btn.textContent = 'Atualizando...';
      await loadDashboard();
      btn.textContent = original;
    } catch (e) {
      console.error(e);
      btn.textContent = 'Erro';
      setTimeout(() => { btn.textContent = 'Atualizar agora'; }, 2000);
    } finally {
      btn.disabled = false;
    }
  });

  updatedEl.insertAdjacentElement('afterend', btn);
}

async function loadDashboard() {
  try {
    const payload = await fetchDashboardJson();
    DATA = buildDashboardData(Array.isArray(payload) ? payload : payload.principal);
    renderDashboard();
    showUpdatedStatus();
  } catch (error) {
    showLoadError(error);
  }
}

async function fetchDashboardJson() {
  attemptedUrls = [];
  const ts = Date.now();
  const candidates = [];

  // Mantém compatibilidade com a configuração antiga (API_URL)
  if (API_URL) {
    const sep = API_URL.includes('?') ? '&' : '?';
    candidates.push(`${API_URL}${sep}v=${ts}`);
  }

  // Fallbacks comuns: backend dev na porta 8787 (padrão do dashboard_server.py)
  candidates.push(`http://127.0.0.1:8787/api/dashboard?v=${ts}`);
  candidates.push(`http://localhost:8787/api/dashboard?v=${ts}`);

  // Tentar também o arquivo JSON estático (mesma pasta do index)
  candidates.push(`./Dashboard.json?v=${ts}`);
  candidates.push(`./Dashboard.json.bak?v=${ts}`);

  const errors = [];
  for (const url of candidates) {
    attemptedUrls.push(url);
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        errors.push(`${url} -> ${response.status} ${response.statusText}`);
        continue;
      }

      const text = await response.text();
      if (!text) {
        errors.push(`${url} -> resposta vazia`);
        continue;
      }

      let json;
      try {
        json = JSON.parse(text);
      } catch (e) {
        errors.push(`${url} -> JSON inválido (${e.message})`);
        continue;
      }

      if (!validatePayload(json)) {
        errors.push(`${url} -> estrutura inesperada`);
        continue;
      }

      // Sucesso
      lastGoodSource = url;
      attemptedUrls = [];
      return json;
    } catch (err) {
      errors.push(`${url} -> ${err?.message || err}`);
      continue;
    }
  }

  throw new Error(
    `Nao foi possivel carregar dados da API. Tentativas: ${attemptedUrls.join(', ')}. Erros: ${errors.join(' | ')}`
  );
}

function validatePayload(payload) {
  if (Array.isArray(payload)) return true;
  if (payload && typeof payload === 'object' && Array.isArray(payload.principal)) return true;
  return false;
}

function buildDashboardData(rowsInput = []) {
  const rows = rowsInput.filter(hasBusinessData);
  const enriched = rows.map(normalizeRow);
  const total = enriched.length;
  const pedidos = uniqueCount(enriched, 'pedido');
  const nests = uniqueCount(enriched, 'nest');
  const clientesUnicos = uniqueCount(enriched, 'cliente');
  const maquinasUnicas = uniqueCount(enriched, 'maquina');
  const totalRealizadoHoras = sum(enriched, 'tempoTotalHoras');
  const tempoTeoricoHoras = sum(enriched, 'tempoTeoricoHoras');
  const tempoChapaTotalHoras = sum(enriched, 'tempoChapaHoras');
  const chapasTotal = sum(enriched, 'chapas');
  const eficienciaMedia = totalRealizadoHoras > 0 ? tempoTeoricoHoras / totalRealizadoHoras : 0;
  const machineCounts = groupCount(enriched, 'maquina');
  const machineEfficiency = groupAverage(enriched, 'maquina', 'eficiencia');
  const efficiencies = enriched.map((row) => row.eficiencia).filter(Number.isFinite);
  const dates = enriched.map((row) => row.dataEntrega).filter(Boolean).sort((a, b) => a - b);
  const status = buildStatusCounts(enriched);

  return {
    totals: {
      registros: total,
      clientesUnicos,
      pedidos,
      nests,
      maquinas: maquinasUnicas,
      periodo: {
        inicio: dates[0] ? toIsoDate(dates[0]) : '--',
        fim: dates[dates.length - 1] ? toIsoDate(dates[dates.length - 1]) : '--'
      }
    },
    status,
    maquinas: { counts: machineCounts, eficienciaMedia: machineEfficiency },
    eficiencia: {
      media: eficienciaMedia,
      mediana: median(efficiencies),
      min: efficiencies.length ? Math.min(...efficiencies) : 0,
      max: efficiencies.length ? Math.max(...efficiencies) : 0
    },
    tempos: {
      totalRealizadoHoras,
      tempoTeoricoHoras,
      tempoChapaTotalHoras,
      tempoMedioPorRegistroMinutos: total > 0 ? (totalRealizadoHoras * 60) / total : 0
    },
    chapas: { total: chapasTotal, mediaPorRegistro: total > 0 ? chapasTotal / total : 0 },
    topClientes: topCounts(enriched, 'cliente', 10),
    normas: topCounts(enriched, 'norma', 8),
    origemMP: topCounts(enriched, 'materiaPrima', 6),
    destaques: {
      maiorTempo: maxBy(enriched, 'tempoTotalHoras') || emptyHighlight(),
      maiorChapas: maxBy(enriched, 'chapas') || emptyHighlight()
    },
    metas: METAS
  };
}

function hasBusinessData(row) {
  if (!row) return false;

  return Boolean(
    cleanText(getField(row, FIELD_NAMES.cliente)) ||
    cleanText(getField(row, FIELD_NAMES.pedido)) ||
    cleanText(getField(row, FIELD_NAMES.nest))
  );
}

function normalizeRow(row) {
  const chapas = Math.max(0, toNumber(getField(row, FIELD_NAMES.chapas)));
  const tempoChapaDias = Math.max(0, toNumber(getField(row, FIELD_NAMES.tempoChapa)));
  const tempoTotalDias = Math.max(0, toNumber(getField(row, FIELD_NAMES.tempoTotal)));
  const tempoTeoricoDias = Math.max(0, toNumber(getField(row, FIELD_NAMES.tempoTeorico))) || tempoChapaDias * (chapas || 1);
  const eficienciaPlanilha = parsePercent(getField(row, FIELD_NAMES.eficienciaNest));
  const cliente = cleanText(getField(row, FIELD_NAMES.cliente)) || 'Sem cliente';
  const maquina = cleanText(getField(row, FIELD_NAMES.maquina)) || 'Sem máquina';
  const norma = cleanText(getField(row, FIELD_NAMES.norma)) || 'Sem norma';
  const materiaPrima = cleanText(getField(row, FIELD_NAMES.materiaPrima)) || 'Sem matéria-prima';
  const statusNest = cleanText(getField(row, FIELD_NAMES.statusNest));

  return {
    cliente,
    pedido: cleanText(getField(row, FIELD_NAMES.pedido)) || '--',
    nest: cleanText(getField(row, FIELD_NAMES.nest)) || '--',
    maquina,
    norma,
    materiaPrima,
    chapas,
    tempoChapaHoras: tempoChapaDias * 24,
    tempoTotalHoras: tempoTotalDias * 24,
    tempoTeoricoHoras: tempoTeoricoDias * 24,
    eficiencia: Number.isFinite(eficienciaPlanilha) ? eficienciaPlanilha : tempoTotalDias > 0 ? tempoTeoricoDias / tempoTotalDias : 0,
    statusNest,
    dataEntrega: parseDateValue(getField(row, FIELD_NAMES.dataEntrega))
  };
}

function buildStatusCounts(rows) {
  const hasSpreadsheetStatus = rows.some((row) => row.statusNest);

  // Always compute counts by efficiency as a canonical source
  const byEfficiency = rows.reduce((acc, row) => {
    if (row.eficiencia >= METAS.eficiencia) acc.dentroMeta += 1;
    else if (row.eficiencia >= 0.65) acc.alerta += 1;
    else acc.critico += 1;
    return acc;
  }, { dentroMeta: 0, alerta: 0, critico: 0 });

  // If there is no spreadsheet status column, use efficiency-based counts
  if (!hasSpreadsheetStatus) return byEfficiency;

  // Compute counts based on the spreadsheet status column
  const bySpreadsheet = rows.reduce((acc, row) => {
    const status = normalizeKey(row.statusNest || '');
    if (status.includes('dentrodameta') || status.includes('dentrodmeta') || status.includes('dentro')) {
      acc.dentroMeta += 1;
    } else if (status.includes('critic') || status.includes('critico')) {
      acc.critico += 1;
    } else {
      acc.alerta += 1;
    }
    return acc;
  }, { dentroMeta: 0, alerta: 0, critico: 0 });

  // If spreadsheet counts don't sum to the row count, prefer efficiency-based counts
  const sumSpreadsheet = bySpreadsheet.dentroMeta + bySpreadsheet.alerta + bySpreadsheet.critico;
  if (sumSpreadsheet !== rows.length) return byEfficiency;

  // If spreadsheet counts diverge significantly from efficiency (more than 5% of rows), prefer efficiency
  const diff = Math.abs(bySpreadsheet.dentroMeta - byEfficiency.dentroMeta);
  if (diff > Math.max(1, Math.round(rows.length * 0.05))) return byEfficiency;

  // Otherwise trust the spreadsheet status
  return bySpreadsheet;
}

// renderDashboard
// - Executa a sequência de renderização da UI: KPIs, blocos de decisão, status, máquinas e gráficos de suporte.
function renderDashboard() {
  renderExecutiveKpis();
  renderDecisionBlocks();
  renderStatus();
  renderMachines();
  renderRiskTable();
  renderComparisons();
  renderMix();
}

// configureCharts
// - Ajustes globais do Chart.js (responsividade, fontes e tooltips)
function configureCharts() {
  if (!window.Chart) return;
  Chart.defaults.responsive = true;
  Chart.defaults.maintainAspectRatio = false;
  Chart.defaults.color = '#475569';
  Chart.defaults.font.family = 'Inter, system-ui, -apple-system, Segoe UI, sans-serif';
  Chart.defaults.plugins.legend.labels.boxWidth = 10;
  Chart.defaults.plugins.tooltip.backgroundColor = '#172033';
}

// getMetrics
// - Calcula métricas derivadas usadas em KPIs e outros componentes
function getMetrics() {
  const total = DATA.totals.registros;
  const risk = DATA.status.alerta + DATA.status.critico;
  const timeDeviation = DATA.tempos.tempoTeoricoHoras > 0
    ? (DATA.tempos.totalRealizadoHoras / DATA.tempos.tempoTeoricoHoras) - 1
    : 0;
  const machineEntries = Object.entries(DATA.maquinas.counts);
  const topMachine = machineEntries.sort((a, b) => b[1] - a[1])[0] || ['--', 0];
  const machineShare = total > 0 ? topMachine[1] / total : 0;
  const efficiencyGap = DATA.eficiencia.media - DATA.metas.eficiencia;

  return {
    total,
    risk,
    adherence: total > 0 ? DATA.status.dentroMeta / total : 0,
    riskShare: total > 0 ? risk / total : 0,
    timeDeviation,
    topMachine,
    machineShare,
    efficiencyGap
  };
}

// renderExecutiveKpis
// - Atualiza os cards de KPI com valores formatados e sinalizações visuais
function renderExecutiveKpis() {
  const m = getMetrics();

  setText('kpiAderencia', pct(DATA.status.dentroMeta, m.total));
  setText('kpiAderenciaNote', `Meta: ${asPct(DATA.metas.aderencia)} | ${NF(DATA.status.dentroMeta)} de ${NF(m.total)} registros`);
  setSignal('cardAderencia', m.adherence >= DATA.metas.aderencia ? 'good' : 'watch');

  setText('kpiRisco', pct(m.risk, m.total));
  setText('kpiRiscoNote', `Limite executivo: ${asPct(DATA.metas.riscoMaximo)} | ${NF(m.risk)} registros`);
  setSignal('cardRisco', m.riskShare <= DATA.metas.riscoMaximo ? 'good' : 'critical');

  setText('kpiEficiencia', asPct(DATA.eficiencia.media));
  setText('kpiEficienciaNote', `Meta: ${asPct(DATA.metas.eficiencia)} | Gap: ${signedPct(m.efficiencyGap)}`);
  setSignal('cardEficiencia', m.efficiencyGap >= 0 ? 'good' : 'watch');

  setText('kpiDesvioTempo', signedPct(m.timeDeviation));
  setText('kpiDesvioTempoNote', `${NFdec(DATA.tempos.totalRealizadoHoras, 1)} h realizadas vs ${NFdec(DATA.tempos.tempoTeoricoHoras, 1)} h teóricas`);
  setSignal('cardTempo', m.timeDeviation <= DATA.metas.desvioTempoMaximo ? 'good' : 'critical');

  setText('kpiVolume', NF(DATA.totals.nests));
  setText('kpiVolumeNote', `${NF(DATA.totals.pedidos)} pedidos, ${NF(DATA.chapas.total)} chapas, ${NF(DATA.totals.clientesUnicos)} clientes`);
  setSignal('cardVolume', 'good');

  setText('kpiConcentracao', asPct(m.machineShare));
  setText('kpiConcentracaoNote', `${NF(m.topMachine[1])} registros na ${m.topMachine[0]} | limite: ${asPct(DATA.metas.concentracaoMaxima)}`);
  setSignal('cardGargalo', m.machineShare <= DATA.metas.concentracaoMaxima ? 'good' : 'watch');
}

// renderDecisionBlocks
// - Preenche o bloco de decisão com headline, resumo executivo e plano de ação
function renderDecisionBlocks() {
  const m = getMetrics();
  const topClient = DATA.topClientes[0] || { name: '--', value: 0 };
  const topNorm = DATA.normas[0] || { name: '--', value: 0 };
  const decisionClass = m.riskShare > DATA.metas.riscoMaximo || m.timeDeviation > DATA.metas.desvioTempoMaximo ? 'critical' : 'good';

  setSignal('executive-summary', decisionClass);
  setText('headlineDecision', `Prioridade: reduzir ${NF(m.risk)} registros fora da condição ideal`);
  setHTML('executiveText', `A eficiência média está em <strong>${asPct(DATA.eficiencia.media)}</strong>, com meta de <strong>${asPct(DATA.metas.eficiencia)}</strong>. O ponto de decisão e capacidade: o tempo realizado está <strong>${signedPct(m.timeDeviation)}</strong> contra o teórico e a ${m.topMachine[0]} concentra <strong>${asPct(m.machineShare)}</strong> do volume.`);
  setText('riskCount', `${NF(m.risk)} riscos`);

  const actions = [
    `Revisar os ${NF(DATA.status.alerta)} registros em alerta por máquina e causa raiz.`,
    `Criar plano de capacidade para a ${m.topMachine[0]}, que concentra ${asPct(m.machineShare)} dos registros.`,
    `Auditar desvios de tempo começando pelo cliente ${DATA.destaques.maiorTempo.cliente}, pedido ${DATA.destaques.maiorTempo.pedido}.`,
    `Padronizar parâmetros para ${topNorm.name}, responsável por ${pct(topNorm.value, m.total)} dos registros.`,
    `Acompanhar ${topClient.name}, maior cliente em volume, com produção e atendimento.`
  ];

  const list = document.getElementById('actionList');
  if (list) list.innerHTML = actions.map((action) => `<li>${action}</li>`).join('');
}

// renderStatus
// - Atualiza as barras de status e renderiza o gráfico de donut (inside/alert/critical)
function renderStatus() {
  const m = getMetrics();
  const values = [DATA.status.dentroMeta, DATA.status.alerta, DATA.status.critico];

  setText('metaStatus', `${pct(DATA.status.dentroMeta, m.total)} aderência`);
  setBar('barMeta', DATA.status.dentroMeta / m.total);
  setBar('barAlerta', DATA.status.alerta / m.total);
  setBar('barCritico', DATA.status.critico / m.total);
  setText('valMeta', `${NF(DATA.status.dentroMeta)} (${pct(DATA.status.dentroMeta, m.total)})`);
  setText('valAlerta', `${NF(DATA.status.alerta)} (${pct(DATA.status.alerta, m.total)})`);
  setText('valCritico', `${NF(DATA.status.critico)} (${pct(DATA.status.critico, m.total)})`);

  if (!window.Chart) return;
  renderChart('statusChart', {
    type: 'doughnut',
    data: {
      labels: ['Dentro da meta', 'Alerta', 'Crítico'],
      datasets: [{ data: values, backgroundColor: [COLORS.meta, COLORS.alert, COLORS.critical], borderWidth: 0 }]
    },
    options: {
      cutout: '68%',
      plugins: {
        legend: { position: 'bottom' },
        tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${NF(ctx.parsed)} (${pct(ctx.parsed, m.total)})` } }
      }
    }
  });
}

// renderMachines
// - Renderiza gráfico combinado: barras (volume) + linha (eficiência média)
function renderMachines() {
  if (!window.Chart) return;
  const labels = Object.keys(DATA.maquinas.counts);
  const volumes = labels.map((label) => DATA.maquinas.counts[label]);
  const efficiencies = labels.map((label) => (DATA.maquinas.eficienciaMedia[label] || 0) * 100);

  renderChart('machineChart', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Registros', data: volumes, backgroundColor: COLORS.blue, borderRadius: 6, yAxisID: 'y' },
        { label: 'Eficiência média (%)', data: efficiencies, type: 'line', borderColor: COLORS.teal, backgroundColor: COLORS.teal, tension: 0.35, yAxisID: 'y1' }
      ]
    },
    options: {
      plugins: { legend: { position: 'bottom' } },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: 'Registros' } },
        y1: { position: 'right', min: 0, max: 110, grid: { drawOnChartArea: false }, ticks: { callback: (v) => `${v}%` } }
      }
    }
  });
}

// renderRiskTable
// - Monta a lista de riscos com nível e ação recomendada
function renderRiskTable() {
  const m = getMetrics();
  const risks = [
    { label: 'Tempo contra o teórico', value: signedPct(m.timeDeviation), level: m.timeDeviation > DATA.metas.desvioTempoMaximo ? 'Alto' : 'Baixo', action: 'Dono: Produção | Ação: revisar setup, fila e parâmetros de corte' },
    { label: 'Registros em alerta', value: NF(DATA.status.alerta), level: DATA.status.alerta > 0 ? 'Alto' : 'Baixo', action: 'Dono: PCP | Ação: classificar causa‑raiz e impacto no prazo' },
    { label: `Dependência da ${m.topMachine[0]}`, value: asPct(m.machineShare), level: m.machineShare > DATA.metas.concentracaoMaxima ? 'Médio' : 'Baixo', action: 'Dono: Manutenção/PCP | Ação: contingência de capacidade' },
    { label: 'Eficiência acima de 100%', value: asPct(DATA.eficiencia.max), level: DATA.eficiencia.max > 1 ? 'Médio' : 'Baixo', action: 'Dono: Engenharia | Ação: validar apontamento e regra de cálculo' },
    { label: 'Registros críticos', value: NF(DATA.status.critico), level: DATA.status.critico > 0 ? 'Alto' : 'Baixo', action: 'Dono: Qualidade | Ação: encerrar análise pontual' }
  ];

  setHTML('riskTable', risks.map((risk) => `
    <div class="risk-row ${normalizeLevel(risk.level)}">
      <div>
        <strong>${risk.label}</strong>
        <span>${risk.action}</span>
      </div>
      <b>${risk.value}</b>
      <em>${risk.level}</em>
    </div>
  `).join(''));
}

// renderComparisons
// - Preenche os blocos de comparação entre tempo realizado e referências
function renderComparisons() {
  const m = getMetrics();
  setText('cmpTempoReal', `${NFdec(DATA.tempos.totalRealizadoHoras, 2)} h`);
  setText('cmpTempoRealNote', `Desvio executivo: ${signedPct(m.timeDeviation)} vs referência`);
  setText('cmpTempoTeorico', `${NFdec(DATA.tempos.tempoTeoricoHoras, 2)} h`);
  setText('cmpTempoMedio', `${NFdec(DATA.tempos.tempoMedioPorRegistroMinutos, 2)} min`);
  setText('cmpChapas', NFdec(DATA.chapas.mediaPorRegistro, 2));
}

// renderMix
// - Renderiza gráficos de mix: top clients, normas e origem da matéria-prima
function renderMix() {
  if (!window.Chart) return;
  renderHorizontalBar('topClientsChart', DATA.topClientes.slice(0, 7), COLORS.ink);
  renderVerticalBar('normasChart', DATA.normas.slice(0, 7), COLORS.teal);

  renderChart('origemChart', {
    type: 'doughnut',
    data: {
      labels: DATA.origemMP.map((item) => item.name),
      datasets: [{ data: DATA.origemMP.map((item) => item.value), backgroundColor: [COLORS.ink, COLORS.blue, COLORS.teal, COLORS.alert, COLORS.meta, COLORS.critical], borderWidth: 0 }]
    },
    options: { cutout: '64%', plugins: { legend: { position: 'bottom' } } }
  });
}

// renderHorizontalBar
// - Helper para barras horizontais (ex.: top clients)
function renderHorizontalBar(id, rows, color) {
  renderChart(id, {
    type: 'bar',
    data: { labels: rows.map((r) => r.name), datasets: [{ data: rows.map((r) => r.value), backgroundColor: color, borderRadius: 6 }] },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true }, y: { grid: { display: false } } }
    }
  });
}

// renderVerticalBar
// - Helper para barras verticais (ex.: normas)
function renderVerticalBar(id, rows, color) {
  renderChart(id, {
    type: 'bar',
    data: { labels: rows.map((r) => r.name), datasets: [{ data: rows.map((r) => r.value), backgroundColor: color, borderRadius: 6 }] },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true }, x: { grid: { display: false } } }
    }
  });
}

// renderChart
// - Cria/atualiza um gráfico Chart.js no canvas indicado por `id`
function renderChart(id, config) {
  const canvas = document.getElementById(id);
  if (!canvas || !window.Chart) return;
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(canvas, config);
}

// getField
// - Retorna o primeiro campo disponível entre os `aliases` informados.
// - Primeiro tenta acesso direto por nome de coluna; se não, normaliza chaves e tenta novamente.
function getField(row, aliases) {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, alias)) return row[alias];
  }

  const normalizedAliases = aliases.map(normalizeKey);
  const key = Object.keys(row).find((candidate) => normalizedAliases.includes(normalizeKey(candidate)));
  return key ? row[key] : '';
}

// normalizeKey
// - Remove acentos, normaliza para minúsculas e remove caracteres não alfanuméricos.
function normalizeKey(value) {
  return cleanText(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

// cleanText
// - Normaliza entradas textuais, tratando problemas comuns de encoding (ex.: CP1252) e retornando string limpa.
function cleanText(value) {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  if (!/[ÃÂ]/.test(text)) return text;

  try {
    return decodeURIComponent(Array.from(text).map((char) => {
      const byte = cp1252Byte(char);
      return byte === null ? encodeURIComponent(char) : `%${byte.toString(16).padStart(2, '0')}`;
    }).join(''));
  } catch {
    return text;
  }
}

// cp1252Byte
// - Retorna o byte correspondente ao caractere Unicode usando mapa CP1252 quando aplicável.
function cp1252Byte(char) {
  const code = char.charCodeAt(0);
  if (code <= 255) return code;

  const map = {
    0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
    0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
    0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
    0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
    0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
    0x017e: 0x9e, 0x0178: 0x9f
  };

  return map[code] ?? null;
}

// toNumber
// - Converte strings numéricas em formato pt-BR (com ponto como separador de milhares e vírgula decimal)
function toNumber(value) {
  if (typeof value === 'number') return value;
  const text = cleanText(value).replace(/\s/g, '').trim();
  if (!text) return 0;
  if (/^-?\d{1,3}(\.\d{3})+,\d+$/u.test(text)) return Number(text.replace(/\./g, '').replace(',', '.'));
  if (/^-?\d+,\d+$/u.test(text)) return Number(text.replace(',', '.'));
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

// parsePercent
// - Interpreta textos percentuais ou números absolutos retornando valor em fração (0-1)
function parsePercent(value) {
  if (value === null || value === undefined || value === '') return NaN;

  const text = cleanText(value).trim();
  const number = toNumber(text.replace('%', ''));

  if (!Number.isFinite(number)) return NaN;
  if (text.includes('%')) return number / 100;
  return number > 1 && number <= 100 ? number / 100 : number;
}

// parseDateValue
// - Detecta e converte diversos formatos de data: números Excel, dd/mm/yyyy e ISO
function parseDateValue(value) {
  const text = cleanText(value);
  const numeric = toNumber(text);
  if (numeric > 20000) {
    return new Date(Date.UTC(1899, 11, 30) + numeric * 86400000);
  }

  const brDate = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brDate) return new Date(Number(brDate[3]), Number(brDate[2]) - 1, Number(brDate[1]));

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

// toIsoDate
// - Converte `Date` para string ISO no formato yyyy-mm-dd
function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

// uniqueCount
// - Conta valores únicos não vazios para a chave fornecida
function uniqueCount(rows, key) {
  return new Set(rows.map((row) => row[key]).filter(Boolean)).size;
}

// groupCount
// - Agrupa linhas por `key` e retorna objeto { label: count }
function groupCount(rows, key) {
  return rows.reduce((acc, row) => {
    const label = row[key] || '--';
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});
}

// groupAverage
// - Calcula média por grupo (agrupa por `groupKey` e média do `valueKey`)
function groupAverage(rows, groupKey, valueKey) {
  const grouped = rows.reduce((acc, row) => {
    const label = row[groupKey] || '--';
    if (!acc[label]) acc[label] = { total: 0, count: 0 };
    if (Number.isFinite(row[valueKey])) {
      acc[label].total += row[valueKey];
      acc[label].count += 1;
    }
    return acc;
  }, {});

  return Object.fromEntries(Object.entries(grouped).map(([key, value]) => [
    key,
    value.count > 0 ? value.total / value.count : 0
  ]));
}

// topCounts
// - Retorna os top N valores agrupados por `key`, já ordenados por volume
function topCounts(rows, key, limit) {
  return Object.entries(groupCount(rows, key))
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

// sum
// - Soma valores numéricos da chave `key` em todas as linhas
function sum(rows, key) {
  return rows.reduce((total, row) => total + (Number.isFinite(row[key]) ? row[key] : 0), 0);
}

// median
// - Calcula mediana de um array numérico
function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// maxBy
// - Retorna a linha com o maior valor na chave `key` ou `null` se vazio
function maxBy(rows, key) {
  return rows.reduce((best, row) => !best || row[key] > best[key] ? row : best, null);
}

// emptyHighlight
// - Retorno padrão para destaques vazios
function emptyHighlight() {
  return { cliente: '--', pedido: '--', nest: '--', maquina: '--', tempoTotalHoras: 0, chapas: 0 };
}

// signedPct
// - Formata percentual com sinal explícito (+/-)
function signedPct(value) {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${asPct(value)}`;
}

// normalizeLevel
// - Normaliza valor de nível (ex.: 'Alto', 'Médio') para facilitar classes CSS
function normalizeLevel(value) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// setSignal
// - Aplica classes visuais (`good`/`watch`/`critical`) a elementos por id ou classe
function setSignal(id, signal) {
  const element = document.getElementById(id) || document.querySelector(`.${id}`);
  if (!element) return;
  element.classList.remove('good', 'watch', 'critical');
  element.classList.add(signal);
}

// setText
// - Define o texto (`textContent`) de um elemento identificado por `id`
function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

// setHTML
// - Define conteúdo HTML (`innerHTML`) de um elemento por `id` (usar com cuidado)
function setHTML(id, value) {
  const element = document.getElementById(id);
  if (element) element.innerHTML = value;
}

// setBar
// - Ajusta a largura de um elemento tipo barra com base em `ratio` (0-1)
function setBar(id, ratio) {
  const element = document.getElementById(id);
  if (element) element.style.width = `${Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0)) * 100}%`;
}

// showUpdatedStatus
// - Exibe timestamp amigável de última atualização no elemento `.updated`
function showUpdatedStatus() {
  const element = document.querySelector('.updated');
  if (!element) return;
  const now = new Date().toLocaleString('pt-BR');
  element.textContent = `Atualizado em: ${now}`;
}

// showLoadError
// - Exibe mensagem de erro amigável quando a carga do JSON falha
function showLoadError(error) {
  console.error(error);
  setText('headlineDecision', 'Não foi possível carregar os dados da API');
  setText('executiveText', 'Confirme que o backend está em execução e que o endpoint /api/dashboard está respondendo.');
  const element = document.querySelector('.updated');
  if (element) element.textContent = `Falha ao carregar dados: ${error.message}`;
  if (!refreshTimer) return;
}
