// deals.js - Deals pipeline module (Kanban + List views)

import { store } from './store.js';
import { escapeHtml, generateId, formatDate, formatDateTime, timeAgo, formatCurrency } from './utils.js';

const DEAL_STAGES = ['Qualification', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost'];

const STAGE_COLORS = {
  'Qualification': '#0ea5e9',
  'Proposal':      '#f59e0b',
  'Negotiation':   '#eab308',
  'Closed Won':    '#22c55e',
  'Closed Lost':   '#ef4444',
};

const SERVICES = ['Website', 'SEO', 'Social Media', 'PPC', 'Email Marketing', 'Branding', 'Other'];

let currentView = 'kanban'; // 'kanban' | 'list'
let sortColumn = 'createdAt';
let sortDir = 'desc';

// ---- Helpers ----

function stageBadge(stage) {
  const color = STAGE_COLORS[stage] || '#6b7280';
  return `<span class="deal-stage-badge" style="background:${color};color:#fff;padding:2px 10px;border-radius:9999px;font-size:0.75rem;font-weight:600;white-space:nowrap;">${escapeHtml(stage)}</span>`;
}

function contactName(contactId) {
  const c = store.getContactById(contactId);
  return c ? escapeHtml(c.name || c.businessName || 'Unnamed') : '<em>No contact</em>';
}

function contactLink(contactId) {
  const c = store.getContactById(contactId);
  if (!c) return '<em>No contact</em>';
  const name = escapeHtml(c.name || c.businessName || 'Unnamed');
  return `<a href="#" class="contact-link" data-contact-id="${escapeHtml(c.id)}">${name}</a>`;
}

function servicePills(services) {
  if (!services || !services.length) return '';
  return services.map(s =>
    `<span class="service-pill" style="display:inline-block;background:#e0e7ff;color:#3730a3;padding:1px 8px;border-radius:9999px;font-size:0.65rem;margin:1px 2px;">${escapeHtml(s)}</span>`
  ).join('');
}

function pipelineValue() {
  return store.getDeals()
    .filter(d => d.stage !== 'Closed Won' && d.stage !== 'Closed Lost')
    .reduce((sum, d) => sum + (Number(d.value) || 0), 0);
}

// ---- Kanban View ----

function renderKanban() {
  const deals = store.getDeals();
  const columns = DEAL_STAGES.map(stage => {
    const stageDeals = deals.filter(d => d.stage === stage);
    const total = stageDeals.reduce((s, d) => s + (Number(d.value) || 0), 0);
    return `
      <div class="kanban-column" data-stage="${escapeHtml(stage)}">
        <div class="kanban-column-header" style="border-top:3px solid ${STAGE_COLORS[stage]};">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-weight:600;">${escapeHtml(stage)}</span>
            <span class="kanban-count" style="background:#e5e7eb;color:#374151;padding:1px 8px;border-radius:9999px;font-size:0.7rem;">${stageDeals.length}</span>
          </div>
          <div style="font-size:0.8rem;color:#6b7280;margin-top:2px;">${formatCurrency(total)}</div>
        </div>
        <div class="kanban-cards" style="overflow-y:auto;max-height:calc(100vh - 300px);padding:4px;">
          ${stageDeals.length === 0
            ? '<div style="text-align:center;color:#9ca3af;padding:24px 8px;font-size:0.85rem;">No deals</div>'
            : stageDeals.map(d => renderKanbanCard(d)).join('')}
        </div>
      </div>`;
  });

  return `<div class="kanban-board" style="display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;">${columns.join('')}</div>`;
}

function renderKanbanCard(deal) {
  const closeDate = deal.expectedCloseDate ? `<div style="font-size:0.75rem;color:#6b7280;margin-top:4px;">Close: ${formatDate(deal.expectedCloseDate)}</div>` : '';
  const pills = servicePills(deal.services);
  const stageOptions = DEAL_STAGES.map(s =>
    `<option value="${escapeHtml(s)}" ${s === deal.stage ? 'selected' : ''}>${escapeHtml(s)}</option>`
  ).join('');

  return `
    <div class="kanban-card deal-card" data-deal-id="${escapeHtml(deal.id)}" style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-bottom:8px;cursor:pointer;">
      <div style="font-weight:600;font-size:0.9rem;margin-bottom:4px;">${escapeHtml(deal.name)}</div>
      <div style="font-size:0.8rem;margin-bottom:4px;">${contactLink(deal.contactId)}</div>
      <div style="font-size:1.15rem;font-weight:700;color:#111827;margin-bottom:4px;">${formatCurrency(deal.value)}</div>
      ${closeDate}
      ${pills ? `<div style="margin-top:4px;">${pills}</div>` : ''}
      <div style="margin-top:8px;" onclick="event.stopPropagation();">
        <select class="deal-stage-select" data-deal-id="${escapeHtml(deal.id)}" style="font-size:0.75rem;padding:2px 6px;border-radius:4px;border:1px solid #d1d5db;width:100%;">
          ${stageOptions}
        </select>
      </div>
    </div>`;
}

// ---- List View ----

function renderList() {
  const deals = getSortedDeals();
  const arrow = dir => dir === 'asc' ? ' &#9650;' : ' &#9660;';

  function thSort(col, label) {
    const active = sortColumn === col;
    return `<th class="sortable-th" data-sort="${col}" style="cursor:pointer;user-select:none;padding:8px 12px;text-align:left;white-space:nowrap;${active ? 'color:#2563eb;' : ''}">${label}${active ? arrow(sortDir) : ''}</th>`;
  }

  const rows = deals.map(d => `
    <tr class="deal-row" data-deal-id="${escapeHtml(d.id)}" style="cursor:pointer;">
      <td style="padding:8px 12px;font-weight:500;">${escapeHtml(d.name)}</td>
      <td style="padding:8px 12px;">${contactName(d.contactId)}</td>
      <td style="padding:8px 12px;font-weight:600;">${formatCurrency(d.value)}</td>
      <td style="padding:8px 12px;">${stageBadge(d.stage)}</td>
      <td style="padding:8px 12px;">${d.expectedCloseDate ? formatDate(d.expectedCloseDate) : '—'}</td>
      <td style="padding:8px 12px;">${servicePills(d.services)}</td>
      <td style="padding:8px 12px;font-size:0.8rem;color:#6b7280;">${formatDate(d.createdAt)}</td>
    </tr>
  `).join('');

  return `
    <div style="overflow-x:auto;">
      <table class="deals-table" style="width:100%;border-collapse:collapse;">
        <thead style="background:#f9fafb;border-bottom:2px solid #e5e7eb;">
          <tr>
            ${thSort('name', 'Deal Name')}
            ${thSort('contactId', 'Contact')}
            ${thSort('value', 'Value')}
            ${thSort('stage', 'Stage')}
            ${thSort('expectedCloseDate', 'Expected Close')}
            <th style="padding:8px 12px;text-align:left;">Services</th>
            ${thSort('createdAt', 'Created')}
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="7" style="text-align:center;padding:32px;color:#9ca3af;">No deals yet</td></tr>'}</tbody>
      </table>
    </div>`;
}

function getSortedDeals() {
  const deals = [...store.getDeals()];
  deals.sort((a, b) => {
    let va = a[sortColumn];
    let vb = b[sortColumn];
    if (sortColumn === 'contactId') {
      va = contactName(a.contactId);
      vb = contactName(b.contactId);
    }
    if (sortColumn === 'value') {
      va = Number(va) || 0;
      vb = Number(vb) || 0;
      return sortDir === 'asc' ? va - vb : vb - va;
    }
    if (va == null) va = '';
    if (vb == null) vb = '';
    const cmp = String(va).localeCompare(String(vb));
    return sortDir === 'asc' ? cmp : -cmp;
  });
  return deals;
}

// ---- Section Chrome ----

function renderHeader() {
  const deals = store.getDeals();
  const total = deals.length;
  const pipeline = pipelineValue();
  const kanbanActive = currentView === 'kanban';

  return `
    <div class="section-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:16px;">
      <div>
        <h2 style="margin:0;font-size:1.4rem;">Deals <span style="font-size:0.9rem;font-weight:400;color:#6b7280;">(${total})</span></h2>
        <div style="font-size:0.85rem;color:#6b7280;">Pipeline: <strong>${formatCurrency(pipeline)}</strong></div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <div class="view-toggle" style="display:inline-flex;border:1px solid #d1d5db;border-radius:6px;overflow:hidden;">
          <button class="view-toggle-btn ${kanbanActive ? 'active' : ''}" data-view="kanban" style="padding:6px 14px;font-size:0.8rem;border:none;cursor:pointer;background:${kanbanActive ? '#2563eb' : '#fff'};color:${kanbanActive ? '#fff' : '#374151'};">Kanban</button>
          <button class="view-toggle-btn ${!kanbanActive ? 'active' : ''}" data-view="list" style="padding:6px 14px;font-size:0.8rem;border:none;cursor:pointer;background:${!kanbanActive ? '#2563eb' : '#fff'};color:${!kanbanActive ? '#fff' : '#374151'};">List</button>
        </div>
        <button class="btn-new-deal" style="padding:8px 16px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:0.85rem;font-weight:500;">+ New Deal</button>
      </div>
    </div>`;
}

// ---- Create/Edit Modal ----

function openDealModal(dealId) {
  const deal = dealId ? store.getDealById(dealId) : null;
  const isEdit = !!deal;
  const contacts = store.getContacts();

  const contactOptions = contacts.map(c => {
    const selected = deal && deal.contactId === c.id ? 'selected' : '';
    const label = escapeHtml(c.name || c.businessName || 'Unnamed');
    return `<option value="${escapeHtml(c.id)}" ${selected}>${label}</option>`;
  }).join('');

  const stageOptions = DEAL_STAGES.map(s =>
    `<option value="${escapeHtml(s)}" ${deal && deal.stage === s ? 'selected' : ''}>${escapeHtml(s)}</option>`
  ).join('');

  const serviceChecks = SERVICES.map(s => {
    const checked = deal && deal.services && deal.services.includes(s) ? 'checked' : '';
    return `<label style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;font-size:0.85rem;"><input type="checkbox" name="services" value="${escapeHtml(s)}" ${checked}> ${escapeHtml(s)}</label>`;
  }).join('');

  const html = `
    <form id="deal-form" data-deal-id="${deal ? escapeHtml(deal.id) : ''}">
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div>
          <label style="display:block;font-weight:500;margin-bottom:4px;font-size:0.85rem;">Deal Name *</label>
          <input type="text" name="name" value="${deal ? escapeHtml(deal.name) : ''}" required style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;">
        </div>
        <div>
          <label style="display:block;font-weight:500;margin-bottom:4px;font-size:0.85rem;">Contact *</label>
          <select name="contactId" required style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;">
            <option value="">Select a contact</option>
            ${contactOptions}
          </select>
        </div>
        <div>
          <label style="display:block;font-weight:500;margin-bottom:4px;font-size:0.85rem;">Value *</label>
          <input type="number" name="value" min="0" step="0.01" value="${deal ? deal.value : ''}" required style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;">
        </div>
        <div>
          <label style="display:block;font-weight:500;margin-bottom:4px;font-size:0.85rem;">Stage</label>
          <select name="stage" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;">
            ${stageOptions}
          </select>
        </div>
        <div>
          <label style="display:block;font-weight:500;margin-bottom:4px;font-size:0.85rem;">Expected Close Date</label>
          <input type="date" name="expectedCloseDate" value="${deal ? (deal.expectedCloseDate || '') : ''}" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;">
        </div>
        <div>
          <label style="display:block;font-weight:500;margin-bottom:4px;font-size:0.85rem;">Services</label>
          <div style="display:flex;flex-wrap:wrap;gap:4px;">${serviceChecks}</div>
        </div>
        <div>
          <label style="display:block;font-weight:500;margin-bottom:4px;font-size:0.85rem;">Notes</label>
          <textarea name="notes" rows="3" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;resize:vertical;">${deal ? escapeHtml(deal.notes || '') : ''}</textarea>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px;">
          <button type="button" class="btn-cancel-deal" style="padding:8px 16px;background:#f3f4f6;color:#374151;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;">Cancel</button>
          <button type="submit" style="padding:8px 20px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:500;">${isEdit ? 'Update' : 'Create'} Deal</button>
        </div>
      </div>
    </form>`;

  window.CRM.showModal(isEdit ? 'Edit Deal' : 'New Deal', html);
}

function handleDealFormSubmit(form) {
  const dealId = form.dataset.dealId;
  const data = {
    name: form.name.value.trim(),
    contactId: form.contactId.value,
    value: parseFloat(form.value.value) || 0,
    stage: form.stage.value,
    expectedCloseDate: form.expectedCloseDate.value || null,
    services: Array.from(form.querySelectorAll('input[name="services"]:checked')).map(cb => cb.value),
    notes: form.notes.value.trim(),
  };

  if (!data.name || !data.contactId) return;

  if (dealId) {
    store.updateDeal(dealId, data);
    window.CRM.showToast('Deal updated');
  } else {
    store.addDeal(data);
    window.CRM.showToast('Deal created');
  }

  window.CRM.closeModal();
  render();
}

// ---- Deal Detail ----

function openDealDetail(dealId) {
  const deal = store.getDealById(dealId);
  if (!deal) return;

  const activities = store.getActivitiesFor('deal', dealId);
  const tasks = store.getTasksFor('deal', dealId);

  const activityRows = activities.length > 0
    ? activities.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || '')).map(a => `
        <div style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:0.85rem;">
          <span style="font-weight:500;text-transform:capitalize;">${escapeHtml(a.type)}</span>
          <span style="color:#6b7280;margin-left:8px;">${timeAgo(a.timestamp)}</span>
          <div style="color:#374151;margin-top:2px;">${escapeHtml(a.summary)}</div>
        </div>`).join('')
    : '<div style="color:#9ca3af;font-size:0.85rem;padding:8px 0;">No activities logged yet.</div>';

  const taskRows = tasks.length > 0
    ? tasks.map(t => `
        <div style="padding:6px 0;border-bottom:1px solid #f3f4f6;font-size:0.85rem;display:flex;align-items:center;gap:8px;">
          <span style="color:${t.completed ? '#22c55e' : '#d1d5db'};">${t.completed ? '&#10003;' : '&#9675;'}</span>
          <span style="${t.completed ? 'text-decoration:line-through;color:#9ca3af;' : ''}">${escapeHtml(t.title)}</span>
          ${t.dueDate ? `<span style="margin-left:auto;font-size:0.75rem;color:#6b7280;">${formatDate(t.dueDate)}</span>` : ''}
        </div>`).join('')
    : '<div style="color:#9ca3af;font-size:0.85rem;padding:8px 0;">No tasks linked.</div>';

  const html = `
    <div class="deal-detail">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
        <div>
          <h3 style="margin:0 0 4px 0;">${escapeHtml(deal.name)}</h3>
          <div style="font-size:1.2rem;font-weight:700;margin-bottom:6px;">${formatCurrency(deal.value)}</div>
          <div style="margin-bottom:4px;">${stageBadge(deal.stage)}</div>
          <div style="font-size:0.85rem;margin-top:6px;">Contact: ${contactLink(deal.contactId)}</div>
        </div>
        <button class="btn-edit-deal" data-deal-id="${escapeHtml(deal.id)}" style="padding:6px 14px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;font-size:0.8rem;">Edit</button>
      </div>

      ${deal.expectedCloseDate ? `<div style="font-size:0.85rem;color:#6b7280;margin-bottom:4px;">Expected Close: ${formatDate(deal.expectedCloseDate)}</div>` : ''}
      ${deal.services && deal.services.length ? `<div style="margin-bottom:8px;">${servicePills(deal.services)}</div>` : ''}
      ${deal.notes ? `<div style="font-size:0.85rem;color:#374151;background:#f9fafb;padding:8px 12px;border-radius:6px;margin-bottom:12px;">${escapeHtml(deal.notes)}</div>` : ''}

      <div style="margin-top:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <h4 style="margin:0;font-size:0.95rem;">Activity</h4>
          <div style="display:flex;gap:6px;">
            <button class="btn-quick-activity" data-type="call" data-deal-id="${escapeHtml(deal.id)}" style="padding:4px 10px;font-size:0.75rem;background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:4px;cursor:pointer;">Log Call</button>
            <button class="btn-quick-activity" data-type="email" data-deal-id="${escapeHtml(deal.id)}" style="padding:4px 10px;font-size:0.75rem;background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:4px;cursor:pointer;">Log Email</button>
            <button class="btn-quick-activity" data-type="meeting" data-deal-id="${escapeHtml(deal.id)}" style="padding:4px 10px;font-size:0.75rem;background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:4px;cursor:pointer;">Log Meeting</button>
            <button class="btn-quick-activity" data-type="note" data-deal-id="${escapeHtml(deal.id)}" style="padding:4px 10px;font-size:0.75rem;background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:4px;cursor:pointer;">Add Note</button>
          </div>
        </div>
        ${activityRows}
      </div>

      <div style="margin-top:16px;">
        <h4 style="margin:0 0 8px 0;font-size:0.95rem;">Tasks</h4>
        ${taskRows}
      </div>
    </div>`;

  window.CRM.showModal(deal.name, html);
}

// ---- Quick Activity ----

function openQuickActivity(type, dealId) {
  const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
  const html = `
    <form id="quick-activity-form" data-type="${escapeHtml(type)}" data-deal-id="${escapeHtml(dealId)}">
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div>
          <label style="display:block;font-weight:500;margin-bottom:4px;font-size:0.85rem;">Summary *</label>
          <input type="text" name="summary" required placeholder="Brief summary..." style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;">
        </div>
        <div>
          <label style="display:block;font-weight:500;margin-bottom:4px;font-size:0.85rem;">Details</label>
          <textarea name="details" rows="3" placeholder="Additional details..." style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;resize:vertical;"></textarea>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button type="button" class="btn-cancel-activity" style="padding:8px 16px;background:#f3f4f6;color:#374151;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;">Cancel</button>
          <button type="submit" style="padding:8px 20px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:500;">Log ${typeLabel}</button>
        </div>
      </div>
    </form>`;

  window.CRM.showModal(`Log ${typeLabel}`, html);
}

function handleQuickActivitySubmit(form) {
  const type = form.dataset.type;
  const dealId = form.dataset.dealId;
  const deal = store.getDealById(dealId);
  const summary = form.summary.value.trim();
  if (!summary) return;

  store.addActivity({
    type,
    dealId,
    contactId: deal ? deal.contactId : null,
    summary,
    details: form.details.value.trim(),
  });

  window.CRM.showToast('Activity logged');
  window.CRM.closeModal();
  // Re-open the deal detail to show the new activity
  openDealDetail(dealId);
}

// ---- Render ----

export function render() {
  const container = document.getElementById('section-deals');
  if (!container) return;

  const body = currentView === 'kanban' ? renderKanban() : renderList();
  container.innerHTML = renderHeader() + body;
}

// ---- Event Delegation ----

export function init() {
  const section = document.getElementById('section-deals');
  if (!section) return;

  section.addEventListener('click', (e) => {
    const target = e.target;

    // New Deal button
    if (target.closest('.btn-new-deal')) {
      openDealModal(null);
      return;
    }

    // View toggle
    const toggleBtn = target.closest('.view-toggle-btn');
    if (toggleBtn) {
      const view = toggleBtn.dataset.view;
      if (view && view !== currentView) {
        currentView = view;
        render();
      }
      return;
    }

    // Column sort (list view)
    const sortTh = target.closest('.sortable-th');
    if (sortTh) {
      const col = sortTh.dataset.sort;
      if (col === sortColumn) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortColumn = col;
        sortDir = 'asc';
      }
      render();
      return;
    }

    // Contact link navigation
    const contactLink = target.closest('.contact-link');
    if (contactLink) {
      e.preventDefault();
      const contactId = contactLink.dataset.contactId;
      if (contactId && window.CRM.navigate) {
        window.CRM.navigate('contacts', contactId);
      }
      return;
    }

    // Deal card click (kanban) — but not if clicking the stage select
    const card = target.closest('.deal-card');
    if (card && !target.closest('.deal-stage-select')) {
      openDealDetail(card.dataset.dealId);
      return;
    }

    // Deal row click (list)
    const row = target.closest('.deal-row');
    if (row) {
      openDealDetail(row.dataset.dealId);
      return;
    }
  });

  // Stage dropdown change (kanban cards)
  section.addEventListener('change', (e) => {
    if (e.target.classList.contains('deal-stage-select')) {
      const dealId = e.target.dataset.dealId;
      const newStage = e.target.value;
      store.updateDeal(dealId, { stage: newStage });
      window.CRM.showToast(`Deal moved to ${newStage}`);
      render();
    }
  });

  // Modal-level event delegation (attached to document for modals rendered outside section)
  document.addEventListener('click', (e) => {
    const target = e.target;

    // Edit deal from detail modal
    const editBtn = target.closest('.btn-edit-deal');
    if (editBtn) {
      window.CRM.closeModal();
      openDealModal(editBtn.dataset.dealId);
      return;
    }

    // Quick activity buttons
    const actBtn = target.closest('.btn-quick-activity');
    if (actBtn) {
      const type = actBtn.dataset.type;
      const dealId = actBtn.dataset.dealId;
      window.CRM.closeModal();
      openQuickActivity(type, dealId);
      return;
    }

    // Cancel buttons in modals
    if (target.closest('.btn-cancel-deal') || target.closest('.btn-cancel-activity')) {
      window.CRM.closeModal();
      return;
    }
  });

  // Form submissions (modals)
  document.addEventListener('submit', (e) => {
    if (e.target.id === 'deal-form') {
      e.preventDefault();
      handleDealFormSubmit(e.target);
      return;
    }

    if (e.target.id === 'quick-activity-form') {
      e.preventDefault();
      handleQuickActivitySubmit(e.target);
      return;
    }
  });

  render();
}
