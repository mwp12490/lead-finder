// contacts.js - Contacts module for the CRM application

import { store } from './store.js';
import { escapeHtml, generateId, formatDate, formatDateTime, timeAgo, formatCurrency } from './utils.js';

let currentSort = { column: 'name', direction: 'asc' };
let searchQuery = '';
let filterCategory = '';
let expandedContactId = null;
let debounceTimer = null;

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
      <td colspan="8">
        <div class="contact-detail-panel">

          <div class="contact-detail-header">
            <div>
              <h2 class="contact-detail-name">${escapeHtml(contact.name)}</h2>
              ${contact.businessName ? `<div class="contact-detail-business">${escapeHtml(contact.businessName)}</div>` : ''}
              ${contact.category ? `<span class="badge badge-info">${escapeHtml(contact.category)}</span>` : ''}
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
              <textarea class="contact-notes-textarea" data-action="update-notes" data-contact-id="${contact.id}" placeholder="Add notes about this contact...">${escapeHtml(contact.notes || '')}</textarea>
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

  section.innerHTML = `
    <div class="section-header">
      <h1>Contacts <span class="count-badge">${totalCount}</span></h1>
      <button class="btn btn-primary" data-action="add-contact">Add Contact</button>
    </div>

    <div class="filter-bar">
      <input type="text" class="form-control search-input" placeholder="Search contacts..." data-action="search" value="${escapeHtml(searchQuery)}">
      <select class="form-control category-filter" data-action="filter-category">
        <option value="">All Categories</option>
        ${categories.map(cat => `<option value="${escapeHtml(cat)}" ${filterCategory === cat ? 'selected' : ''}>${escapeHtml(cat)}</option>`).join('')}
      </select>
    </div>

    ${contacts.length === 0
      ? `<div class="empty-state">
           <p>${searchQuery || filterCategory ? 'No contacts match your filters.' : 'No contacts yet. Add your first contact to get started.'}</p>
         </div>`
      : `<div class="table-responsive">
          <table class="data-table contacts-table">
            <thead>
              <tr>
                <th class="sortable" data-action="sort" data-column="name">Name${sortIndicator('name')}</th>
                <th class="sortable" data-action="sort" data-column="businessName">Business${sortIndicator('businessName')}</th>
                <th class="sortable" data-action="sort" data-column="category">Category${sortIndicator('category')}</th>
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
                return `
                  <tr class="contact-row ${isExpanded ? 'expanded' : ''}" data-action="toggle-detail" data-id="${c.id}">
                    <td>${escapeHtml(c.name)}</td>
                    <td>${escapeHtml(c.businessName)}</td>
                    <td>${c.category ? `<span class="badge badge-info">${escapeHtml(c.category)}</span>` : ''}</td>
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
  }
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

  // Notes auto-save with debounce
  if (target.matches('[data-action="update-notes"]')) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const contactId = target.dataset.contactId;
      store.updateContact(contactId, { notes: target.value });
    }, 500);
    return;
  }
}

function handleChange(e) {
  const target = e.target;

  if (target.matches('[data-action="filter-category"]')) {
    filterCategory = target.value;
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

  // Listen for form submissions at document level (modals may be outside section)
  document.addEventListener('submit', handleSubmit);
}
