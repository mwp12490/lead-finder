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

function renderKPICards() {
    const cards = [
        { label: 'Total Leads', value: countSavedLeads(), icon: kpiIcon('magnifier'), color: '#3b82f6' },
        { label: 'Active Pipeline', value: countActivePipeline(), icon: kpiIcon('funnel'), color: '#f59e0b' },
        { label: 'Contacts', value: countContacts(), icon: kpiIcon('people'), color: '#22c55e' },
        { label: 'Open Deals', value: formatCurrency(sumOpenDeals()), icon: kpiIcon('dollar'), color: '#eab308' },
        { label: 'Conversion Rate', value: conversionRate(), icon: kpiIcon('trending-up'), color: '#8b5cf6' },
        { label: 'Revenue This Month', value: formatCurrency(revenueThisMonth()), icon: kpiIcon('chart'), color: '#22c55e' },
    ];

    return `
        <div class="kpi-grid">
            ${cards.map(c => `
                <div class="kpi-card">
                    <div class="kpi-icon" style="color:${c.color};">${c.icon}</div>
                    <div class="kpi-info">
                        <div class="kpi-value">${c.value}</div>
                        <div class="kpi-label">${escapeHtml(c.label)}</div>
                    </div>
                </div>
            `).join('')}
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
        <div class="section-header">
            <h1>Dashboard</h1>
            <p class="section-subtitle">${subtitle}</p>
        </div>

        ${renderKPICards()}

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

    // Quick action navigation
    section.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="nav"]');
        if (btn) {
            const target = btn.dataset.target;
            if (target) {
                location.hash = `#${target}`;
            }
        }
    });
}
