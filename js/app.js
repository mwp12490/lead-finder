/**
 * Business CRM - Main Application Orchestrator
 * Handles routing, module loading, toasts, modals, setup wizard, and help tooltips.
 */

import { store } from './modules/store.js';

const modules = {};

/**
 * Dynamically load all section modules.
 */
async function loadModules() {
    const moduleMap = {
        dashboard:  './modules/dashboard.js',
        leads:      './modules/leadFinder.js',
        contacts:   './modules/contacts.js',
        deals:      './modules/deals.js',
        projects:   './modules/projects.js',
        tasks:      './modules/tasks.js',
        ai:         './modules/ai.js',
        calendar:   './modules/calendar.js',
        reports:    './modules/reports.js',
        settings:   './modules/settings.js',
    };

    const loadPromises = Object.entries(moduleMap).map(async ([name, path]) => {
        try {
            const m = await import(path);
            modules[name] = m;
        } catch (e) {
            console.warn(`Module "${name}" not loaded:`, e.message);
        }
    });

    await Promise.all(loadPromises);

    // Initialize every successfully loaded module
    for (const [name, mod] of Object.entries(modules)) {
        if (typeof mod.init === 'function') {
            try {
                mod.init();
            } catch (e) {
                console.error(`Failed to init module "${name}":`, e);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

export function navigate(hash, entityId) {
    const section = hash.replace('#', '') || 'dashboard';

    // Hide all sections
    document.querySelectorAll('.section').forEach(s => {
        s.style.display = 'none';
    });

    // Show target section
    const target = document.getElementById(`section-${section}`);
    if (target) {
        target.style.display = 'block';
        target.classList.add('fade-in');
        setTimeout(() => target.classList.remove('fade-in'), 300);
    }

    // Update sidebar active state
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.section === section);
    });

    // Call the section's render function
    if (modules[section] && typeof modules[section].render === 'function') {
        try {
            modules[section].render(entityId);
        } catch (e) {
            console.error(`Failed to render module "${section}":`, e);
        }
    }

    // Update pipeline progress in sidebar
    updatePipelineProgress();
}

// ---------------------------------------------------------------------------
// Toast Notifications
// ---------------------------------------------------------------------------

export function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('toast-visible');
    });

    setTimeout(() => {
        toast.classList.remove('toast-visible');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, 400);
    }, 3000);
}

// ---------------------------------------------------------------------------
// Modal System
// ---------------------------------------------------------------------------

export function showModal(titleOrHtml, contentHtml) {
    const container = document.getElementById('modalContainer');
    if (!container) return;

    // Backwards compat: if called with one arg, treat it as contentHtml with no title
    let title = '';
    let bodyHtml = contentHtml;
    if (contentHtml === undefined) {
        bodyHtml = titleOrHtml;
        title = '';
    } else {
        title = titleOrHtml || '';
    }

    closeModal();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal';

    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `<h3 class="modal-title">${title}</h3>`;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.setAttribute('aria-label', 'Close modal');
    closeBtn.addEventListener('click', closeModal);
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'modal-body';
    body.innerHTML = bodyHtml;

    modal.appendChild(header);
    modal.appendChild(body);
    overlay.appendChild(modal);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });

    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);

    container.appendChild(overlay);
}

export function closeModal() {
    const container = document.getElementById('modalContainer');
    if (!container) return;
    container.innerHTML = '';
}

// ---------------------------------------------------------------------------
// Task Badge
// ---------------------------------------------------------------------------

export function updateTaskBadge() {
    const badge = document.getElementById('taskBadge');
    if (!badge) return;

    const tasks = store.get('tasks') || [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const endOfToday = new Date(today);
    endOfToday.setHours(23, 59, 59, 999);

    const urgentCount = tasks.filter(task => {
        if (task.completed) return false;
        if (!task.dueDate) return false;
        const due = new Date(task.dueDate);
        return due <= endOfToday;
    }).length;

    if (urgentCount > 0) {
        badge.textContent = urgentCount;
        badge.style.display = '';
    } else {
        badge.style.display = 'none';
    }
}

// ---------------------------------------------------------------------------
// Pipeline Progress Bar (sidebar)
// ---------------------------------------------------------------------------

function updatePipelineProgress() {
    const fill = document.getElementById('pipelineProgressFill');
    const stats = document.getElementById('pipelineProgressStats');
    if (!fill || !stats) return;

    const leads = store.getLeads().filter(l => l.savedAt);
    const contacts = store.getContacts();
    const deals = store.getDeals();
    const wonDeals = deals.filter(d => d.stage === 'Closed Won');
    const projects = store.getProjects();

    // Calculate stages with data
    const stages = [
        { label: 'Leads', count: leads.length },
        { label: 'Contacts', count: contacts.length },
        { label: 'Deals', count: deals.filter(d => d.stage !== 'Closed Won' && d.stage !== 'Closed Lost').length },
        { label: 'Won', count: wonDeals.length },
        { label: 'Projects', count: projects.filter(p => p.status !== 'Complete').length },
    ];

    const totalItems = stages.reduce((s, st) => s + st.count, 0);
    const activeStages = stages.filter(s => s.count > 0).length;
    const pct = totalItems > 0 ? Math.min(100, (activeStages / stages.length) * 100) : 0;

    fill.style.width = pct + '%';
    stats.innerHTML = stages.map(s =>
        `<span class="progress-stat${s.count > 0 ? ' active' : ''}">${s.count} ${s.label}</span>`
    ).join('');
}

// ---------------------------------------------------------------------------
// Sidebar Click Handlers
// ---------------------------------------------------------------------------

function setupSidebar() {
    document.querySelectorAll('.nav-item[data-section]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.dataset.section;
            if (section) {
                location.hash = `#${section}`;
            }
        });
    });
}

// ---------------------------------------------------------------------------
// Global Search
// ---------------------------------------------------------------------------

function setupGlobalSearch() {
    const input = document.getElementById('globalSearch');
    const dropdown = document.getElementById('globalSearchResults');
    if (!input || !dropdown) return;

    let debounceTimer = null;

    input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const query = input.value.trim().toLowerCase();
            if (!query) {
                dropdown.style.display = 'none';
                dropdown.innerHTML = '';
                return;
            }
            const results = performGlobalSearch(query);
            renderGlobalSearchResults(results, dropdown);
        }, 300);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            dropdown.style.display = 'none';
            input.blur();
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.sidebar-search')) {
            dropdown.style.display = 'none';
        }
    });
}

function performGlobalSearch(query) {
    const results = [];
    const max = 10;

    const leads = store.getLeads() || [];
    for (const lead of leads) {
        if (results.length >= max) break;
        const haystack = [lead.name, lead.category, lead.city].filter(Boolean).join(' ').toLowerCase();
        if (haystack.includes(query)) {
            results.push({ type: 'lead', name: lead.name, section: 'leads' });
        }
    }

    const contacts = store.getContacts() || [];
    for (const c of contacts) {
        if (results.length >= max) break;
        const haystack = [c.name, c.businessName, c.email].filter(Boolean).join(' ').toLowerCase();
        if (haystack.includes(query)) {
            results.push({ type: 'contact', name: c.name, section: 'contacts' });
        }
    }

    const deals = store.getDeals() || [];
    for (const d of deals) {
        if (results.length >= max) break;
        if (d.name && d.name.toLowerCase().includes(query)) {
            results.push({ type: 'deal', name: d.name, section: 'deals' });
        }
    }

    const tasks = store.getTasks() || [];
    for (const t of tasks) {
        if (results.length >= max) break;
        if (t.title && t.title.toLowerCase().includes(query)) {
            results.push({ type: 'task', name: t.title, section: 'tasks' });
        }
    }

    const projects = store.getProjects() || [];
    for (const p of projects) {
        if (results.length >= max) break;
        if (p.name && p.name.toLowerCase().includes(query)) {
            results.push({ type: 'project', name: p.name, section: 'projects' });
        }
    }

    return results;
}

function renderGlobalSearchResults(results, dropdown) {
    if (!results.length) {
        dropdown.innerHTML = '<div class="no-results">No results found</div>';
        dropdown.style.display = 'block';
        return;
    }

    const iconMap = {
        lead: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
        contact: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>',
        deal: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="6" x2="12" y2="18"/></svg>',
        task: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12l2 2 4-4"/></svg>',
        project: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    };

    const typeLabel = { lead: 'Lead', contact: 'Contact', deal: 'Deal', task: 'Task', project: 'Project' };

    dropdown.innerHTML = results.map(r => `
        <div class="search-result-item" data-section="${r.section}">
            <span class="result-icon type-${r.type}">${iconMap[r.type]}</span>
            <span class="result-name">${escapeHtmlSimple(r.name)}</span>
            <span class="result-type">${typeLabel[r.type]}</span>
        </div>
    `).join('');

    dropdown.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', () => {
            const section = item.dataset.section;
            location.hash = `#${section}`;
            dropdown.style.display = 'none';
            document.getElementById('globalSearch').value = '';
        });
    });

    dropdown.style.display = 'block';
}

function escapeHtmlSimple(str) {
    if (str == null) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

// ---------------------------------------------------------------------------
// Theme Toggle
// ---------------------------------------------------------------------------

function setupThemeToggle() {
    const btn = document.getElementById('theme-toggle-btn');
    if (!btn) return;

    const settings = store.getSettings();
    const isLight = settings.theme === 'light';
    updateThemeIcon(btn, isLight);

    btn.addEventListener('click', (e) => {
        e.preventDefault();
        const currentSettings = store.getSettings();
        const newTheme = currentSettings.theme === 'light' ? 'dark' : 'light';
        store.updateSettings({ theme: newTheme });

        if (newTheme === 'light') {
            document.documentElement.setAttribute('data-theme', 'light');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }

        updateThemeIcon(btn, newTheme === 'light');
        showToast(newTheme === 'light' ? 'Light theme applied.' : 'Dark theme applied.');
    });
}

function updateThemeIcon(btn, isLight) {
    btn.innerHTML = isLight
        ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/></svg><span>Theme</span>'
        : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg><span>Theme</span>';
    btn.title = isLight ? 'Switch to Dark Mode' : 'Switch to Light Mode';
}

// ---------------------------------------------------------------------------
// Help Tooltips
// ---------------------------------------------------------------------------

function setupHelpTooltips() {
    const tooltip = document.getElementById('helpTooltip');
    if (!tooltip) return;

    document.addEventListener('mouseenter', (e) => {
        const tip = e.target.closest('.nav-help-tip');
        if (!tip) return;
        const text = tip.dataset.tooltip;
        if (!text) return;

        const rect = tip.getBoundingClientRect();
        tooltip.textContent = text;
        tooltip.style.display = 'block';
        tooltip.style.top = (rect.top + rect.height / 2 - tooltip.offsetHeight / 2) + 'px';
        tooltip.style.left = (rect.right + 10) + 'px';
    }, true);

    document.addEventListener('mouseleave', (e) => {
        if (e.target.closest('.nav-help-tip')) {
            tooltip.style.display = 'none';
        }
    }, true);
}

// ---------------------------------------------------------------------------
// First-Time Setup Wizard
// ---------------------------------------------------------------------------

function checkSetupWizard() {
    const settings = store.getSettings();
    if (settings.setupComplete) return;

    // If they already have data, mark setup as done
    if (store.getLeads().length > 0 || settings.apiKey) {
        store.updateSettings({ setupComplete: true });
        return;
    }

    showSetupWizard();
}

function showSetupWizard() {
    const overlay = document.getElementById('setupWizard');
    if (!overlay) return;
    overlay.style.display = 'flex';
    renderWizardStep(1);
}

function renderWizardStep(step) {
    const body = document.getElementById('wizardBody');
    if (!body) return;

    // Update step indicators
    document.querySelectorAll('.wizard-step').forEach(el => {
        const s = parseInt(el.dataset.step);
        el.classList.toggle('active', s === step);
        el.classList.toggle('completed', s < step);
    });

    if (step === 1) {
        body.innerHTML = `
            <div class="wizard-content">
                <h3>Tell us about you</h3>
                <p>This helps personalize your dashboard.</p>
                <div class="form-group">
                    <label>Your Name</label>
                    <input type="text" id="wizard-name" class="form-control" placeholder="e.g. John Smith">
                </div>
                <div class="form-group">
                    <label>Business Name</label>
                    <input type="text" id="wizard-business" class="form-control" placeholder="e.g. Smith Digital Marketing">
                </div>
                <div class="wizard-actions">
                    <button class="btn btn-outline" id="wizard-skip">Skip Setup</button>
                    <button class="btn btn-primary" id="wizard-next-1">Next</button>
                </div>
            </div>`;
    } else if (step === 2) {
        body.innerHTML = `
            <div class="wizard-content">
                <h3>Add Your Google API Key</h3>
                <p>This lets you search for businesses in any city. Google gives you <strong>$200/month free</strong> (about 10,000 searches).</p>
                <div class="form-group">
                    <label>Google Places API Key</label>
                    <input type="text" id="wizard-apikey" class="form-control" placeholder="Paste your API key here">
                </div>
                <div class="wizard-help">
                    <p><strong>How to get one (free):</strong></p>
                    <ol>
                        <li>Go to <a href="https://console.cloud.google.com/" target="_blank">Google Cloud Console</a></li>
                        <li>Create a project and enable Places API</li>
                        <li>Go to Credentials, create an API key</li>
                        <li>Paste it above</li>
                    </ol>
                </div>
                <div class="wizard-actions">
                    <button class="btn btn-outline" id="wizard-back-2">Back</button>
                    <button class="btn btn-outline" id="wizard-skip-2">Skip for now</button>
                    <button class="btn btn-primary" id="wizard-next-2">Next</button>
                </div>
            </div>`;
    } else if (step === 3) {
        body.innerHTML = `
            <div class="wizard-content">
                <h3>You're All Set!</h3>
                <p>Here's how your business workflow works:</p>
                <div class="wizard-flow">
                    <div class="wizard-flow-step"><span class="stage-number">1</span><strong>Find Leads</strong><br>Search for businesses in your target market</div>
                    <div class="wizard-flow-arrow">&#8594;</div>
                    <div class="wizard-flow-step"><span class="stage-number">2</span><strong>Reach Out</strong><br>Convert leads to contacts and make contact</div>
                    <div class="wizard-flow-arrow">&#8594;</div>
                    <div class="wizard-flow-step"><span class="stage-number">3</span><strong>Close Deals</strong><br>Track proposals and close sales</div>
                    <div class="wizard-flow-arrow">&#8594;</div>
                    <div class="wizard-flow-step"><span class="stage-number">4</span><strong>Deliver Work</strong><br>Manage projects and deliverables</div>
                    <div class="wizard-flow-arrow">&#8594;</div>
                    <div class="wizard-flow-step"><span class="stage-number">5</span><strong>Follow Up</strong><br>Tasks, reminders, and repeat business</div>
                </div>
                <div class="wizard-actions" style="justify-content:center;">
                    <button class="btn btn-primary btn-lg" id="wizard-finish">Start Finding Leads</button>
                </div>
            </div>`;
    }
}

function setupWizardHandlers() {
    document.addEventListener('click', (e) => {
        const target = e.target;

        if (target.id === 'wizard-next-1') {
            const name = document.getElementById('wizard-name')?.value.trim();
            const business = document.getElementById('wizard-business')?.value.trim();
            if (name || business) {
                store.updateSettings({ userName: name, businessName: business });
            }
            renderWizardStep(2);
            return;
        }

        if (target.id === 'wizard-next-2') {
            const key = document.getElementById('wizard-apikey')?.value.trim();
            if (key) {
                store.updateSettings({ apiKey: key });
            }
            renderWizardStep(3);
            return;
        }

        if (target.id === 'wizard-back-2') {
            renderWizardStep(1);
            return;
        }

        if (target.id === 'wizard-skip' || target.id === 'wizard-skip-2') {
            store.updateSettings({ setupComplete: true });
            document.getElementById('setupWizard').style.display = 'none';
            navigate(location.hash || '#dashboard');
            return;
        }

        if (target.id === 'wizard-finish') {
            store.updateSettings({ setupComplete: true });
            document.getElementById('setupWizard').style.display = 'none';
            location.hash = '#leads';
            navigate('#leads');
            return;
        }
    });
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
    store.init();

    // Apply saved theme
    const settings = store.getSettings();
    if (settings.theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    }

    // Expose CRM utilities globally for modules
    window.CRM = {
        showToast,
        showModal,
        closeModal,
        navigate: (section, entityId) => {
            location.hash = `#${section}`;
            navigate(`#${section}`, entityId);
        },
        updateTaskBadge,
        store,
    };

    // Load and initialize all section modules
    await loadModules();

    setupSidebar();
    setupGlobalSearch();
    setupThemeToggle();
    setupHelpTooltips();
    setupWizardHandlers();

    window.addEventListener('hashchange', () => {
        navigate(location.hash);
    });

    window.addEventListener('popstate', () => {
        navigate(location.hash);
    });

    // Check if first-time user
    checkSetupWizard();

    // Navigate to the initial route
    navigate(location.hash || '#dashboard');

    updateTaskBadge();
});
