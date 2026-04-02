// settings.js - Settings module for the CRM application

import { store } from './store.js';
import { escapeHtml, formatDate, formatCurrency, timeAgo } from './utils.js';

// ---- Helpers ----

function updateThemeToggleIcon() {
    const btn = document.getElementById('theme-toggle-btn');
    if (!btn) return;
    const settings = store.getSettings();
    const isLight = settings.theme === 'light';
    btn.innerHTML = isLight
        ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/></svg>'
        : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
    btn.title = isLight ? 'Switch to Dark Mode' : 'Switch to Light Mode';
}

export { updateThemeToggleIcon };

function maskApiKey(key) {
    if (!key) return '';
    if (key.length <= 4) return key;
    return '\u2022'.repeat(key.length - 4) + key.slice(-4);
}

function getDataStats() {
    return {
        leads: store.getLeads().length,
        contacts: store.getContacts().length,
        deals: store.getDeals().length,
        tasks: store.getTasks().length,
        activities: store.getActivities().length,
        projects: store.getProjects().length,
        payments: store.getPayments().length,
    };
}

// ---- Render ----

export function render() {
    const container = document.getElementById('section-settings');
    if (!container) return;

    const settings = store.getSettings();
    const stats = getDataStats();

    container.innerHTML = `
        <div class="section-header">
            <h1>Settings</h1>
        </div>

        <div class="card settings-card">
            <h3>Google Places API Key</h3>
            <p class="text-muted">Used for lead discovery. Stored locally in your browser.</p>
            <div class="form-group">
                <input type="text" id="settings-api-key" class="form-control" value="${escapeHtml(maskApiKey(settings.apiKey))}" placeholder="Enter your API key">
            </div>
            <button class="btn btn-primary" id="btn-update-api-key">Update Key</button>
            <div class="settings-instructions">
                <p><strong>How to get an API key:</strong></p>
                <ol>
                    <li>Go to the <a href="https://console.cloud.google.com/" target="_blank" rel="noopener">Google Cloud Console</a></li>
                    <li>Create a new project (or select an existing one)</li>
                    <li>Enable the <strong>Places API</strong> and <strong>Maps JavaScript API</strong></li>
                    <li>Go to <strong>Credentials</strong> and create an API key</li>
                    <li>Paste the key above and click Update Key</li>
                </ol>
            </div>
        </div>

        <div class="card settings-card">
            <h3>Hunter.io API Key</h3>
            <p class="text-muted">Used to find email addresses from business websites. Free tier: 25 lookups/month.</p>
            <div class="form-group">
                <input type="text" id="settings-hunter-key" class="form-control" value="${escapeHtml(maskApiKey(settings.hunterApiKey || ''))}" placeholder="Enter your Hunter.io API key">
            </div>
            <button class="btn btn-primary" id="btn-update-hunter-key">Update Key</button>
            <div class="settings-instructions">
                <p><strong>How to get an API key:</strong></p>
                <ol>
                    <li>Go to <a href="https://hunter.io/users/sign_up" target="_blank" rel="noopener">hunter.io</a> and create a free account</li>
                    <li>Go to your <strong>API</strong> page in account settings</li>
                    <li>Copy your API key and paste it above</li>
                </ol>
            </div>
        </div>

        <div class="card settings-card">
            <h3>Yelp Fusion API Key</h3>
            <p class="text-muted">Used as an alternative source for finding businesses. Free: 5,000 calls/day.</p>
            <div class="form-group">
                <input type="text" id="settings-yelp-key" class="form-control" value="${escapeHtml(maskApiKey(settings.yelpApiKey || ''))}" placeholder="Enter your Yelp Fusion API key">
            </div>
            <button class="btn btn-primary" id="btn-update-yelp-key">Update Key</button>
            <div class="settings-instructions">
                <p><strong>How to get an API key:</strong></p>
                <ol>
                    <li>Go to <a href="https://www.yelp.com/developers" target="_blank" rel="noopener">Yelp for Developers</a></li>
                    <li>Create an app to get your API key</li>
                    <li>Copy the key and paste it above</li>
                </ol>
            </div>
        </div>

        <div class="card settings-card">
            <h3>Claude AI API Key</h3>
            <p class="text-muted">Powers the AI Assistant features: outreach writing, sales coaching, meeting prep, and more. Free tier available.</p>
            <div class="form-group">
                <input type="text" id="settings-claude-key" class="form-control" value="${escapeHtml(maskApiKey(settings.claudeApiKey || ''))}" placeholder="Enter your Anthropic API key">
            </div>
            <button class="btn btn-primary" id="btn-update-claude-key">Update Key</button>
            <div class="settings-instructions">
                <p><strong>How to get an API key:</strong></p>
                <ol>
                    <li>Go to <a href="https://console.anthropic.com/" target="_blank" rel="noopener">console.anthropic.com</a></li>
                    <li>Create a free account</li>
                    <li>Go to <strong>API Keys</strong> and create a new key</li>
                    <li>Copy the key and paste it above</li>
                </ol>
            </div>
        </div>

        <div class="card settings-card">
            <h3>Business Profile</h3>
            <div class="form-group">
                <label for="settings-user-name">Your Name</label>
                <input type="text" id="settings-user-name" class="form-control" value="${escapeHtml(settings.userName || '')}" placeholder="Your name">
            </div>
            <div class="form-group">
                <label for="settings-business-name">Business Name</label>
                <input type="text" id="settings-business-name" class="form-control" value="${escapeHtml(settings.businessName || '')}" placeholder="Your business name">
            </div>
            <button class="btn btn-primary" id="btn-save-profile">Save</button>
        </div>

        <div class="card settings-card">
            <h3>Data Management</h3>
            <div class="data-stats">
                <span class="data-stat">${stats.leads} leads</span>
                <span class="data-stat-sep">&middot;</span>
                <span class="data-stat">${stats.contacts} contacts</span>
                <span class="data-stat-sep">&middot;</span>
                <span class="data-stat">${stats.deals} deals</span>
                <span class="data-stat-sep">&middot;</span>
                <span class="data-stat">${stats.tasks} tasks</span>
                <span class="data-stat-sep">&middot;</span>
                <span class="data-stat">${stats.activities} activities</span>
                <span class="data-stat-sep">&middot;</span>
                <span class="data-stat">${stats.projects} projects</span>
                <span class="data-stat-sep">&middot;</span>
                <span class="data-stat">${stats.payments} payments</span>
            </div>
            <div class="settings-actions">
                <button class="btn btn-outline" id="btn-export-data">Export All Data</button>
                <label class="btn btn-outline import-btn" for="import-file-input">
                    Import Data
                    <input type="file" id="import-file-input" accept=".json" style="display:none;">
                </label>
                <button class="btn btn-danger" id="btn-clear-data">Clear All Data</button>
            </div>
        </div>

        <div class="card settings-card">
            <h3>Theme</h3>
            <p class="text-muted">Choose your preferred color scheme.</p>
            <div class="settings-actions" style="margin-top:0.75rem;">
                <button class="btn ${(settings.theme || 'dark') === 'dark' ? 'btn-primary' : 'btn-outline'}" id="btn-theme-dark">Dark</button>
                <button class="btn ${settings.theme === 'light' ? 'btn-primary' : 'btn-outline'}" id="btn-theme-light">Light</button>
            </div>
        </div>

        <div class="card settings-card">
            <h3>Tags Management</h3>
            <p class="text-muted">Create and manage tags for organizing leads and contacts.</p>
            <div style="display:flex;gap:0.5rem;align-items:flex-end;flex-wrap:wrap;margin-top:0.75rem;">
                <div class="form-group" style="margin-bottom:0;flex:1;min-width:140px;">
                    <label for="settings-tag-name">Tag Name</label>
                    <input type="text" id="settings-tag-name" class="form-control" placeholder="e.g. Hot Lead">
                </div>
                <div class="form-group" style="margin-bottom:0;">
                    <label>Color</label>
                    <div class="tag-color-picker" id="settings-tag-colors">
                        ${store.TAG_COLORS.map((c, i) => `<div class="tag-color-swatch ${i === 0 ? 'selected' : ''}" data-color="${escapeHtml(c)}" style="background:${escapeHtml(c)}"></div>`).join('')}
                    </div>
                </div>
                <button class="btn btn-primary btn-sm" id="btn-add-tag">Add Tag</button>
            </div>
            ${store.getTags().length ? `
                <div class="tags-list" id="settings-tags-list">
                    ${store.getTags().map(t => `
                        <div class="tag-list-item">
                            <span class="tag-color-dot" style="background:${escapeHtml(t.color)}"></span>
                            <span class="tag-name">${escapeHtml(t.name)}</span>
                            <button class="btn-delete-tag" data-tag-id="${escapeHtml(t.id)}" title="Delete tag">&times;</button>
                        </div>
                    `).join('')}
                </div>
            ` : '<p class="text-muted" style="margin-top:0.75rem;">No tags created yet.</p>'}
        </div>

        <div class="card settings-card">
            <h3>About</h3>
            <p>Business CRM v1.0</p>
            <p class="text-muted">Built for managing your entire sales pipeline from lead generation to deal close.</p>
        </div>
    `;
}

// ---- API Key Update ----

function handleUpdateApiKey() {
    const input = document.getElementById('settings-api-key');
    if (!input) return;

    const rawValue = input.value.trim();
    // If the value is all dots/bullets, user didn't change it
    if (/^[\u2022]+/.test(rawValue) && rawValue.length > 4) {
        // Check if the last 4 chars match the stored key
        const currentKey = store.getSettings().apiKey || '';
        if (rawValue.slice(-4) === currentKey.slice(-4)) {
            window.CRM.showToast('API key unchanged.', 'info');
            return;
        }
    }

    if (!rawValue) {
        window.CRM.showToast('Please enter an API key.', 'error');
        return;
    }

    store.updateSettings({ apiKey: rawValue });
    window.CRM.showToast('API key updated.');

    // Reload Google Maps API if available
    if (typeof google !== 'undefined' && google.maps) {
        // The map will use the new key on next search
        window.CRM.showToast('New API key will be used on next search.', 'info');
    }

    render();
}

// ---- Hunter.io Key Update ----

function handleUpdateHunterKey() {
    const input = document.getElementById('settings-hunter-key');
    if (!input) return;
    const rawValue = input.value.trim();
    if (/^[\u2022]+/.test(rawValue) && rawValue.length > 4) {
        const currentKey = store.getSettings().hunterApiKey || '';
        if (rawValue.slice(-4) === currentKey.slice(-4)) {
            window.CRM.showToast('Hunter.io key unchanged.', 'info');
            return;
        }
    }
    if (!rawValue) { window.CRM.showToast('Please enter an API key.', 'error'); return; }
    store.updateSettings({ hunterApiKey: rawValue });
    window.CRM.showToast('Hunter.io API key updated.');
    render();
}

// ---- Yelp Key Update ----

function handleUpdateYelpKey() {
    const input = document.getElementById('settings-yelp-key');
    if (!input) return;
    const rawValue = input.value.trim();
    if (/^[\u2022]+/.test(rawValue) && rawValue.length > 4) {
        const currentKey = store.getSettings().yelpApiKey || '';
        if (rawValue.slice(-4) === currentKey.slice(-4)) {
            window.CRM.showToast('Yelp key unchanged.', 'info');
            return;
        }
    }
    if (!rawValue) { window.CRM.showToast('Please enter an API key.', 'error'); return; }
    store.updateSettings({ yelpApiKey: rawValue });
    window.CRM.showToast('Yelp Fusion API key updated.');
    render();
}

// ---- Claude Key Update ----

function handleUpdateClaudeKey() {
    const input = document.getElementById('settings-claude-key');
    if (!input) return;
    const rawValue = input.value.trim();
    if (/^[\u2022]+/.test(rawValue) && rawValue.length > 4) {
        const currentKey = store.getSettings().claudeApiKey || '';
        if (rawValue.slice(-4) === currentKey.slice(-4)) {
            window.CRM.showToast('Claude API key unchanged.', 'info');
            return;
        }
    }
    if (!rawValue) { window.CRM.showToast('Please enter an API key.', 'error'); return; }
    store.updateSettings({ claudeApiKey: rawValue });
    window.CRM.showToast('Claude API key updated.');
    render();
}

// ---- Profile Save ----

function handleSaveProfile() {
    const userName = document.getElementById('settings-user-name');
    const businessName = document.getElementById('settings-business-name');

    if (!userName || !businessName) return;

    store.updateSettings({
        userName: userName.value.trim(),
        businessName: businessName.value.trim(),
    });

    window.CRM.showToast('Profile saved.');
}

// ---- Export ----

function handleExportData() {
    const data = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        leads: store.getLeads(),
        contacts: store.getContacts(),
        deals: store.getDeals(),
        activities: store.getActivities(),
        tasks: store.getTasks(),
        projects: store.getProjects(),
        payments: store.getPayments(),
        settings: store.getSettings(),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crm-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    window.CRM.showToast('Data exported successfully.');
}

// ---- Import ----

function handleImportData(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);

            if (!data || typeof data !== 'object') {
                window.CRM.showToast('Invalid backup file.', 'error');
                return;
            }

            // Import each section if present
            if (Array.isArray(data.leads)) {
                data.leads.forEach(lead => store.addLead(lead));
            }
            if (Array.isArray(data.contacts)) {
                data.contacts.forEach(contact => store.addContact(contact));
            }
            if (Array.isArray(data.deals)) {
                data.deals.forEach(deal => store.addDeal(deal));
            }
            if (Array.isArray(data.activities)) {
                data.activities.forEach(activity => store.addActivity(activity));
            }
            if (Array.isArray(data.tasks)) {
                data.tasks.forEach(task => store.addTask(task));
            }
            if (Array.isArray(data.projects)) {
                data.projects.forEach(project => store.addProject(project));
            }
            if (Array.isArray(data.payments)) {
                data.payments.forEach(payment => store.addPayment(payment));
            }
            if (data.settings && typeof data.settings === 'object') {
                store.updateSettings(data.settings);
            }

            window.CRM.showToast('Data imported successfully.');
            render();
        } catch (err) {
            window.CRM.showToast('Failed to parse backup file.', 'error');
        }
    };
    reader.readAsText(file);
}

// ---- Clear All Data ----

function handleClearData() {
    const confirmed = confirm(
        'Are you sure you want to clear ALL CRM data?\n\n' +
        'This will permanently delete all leads, contacts, deals, tasks, activities, projects, and payments.\n\n' +
        'This action cannot be undone. Consider exporting your data first.'
    );

    if (!confirmed) return;

    // Clear all localStorage keys used by the CRM
    localStorage.removeItem('crm_leads');
    localStorage.removeItem('crm_contacts');
    localStorage.removeItem('crm_deals');
    localStorage.removeItem('crm_activities');
    localStorage.removeItem('crm_tasks');
    localStorage.removeItem('crm_settings');
    localStorage.removeItem('crm_tags');
    localStorage.removeItem('crm_notes');
    localStorage.removeItem('crm_projects');
    localStorage.removeItem('crm_payments');

    // Re-initialize the store
    store.init();

    window.CRM.showToast('All data has been cleared.');
    render();
}

// ---- Init ----

export function init() {
    const section = document.getElementById('section-settings');
    if (!section) return;

    section.addEventListener('click', (e) => {
        const target = e.target;

        if (target.id === 'btn-update-api-key' || target.closest('#btn-update-api-key')) {
            handleUpdateApiKey();
            return;
        }

        if (target.id === 'btn-update-hunter-key' || target.closest('#btn-update-hunter-key')) {
            handleUpdateHunterKey();
            return;
        }

        if (target.id === 'btn-update-yelp-key' || target.closest('#btn-update-yelp-key')) {
            handleUpdateYelpKey();
            return;
        }

        if (target.id === 'btn-update-claude-key' || target.closest('#btn-update-claude-key')) {
            handleUpdateClaudeKey();
            return;
        }

        if (target.id === 'btn-save-profile' || target.closest('#btn-save-profile')) {
            handleSaveProfile();
            return;
        }

        if (target.id === 'btn-export-data' || target.closest('#btn-export-data')) {
            handleExportData();
            return;
        }

        if (target.id === 'btn-clear-data' || target.closest('#btn-clear-data')) {
            handleClearData();
            return;
        }

        if (target.id === 'btn-theme-dark' || target.closest('#btn-theme-dark')) {
            store.updateSettings({ theme: 'dark' });
            document.documentElement.removeAttribute('data-theme');
            updateThemeToggleIcon();
            window.CRM.showToast('Dark theme applied.');
            render();
            return;
        }

        if (target.id === 'btn-theme-light' || target.closest('#btn-theme-light')) {
            store.updateSettings({ theme: 'light' });
            document.documentElement.setAttribute('data-theme', 'light');
            updateThemeToggleIcon();
            window.CRM.showToast('Light theme applied.');
            render();
            return;
        }

        // Tag color swatch selection
        if (target.classList.contains('tag-color-swatch')) {
            section.querySelectorAll('.tag-color-swatch').forEach(s => s.classList.remove('selected'));
            target.classList.add('selected');
            return;
        }

        // Add tag
        if (target.id === 'btn-add-tag' || target.closest('#btn-add-tag')) {
            const nameInput = document.getElementById('settings-tag-name');
            const name = nameInput ? nameInput.value.trim() : '';
            if (!name) { window.CRM.showToast('Please enter a tag name.', 'error'); return; }
            const selectedSwatch = section.querySelector('.tag-color-swatch.selected');
            const color = selectedSwatch ? selectedSwatch.dataset.color : store.TAG_COLORS[0];
            store.addTag({ name, color });
            window.CRM.showToast('Tag created.');
            render();
            return;
        }

        // Delete tag
        const deleteTagBtn = target.closest('.btn-delete-tag');
        if (deleteTagBtn) {
            const tagId = deleteTagBtn.dataset.tagId;
            store.removeTag(tagId);
            window.CRM.showToast('Tag deleted.');
            render();
            return;
        }
    });

    section.addEventListener('change', (e) => {
        if (e.target.id === 'import-file-input') {
            const file = e.target.files[0];
            if (file) {
                handleImportData(file);
                // Reset the input so the same file can be imported again
                e.target.value = '';
            }
        }
    });
}
