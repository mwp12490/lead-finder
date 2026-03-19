// contacts.js - Contacts module for the CRM application

import { store } from './store.js';
import { escapeHtml, generateId, formatDate, formatDateTime, timeAgo, formatCurrency } from './utils.js';

let currentSort = { column: 'name', direction: 'asc' };
let searchQuery = '';
let filterCategory = '';
let filterTagId = '';
let expandedContactId = null;
let debounceTimer = null;
let bulkSelectMode = false;
let bulkSelectedIds = new Set();

function getFilteredContacts() {
  let contacts = store.getContacts();

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    contacts = contacts.filter(c =>
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.businessName && c.businessName.toLowerCase().includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q)) ||
      (c.phone && c.phone.toLowerCase().includes(q))
    );
  }

  if (filterCategory) {
    contacts = contacts.filter(c => c.category === filterCategory);
  }

  if (filterTagId) {
    contacts = contacts.filter(c => (c.tags || []).includes(filterTagId));
  }

  contacts.sort((a, b) => {
    let valA, valB;

    switch (currentSort.column) {
      case 'name':
        valA = (a.name || '').toLowerCase();
        valB = (b.name || '').toLowerCase();
        break;
      case 'businessName':
        valA = (a.businessName || '').toLowerCase();
        valB = (b.businessName || '').toLowerCase();
        break;
      case 'category':
        valA = (a.category || '').toLowerCase();
        valB = (b.category || '').toLowerCase();
        break;
      case 'phone':
        valA = (a.phone || '').toLowerCase();
        valB = (b.phone || '').toLowerCase();
        break;
      case 'email':
        valA = (a.email || '').toLowerCase();
        valB = (b.email || '').toLowerCase();
        break;
      case 'deals': {
        valA = store.getDealsForContact(a.id).length;
        valB = store.getDealsForContact(b.id).length;
        break;
      }
      case 'lastActivity': {
        const actsA = store.getActivitiesFor('contact', a.id);
        const actsB = store.getActivitiesFor('contact', b.id);
        valA = actsA.length ? Math.max(...actsA.map(x => new Date(x.timestamp).getTime())) : 0;
        valB = actsB.length ? Math.max(...actsB.map(x => new Date(x.timestamp).getTime())) : 0;
        break;
      }
      case 'createdAt':
        valA = a.createdAt || '';
        valB = b.createdAt || '';
        break;
      default:
        valA = '';
        valB = '';
    }

    if (valA < valB) return currentSort.direction === 'asc' ? -1 : 1;
    if (valA > valB) return currentSort.direction === 'asc' ? 1 : -1;
    return 0;
  });

  return contacts;
}

function getUniqueCategories() {
  const contacts = store.getContacts();
  const cats = new Set();
  contacts.forEach(c => {
    if (c.category) cats.add(c.category);
  });
  return Array.from(cats).sort();
}

function sortIndicator(column) {
  if (currentSort.column !== column) return '';
  return currentSort.direction === 'asc' ? ' &#9650;' : ' &#9660;';
}

function getLastActivityDate(contactId) {
  const acts = store.getActivitiesFor('contact', contactId);
  if (!acts.length) return null;
  acts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return acts[0].timestamp;
}

function renderActivityIcon(type) {
  switch (type) {
    case 'call':
      return '<span class="activity-icon activity-icon-call" title="Call"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg></span>';
    case 'email':
      return '<span class="activity-icon activity-icon-email" title="Email"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 7L2 7"/></svg></span>';
    case 'meeting':
      return '<span class="activity-icon activity-icon-meeting" title="Meeting"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg></span>';
    case 'note':
      return '<span class="activity-icon activity-icon-note" title="Note"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></span>';
    default:
      return '<span class="activity-icon activity-icon-other" title="Activity"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg></span>';
  }
}

function renderDetailView(contact) {
  const activities = store.getActivitiesFor('contact', contact.id)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const deals = store.getDealsForContact(contact.id);
  const tasks = store.getTasksFor('contact', contact.id).filter(t => !t.completed);
  const lead = contact.sourceLeadId ? store.getLeadById(contact.sourceLeadId) : null;

  const stageClass = (stage) => {
    switch (stage) {
      case 'Closed Won': return 'badge-success';
      case 'Closed Lost': return 'badge-danger';
      case 'Negotiation': return 'badge-warning';
      default: return 'badge-info';
    }
  };

  const priorityDot = (p) => {
    switch (p) {
      case 'high': return '<span class="priority-dot priority-high" title="High"></span>';
      case 'medium': return '<span class="priority-dot priority-medium" title="Medium"></span>';
      default: return '<span class="priority-dot priority-low" title="Low"></span>';
    }
  };

  return `
    <tr class="contact-detail-row" data-detail-for="${contact.id}">
      <td colspan="${bulkSelectMode ? 11 : 10}">
        <div class="contact-detail-panel">

          <div class="contact-detail-header">
            <div>
              <h2 class="contact-detail-name">${escapeHtml(contact.name)}</h2>
              ${contact.businessName ? `<div class="contact-detail-business">${escapeHtml(contact.businessName)}</div>` : ''}
              ${contact.category ? `<span class="badge badge-info">${escapeHtml(contact.category)}</span>` : ''}
              ${(contact.tags || []).length ? `<div class="tags-row" style="margin-top:0.35rem;">${(contact.tags || []).map(tid => {
                const tag = store.getTagById(tid);
                return tag ? `<span class="tag-badge" style="background:${escapeHtml(tag.color)}">${escapeHtml(tag.name)}</span>` : '';
              }).join('')}</div>` : ''}
            </div>
            <button class="btn btn-sm btn-secondary" data-action="edit-contact" data-id="${contact.id}">Edit</button>
          </div>

          <div class="contact-info-grid">
            <div class="info-item">
              <label>Phone</label>
              ${contact.phone ? `<a href="tel:${escapeHtml(contact.phone)}">${escapeHtml(contact.phone)}</a>` : '<span class="text-muted">--</span>'}
            </div>
            <div class="info-item">
              <label>Email</label>
              ${contact.email ? `<a href="mailto:${escapeHtml(contact.email)}">${escapeHtml(contact.email)}</a>` : '<span class="text-muted">--</span>'}
            </div>
            <div class="info-item">
              <label>Website</label>
              ${contact.website ? `<a href="${escapeHtml(contact.website)}" target="_blank" rel="noopener">${escapeHtml(contact.website)}</a>` : '<span class="text-muted">--</span>'}
            </div>
            <div class="info-item">
              <label>Address</label>
              <span>${escapeHtml(contact.address) || '<span class="text-muted">--</span>'}</span>
            </div>
            <div class="info-item">
              <label>City</label>
              <span>${escapeHtml(contact.city) || '<span class="text-muted">--</span>'}</span>
            </div>
            <div class="info-item">
              <label>Created</label>
              <span>${formatDate(contact.createdAt)}</span>
            </div>
          </div>

          <div class="contact-actions-row">
            <button class="btn btn-sm btn-outline" data-action="log-activity" data-contact-id="${contact.id}" data-type="call">Log Call</button>
            <button class="btn btn-sm btn-outline" data-action="log-activity" data-contact-id="${contact.id}" data-type="email">Log Email</button>
            <button class="btn btn-sm btn-outline" data-action="log-activity" data-contact-id="${contact.id}" data-type="meeting">Log Meeting</button>
            <button class="btn btn-sm btn-outline" data-action="log-activity" data-contact-id="${contact.id}" data-type="note">Add Note</button>
            ${contact.email ? `<button class="btn btn-sm btn-secondary" data-action="compose-email" data-contact-id="${contact.id}">Email</button>` : ''}
            <button class="btn btn-sm btn-outline" data-action="create-deal" data-contact-id="${contact.id}">Create Deal</button>
            <button class="btn btn-sm btn-outline" data-action="add-task" data-contact-id="${contact.id}">Add Task</button>
          </div>

          <div class="activity-form-container" id="activity-form-${contact.id}"></div>

          <div class="contact-detail-sections">

            <div class="detail-section">
              <h3>Activity Timeline</h3>
              ${activities.length === 0
                ? '<p class="text-muted">No activities yet.</p>'
                : `<div class="activity-timeline">
                    ${activities.map(a => `
                      <div class="activity-item">
                        ${renderActivityIcon(a.type)}
                        <div class="activity-content">
                          <div class="activity-summary">${escapeHtml(a.summary)}</div>
                          <div class="activity-meta">${timeAgo(a.timestamp)} &middot; ${escapeHtml(a.type)}${a.duration ? ' &middot; ' + a.duration + ' min' : ''}</div>
                          ${a.details ? `<div class="activity-details">${escapeHtml(a.details)}</div>` : ''}
                        </div>
                      </div>
                    `).join('')}
                  </div>`
              }
            </div>

            <div class="detail-section">
              <h3>Deals</h3>
              ${deals.length === 0
                ? '<p class="text-muted">No deals yet.</p>'
                : `<div class="deals-list">
                    ${deals.map(d => `
                      <div class="deal-card">
                        <div class="deal-name">${escapeHtml(d.name)}</div>
                        <div class="deal-info">
                          <span class="deal-value">${formatCurrency(d.value)}</span>
                          <span class="badge ${stageClass(d.stage)}">${escapeHtml(d.stage)}</span>
                          ${d.expectedCloseDate ? `<span class="deal-close-date">Close: ${formatDate(d.expectedCloseDate)}</span>` : ''}
                        </div>
                      </div>
                    `).join('')}
                  </div>`
              }
            </div>

            <div class="detail-section">
              <h3>Tasks</h3>
              ${tasks.length === 0
                ? '<p class="text-muted">No open tasks.</p>'
                : `<div class="tasks-list">
                    ${tasks.map(t => `
                      <div class="task-item">
                        <label class="task-checkbox-label">
                          <input type="checkbox" class="task-complete-checkbox" data-action="complete-task" data-task-id="${t.id}" ${t.completed ? 'checked' : ''}>
                        </label>
                        ${priorityDot(t.priority)}
                        <span class="task-title">${escapeHtml(t.title)}</span>
                        ${t.dueDate ? `<span class="task-due">${formatDate(t.dueDate)}</span>` : ''}
                      </div>
                    `).join('')}
                  </div>`
              }
            </div>

            <div class="detail-section">
              <h3>Notes</h3>
              <div class="notes-log-input-bar" style="display:flex;gap:0.5rem;margin-bottom:0.75rem;">
                <input type="text" class="form-control" data-action="note-input" data-entity-type="contact" data-entity-id="${contact.id}" placeholder="Add a note..." style="flex:1;">
                <button class="btn btn-sm btn-primary" data-action="add-note" data-entity-type="contact" data-entity-id="${contact.id}">Add Note</button>
              </div>
              <div class="notes-log-list" id="notes-log-contact-${contact.id}">
                ${renderNotesLog('contact', contact.id)}
              </div>
            </div>

            ${contact.sourceLeadId ? `
              <details class="detail-section original-lead-section">
                <summary><h3 style="display:inline">Original Lead Data</h3></summary>
                <div class="lead-data-grid">
                  ${contact.originalRating != null ? `<div class="info-item"><label>Rating</label><span>${contact.originalRating}</span></div>` : ''}
                  ${contact.originalReviewCount != null ? `<div class="info-item"><label>Review Count</label><span>${contact.originalReviewCount}</span></div>` : ''}
                  ${contact.originalScore != null ? `<div class="info-item"><label>Score</label><span>${contact.originalScore}</span></div>` : ''}
                </div>
              </details>
            ` : ''}

          </div>
        </div>
      </td>
    </tr>
  `;
}

function renderNotesLog(entityType, entityId) {
  const notes = store.getNotesFor(entityType, entityId);
  if (!notes.length) return '<p class="text-muted" style="font-size:0.85rem;">No notes yet.</p>';
  return notes.map(n => `
    <div class="note-item" style="display:flex;align-items:flex-start;gap:0.5rem;padding:0.5rem 0;border-bottom:1px solid var(--border-light);">
      <div style="flex:1;min-width:0;">
        <div style="font-size:0.88rem;">${escapeHtml(n.text)}</div>
        <div class="text-muted" style="font-size:0.75rem;">${timeAgo(n.createdAt)}</div>
      </div>
      <button class="btn btn-sm" data-action="delete-note" data-note-id="${n.id}" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;padding:0.2rem 0.4rem;font-size:0.9rem;" title="Delete note">&times;</button>
    </div>
  `).join('');
}

function renderEmailComposeModal(contact) {
  const settings = store.getSettings();
  const senderName = settings.userName || '[Your Name]';
  const businessName = settings.businessName || '[Your Business]';
  const defaultSubject = `Quick idea for ${contact.businessName || contact.name}`;
  const defaultBody = `Hi ${contact.name},\n\nI wanted to reach out regarding ${contact.businessName || 'your business'}.\n\nBest,\n${senderName}\n${businessName}`;

  const html = `
    <form id="email-compose-form" data-contact-id="${contact.id}">
      <div class="form-group">
        <label for="compose-to">To</label>
        <input type="email" id="compose-to" class="form-control" value="${escapeHtml(contact.email || '')}" readonly>
      </div>
      <div class="form-group">
        <label for="compose-subject">Subject</label>
        <input type="text" id="compose-subject" class="form-control" value="${escapeHtml(defaultSubject)}">
      </div>
      <div class="form-group">
        <label for="compose-body">Body</label>
        <textarea id="compose-body" class="form-control" rows="8">${escapeHtml(defaultBody)}</textarea>
      </div>
      <div class="form-actions" style="display:flex;gap:0.5rem;flex-wrap:wrap;">
        <button type="button" class="btn btn-primary" data-action="send-gmail" data-contact-id="${contact.id}">Send via Gmail</button>
        <button type="button" class="btn btn-secondary" data-action="send-outlook" data-contact-id="${contact.id}">Send via Outlook</button>
        <button type="button" class="btn btn-outline" data-action="copy-email">Copy to Clipboard</button>
        <button type="button" class="btn btn-outline" data-action="cancel-modal">Cancel</button>
      </div>
    </form>
  `;

  window.CRM.showModal('Compose Email', html);
}

function getComposeFields() {
  return {
    to: (document.getElementById('compose-to')?.value || '').trim(),
    subject: (document.getElementById('compose-subject')?.value || '').trim(),
    body: (document.getElementById('compose-body')?.value || '').trim(),
  };
}

function renderContactModal(contact) {
  const isEdit = !!contact;
  const c = contact || {};

  const html = `
    <form id="contact-form" data-contact-id="${c.id || ''}">
      <div class="form-group">
        <label for="contact-name">Name *</label>
        <input type="text" id="contact-name" class="form-control" value="${escapeHtml(c.name || '')}" required>
      </div>
      <div class="form-group">
        <label for="contact-business">Business Name</label>
        <input type="text" id="contact-business" class="form-control" value="${escapeHtml(c.businessName || '')}">
      </div>
      <div class="form-group">
        <label for="contact-email">Email</label>
        <input type="email" id="contact-email" class="form-control" value="${escapeHtml(c.email || '')}">
      </div>
      <div class="form-group">
        <label for="contact-phone">Phone</label>
        <input type="text" id="contact-phone" class="form-control" value="${escapeHtml(c.phone || '')}">
      </div>
      <div class="form-group">
        <label for="contact-website">Website</label>
        <input type="url" id="contact-website" class="form-control" value="${escapeHtml(c.website || '')}">
      </div>
      <div class="form-group">
        <label for="contact-address">Address</label>
        <input type="text" id="contact-address" class="form-control" value="${escapeHtml(c.address || '')}">
      </div>
      <div class="form-group">
        <label for="contact-city">City</label>
        <input type="text" id="contact-city" class="form-control" value="${escapeHtml(c.city || '')}">
      </div>
      <div class="form-group">
        <label for="contact-category">Category</label>
        <input type="text" id="contact-category" class="form-control" value="${escapeHtml(c.category || '')}">
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" data-action="cancel-modal">Cancel</button>
        <button type="submit" class="btn btn-primary">${isEdit ? 'Update' : 'Add'} Contact</button>
      </div>
    </form>
  `;

  window.CRM.showModal(isEdit ? 'Edit Contact' : 'Add Contact', html);
}

function renderDealModal(contactId) {
  const html = `
    <form id="deal-form" data-contact-id="${contactId}">
      <div class="form-group">
        <label for="deal-name">Deal Name *</label>
        <input type="text" id="deal-name" class="form-control" required>
      </div>
      <div class="form-group">
        <label for="deal-value">Value ($)</label>
        <input type="number" id="deal-value" class="form-control" min="0" step="0.01" value="0">
      </div>
      <div class="form-group">
        <label for="deal-stage">Stage</label>
        <select id="deal-stage" class="form-control">
          <option value="Qualification">Qualification</option>
          <option value="Proposal">Proposal</option>
          <option value="Negotiation">Negotiation</option>
          <option value="Closed Won">Closed Won</option>
          <option value="Closed Lost">Closed Lost</option>
        </select>
      </div>
      <div class="form-group">
        <label for="deal-close-date">Expected Close Date</label>
        <input type="date" id="deal-close-date" class="form-control">
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" data-action="cancel-modal">Cancel</button>
        <button type="submit" class="btn btn-primary">Create Deal</button>
      </div>
    </form>
  `;

  window.CRM.showModal('Create Deal', html);
}

function renderTaskModal(contactId) {
  const html = `
    <form id="task-form" data-contact-id="${contactId}">
      <div class="form-group">
        <label for="task-title">Title *</label>
        <input type="text" id="task-title" class="form-control" required>
      </div>
      <div class="form-group">
        <label for="task-due">Due Date</label>
        <input type="date" id="task-due" class="form-control">
      </div>
      <div class="form-group">
        <label for="task-priority">Priority</label>
        <select id="task-priority" class="form-control">
          <option value="low">Low</option>
          <option value="medium" selected>Medium</option>
          <option value="high">High</option>
        </select>
      </div>
      <div class="form-group">
        <label for="task-description">Description</label>
        <textarea id="task-description" class="form-control" rows="3"></textarea>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" data-action="cancel-modal">Cancel</button>
        <button type="submit" class="btn btn-primary">Add Task</button>
      </div>
    </form>
  `;

  window.CRM.showModal('Add Task', html);
}

function showInlineActivityForm(contactId, defaultType) {
  const container = document.getElementById(`activity-form-${contactId}`);
  if (!container) return;

  const types = ['call', 'email', 'meeting', 'note'];
  container.innerHTML = `
    <div class="activity-form">
      <div class="form-row">
        <select class="activity-type-select" data-field="type">
          ${types.map(t => `<option value="${t}" ${t === defaultType ? 'selected' : ''}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join('')}
        </select>
        <input type="text" placeholder="Summary..." class="activity-summary-input form-control" data-field="summary">
      </div>
      <textarea placeholder="Details (optional)..." class="activity-details-input form-control" data-field="details"></textarea>
      <div class="form-row">
        <input type="number" placeholder="Duration (min)" class="activity-duration-input form-control" data-field="duration">
        <button class="btn btn-primary btn-sm save-activity-btn" data-action="save-activity" data-contact-id="${contactId}">Log Activity</button>
        <button class="btn btn-sm btn-secondary cancel-activity-btn" data-action="cancel-activity-form" data-contact-id="${contactId}">Cancel</button>
      </div>
    </div>
  `;
}

export function render() {
  const section = document.getElementById('section-contacts');
  if (!section) return;

  const contacts = getFilteredContacts();
  const categories = getUniqueCategories();
  const totalCount = store.getContacts().length;
  const allTags = store.getTags();
  const colSpan = bulkSelectMode ? 9 : 8;

  section.innerHTML = `
    <div class="section-header">
      <h1>Contacts <span class="count-badge">${totalCount}</span></h1>
      <div style="display:flex;gap:0.5rem;">
        <button class="btn ${bulkSelectMode ? 'btn-secondary' : 'btn-outline'} btn-sm" data-action="toggle-bulk">${bulkSelectMode ? 'Cancel Select' : 'Select'}</button>
        <button class="btn btn-primary" data-action="add-contact">Add Contact</button>
      </div>
    </div>

    <div class="filter-bar" style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem;">
      <input type="text" class="form-control search-input" placeholder="Search contacts..." data-action="search" value="${escapeHtml(searchQuery)}" style="flex:1;min-width:180px;">
      <select class="form-control category-filter" data-action="filter-category" style="width:auto;min-width:140px;">
        <option value="">All Categories</option>
        ${categories.map(cat => `<option value="${escapeHtml(cat)}" ${filterCategory === cat ? 'selected' : ''}>${escapeHtml(cat)}</option>`).join('')}
      </select>
      <select class="form-control tag-filter" data-action="filter-tag" style="width:auto;min-width:140px;">
        <option value="">All Tags</option>
        ${allTags.map(t => `<option value="${escapeHtml(t.id)}" ${filterTagId === t.id ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('')}
      </select>
    </div>

    ${bulkSelectMode ? `
      <div style="display:flex;gap:0.5rem;margin-bottom:0.75rem;">
        <button class="btn btn-outline btn-sm" data-action="select-all-contacts">Select All</button>
        <button class="btn btn-outline btn-sm" data-action="deselect-all-contacts">Deselect All</button>
      </div>` : ''}

    ${contacts.length === 0
      ? `<div class="empty-state">
           <p>${searchQuery || filterCategory || filterTagId ? 'No contacts match your filters.' : 'No contacts yet. Add your first contact to get started.'}</p>
         </div>`
      : `<div class="table-responsive">
          <table class="data-table contacts-table">
            <thead>
              <tr>
                ${bulkSelectMode ? '<th style="width:40px;"></th>' : ''}
                <th class="sortable" data-action="sort" data-column="name">Name${sortIndicator('name')}</th>
                <th class="sortable" data-action="sort" data-column="businessName">Business${sortIndicator('businessName')}</th>
                <th class="sortable" data-action="sort" data-column="category">Category${sortIndicator('category')}</th>
                <th>Tags</th>
                <th class="sortable" data-action="sort" data-column="phone">Phone${sortIndicator('phone')}</th>
                <th class="sortable" data-action="sort" data-column="email">Email${sortIndicator('email')}</th>
                <th class="sortable" data-action="sort" data-column="deals">Deals${sortIndicator('deals')}</th>
                <th class="sortable" data-action="sort" data-column="lastActivity">Last Activity${sortIndicator('lastActivity')}</th>
                <th class="sortable" data-action="sort" data-column="createdAt">Created${sortIndicator('createdAt')}</th>
              </tr>
            </thead>
            <tbody>
              ${contacts.map(c => {
                const dealCount = store.getDealsForContact(c.id).length;
                const lastAct = getLastActivityDate(c.id);
                const isExpanded = expandedContactId === c.id;
                const contactTags = (c.tags || []).map(tid => store.getTagById(tid)).filter(Boolean);
                return `
                  <tr class="contact-row ${isExpanded ? 'expanded' : ''}" data-action="toggle-detail" data-id="${c.id}">
                    ${bulkSelectMode ? `<td class="bulk-select-cell" data-action="none"><input type="checkbox" class="contacts-bulk-checkbox" data-contact-id="${c.id}" ${bulkSelectedIds.has(c.id) ? 'checked' : ''}></td>` : ''}
                    <td>${escapeHtml(c.name)}</td>
                    <td>${escapeHtml(c.businessName)}</td>
                    <td>${c.category ? `<span class="badge badge-info">${escapeHtml(c.category)}</span>` : ''}</td>
                    <td>${contactTags.map(t => `<span class="tag-badge" style="background:${escapeHtml(t.color)};font-size:0.68rem;">${escapeHtml(t.name)}</span>`).join(' ')}</td>
                    <td>${escapeHtml(c.phone)}</td>
                    <td>${escapeHtml(c.email)}</td>
                    <td>${dealCount || ''}</td>
                    <td>${lastAct ? timeAgo(lastAct) : ''}</td>
                    <td>${formatDate(c.createdAt)}</td>
                  </tr>
                  ${isExpanded ? renderDetailView(c) : ''}
                `;
              }).join('')}
            </tbody>
          </table>
        </div>`
    }

    ${bulkSelectMode && bulkSelectedIds.size > 0 ? `
      <div class="bulk-action-bar" id="contacts-bulkActionBar">
        <span class="bulk-count">${bulkSelectedIds.size} selected</span>
        <button class="btn btn-outline btn-sm" data-action="bulk-add-tag">Add Tag</button>
        <button class="btn btn-outline btn-sm" data-action="bulk-export-contacts">Export Selected</button>
        <button class="btn btn-danger btn-sm" data-action="bulk-delete-contacts">Delete Selected</button>
      </div>` : ''}
  `;
}

function handleClick(e) {
  const target = e.target.closest('[data-action]');
  if (!target) return;

  const action = target.dataset.action;

  switch (action) {
    case 'add-contact': {
      renderContactModal(null);
      break;
    }

    case 'edit-contact': {
      e.stopPropagation();
      const contact = store.getContactById(target.dataset.id);
      if (contact) renderContactModal(contact);
      break;
    }

    case 'cancel-modal': {
      window.CRM.closeModal();
      break;
    }

    case 'toggle-detail': {
      const id = target.dataset.id;
      if (expandedContactId === id) {
        expandedContactId = null;
      } else {
        expandedContactId = id;
      }
      render();
      break;
    }

    case 'sort': {
      const column = target.dataset.column;
      if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        currentSort.column = column;
        currentSort.direction = 'asc';
      }
      render();
      break;
    }

    case 'filter-category': {
      // Handled by change event
      break;
    }

    case 'log-activity': {
      e.stopPropagation();
      const contactId = target.dataset.contactId;
      const type = target.dataset.type || 'call';
      showInlineActivityForm(contactId, type);
      break;
    }

    case 'save-activity': {
      e.stopPropagation();
      const contactId = target.dataset.contactId;
      const container = document.getElementById(`activity-form-${contactId}`);
      if (!container) break;

      const typeEl = container.querySelector('[data-field="type"]');
      const summaryEl = container.querySelector('[data-field="summary"]');
      const detailsEl = container.querySelector('[data-field="details"]');
      const durationEl = container.querySelector('[data-field="duration"]');

      const summary = summaryEl ? summaryEl.value.trim() : '';
      if (!summary) {
        window.CRM.showToast('Please enter a summary.', 'error');
        break;
      }

      store.addActivity({
        type: typeEl ? typeEl.value : 'other',
        contactId,
        summary,
        details: detailsEl ? detailsEl.value.trim() : '',
        duration: durationEl && durationEl.value ? parseInt(durationEl.value, 10) : null,
        timestamp: new Date().toISOString(),
      });

      window.CRM.showToast('Activity logged.');
      render();
      break;
    }

    case 'cancel-activity-form': {
      e.stopPropagation();
      const contactId = target.dataset.contactId;
      const container = document.getElementById(`activity-form-${contactId}`);
      if (container) container.innerHTML = '';
      break;
    }

    case 'create-deal': {
      e.stopPropagation();
      renderDealModal(target.dataset.contactId);
      break;
    }

    case 'add-task': {
      e.stopPropagation();
      renderTaskModal(target.dataset.contactId);
      break;
    }

    case 'complete-task': {
      e.stopPropagation();
      const taskId = target.dataset.taskId;
      const isChecked = target.checked;
      store.updateTask(taskId, { completed: isChecked });
      window.CRM.showToast(isChecked ? 'Task completed.' : 'Task reopened.');
      render();
      break;
    }

    case 'compose-email': {
      e.stopPropagation();
      const contact = store.getContactById(target.dataset.contactId);
      if (contact) renderEmailComposeModal(contact);
      break;
    }

    case 'send-gmail': {
      e.stopPropagation();
      const { to, subject, body } = getComposeFields();
      const gmailUrl = `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.open(gmailUrl, '_blank');
      store.addActivity({
        type: 'email',
        contactId: target.dataset.contactId,
        summary: `Email sent via Gmail: ${subject}`,
        timestamp: new Date().toISOString(),
      });
      window.CRM.closeModal();
      window.CRM.showToast('Gmail compose opened. Activity logged.');
      render();
      break;
    }

    case 'send-outlook': {
      e.stopPropagation();
      const { to: olTo, subject: olSubject, body: olBody } = getComposeFields();
      const outlookUrl = `https://outlook.live.com/mail/0/deeplink/compose?to=${encodeURIComponent(olTo)}&subject=${encodeURIComponent(olSubject)}&body=${encodeURIComponent(olBody)}`;
      window.open(outlookUrl, '_blank');
      store.addActivity({
        type: 'email',
        contactId: target.dataset.contactId,
        summary: `Email sent via Outlook: ${olSubject}`,
        timestamp: new Date().toISOString(),
      });
      window.CRM.closeModal();
      window.CRM.showToast('Outlook compose opened. Activity logged.');
      render();
      break;
    }

    case 'copy-email': {
      e.stopPropagation();
      const { to: cpTo, subject: cpSubject, body: cpBody } = getComposeFields();
      const fullText = `To: ${cpTo}\nSubject: ${cpSubject}\n\n${cpBody}`;
      navigator.clipboard.writeText(fullText).then(() => {
        window.CRM.showToast('Email copied to clipboard.');
      });
      break;
    }

    case 'add-note': {
      e.stopPropagation();
      const entityType = target.dataset.entityType;
      const entityId = target.dataset.entityId;
      const inputEl = document.querySelector(`[data-action="note-input"][data-entity-type="${entityType}"][data-entity-id="${entityId}"]`);
      if (!inputEl) break;
      const text = inputEl.value.trim();
      if (!text) { window.CRM.showToast('Please enter a note.', 'error'); break; }
      store.addNote({ entityType, entityId, text });
      window.CRM.showToast('Note added.');
      render();
      break;
    }

    case 'delete-note': {
      e.stopPropagation();
      store.removeNote(target.dataset.noteId);
      window.CRM.showToast('Note deleted.');
      render();
      break;
    }

    case 'none': {
      // Prevent toggle-detail when clicking bulk checkbox cell
      e.stopPropagation();
      break;
    }

    case 'toggle-bulk': {
      bulkSelectMode = !bulkSelectMode;
      bulkSelectedIds.clear();
      render();
      break;
    }

    case 'select-all-contacts': {
      store.getContacts().forEach(c => bulkSelectedIds.add(c.id));
      render();
      break;
    }

    case 'deselect-all-contacts': {
      bulkSelectedIds.clear();
      render();
      break;
    }

    case 'bulk-add-tag': {
      e.stopPropagation();
      showContactsBulkTagPopover(target);
      break;
    }

    case 'bulk-export-contacts': {
      bulkExportContacts();
      break;
    }

    case 'bulk-delete-contacts': {
      bulkDeleteContacts();
      break;
    }
  }
}

function showContactsBulkTagPopover(anchorEl) {
  // Remove any existing popover
  const existing = document.getElementById('contacts-tagPopover');
  if (existing) existing.remove();

  const tags = store.getTags();
  const popover = document.createElement('div');
  popover.className = 'tag-popover';
  popover.id = 'contacts-tagPopover';

  if (!tags.length) {
    popover.innerHTML = '<div class="no-tags-msg">No tags yet. Create tags in Settings.</div>';
  } else {
    popover.innerHTML = tags.map(t => `
      <div class="tag-option contacts-bulk-tag-option" data-tag-id="${escapeHtml(t.id)}" style="cursor:pointer;">
        <span class="tag-color-dot" style="background:${escapeHtml(t.color)}"></span>
        <span class="tag-option-label">${escapeHtml(t.name)}</span>
      </div>
    `).join('');
  }

  const rect = anchorEl.getBoundingClientRect();
  popover.style.position = 'fixed';
  popover.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
  popover.style.left = rect.left + 'px';
  document.body.appendChild(popover);

  const closeHandler = (ev) => {
    if (!ev.target.closest('.tag-popover') && !ev.target.closest('[data-action="bulk-add-tag"]')) {
      popover.remove();
      document.removeEventListener('click', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('click', closeHandler), 0);

  popover.addEventListener('click', (ev) => {
    const opt = ev.target.closest('.contacts-bulk-tag-option');
    if (opt) {
      const tagId = opt.dataset.tagId;
      bulkSelectedIds.forEach(id => {
        const contact = store.getContactById(id);
        if (contact) {
          const tags = contact.tags || [];
          if (!tags.includes(tagId)) {
            tags.push(tagId);
            store.updateContact(id, { tags });
          }
        }
      });
      window.CRM.showToast(`Tag added to ${bulkSelectedIds.size} contact(s).`);
      popover.remove();
      document.removeEventListener('click', closeHandler);
      render();
    }
  });
}

function bulkExportContacts() {
  const selected = store.getContacts().filter(c => bulkSelectedIds.has(c.id));
  if (!selected.length) return;

  const headers = ['Name', 'Business', 'Email', 'Phone', 'Website', 'Address', 'City', 'Category', 'Created'];
  const rows = selected.map(c => [
    c.name, c.businessName, c.email, c.phone, c.website, c.address, c.city, c.category,
    c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '',
  ]);
  const csv = [headers, ...rows].map(row =>
    row.map(cell => '"' + String(cell || '').replace(/"/g, '""') + '"').join(',')
  ).join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `contacts-selected-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  window.CRM.showToast(`Exported ${selected.length} contact(s).`);
}

function bulkDeleteContacts() {
  if (!confirm(`Delete ${bulkSelectedIds.size} selected contact(s)? This cannot be undone.`)) return;
  const count = bulkSelectedIds.size;
  bulkSelectedIds.forEach(id => store.removeContact(id));
  window.CRM.showToast(`Deleted ${count} contact(s).`);
  bulkSelectedIds.clear();
  render();
}

function handleInput(e) {
  const target = e.target;

  // Search input with debounce
  if (target.matches('[data-action="search"]')) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      searchQuery = target.value.trim();
      render();
    }, 300);
    return;
  }

  // Allow Enter key to add note
  if (target.matches('[data-action="note-input"]') && e.inputType === undefined) {
    // handled by keydown instead
    return;
  }
}

function handleChange(e) {
  const target = e.target;

  if (target.matches('[data-action="filter-category"]')) {
    filterCategory = target.value;
    render();
  }

  if (target.matches('[data-action="filter-tag"]')) {
    filterTagId = target.value;
    render();
  }

  // Bulk checkbox on contact row
  if (target.classList.contains('contacts-bulk-checkbox')) {
    e.stopPropagation();
    const contactId = target.dataset.contactId;
    if (target.checked) {
      bulkSelectedIds.add(contactId);
    } else {
      bulkSelectedIds.delete(contactId);
    }
    render();
  }
}

function handleSubmit(e) {
  // Contact form submission
  if (e.target.id === 'contact-form') {
    e.preventDefault();
    const form = e.target;
    const contactId = form.dataset.contactId;

    const data = {
      name: document.getElementById('contact-name').value.trim(),
      businessName: document.getElementById('contact-business').value.trim(),
      email: document.getElementById('contact-email').value.trim(),
      phone: document.getElementById('contact-phone').value.trim(),
      website: document.getElementById('contact-website').value.trim(),
      address: document.getElementById('contact-address').value.trim(),
      city: document.getElementById('contact-city').value.trim(),
      category: document.getElementById('contact-category').value.trim(),
    };

    if (!data.name) {
      window.CRM.showToast('Name is required.', 'error');
      return;
    }

    if (contactId) {
      store.updateContact(contactId, data);
      window.CRM.showToast('Contact updated.');
    } else {
      store.addContact(data);
      window.CRM.showToast('Contact added.');
    }

    window.CRM.closeModal();
    render();
  }

  // Deal form submission
  if (e.target.id === 'deal-form') {
    e.preventDefault();
    const contactId = e.target.dataset.contactId;

    const name = document.getElementById('deal-name').value.trim();
    if (!name) {
      window.CRM.showToast('Deal name is required.', 'error');
      return;
    }

    store.addDeal({
      name,
      contactId,
      value: parseFloat(document.getElementById('deal-value').value) || 0,
      stage: document.getElementById('deal-stage').value,
      expectedCloseDate: document.getElementById('deal-close-date').value || null,
    });

    window.CRM.showToast('Deal created.');
    window.CRM.closeModal();
    render();
  }

  // Task form submission
  if (e.target.id === 'task-form') {
    e.preventDefault();
    const contactId = e.target.dataset.contactId;

    const title = document.getElementById('task-title').value.trim();
    if (!title) {
      window.CRM.showToast('Task title is required.', 'error');
      return;
    }

    store.addTask({
      title,
      contactId,
      dueDate: document.getElementById('task-due').value || null,
      priority: document.getElementById('task-priority').value,
      description: document.getElementById('task-description').value.trim(),
    });

    window.CRM.showToast('Task added.');
    window.CRM.closeModal();
    render();
  }
}

export function init() {
  const section = document.getElementById('section-contacts');
  if (!section) return;

  section.addEventListener('click', handleClick);
  section.addEventListener('input', handleInput);
  section.addEventListener('change', handleChange);

  // Enter key to add note
  section.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-action="note-input"]')) {
      e.preventDefault();
      const entityType = e.target.dataset.entityType;
      const entityId = e.target.dataset.entityId;
      const text = e.target.value.trim();
      if (!text) return;
      store.addNote({ entityType, entityId, text });
      window.CRM.showToast('Note added.');
      render();
    }
  });

  // Listen for form submissions at document level (modals may be outside section)
  document.addEventListener('submit', handleSubmit);
}
