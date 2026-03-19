/**
 * Business CRM - Main Application Orchestrator
 * Handles routing, module loading, toasts, and modals.
 */

import store from './modules/store.js';

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
// Bootstrap
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize the data store
    store.init();

    // Load and initialize all section modules
    await loadModules();

    // Set up sidebar navigation
    setupSidebar();

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
