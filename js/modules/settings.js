// settings.js - Settings module for the CRM application

import { store } from './store.js';
import { escapeHtml, formatDate, formatCurrency, timeAgo } from './utils.js';

// ---- Helpers ----

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
        'This will permanently delete all leads, contacts, deals, tasks, and activities.\n\n' +
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
