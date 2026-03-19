// dashboard.js - Dashboard module for the CRM application

import { store } from './store.js';
import { escapeHtml, formatDate, formatCurrency, timeAgo } from './utils.js';
import { renderActivityFeed } from './activities.js';

// ---- KPI Helpers ----

function countSavedLeads() {
    return store.getLeads().filter(l => l.savedAt).length;
}

function countActivePipeline() {
    return store.getLeads().filter(l => l.savedAt && l.status !== 'Closed' && l.status !== 'Not Interested').length;
}

function countContacts() {
    return store.getContacts().length;
}

function sumOpenDeals() {
    return store.getDeals()
        .filter(d => d.stage !== 'Closed Won' && d.stage !== 'Closed Lost')
        .reduce((sum, d) => sum + (Number(d.value) || 0), 0);
}

function conversionRate() {
    const leadCount = countSavedLeads();
    if (leadCount === 0) return '0%';
    return ((store.getContacts().length / leadCount) * 100).toFixed(1) + '%';
}

function revenueThisMonth() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    return store.getDeals()
        .filter(d => {
            if (d.stage !== 'Closed Won' || !d.closedAt) return false;
            const closed = new Date(d.closedAt);
            return closed.getMonth() === currentMonth && closed.getFullYear() === currentYear;
        })
        .reduce((sum, d) => sum + (Number(d.value) || 0), 0);
}

// ---- KPI Icons (inline SVG) ----

function kpiIcon(type) {
    switch (type) {
        case 'magnifier':
            return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
        case 'funnel':
            return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>';
        case 'people':
            return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>';
        case 'dollar':
            return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>';
        case 'trending-up':
            return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>';
        case 'chart':
            return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>';
        default:
            return '';
    }
}

// ---- KPI Cards ----

const DEFAULT_KPI_CARDS = [
    { id: 'total-leads', label: 'Total Leads', valueFn: countSavedLeads, icon: 'magnifier', color: '#3b82f6' },
    { id: 'active-pipeline', label: 'Active Pipeline', valueFn: countActivePipeline, icon: 'funnel', color: '#f59e0b' },
    { id: 'contacts', label: 'Contacts', valueFn: countContacts, icon: 'people', color: '#22c55e' },
    { id: 'open-deals', label: 'Open Deals', valueFn: () => formatCurrency(sumOpenDeals()), icon: 'dollar', color: '#eab308' },
    { id: 'conversion-rate', label: 'Conversion Rate', valueFn: conversionRate, icon: 'trending-up', color: '#8b5cf6' },
    { id: 'revenue-month', label: 'Revenue This Month', valueFn: () => formatCurrency(revenueThisMonth()), icon: 'chart', color: '#22c55e' },
];

const DEFAULT_CARD_ORDER = DEFAULT_KPI_CARDS.map(c => c.id);

function getDashboardConfig() {
    const settings = store.getSettings();
    return settings.dashboardConfig || { hiddenCards: [], cardOrder: [...DEFAULT_CARD_ORDER] };
}

function saveDashboardConfig(config) {
    store.updateSettings({ dashboardConfig: config });
}

function renderKPICards() {
    const config = getDashboardConfig();
    const hiddenSet = new Set(config.hiddenCards || []);
    const order = config.cardOrder && config.cardOrder.length === DEFAULT_CARD_ORDER.length
        ? config.cardOrder
        : [...DEFAULT_CARD_ORDER];

    const orderedCards = order
        .map(id => DEFAULT_KPI_CARDS.find(c => c.id === id))
        .filter(c => c && !hiddenSet.has(c.id));

    return `
        <div class="kpi-grid">
            ${orderedCards.map(c => `
                <div class="kpi-card">
                    <div class="kpi-icon" style="color:${c.color};">${kpiIcon(c.icon)}</div>
                    <div class="kpi-info">
                        <div class="kpi-value">${c.valueFn()}</div>
                        <div class="kpi-label">${escapeHtml(c.label)}</div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// ---- Dashboard Customization Modal ----

function openDashboardCustomizeModal() {
    const config = getDashboardConfig();
    const hiddenSet = new Set(config.hiddenCards || []);
    const order = config.cardOrder && config.cardOrder.length === DEFAULT_CARD_ORDER.length
        ? [...config.cardOrder]
        : [...DEFAULT_CARD_ORDER];

    const cardItems = order.map((id, idx) => {
        const card = DEFAULT_KPI_CARDS.find(c => c.id === id);
        if (!card) return '';
        const checked = !hiddenSet.has(id) ? 'checked' : '';
        const isFirst = idx === 0;
        const isLast = idx === order.length - 1;
        return `
            <div class="dash-config-item" data-card-id="${escapeHtml(id)}" style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:6px;">
                <label style="display:flex;align-items:center;gap:8px;flex:1;cursor:pointer;font-size:0.9rem;">
                    <input type="checkbox" class="dash-card-toggle" data-card-id="${escapeHtml(id)}" ${checked} style="width:16px;height:16px;accent-color:#2563eb;">
                    ${escapeHtml(card.label)}
                </label>
                <div style="display:flex;gap:4px;">
                    <button class="dash-move-up" data-card-id="${escapeHtml(id)}" ${isFirst ? 'disabled' : ''} style="padding:2px 8px;border:1px solid #d1d5db;border-radius:4px;background:#fff;cursor:${isFirst ? 'default' : 'pointer'};color:${isFirst ? '#d1d5db' : '#374151'};font-size:0.8rem;">&#9650;</button>
                    <button class="dash-move-down" data-card-id="${escapeHtml(id)}" ${isLast ? 'disabled' : ''} style="padding:2px 8px;border:1px solid #d1d5db;border-radius:4px;background:#fff;cursor:${isLast ? 'default' : 'pointer'};color:${isLast ? '#d1d5db' : '#374151'};font-size:0.8rem;">&#9660;</button>
                </div>
            </div>`;
    }).join('');

    const html = `
        <div id="dash-config-list">
            ${cardItems}
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:16px;">
            <button id="dash-config-reset" style="padding:8px 16px;background:#f3f4f6;color:#374151;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;font-size:0.85rem;">Reset to Default</button>
            <div style="display:flex;gap:8px;">
                <button id="dash-config-cancel" style="padding:8px 16px;background:#f3f4f6;color:#374151;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;">Cancel</button>
                <button id="dash-config-save" style="padding:8px 20px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:500;">Save</button>
            </div>
        </div>`;

    window.CRM.showModal('Customize Dashboard', html);
}

// ---- Stale Deals Alert ----

function renderStaleDealAlert() {
    const now = new Date();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const staleDeals = store.getDeals().filter(d => {
        if (d.stage === 'Closed Won' || d.stage === 'Closed Lost') return false;
        if (!d.updatedAt) return false;
        return (now.getTime() - new Date(d.updatedAt).getTime()) > sevenDaysMs;
    });

    if (staleDeals.length === 0) return '';

    const dealItems = staleDeals.map(d => {
        const daysSince = Math.floor((now.getTime() - new Date(d.updatedAt).getTime()) / (24 * 60 * 60 * 1000));
        return `<div class="stale-deal-item" data-action="nav" data-target="deals" style="cursor:pointer;padding:6px 0;border-bottom:1px solid rgba(180,140,20,0.2);font-size:0.85rem;">
            <span style="font-weight:500;color:#92400e;">${escapeHtml(d.name)}</span>
            <span style="color:#a16207;margin-left:8px;">${daysSince} days since last update</span>
        </div>`;
    }).join('');

    return `
        <div class="stale-deals-alert" style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:16px;margin-bottom:20px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <h3 style="margin:0;font-size:1rem;color:#92400e;">${staleDeals.length} deal${staleDeals.length !== 1 ? 's' : ''} need${staleDeals.length === 1 ? 's' : ''} attention</h3>
            </div>
            ${dealItems}
        </div>
    `;
}

// ---- Charts ----

function renderChartsHTML() {
    return `
        <div class="charts-row">
            <div class="chart-card">
                <h3>Lead Pipeline</h3>
                <div class="chart-container">
                    <canvas id="dashPipelineChart"></canvas>
                </div>
            </div>
            <div class="chart-card">
                <h3>Deal Pipeline Value</h3>
                <div class="chart-container">
                    <canvas id="dashDealsChart"></canvas>
                </div>
            </div>
        </div>
    `;
}

function renderCharts() {
    // Pipeline funnel
    const pipelineCtx = document.getElementById('dashPipelineChart');
    if (pipelineCtx) {
        // Destroy existing chart if any
        if (window._dashPipelineChart) window._dashPipelineChart.destroy();

        const stages = ['New', 'Contacted', 'Responded', 'Meeting Set', 'Closed', 'Not Interested'];
        const leads = store.getLeads().filter(l => l.savedAt);
        const data = stages.map(s => leads.filter(l => l.status === s).length);

        window._dashPipelineChart = new Chart(pipelineCtx, {
            type: 'bar',
            data: {
                labels: stages,
                datasets: [{
                    data: data,
                    backgroundColor: ['#0ea5e9', '#3b82f6', '#8b5cf6', '#f59e0b', '#22c55e', '#6b7280']
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#a0a0b0' } },
                    y: { grid: { display: false }, ticks: { color: '#e0e0e0' } }
                }
            }
        });
    }

    // Deals by stage
    const dealsCtx = document.getElementById('dashDealsChart');
    if (dealsCtx) {
        if (window._dashDealsChart) window._dashDealsChart.destroy();

        const dealStages = ['Qualification', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost'];
        const deals = store.getDeals();
        const dealData = dealStages.map(s =>
            deals.filter(d => d.stage === s).reduce((sum, d) => sum + (Number(d.value) || 0), 0)
        );

        window._dashDealsChart = new Chart(dealsCtx, {
            type: 'bar',
            data: {
                labels: dealStages,
                datasets: [{
                    data: dealData,
                    backgroundColor: ['#0ea5e9', '#f59e0b', '#eab308', '#22c55e', '#ef4444']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false }, ticks: { color: '#e0e0e0' } },
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#a0a0b0', callback: v => '$' + v.toLocaleString() } }
                }
            }
        });
    }
}

// ---- Quick Actions ----

function renderQuickActions() {
    return `
        <div class="quick-actions">
            <button class="btn btn-outline quick-action-btn" data-action="nav" data-target="leads">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                Find New Leads
            </button>
            <button class="btn btn-outline quick-action-btn" data-action="nav" data-target="contacts">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                Add Contact
            </button>
            <button class="btn btn-outline quick-action-btn" data-action="nav" data-target="deals">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
                Create Deal
            </button>
            <button class="btn btn-outline quick-action-btn" data-action="nav" data-target="tasks">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12l2 2 4-4"/></svg>
                Add Task
            </button>
        </div>
    `;
}

// ---- Main Render ----

export function render() {
    const container = document.getElementById('section-dashboard');
    if (!container) return;

    const settings = store.getSettings();
    const subtitle = settings.businessName
        ? `Welcome back, ${escapeHtml(settings.businessName)}`
        : 'Welcome back';

    container.innerHTML = `
        <div class="section-header" style="display:flex;justify-content:space-between;align-items:flex-start;">
            <div>
                <h1>Dashboard</h1>
                <p class="section-subtitle">${subtitle}</p>
            </div>
            <button id="dash-customize-btn" title="Customize Dashboard" style="background:none;border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;cursor:pointer;color:#6b7280;display:flex;align-items:center;gap:4px;font-size:0.8rem;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
                Customize
            </button>
        </div>

        ${renderKPICards()}

        ${renderStaleDealAlert()}

        ${renderChartsHTML()}

        <div class="card activity-card">
            <div class="card-header">
                <h3>Recent Activity</h3>
            </div>
            <div id="dash-activity-feed"></div>
        </div>

        ${renderQuickActions()}
    `;

    // Render activity feed
    renderActivityFeed('dash-activity-feed', 10);

    // Check for empty activity state
    const feedEl = document.getElementById('dash-activity-feed');
    if (feedEl && store.getActivities().length === 0) {
        feedEl.innerHTML = '<p class="text-muted">No activity yet. Start by finding and contacting leads!</p>';
    }

    // Render charts (needs DOM to be in place)
    if (typeof Chart !== 'undefined') {
        renderCharts();
    }
}

// ---- Init ----

export function init() {
    const section = document.getElementById('section-dashboard');
    if (!section) return;

    // Quick action navigation + stale deal clicks
    section.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="nav"]');
        if (btn) {
            const target = btn.dataset.target;
            if (target) {
                location.hash = `#${target}`;
            }
        }

        // Customize button
        if (e.target.closest('#dash-customize-btn')) {
            openDashboardCustomizeModal();
        }
    });

    // Modal-level event delegation for dashboard customization
    document.addEventListener('click', (e) => {
        const target = e.target;

        // Move up
        const upBtn = target.closest('.dash-move-up');
        if (upBtn && !upBtn.disabled) {
            const cardId = upBtn.dataset.cardId;
            const list = document.getElementById('dash-config-list');
            if (list) {
                const items = [...list.querySelectorAll('.dash-config-item')];
                const idx = items.findIndex(el => el.dataset.cardId === cardId);
                if (idx > 0) {
                    list.insertBefore(items[idx], items[idx - 1]);
                    // Update disabled state
                    updateMoveButtons(list);
                }
            }
            return;
        }

        // Move down
        const downBtn = target.closest('.dash-move-down');
        if (downBtn && !downBtn.disabled) {
            const cardId = downBtn.dataset.cardId;
            const list = document.getElementById('dash-config-list');
            if (list) {
                const items = [...list.querySelectorAll('.dash-config-item')];
                const idx = items.findIndex(el => el.dataset.cardId === cardId);
                if (idx >= 0 && idx < items.length - 1) {
                    list.insertBefore(items[idx + 1], items[idx]);
                    updateMoveButtons(list);
                }
            }
            return;
        }

        // Save config
        if (target.id === 'dash-config-save') {
            const list = document.getElementById('dash-config-list');
            if (list) {
                const items = [...list.querySelectorAll('.dash-config-item')];
                const cardOrder = items.map(el => el.dataset.cardId);
                const hiddenCards = items
                    .filter(el => !el.querySelector('.dash-card-toggle').checked)
                    .map(el => el.dataset.cardId);
                saveDashboardConfig({ cardOrder, hiddenCards });
                window.CRM.closeModal();
                render();
            }
            return;
        }

        // Cancel config
        if (target.id === 'dash-config-cancel') {
            window.CRM.closeModal();
            return;
        }

        // Reset to default
        if (target.id === 'dash-config-reset') {
            saveDashboardConfig({ hiddenCards: [], cardOrder: [...DEFAULT_CARD_ORDER] });
            window.CRM.closeModal();
            render();
            window.CRM.showToast('Dashboard reset to default');
            return;
        }
    });

    function updateMoveButtons(list) {
        const items = [...list.querySelectorAll('.dash-config-item')];
        items.forEach((el, idx) => {
            const upBtn = el.querySelector('.dash-move-up');
            const downBtn = el.querySelector('.dash-move-down');
            if (upBtn) {
                upBtn.disabled = idx === 0;
                upBtn.style.color = idx === 0 ? '#d1d5db' : '#374151';
                upBtn.style.cursor = idx === 0 ? 'default' : 'pointer';
            }
            if (downBtn) {
                downBtn.disabled = idx === items.length - 1;
                downBtn.style.color = idx === items.length - 1 ? '#d1d5db' : '#374151';
                downBtn.style.cursor = idx === items.length - 1 ? 'default' : 'pointer';
            }
        });
    }
}
