// reports.js - Reports & Analytics module with Chart.js visualizations

import { store } from './store.js';
import { escapeHtml, formatDate, formatCurrency } from './utils.js';

const DEAL_STAGES = ['Qualification', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost'];
const FUNNEL_STAGES = ['New', 'Contacted', 'Responded', 'Meeting Set', 'Closed'];
const ACTIVITY_TYPES = ['call', 'email', 'meeting', 'note'];

const ACTIVITY_COLORS = {
  call:    '#3b82f6',
  email:   '#22c55e',
  meeting: '#8b5cf6',
  note:    '#6b7280',
};

const STAGE_COLORS = {
  'Qualification': '#0ea5e9',
  'Proposal':      '#f59e0b',
  'Negotiation':   '#eab308',
  'Closed Won':    '#22c55e',
  'Closed Lost':   '#ef4444',
};

let currentRange = '30d';
const charts = {};

// ---- Dark Theme Defaults ----

function getDarkThemeOptions(overrides) {
  const base = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#e0e0e0' } },
    },
    scales: {
      x: {
        grid: { color: 'rgba(255,255,255,0.05)' },
        ticks: { color: '#a0a0b0' },
      },
      y: {
        grid: { color: 'rgba(255,255,255,0.05)' },
        ticks: { color: '#a0a0b0' },
      },
    },
  };

  if (overrides) {
    // Deep merge plugins
    if (overrides.plugins) {
      base.plugins = { ...base.plugins, ...overrides.plugins };
      if (overrides.plugins.legend) {
        base.plugins.legend = { ...base.plugins.legend, ...overrides.plugins.legend };
      }
    }
    // Deep merge scales
    if (overrides.scales) {
      for (const axis of Object.keys(overrides.scales)) {
        base.scales[axis] = { ...base.scales[axis], ...overrides.scales[axis] };
      }
    }
    // Copy other top-level keys
    for (const key of Object.keys(overrides)) {
      if (key !== 'plugins' && key !== 'scales') {
        base[key] = overrides[key];
      }
    }
  }

  return base;
}

// For chart types without axes (doughnut, pie)
function getDarkThemeNoAxes(overrides) {
  const base = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#e0e0e0' } },
    },
  };
  if (overrides) {
    if (overrides.plugins) {
      base.plugins = { ...base.plugins, ...overrides.plugins };
    }
    for (const key of Object.keys(overrides)) {
      if (key !== 'plugins') base[key] = overrides[key];
    }
  }
  return base;
}

// ---- Date Filtering ----

function getDateFilter() {
  const now = new Date();
  switch (currentRange) {
    case '30d':  return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case '90d':  return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case 'year': return new Date(now.getFullYear(), 0, 1);
    case 'all':  return new Date(2020, 0, 1);
    default:     return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}

function isShortRange() {
  return currentRange === '30d' || currentRange === '90d';
}

// ---- Chart Renderer ----

function renderChart(canvasId, config) {
  if (charts[canvasId]) charts[canvasId].destroy();
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  charts[canvasId] = new Chart(ctx, config);
}

// ---- Chart Card Wrapper ----

function chartCard(title, canvasId) {
  return `
    <div class="chart-card" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:16px;display:flex;flex-direction:column;">
      <h3 style="margin:0 0 12px 0;font-size:0.95rem;font-weight:600;color:#e0e0e0;">${escapeHtml(title)}</h3>
      <div style="position:relative;flex:1;min-height:250px;">
        <canvas id="${canvasId}"></canvas>
      </div>
    </div>`;
}

function emptyChartCard(title, message) {
  return `
    <div class="chart-card" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:16px;display:flex;flex-direction:column;">
      <h3 style="margin:0 0 12px 0;font-size:0.95rem;font-weight:600;color:#e0e0e0;">${escapeHtml(title)}</h3>
      <div style="flex:1;display:flex;align-items:center;justify-content:center;min-height:250px;color:#9ca3af;font-size:0.9rem;">${escapeHtml(message)}</div>
    </div>`;
}

// ---- Grouping Helpers ----

function groupByWeek(items, dateKey) {
  const groups = {};
  for (const item of items) {
    const d = new Date(item[dateKey]);
    // Get Monday of the week
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setDate(diff);
    const key = monday.toISOString().slice(0, 10);
    groups[key] = (groups[key] || 0) + 1;
  }
  return groups;
}

function groupByMonth(items, dateKey) {
  const groups = {};
  for (const item of items) {
    const d = new Date(item[dateKey]);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    groups[key] = (groups[key] || 0) + 1;
  }
  return groups;
}

function formatWeekLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatMonthLabel(monthStr) {
  const [year, month] = monthStr.split('-');
  const d = new Date(parseInt(year), parseInt(month) - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

// ---- Chart Data Builders ----

function buildLeadsOverTime() {
  const cutoff = getDateFilter();
  const leads = store.getLeads().filter(l => l.savedAt && new Date(l.savedAt) >= cutoff);

  if (leads.length === 0) return null;

  let groups, labels, data;

  if (isShortRange()) {
    groups = groupByWeek(leads, 'savedAt');
    const sortedKeys = Object.keys(groups).sort();
    labels = sortedKeys.map(formatWeekLabel);
    data = sortedKeys.map(k => groups[k]);
  } else {
    groups = groupByMonth(leads, 'savedAt');
    const sortedKeys = Object.keys(groups).sort();
    labels = sortedKeys.map(formatMonthLabel);
    data = sortedKeys.map(k => groups[k]);
  }

  return {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Leads Saved',
        data,
        borderColor: '#0ea5e9',
        backgroundColor: 'rgba(14,165,233,0.15)',
        fill: true,
        tension: 0.3,
        pointRadius: 3,
        pointBackgroundColor: '#0ea5e9',
      }],
    },
    options: getDarkThemeOptions({
      plugins: {
        legend: { display: false },
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#a0a0b0', precision: 0 },
        },
      },
    }),
  };
}

function buildConversionFunnel() {
  const leads = store.getLeads();

  const statusCounts = {};
  for (const stage of FUNNEL_STAGES) {
    statusCounts[stage] = 0;
  }

  for (const lead of leads) {
    const status = lead.status || 'New';
    if (status === 'Not Interested') continue;

    // A lead at a later stage also counts toward earlier stages
    const idx = FUNNEL_STAGES.indexOf(status);
    if (idx >= 0) {
      for (let i = 0; i <= idx; i++) {
        statusCounts[FUNNEL_STAGES[i]]++;
      }
    } else {
      statusCounts['New']++;
    }
  }

  const data = FUNNEL_STAGES.map(s => statusCounts[s]);

  if (data.every(v => v === 0)) return null;

  const colors = ['#3b82f6', '#0ea5e9', '#06b6d4', '#14b8a6', '#22c55e'];

  return {
    type: 'bar',
    data: {
      labels: FUNNEL_STAGES,
      datasets: [{
        label: 'Leads',
        data,
        backgroundColor: colors,
        borderRadius: 4,
      }],
    },
    options: getDarkThemeOptions({
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#a0a0b0', precision: 0 },
        },
        y: {
          grid: { display: false },
          ticks: { color: '#e0e0e0' },
        },
      },
    }),
  };
}

function buildRevenueByMonth() {
  const cutoff = getDateFilter();
  const deals = store.getDeals().filter(d =>
    d.stage === 'Closed Won' && d.closedAt && new Date(d.closedAt) >= cutoff
  );

  if (deals.length === 0) return null;

  const groups = {};
  for (const deal of deals) {
    const d = new Date(deal.closedAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    groups[key] = (groups[key] || 0) + (Number(deal.value) || 0);
  }

  const sortedKeys = Object.keys(groups).sort();
  // Limit to last 12 months for year/all ranges
  const displayKeys = isShortRange() ? sortedKeys : sortedKeys.slice(-12);

  return {
    type: 'bar',
    data: {
      labels: displayKeys.map(formatMonthLabel),
      datasets: [{
        label: 'Revenue',
        data: displayKeys.map(k => groups[k]),
        backgroundColor: '#22c55e',
        borderRadius: 4,
      }],
    },
    options: getDarkThemeOptions({
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => formatCurrency(ctx.raw),
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: {
            color: '#a0a0b0',
            callback: (val) => formatCurrency(val),
          },
        },
      },
    }),
  };
}

function buildActivityByType() {
  const cutoff = getDateFilter();
  const activities = store.getActivities().filter(a =>
    a.timestamp && new Date(a.timestamp) >= cutoff
  );

  const counts = {};
  for (const type of ACTIVITY_TYPES) {
    counts[type] = 0;
  }
  for (const a of activities) {
    const t = (a.type || '').toLowerCase();
    if (counts.hasOwnProperty(t)) {
      counts[t]++;
    }
  }

  const data = ACTIVITY_TYPES.map(t => counts[t]);
  if (data.every(v => v === 0)) return null;

  const labels = ACTIVITY_TYPES.map(t => t.charAt(0).toUpperCase() + t.slice(1));
  const colors = ACTIVITY_TYPES.map(t => ACTIVITY_COLORS[t]);

  return {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: 'rgba(0,0,0,0.3)',
        borderWidth: 2,
      }],
    },
    options: getDarkThemeNoAxes({
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#e0e0e0', padding: 12 },
        },
      },
    }),
  };
}

function buildLeadSourceByCategory() {
  const cutoff = getDateFilter();
  const leads = store.getLeads().filter(l => l.savedAt && new Date(l.savedAt) >= cutoff);

  const counts = {};
  for (const lead of leads) {
    const cat = lead.category || 'Uncategorized';
    counts[cat] = (counts[cat] || 0) + 1;
  }

  if (Object.keys(counts).length === 0) return null;

  // Sort by count descending, take top 10
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);

  const barColors = [
    '#3b82f6', '#0ea5e9', '#06b6d4', '#14b8a6', '#22c55e',
    '#84cc16', '#eab308', '#f59e0b', '#ef4444', '#8b5cf6',
  ];

  return {
    type: 'bar',
    data: {
      labels: sorted.map(s => s[0]),
      datasets: [{
        label: 'Leads',
        data: sorted.map(s => s[1]),
        backgroundColor: sorted.map((_, i) => barColors[i % barColors.length]),
        borderRadius: 4,
      }],
    },
    options: getDarkThemeOptions({
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: '#a0a0b0',
            maxRotation: 45,
            minRotation: 20,
          },
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#a0a0b0', precision: 0 },
        },
      },
    }),
  };
}

function buildDealPipelineValue() {
  const deals = store.getDeals().filter(d => d.stage !== 'Closed Lost');

  if (deals.length === 0) return null;

  // Group by stage, stack individual deals
  const stageData = {};
  for (const stage of DEAL_STAGES.filter(s => s !== 'Closed Lost')) {
    stageData[stage] = deals.filter(d => d.stage === stage);
  }

  const stages = Object.keys(stageData).filter(s => stageData[s].length > 0);
  if (stages.length === 0) return null;

  // Find the max number of deals in any stage (for stacking)
  const maxDeals = Math.max(...stages.map(s => stageData[s].length));

  // Create one dataset per "layer" in the stack
  const datasets = [];
  for (let i = 0; i < maxDeals; i++) {
    const data = stages.map(stage => {
      const deal = stageData[stage][i];
      return deal ? (Number(deal.value) || 0) : 0;
    });
    datasets.push({
      label: i === 0 ? 'Deals' : '',
      data,
      backgroundColor: stages.map(s => STAGE_COLORS[s] || '#6b7280'),
      borderRadius: i === maxDeals - 1 ? 4 : 0,
    });
  }

  return {
    type: 'bar',
    data: {
      labels: stages,
      datasets,
    },
    options: getDarkThemeOptions({
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const val = ctx.raw;
              return val > 0 ? formatCurrency(val) : '';
            },
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: { color: '#e0e0e0' },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: {
            color: '#a0a0b0',
            callback: (val) => formatCurrency(val),
          },
        },
      },
    }),
  };
}

function buildWinLossReasons() {
  const deals = store.getDeals().filter(d =>
    (d.stage === 'Closed Won' || d.stage === 'Closed Lost') && d.closeReason
  );

  if (deals.length === 0) return null;

  // Collect all unique reasons
  const wonReasons = {};
  const lostReasons = {};

  for (const deal of deals) {
    if (deal.stage === 'Closed Won') {
      wonReasons[deal.closeReason] = (wonReasons[deal.closeReason] || 0) + 1;
    } else {
      lostReasons[deal.closeReason] = (lostReasons[deal.closeReason] || 0) + 1;
    }
  }

  // Combine all unique reasons
  const allReasons = [...new Set([...Object.keys(wonReasons), ...Object.keys(lostReasons)])];
  allReasons.sort();

  const wonData = allReasons.map(r => wonReasons[r] || 0);
  const lostData = allReasons.map(r => lostReasons[r] || 0);

  return {
    type: 'bar',
    data: {
      labels: allReasons,
      datasets: [
        {
          label: 'Won',
          data: wonData,
          backgroundColor: '#22c55e',
          borderRadius: 4,
        },
        {
          label: 'Lost',
          data: lostData,
          backgroundColor: '#ef4444',
          borderRadius: 4,
        },
      ],
    },
    options: getDarkThemeOptions({
      indexAxis: 'y',
      plugins: {
        legend: {
          display: true,
          labels: { color: '#e0e0e0' },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#a0a0b0', precision: 0 },
        },
        y: {
          grid: { display: false },
          ticks: { color: '#e0e0e0' },
        },
      },
    }),
  };
}

// ---- Rendering ----

function renderHeader() {
  const ranges = [
    { key: '30d',  label: '30 Days' },
    { key: '90d',  label: '90 Days' },
    { key: 'year', label: 'This Year' },
    { key: 'all',  label: 'All Time' },
  ];

  const buttonsHtml = ranges.map(r => {
    const active = r.key === currentRange;
    const bg = active ? '#2563eb' : 'rgba(255,255,255,0.08)';
    const color = active ? '#fff' : '#e0e0e0';
    const border = active ? 'border:none;' : 'border:1px solid rgba(255,255,255,0.12);';
    return `<button class="report-range-btn" data-range="${r.key}" style="padding:6px 14px;background:${bg};color:${color};${border}border-radius:6px;cursor:pointer;font-size:0.8rem;font-weight:500;">${r.label}</button>`;
  }).join('');

  return `
    <div class="section-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:16px;">
      <h2 style="margin:0;font-size:1.4rem;">Reports &amp; Analytics</h2>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">${buttonsHtml}</div>
    </div>`;
}

function renderChartsGrid() {
  const chartDefs = [
    { title: 'Leads Over Time',        id: 'chart-leads-over-time' },
    { title: 'Conversion Funnel',       id: 'chart-conversion-funnel' },
    { title: 'Revenue by Month',        id: 'chart-revenue-by-month' },
    { title: 'Activity by Type',        id: 'chart-activity-by-type' },
    { title: 'Lead Source by Category', id: 'chart-lead-source-category' },
    { title: 'Deal Pipeline Value',     id: 'chart-deal-pipeline-value' },
    { title: 'Win/Loss Reasons',        id: 'chart-win-loss-reasons' },
  ];

  const cardsHtml = chartDefs.map(c => chartCard(c.title, c.id)).join('');

  return `
    <div class="charts-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(400px,1fr));gap:16px;">
      ${cardsHtml}
    </div>`;
}

function populateCharts() {
  const chartBuilders = [
    { id: 'chart-leads-over-time',      builder: buildLeadsOverTime,      title: 'Leads Over Time' },
    { id: 'chart-conversion-funnel',     builder: buildConversionFunnel,    title: 'Conversion Funnel' },
    { id: 'chart-revenue-by-month',      builder: buildRevenueByMonth,     title: 'Revenue by Month' },
    { id: 'chart-activity-by-type',      builder: buildActivityByType,     title: 'Activity by Type' },
    { id: 'chart-lead-source-category',  builder: buildLeadSourceByCategory, title: 'Lead Source by Category' },
    { id: 'chart-deal-pipeline-value',   builder: buildDealPipelineValue,  title: 'Deal Pipeline Value' },
    { id: 'chart-win-loss-reasons',      builder: buildWinLossReasons,     title: 'Win/Loss Reasons' },
  ];

  for (const { id, builder, title } of chartBuilders) {
    const config = builder();
    if (config) {
      renderChart(id, config);
    } else {
      // Replace canvas with empty state message
      const canvas = document.getElementById(id);
      if (canvas) {
        const wrapper = canvas.parentElement;
        canvas.style.display = 'none';
        // Check if we already have an empty message
        let emptyMsg = wrapper.querySelector('.chart-empty-msg');
        if (!emptyMsg) {
          emptyMsg = document.createElement('div');
          emptyMsg.className = 'chart-empty-msg';
          emptyMsg.style.cssText = 'display:flex;align-items:center;justify-content:center;width:100%;height:100%;position:absolute;top:0;left:0;color:#9ca3af;font-size:0.9rem;';
          emptyMsg.textContent = 'No data yet for this period';
          wrapper.appendChild(emptyMsg);
        }
      }
    }
  }
}

// ---- Public API ----

export function render() {
  const container = document.getElementById('section-reports');
  if (!container) return;

  // Destroy all existing charts before replacing DOM
  for (const key of Object.keys(charts)) {
    if (charts[key]) {
      charts[key].destroy();
      delete charts[key];
    }
  }

  container.innerHTML = renderHeader() + renderChartsGrid();

  // Chart.js needs the canvases in the DOM before rendering
  requestAnimationFrame(() => {
    populateCharts();
  });
}

export function init() {
  const section = document.getElementById('section-reports');
  if (!section) return;

  section.addEventListener('click', (e) => {
    const target = e.target;

    // Range button
    const rangeBtn = target.closest('.report-range-btn');
    if (rangeBtn) {
      const range = rangeBtn.dataset.range;
      if (range && range !== currentRange) {
        currentRange = range;
        render();
      }
      return;
    }
  });

  render();
}
