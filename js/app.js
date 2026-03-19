/**
 * Business CRM - Main Application Orchestrator
 * Handles routing, module loading, toasts, and modals.
 */

import { store } from './modules/store.js';

const modules = {};

/**
 * Dynamically load all section modules.
 * Each module is wrapped in try-catch so the app works
 * even when individual modules have not been created yet.
 */
async function loadModules() {
    const moduleMap = {
        dashboard:  './modules/dashboard.js',
        leads:      './modules/leadFinder.js',
        contacts:   './modules/contacts.js',
        deals:      './modules/deals.js',
        tasks:      './modules/tasks.js',
        calendar:   './modules/calendar.js',
        reports:    './modules/reports.js',
        settings:   './modules/settings.js',
    };

    const loadPromises = Object.entries(moduleMap).map(async ([name, path]) => {
        try {
            const m = await import(path);
            modules[name] = m;
        } catch (e) {
            // Module not yet implemented -- silently skip
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

/**
 * Navigate to a hash-based section.
 * Hides all sections, shows the target, updates sidebar active state,
 * and calls the section module's render() if available.
 */
export function navigate(hash) {
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
            modules[section].render();
        } catch (e) {
            console.error(`Failed to render module "${section}":`, e);
        }
    }
}

// ---------------------------------------------------------------------------
// Toast Notifications
// ---------------------------------------------------------------------------

/**
 * Display a temporary toast notification.
 * @param {string} message - Text to display.
 * @param {'success'|'error'|'warning'|'info'} type - Visual style.
 */
export function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    // Trigger entrance animation on next frame
    requestAnimationFrame(() => {
        toast.classList.add('toast-visible');
    });

    // Auto-remove after 3 seconds
    setTimeout(() => {
        toast.classList.remove('toast-visible');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
        // Fallback removal if transitionend never fires
        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, 400);
    }, 3000);
}

// ---------------------------------------------------------------------------
// Modal System
// ---------------------------------------------------------------------------

/**
 * Show a modal dialog with the provided HTML content.
 * @param {string} contentHtml - Inner HTML for the modal body.
 */
export function showModal(contentHtml) {
    const container = document.getElementById('modalContainer');
    if (!container) return;

    // Remove any existing modal first
    closeModal();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.setAttribute('aria-label', 'Close modal');
    closeBtn.addEventListener('click', closeModal);

    const body = document.createElement('div');
    body.className = 'modal-body';
    body.innerHTML = contentHtml;

    modal.appendChild(closeBtn);
    modal.appendChild(body);
    overlay.appendChild(modal);

    // Close when clicking the overlay background
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });

    // Close on Escape key
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);

    container.appendChild(overlay);
}

/**
 * Close and remove the current modal.
 */
export function closeModal() {
    const container = document.getElementById('modalContainer');
    if (!container) return;
    container.innerHTML = '';
}

// ---------------------------------------------------------------------------
// Task Badge
// ---------------------------------------------------------------------------

/**
 * Update the sidebar task badge with the count of overdue + due-today tasks.
 */
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

    // Close on Escape
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            dropdown.style.display = 'none';
            input.blur();
        }
    });

    // Close on click outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.sidebar-search')) {
            dropdown.style.display = 'none';
        }
    });
}

function performGlobalSearch(query) {
    const results = [];
    const max = 10;

    // Search leads
    const leads = store.getLeads() || [];
    for (const lead of leads) {
        if (results.length >= max) break;
        const haystack = [lead.name, lead.category, lead.city].filter(Boolean).join(' ').toLowerCase();
        if (haystack.includes(query)) {
            results.push({ type: 'lead', name: lead.name, section: 'leads' });
        }
    }

    // Search contacts
    const contacts = store.getContacts() || [];
    for (const c of contacts) {
        if (results.length >= max) break;
        const haystack = [c.name, c.businessName, c.email].filter(Boolean).join(' ').toLowerCase();
        if (haystack.includes(query)) {
            results.push({ type: 'contact', name: c.name, section: 'contacts' });
        }
    }

    // Search deals
    const deals = store.getDeals() || [];
    for (const d of deals) {
        if (results.length >= max) break;
        if (d.name && d.name.toLowerCase().includes(query)) {
            results.push({ type: 'deal', name: d.name, section: 'deals' });
        }
    }

    // Search tasks
    const tasks = store.getTasks() || [];
    for (const t of tasks) {
        if (results.length >= max) break;
        if (t.title && t.title.toLowerCase().includes(query)) {
            results.push({ type: 'task', name: t.title, section: 'tasks' });
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
    };

    const typeLabel = { lead: 'Lead', contact: 'Contact', deal: 'Deal', task: 'Task' };

    dropdown.innerHTML = results.map(r => `
        <div class="search-result-item" data-section="${r.section}">
            <span class="result-icon type-${r.type}">${iconMap[r.type]}</span>
            <span class="result-name">${escapeHtmlSimple(r.name)}</span>
            <span class="result-type">${typeLabel[r.type]}</span>
        </div>
    `).join('');

    // Click handler for results
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

    // Set initial icon
    const settings = store.getSettings();
    const isLight = settings.theme === 'light';
    btn.innerHTML = isLight
        ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/></svg>'
        : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
    btn.title = isLight ? 'Switch to Dark Mode' : 'Switch to Light Mode';

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

        // Update icon
        const nowLight = newTheme === 'light';
        btn.innerHTML = nowLight
            ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/></svg>'
            : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
        btn.title = nowLight ? 'Switch to Dark Mode' : 'Switch to Light Mode';

        showToast(nowLight ? 'Light theme applied.' : 'Dark theme applied.');
    });
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize the data store
    store.init();

    // Apply saved theme
    const settings = store.getSettings();
    if (settings.theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    }

    // Load and initialize all section modules
    await loadModules();

    // Set up sidebar navigation
    setupSidebar();

    // Set up global search
    setupGlobalSearch();

    // Set up theme toggle button in sidebar
    setupThemeToggle();

    // Listen for hash changes
    window.addEventListener('hashchange', () => {
        navigate(location.hash);
    });

    window.addEventListener('popstate', () => {
        navigate(location.hash);
    });

    // Navigate to the initial route
    navigate(location.hash || '#dashboard');

    // Update the task badge on startup
    updateTaskBadge();
});
