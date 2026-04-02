// projects.js - Projects module for managing project delivery after deal close

import { store } from './store.js';
import { escapeHtml, generateId, formatDate, formatCurrency, timeAgo } from './utils.js';

const PROJECT_STATUSES = ['Not Started', 'In Progress', 'Review', 'Complete'];

const STATUS_COLORS = {
  'Not Started': '#6b7280',
  'In Progress': '#0ea5e9',
  'Review':      '#f59e0b',
  'Complete':    '#22c55e',
};

const DEFAULT_ONBOARDING = [
  'Collect brand assets (logo, colors, fonts)',
  'Get website/hosting login credentials',
  'Schedule kickoff call',
  'Review and confirm project scope',
  'Set up communication channel (Slack/email)',
  'Collect existing content/copy',
  'Get social media account access (if applicable)',
];

let currentView = 'grid';   // 'grid' | 'board'
let filterStatus = '';

// ---- Helpers ----

function statusBadge(status) {
  const color = STATUS_COLORS[status] || '#6b7280';
  return `<span style="background:${color};color:#fff;padding:2px 10px;border-radius:9999px;font-size:0.75rem;font-weight:600;white-space:nowrap;">${escapeHtml(status)}</span>`;
}

function contactName(contactId) {
  const c = store.getContactById(contactId);
  return c ? escapeHtml(c.name || c.businessName || 'Unnamed') : '<em>No contact</em>';
}

function contactLink(contactId) {
  const c = store.getContactById(contactId);
  if (!c) return '<em>No contact</em>';
  const name = escapeHtml(c.name || c.businessName || 'Unnamed');
  return `<a href="#" class="contact-link" data-contact-id="${escapeHtml(c.id)}" style="color:var(--accent-secondary);text-decoration:none;">${name}</a>`;
}

function checklistProgress(checklist) {
  if (!checklist || checklist.length === 0) return { done: 0, total: 0, pct: 0 };
  const done = checklist.filter(i => i.completed).length;
  return { done, total: checklist.length, pct: Math.round((done / checklist.length) * 100) };
}

function progressBar(pct) {
  return `<div style="background:var(--bg-input, #1e2a4a);border-radius:4px;height:6px;width:100%;overflow:hidden;">
    <div style="background:${pct >= 100 ? '#22c55e' : 'var(--accent-primary, #e94560)'};height:100%;width:${pct}%;border-radius:4px;transition:width 0.3s;"></div>
  </div>`;
}

function servicePills(services) {
  if (!services || !services.length) return '';
  return services.map(s =>
    `<span style="display:inline-block;background:rgba(14,165,233,0.15);color:#0ea5e9;padding:1px 8px;border-radius:9999px;font-size:0.65rem;margin:1px 2px;">${escapeHtml(s)}</span>`
  ).join('');
}

function getFilteredProjects() {
  let projects = store.getProjects();
  if (filterStatus) {
    projects = projects.filter(p => p.status === filterStatus);
  }
  return projects;
}

// ---- Project Card ----

function renderProjectCard(project) {
  const { pct } = checklistProgress(project.checklist);
  const dueDate = project.dueDate ? formatDate(project.dueDate) : '—';
  return `
    <div class="project-card" data-project-id="${escapeHtml(project.id)}" style="background:var(--bg-card, #16213e);border-radius:var(--card-radius, 10px);padding:16px;cursor:pointer;box-shadow:var(--card-shadow, 0 2px 8px rgba(0,0,0,0.3));transition:transform 0.15s;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
        <div style="font-weight:600;font-size:0.95rem;color:var(--text-primary, #e0e0e0);flex:1;margin-right:8px;">${escapeHtml(project.name)}</div>
        ${statusBadge(project.status)}
      </div>
      <div style="font-size:0.8rem;color:var(--text-secondary, #a0a0b0);margin-bottom:6px;">${contactName(project.contactId)}</div>
      <div style="font-size:1.1rem;font-weight:700;color:var(--text-primary, #e0e0e0);margin-bottom:8px;">${formatCurrency(project.value)}</div>
      <div style="margin-bottom:6px;">
        ${progressBar(pct)}
        <div style="font-size:0.7rem;color:var(--text-secondary, #a0a0b0);margin-top:2px;">${pct}% complete</div>
      </div>
      ${project.services ? `<div style="margin-bottom:6px;">${servicePills(project.services)}</div>` : ''}
      <div style="font-size:0.75rem;color:var(--text-secondary, #a0a0b0);">Due: ${dueDate}</div>
    </div>`;
}

// ---- Grid View ----

function renderGrid() {
  const projects = getFilteredProjects();
  if (projects.length === 0) {
    return `<div style="text-align:center;color:var(--text-secondary, #a0a0b0);padding:48px 16px;font-size:0.95rem;">No projects yet. Create one from a Closed Won deal or click "+ New Project".</div>`;
  }
  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;">
    ${projects.map(p => renderProjectCard(p)).join('')}
  </div>`;
}

// ---- Board View (Kanban-style status columns) ----

function renderBoard() {
  const projects = store.getProjects();
  const columns = PROJECT_STATUSES.map(status => {
    const items = projects.filter(p => p.status === status);
    return `
      <div style="min-width:250px;flex:1;background:var(--bg-input, #1e2a4a);border-radius:8px;padding:8px;border-top:3px solid ${STATUS_COLORS[status]};">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 4px;margin-bottom:4px;">
          <span style="font-weight:600;font-size:0.85rem;color:var(--text-primary, #e0e0e0);">${escapeHtml(status)}</span>
          <span style="background:rgba(255,255,255,0.1);color:var(--text-secondary, #a0a0b0);padding:1px 8px;border-radius:9999px;font-size:0.7rem;">${items.length}</span>
        </div>
        <div style="overflow-y:auto;max-height:calc(100vh - 300px);">
          ${items.length === 0
            ? '<div style="text-align:center;color:var(--text-secondary, #a0a0b0);padding:24px 8px;font-size:0.8rem;">No projects</div>'
            : items.map(p => renderBoardCard(p)).join('')}
        </div>
      </div>`;
  });
  return `<div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;">${columns.join('')}</div>`;
}

function renderBoardCard(project) {
  const { pct } = checklistProgress(project.checklist);
  const statusOptions = PROJECT_STATUSES.map(s =>
    `<option value="${escapeHtml(s)}" ${s === project.status ? 'selected' : ''}>${escapeHtml(s)}</option>`
  ).join('');
  return `
    <div class="project-card" data-project-id="${escapeHtml(project.id)}" style="background:var(--bg-card, #16213e);border-radius:8px;padding:12px;margin-bottom:8px;cursor:pointer;">
      <div style="font-weight:600;font-size:0.85rem;color:var(--text-primary, #e0e0e0);margin-bottom:4px;">${escapeHtml(project.name)}</div>
      <div style="font-size:0.75rem;color:var(--text-secondary, #a0a0b0);margin-bottom:4px;">${contactName(project.contactId)}</div>
      <div style="font-weight:700;color:var(--text-primary, #e0e0e0);margin-bottom:6px;">${formatCurrency(project.value)}</div>
      ${progressBar(pct)}
      <div style="font-size:0.65rem;color:var(--text-secondary, #a0a0b0);margin:2px 0 6px;">${pct}%</div>
      <div onclick="event.stopPropagation();">
        <select class="project-status-select" data-project-id="${escapeHtml(project.id)}" style="font-size:0.75rem;padding:2px 6px;border-radius:4px;border:1px solid rgba(255,255,255,0.1);background:var(--bg-input, #1e2a4a);color:var(--text-primary, #e0e0e0);width:100%;">
          ${statusOptions}
        </select>
      </div>
    </div>`;
}

// ---- Header ----

function renderHeader() {
  const projects = store.getProjects();
  const total = projects.length;
  const totalValue = projects.reduce((s, p) => s + (Number(p.value) || 0), 0);
  const gridActive = currentView === 'grid';

  const statusFilterOptions = ['<option value="">All Statuses</option>']
    .concat(PROJECT_STATUSES.map(s =>
      `<option value="${escapeHtml(s)}" ${filterStatus === s ? 'selected' : ''}>${escapeHtml(s)}</option>`
    )).join('');

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:16px;">
      <div>
        <h2 style="margin:0;font-size:1.4rem;color:var(--text-primary, #e0e0e0);">Projects <span style="font-size:0.9rem;font-weight:400;color:var(--text-secondary, #a0a0b0);">(${total})</span></h2>
        <div style="font-size:0.85rem;color:var(--text-secondary, #a0a0b0);">Total Value: <strong style="color:var(--text-primary, #e0e0e0);">${formatCurrency(totalValue)}</strong></div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <select id="project-status-filter" style="padding:6px 10px;font-size:0.8rem;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:var(--bg-input, #1e2a4a);color:var(--text-primary, #e0e0e0);">
          ${statusFilterOptions}
        </select>
        <div style="display:inline-flex;border:1px solid rgba(255,255,255,0.1);border-radius:6px;overflow:hidden;">
          <button class="view-toggle-btn" data-view="grid" style="padding:6px 14px;font-size:0.8rem;border:none;cursor:pointer;background:${gridActive ? 'var(--accent-primary, #e94560)' : 'var(--bg-input, #1e2a4a)'};color:${gridActive ? '#fff' : 'var(--text-secondary, #a0a0b0)'};">Grid</button>
          <button class="view-toggle-btn" data-view="board" style="padding:6px 14px;font-size:0.8rem;border:none;cursor:pointer;background:${!gridActive ? 'var(--accent-primary, #e94560)' : 'var(--bg-input, #1e2a4a)'};color:${!gridActive ? '#fff' : 'var(--text-secondary, #a0a0b0)'};">Board</button>
        </div>
        <button class="btn-new-project" style="padding:8px 16px;background:var(--accent-primary, #e94560);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:0.85rem;font-weight:500;">+ New Project</button>
      </div>
    </div>`;
}

// ---- Create / Edit Project Modal ----

function openProjectModal(projectId, prefill) {
  const project = projectId ? store.getProjectById(projectId) : null;
  const isEdit = !!project;
  const contacts = store.getContacts ? store.getContacts() : [];
  const deals = store.getDeals();
  const closedDeals = deals.filter(d => d.stage === 'Closed Won');

  const src = project || prefill || {};

  const contactOptions = contacts.map(c => {
    const selected = src.contactId === c.id ? 'selected' : '';
    return `<option value="${escapeHtml(c.id)}" ${selected}>${escapeHtml(c.name || c.businessName || 'Unnamed')}</option>`;
  }).join('');

  const dealOptions = closedDeals.map(d => {
    const selected = src.dealId === d.id ? 'selected' : '';
    return `<option value="${escapeHtml(d.id)}" ${selected}>${escapeHtml(d.name)} (${formatCurrency(d.value)})</option>`;
  }).join('');

  const statusOptions = PROJECT_STATUSES.map(s =>
    `<option value="${escapeHtml(s)}" ${(src.status || 'Not Started') === s ? 'selected' : ''}>${escapeHtml(s)}</option>`
  ).join('');

  const html = `
    <form id="project-form" data-project-id="${project ? escapeHtml(project.id) : ''}">
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div>
          <label style="display:block;font-weight:500;margin-bottom:4px;font-size:0.85rem;color:var(--text-primary, #e0e0e0);">Project Name *</label>
          <input type="text" name="name" value="${escapeHtml(src.name || '')}" required style="width:100%;padding:8px;border:1px solid rgba(255,255,255,0.15);border-radius:6px;background:var(--bg-input, #1e2a4a);color:var(--text-primary, #e0e0e0);">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div>
            <label style="display:block;font-weight:500;margin-bottom:4px;font-size:0.85rem;color:var(--text-primary, #e0e0e0);">Linked Deal</label>
            <select name="dealId" style="width:100%;padding:8px;border:1px solid rgba(255,255,255,0.15);border-radius:6px;background:var(--bg-input, #1e2a4a);color:var(--text-primary, #e0e0e0);">
              <option value="">None</option>
              ${dealOptions}
            </select>
          </div>
          <div>
            <label style="display:block;font-weight:500;margin-bottom:4px;font-size:0.85rem;color:var(--text-primary, #e0e0e0);">Contact *</label>
            <select name="contactId" required style="width:100%;padding:8px;border:1px solid rgba(255,255,255,0.15);border-radius:6px;background:var(--bg-input, #1e2a4a);color:var(--text-primary, #e0e0e0);">
              <option value="">Select contact</option>
              ${contactOptions}
            </select>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div>
            <label style="display:block;font-weight:500;margin-bottom:4px;font-size:0.85rem;color:var(--text-primary, #e0e0e0);">Value</label>
            <input type="number" name="value" min="0" step="0.01" value="${src.value || ''}" style="width:100%;padding:8px;border:1px solid rgba(255,255,255,0.15);border-radius:6px;background:var(--bg-input, #1e2a4a);color:var(--text-primary, #e0e0e0);">
          </div>
          <div>
            <label style="display:block;font-weight:500;margin-bottom:4px;font-size:0.85rem;color:var(--text-primary, #e0e0e0);">Status</label>
            <select name="status" style="width:100%;padding:8px;border:1px solid rgba(255,255,255,0.15);border-radius:6px;background:var(--bg-input, #1e2a4a);color:var(--text-primary, #e0e0e0);">
              ${statusOptions}
            </select>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div>
            <label style="display:block;font-weight:500;margin-bottom:4px;font-size:0.85rem;color:var(--text-primary, #e0e0e0);">Start Date</label>
            <input type="date" name="startDate" value="${src.startDate || ''}" style="width:100%;padding:8px;border:1px solid rgba(255,255,255,0.15);border-radius:6px;background:var(--bg-input, #1e2a4a);color:var(--text-primary, #e0e0e0);">
          </div>
          <div>
            <label style="display:block;font-weight:500;margin-bottom:4px;font-size:0.85rem;color:var(--text-primary, #e0e0e0);">Due Date</label>
            <input type="date" name="dueDate" value="${src.dueDate || ''}" style="width:100%;padding:8px;border:1px solid rgba(255,255,255,0.15);border-radius:6px;background:var(--bg-input, #1e2a4a);color:var(--text-primary, #e0e0e0);">
          </div>
        </div>
        <div>
          <label style="display:block;font-weight:500;margin-bottom:4px;font-size:0.85rem;color:var(--text-primary, #e0e0e0);">Services</label>
          <input type="text" name="services" value="${escapeHtml((src.services || []).join(', '))}" placeholder="e.g. Website, SEO, Branding" style="width:100%;padding:8px;border:1px solid rgba(255,255,255,0.15);border-radius:6px;background:var(--bg-input, #1e2a4a);color:var(--text-primary, #e0e0e0);">
        </div>
        <div>
          <label style="display:block;font-weight:500;margin-bottom:4px;font-size:0.85rem;color:var(--text-primary, #e0e0e0);">Notes</label>
          <textarea name="notes" rows="3" style="width:100%;padding:8px;border:1px solid rgba(255,255,255,0.15);border-radius:6px;resize:vertical;background:var(--bg-input, #1e2a4a);color:var(--text-primary, #e0e0e0);">${escapeHtml(src.notes || '')}</textarea>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px;">
          <button type="button" class="btn-cancel-project" style="padding:8px 16px;background:var(--bg-input, #1e2a4a);color:var(--text-primary, #e0e0e0);border:1px solid rgba(255,255,255,0.1);border-radius:6px;cursor:pointer;">Cancel</button>
          <button type="submit" style="padding:8px 20px;background:var(--accent-primary, #e94560);color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:500;">${isEdit ? 'Update' : 'Create'} Project</button>
        </div>
      </div>
    </form>`;

  window.CRM.showModal(isEdit ? 'Edit Project' : 'New Project', html);
}

function handleProjectFormSubmit(form) {
  const projectId = form.dataset.projectId;
  const servicesRaw = form.services.value.trim();
  const data = {
    name: form.name.value.trim(),
    dealId: form.dealId.value || null,
    contactId: form.contactId.value,
    value: parseFloat(form.value.value) || 0,
    status: form.status.value || 'Not Started',
    startDate: form.startDate.value || null,
    dueDate: form.dueDate.value || null,
    services: servicesRaw ? servicesRaw.split(',').map(s => s.trim()).filter(Boolean) : [],
    notes: form.notes.value.trim(),
  };

  if (!data.name || !data.contactId) {
    window.CRM.showToast('Name and contact are required', 'error');
    return;
  }

  if (projectId) {
    store.updateProject(projectId, data);
    window.CRM.showToast('Project updated');
  } else {
    // Add default onboarding checklist for new projects
    data.checklist = DEFAULT_ONBOARDING.map(text => ({ id: generateId(), text, completed: false }));
    data.milestones = [];
    store.addProject(data);
    window.CRM.showToast('Project created');
  }

  window.CRM.closeModal();
  render();
}

// ---- Convert from Deal ----

export function openCreateProjectFromDeal(dealId) {
  const deal = store.getDealById(dealId);
  if (!deal) return;
  openProjectModal(null, {
    name: deal.name,
    dealId: deal.id,
    contactId: deal.contactId,
    services: deal.services || [],
    value: deal.value || 0,
  });
}

// ---- Project Detail Modal ----

function openProjectDetail(projectId) {
  const project = store.getProjectById(projectId);
  if (!project) return;

  const contact = store.getContactById(project.contactId);
  const payments = store.getPaymentsForProject(projectId);
  const activities = store.getActivitiesFor('project', projectId);
  const tasks = store.getTasksFor('project', projectId);

  const totalPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const remaining = (Number(project.value) || 0) - totalPaid;
  const { pct } = checklistProgress(project.checklist);

  const statusOptions = PROJECT_STATUSES.map(s =>
    `<option value="${escapeHtml(s)}" ${s === project.status ? 'selected' : ''}>${escapeHtml(s)}</option>`
  ).join('');

  // Milestones section
  const milestonesHtml = (project.milestones || []).map(m => `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
      <input type="checkbox" class="milestone-toggle" data-project-id="${escapeHtml(project.id)}" data-milestone-id="${escapeHtml(m.id)}" ${m.completed ? 'checked' : ''} style="cursor:pointer;">
      <span style="flex:1;color:var(--text-primary, #e0e0e0);${m.completed ? 'text-decoration:line-through;opacity:0.6;' : ''}">${escapeHtml(m.name)}</span>
      <span style="font-size:0.75rem;color:var(--text-secondary, #a0a0b0);">${m.dueDate ? formatDate(m.dueDate) : ''}</span>
      <button class="milestone-delete" data-project-id="${escapeHtml(project.id)}" data-milestone-id="${escapeHtml(m.id)}" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:0.8rem;" title="Remove">&times;</button>
    </div>
  `).join('') || '<div style="color:var(--text-secondary, #a0a0b0);font-size:0.85rem;padding:8px 0;">No milestones yet.</div>';

  // Onboarding checklist (first N default items + custom)
  const checklistHtml = (project.checklist || []).map(item => `
    <div style="display:flex;align-items:center;gap:8px;padding:5px 0;">
      <input type="checkbox" class="checklist-toggle" data-project-id="${escapeHtml(project.id)}" data-item-id="${escapeHtml(item.id)}" ${item.completed ? 'checked' : ''} style="cursor:pointer;">
      <span style="flex:1;font-size:0.85rem;color:var(--text-primary, #e0e0e0);${item.completed ? 'text-decoration:line-through;opacity:0.6;' : ''}">${escapeHtml(item.text)}</span>
      <button class="checklist-delete" data-project-id="${escapeHtml(project.id)}" data-item-id="${escapeHtml(item.id)}" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:0.8rem;" title="Remove">&times;</button>
    </div>
  `).join('') || '<div style="color:var(--text-secondary, #a0a0b0);font-size:0.85rem;">No checklist items.</div>';

  // Payments list
  const paymentsListHtml = payments.length > 0
    ? payments.map(p => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:0.85rem;">
        <div>
          <span style="color:var(--text-primary, #e0e0e0);font-weight:500;">${formatCurrency(p.amount)}</span>
          <span style="color:var(--text-secondary, #a0a0b0);margin-left:8px;">${p.method ? escapeHtml(p.method) : ''}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="color:var(--text-secondary, #a0a0b0);">${p.date ? formatDate(p.date) : ''}</span>
          <button class="payment-delete" data-payment-id="${escapeHtml(p.id)}" data-project-id="${escapeHtml(project.id)}" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:0.8rem;" title="Remove">&times;</button>
        </div>
      </div>
    `).join('')
    : '<div style="color:var(--text-secondary, #a0a0b0);font-size:0.85rem;padding:8px 0;">No payments recorded.</div>';

  // Activity timeline
  const activityHtml = activities.length > 0
    ? activities.slice(0, 15).map(a => `
      <div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:0.85rem;">
        <div style="display:flex;justify-content:space-between;">
          <span style="color:var(--text-primary, #e0e0e0);">${escapeHtml(a.type || 'Note')}: ${escapeHtml(a.description || a.notes || '')}</span>
          <span style="color:var(--text-secondary, #a0a0b0);font-size:0.75rem;white-space:nowrap;margin-left:8px;">${timeAgo(a.createdAt)}</span>
        </div>
      </div>
    `).join('')
    : '<div style="color:var(--text-secondary, #a0a0b0);font-size:0.85rem;padding:8px 0;">No activity yet.</div>';

  // Tasks
  const tasksHtml = tasks.length > 0
    ? tasks.map(t => `
      <div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:0.85rem;">
        <span style="width:8px;height:8px;border-radius:50%;background:${t.completed ? '#22c55e' : '#f59e0b'};flex-shrink:0;"></span>
        <span style="flex:1;color:var(--text-primary, #e0e0e0);${t.completed ? 'text-decoration:line-through;opacity:0.6;' : ''}">${escapeHtml(t.title || t.text || '')}</span>
        <span style="color:var(--text-secondary, #a0a0b0);font-size:0.75rem;">${t.dueDate ? formatDate(t.dueDate) : ''}</span>
      </div>
    `).join('')
    : '<div style="color:var(--text-secondary, #a0a0b0);font-size:0.85rem;padding:8px 0;">No tasks linked.</div>';

  const sectionStyle = 'background:var(--bg-input, #1e2a4a);border-radius:8px;padding:14px;margin-bottom:12px;';
  const sectionTitle = 'font-weight:600;font-size:0.9rem;color:var(--text-primary, #e0e0e0);margin-bottom:8px;';
  const inlineInput = 'padding:6px 8px;border:1px solid rgba(255,255,255,0.15);border-radius:4px;background:var(--bg-card, #16213e);color:var(--text-primary, #e0e0e0);font-size:0.8rem;';
  const smallBtn = 'padding:4px 12px;border:none;border-radius:4px;cursor:pointer;font-size:0.8rem;font-weight:500;';

  const html = `
    <div style="max-height:75vh;overflow-y:auto;padding-right:4px;">
      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:16px;">
        <div style="flex:1;">
          <h3 style="margin:0 0 4px;color:var(--text-primary, #e0e0e0);">${escapeHtml(project.name)}</h3>
          <div style="font-size:0.85rem;color:var(--text-secondary, #a0a0b0);">Contact: ${contactLink(project.contactId)}</div>
          ${project.dealId ? `<div style="font-size:0.85rem;color:var(--text-secondary, #a0a0b0);margin-top:2px;">Deal: ${escapeHtml((store.getDealById(project.dealId) || {}).name || 'Unknown')}</div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
          <select class="detail-status-select" data-project-id="${escapeHtml(project.id)}" style="${inlineInput}width:140px;">
            ${statusOptions}
          </select>
          <div style="font-size:1.2rem;font-weight:700;color:var(--text-primary, #e0e0e0);">${formatCurrency(project.value)}</div>
        </div>
      </div>

      <!-- Dates and progress -->
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px;font-size:0.85rem;color:var(--text-secondary, #a0a0b0);">
        <span>Start: <strong style="color:var(--text-primary, #e0e0e0);">${project.startDate ? formatDate(project.startDate) : '—'}</strong></span>
        <span>Due: <strong style="color:var(--text-primary, #e0e0e0);">${project.dueDate ? formatDate(project.dueDate) : '—'}</strong></span>
        ${project.completedAt ? `<span>Completed: <strong style="color:#22c55e;">${formatDate(project.completedAt)}</strong></span>` : ''}
      </div>
      <div style="margin-bottom:16px;">
        ${progressBar(pct)}
        <div style="font-size:0.75rem;color:var(--text-secondary, #a0a0b0);margin-top:3px;">${pct}% complete</div>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:16px;">
        <button class="btn-edit-project" data-project-id="${escapeHtml(project.id)}" style="${smallBtn}background:var(--accent-secondary, #0ea5e9);color:#fff;">Edit Project</button>
        <button class="btn-delete-project" data-project-id="${escapeHtml(project.id)}" style="${smallBtn}background:#ef4444;color:#fff;">Delete</button>
      </div>

      <!-- Milestones -->
      <div style="${sectionStyle}">
        <div style="${sectionTitle}">Milestones</div>
        ${milestonesHtml}
        <div style="display:flex;gap:6px;margin-top:8px;">
          <input type="text" id="milestone-name" placeholder="Milestone name" style="${inlineInput}flex:1;">
          <input type="date" id="milestone-date" style="${inlineInput}">
          <button class="btn-add-milestone" data-project-id="${escapeHtml(project.id)}" style="${smallBtn}background:var(--accent-primary, #e94560);color:#fff;">Add</button>
        </div>
      </div>

      <!-- Checklist -->
      <div style="${sectionStyle}">
        <div style="${sectionTitle}">Checklist</div>
        ${checklistHtml}
        <div style="display:flex;gap:6px;margin-top:8px;">
          <input type="text" id="checklist-text" placeholder="Add checklist item..." style="${inlineInput}flex:1;">
          <button class="btn-add-checklist" data-project-id="${escapeHtml(project.id)}" style="${smallBtn}background:var(--accent-primary, #e94560);color:#fff;">Add</button>
        </div>
      </div>

      <!-- Payment Tracking -->
      <div style="${sectionStyle}">
        <div style="${sectionTitle}">Payments</div>
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:10px;font-size:0.85rem;">
          <span style="color:var(--text-secondary, #a0a0b0);">Total: <strong style="color:var(--text-primary, #e0e0e0);">${formatCurrency(project.value)}</strong></span>
          <span style="color:var(--text-secondary, #a0a0b0);">Paid: <strong style="color:#22c55e;">${formatCurrency(totalPaid)}</strong></span>
          <span style="color:var(--text-secondary, #a0a0b0);">Remaining: <strong style="color:${remaining > 0 ? '#f59e0b' : '#22c55e'};">${formatCurrency(remaining)}</strong></span>
        </div>
        ${paymentsListHtml}
        <div id="payment-form-area" style="margin-top:8px;">
          <button class="btn-show-payment-form" data-project-id="${escapeHtml(project.id)}" style="${smallBtn}background:var(--accent-primary, #e94560);color:#fff;">Record Payment</button>
        </div>
      </div>

      <!-- Activity Timeline -->
      <div style="${sectionStyle}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div style="${sectionTitle}margin-bottom:0;">Activity</div>
          <button class="btn-log-activity" data-project-id="${escapeHtml(project.id)}" style="${smallBtn}background:var(--accent-secondary, #0ea5e9);color:#fff;">Log Activity</button>
        </div>
        ${activityHtml}
      </div>

      <!-- Tasks -->
      <div style="${sectionStyle}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div style="${sectionTitle}margin-bottom:0;">Tasks</div>
          <button class="btn-add-task" data-project-id="${escapeHtml(project.id)}" style="${smallBtn}background:var(--accent-secondary, #0ea5e9);color:#fff;">Add Task</button>
        </div>
        ${tasksHtml}
      </div>
    </div>`;

  window.CRM.showModal('Project Details', html);
}

// ---- Inline forms within detail modal ----

function showPaymentForm(projectId) {
  const area = document.getElementById('payment-form-area');
  if (!area) return;
  const inlineInput = 'padding:6px 8px;border:1px solid rgba(255,255,255,0.15);border-radius:4px;background:var(--bg-card, #16213e);color:var(--text-primary, #e0e0e0);font-size:0.8rem;';
  const smallBtn = 'padding:4px 12px;border:none;border-radius:4px;cursor:pointer;font-size:0.8rem;font-weight:500;';
  area.innerHTML = `
    <form id="record-payment-form" data-project-id="${escapeHtml(projectId)}" style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-end;">
      <div>
        <label style="font-size:0.7rem;color:var(--text-secondary, #a0a0b0);display:block;">Amount *</label>
        <input type="number" name="amount" min="0" step="0.01" required style="${inlineInput}width:100px;">
      </div>
      <div>
        <label style="font-size:0.7rem;color:var(--text-secondary, #a0a0b0);display:block;">Date</label>
        <input type="date" name="date" value="${new Date().toISOString().split('T')[0]}" style="${inlineInput}width:130px;">
      </div>
      <div>
        <label style="font-size:0.7rem;color:var(--text-secondary, #a0a0b0);display:block;">Method</label>
        <select name="method" style="${inlineInput}width:110px;">
          <option value="Bank Transfer">Bank Transfer</option>
          <option value="Credit Card">Credit Card</option>
          <option value="PayPal">PayPal</option>
          <option value="Cash">Cash</option>
          <option value="Check">Check</option>
          <option value="Other">Other</option>
        </select>
      </div>
      <div>
        <label style="font-size:0.7rem;color:var(--text-secondary, #a0a0b0);display:block;">Notes</label>
        <input type="text" name="notes" placeholder="Optional" style="${inlineInput}width:120px;">
      </div>
      <button type="submit" style="${smallBtn}background:#22c55e;color:#fff;">Save</button>
      <button type="button" class="btn-cancel-payment" style="${smallBtn}background:var(--bg-input, #1e2a4a);color:var(--text-primary, #e0e0e0);border:1px solid rgba(255,255,255,0.1);">Cancel</button>
    </form>`;
}

function showLogActivityForm(projectId) {
  const project = store.getProjectById(projectId);
  if (!project) return;
  const inlineInput = 'width:100%;padding:8px;border:1px solid rgba(255,255,255,0.15);border-radius:6px;background:var(--bg-input, #1e2a4a);color:var(--text-primary, #e0e0e0);font-size:0.85rem;';
  const html = `
    <form id="project-activity-form" data-project-id="${escapeHtml(projectId)}">
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div>
          <label style="display:block;font-weight:500;margin-bottom:4px;font-size:0.85rem;color:var(--text-primary, #e0e0e0);">Type</label>
          <select name="type" style="${inlineInput}">
            <option value="Note">Note</option>
            <option value="Call">Call</option>
            <option value="Email">Email</option>
            <option value="Meeting">Meeting</option>
            <option value="Update">Update</option>
          </select>
        </div>
        <div>
          <label style="display:block;font-weight:500;margin-bottom:4px;font-size:0.85rem;color:var(--text-primary, #e0e0e0);">Description *</label>
          <textarea name="description" rows="3" required style="${inlineInput}resize:vertical;"></textarea>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button type="button" class="btn-cancel-project" style="padding:8px 16px;background:var(--bg-input, #1e2a4a);color:var(--text-primary, #e0e0e0);border:1px solid rgba(255,255,255,0.1);border-radius:6px;cursor:pointer;">Cancel</button>
          <button type="submit" style="padding:8px 20px;background:var(--accent-primary, #e94560);color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:500;">Log Activity</button>
        </div>
      </div>
    </form>`;
  window.CRM.showModal('Log Activity', html);
}

function showAddTaskForm(projectId) {
  const project = store.getProjectById(projectId);
  if (!project) return;
  const inlineInput = 'width:100%;padding:8px;border:1px solid rgba(255,255,255,0.15);border-radius:6px;background:var(--bg-input, #1e2a4a);color:var(--text-primary, #e0e0e0);font-size:0.85rem;';
  const html = `
    <form id="project-task-form" data-project-id="${escapeHtml(projectId)}">
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div>
          <label style="display:block;font-weight:500;margin-bottom:4px;font-size:0.85rem;color:var(--text-primary, #e0e0e0);">Task Title *</label>
          <input type="text" name="title" required style="${inlineInput}">
        </div>
        <div>
          <label style="display:block;font-weight:500;margin-bottom:4px;font-size:0.85rem;color:var(--text-primary, #e0e0e0);">Due Date</label>
          <input type="date" name="dueDate" style="${inlineInput}">
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button type="button" class="btn-cancel-project" style="padding:8px 16px;background:var(--bg-input, #1e2a4a);color:var(--text-primary, #e0e0e0);border:1px solid rgba(255,255,255,0.1);border-radius:6px;cursor:pointer;">Cancel</button>
          <button type="submit" style="padding:8px 20px;background:var(--accent-primary, #e94560);color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:500;">Add Task</button>
        </div>
      </div>
    </form>`;
  window.CRM.showModal('Add Task to Project', html);
}

// ---- Render ----

export function render() {
  const container = document.getElementById('section-projects');
  if (!container) return;
  const body = currentView === 'board' ? renderBoard() : renderGrid();
  container.innerHTML = renderHeader() + body;
}

// ---- Event Delegation ----

export function init() {
  const section = document.getElementById('section-projects');
  if (!section) return;

  // Section-level clicks
  section.addEventListener('click', (e) => {
    const target = e.target;

    // New Project
    if (target.closest('.btn-new-project')) {
      openProjectModal(null);
      return;
    }

    // View toggle
    const viewBtn = target.closest('.view-toggle-btn');
    if (viewBtn && viewBtn.dataset.view) {
      currentView = viewBtn.dataset.view;
      render();
      return;
    }

    // Open project detail
    const card = target.closest('.project-card');
    if (card && !target.closest('select') && !target.closest('button')) {
      openProjectDetail(card.dataset.projectId);
      return;
    }
  });

  // Status filter
  section.addEventListener('change', (e) => {
    if (e.target.id === 'project-status-filter') {
      filterStatus = e.target.value;
      render();
      return;
    }

    // Board card status change
    if (e.target.classList.contains('project-status-select')) {
      const pid = e.target.dataset.projectId;
      const newStatus = e.target.value;
      const updates = { status: newStatus };
      if (newStatus === 'Complete') updates.completedAt = new Date().toISOString();
      else updates.completedAt = null;
      store.updateProject(pid, updates);
      render();
      return;
    }
  });

  // Document-level delegation for modals
  document.addEventListener('click', (e) => {
    const target = e.target;

    // Cancel
    if (target.closest('.btn-cancel-project')) {
      window.CRM.closeModal();
      return;
    }

    // Edit project from detail
    const editBtn = target.closest('.btn-edit-project');
    if (editBtn) {
      window.CRM.closeModal();
      openProjectModal(editBtn.dataset.projectId);
      return;
    }

    // Delete project
    const deleteBtn = target.closest('.btn-delete-project');
    if (deleteBtn) {
      if (confirm('Delete this project? This cannot be undone.')) {
        store.removeProject(deleteBtn.dataset.projectId);
        window.CRM.closeModal();
        window.CRM.showToast('Project deleted');
        render();
      }
      return;
    }

    // Milestone toggle
    const mileToggle = target.closest('.milestone-toggle');
    if (mileToggle) {
      const pid = mileToggle.dataset.projectId;
      const mid = mileToggle.dataset.milestoneId;
      const project = store.getProjectById(pid);
      if (project) {
        const milestones = (project.milestones || []).map(m =>
          m.id === mid ? { ...m, completed: !m.completed } : m
        );
        store.updateProject(pid, { milestones });
        openProjectDetail(pid);
      }
      return;
    }

    // Milestone delete
    const mileDel = target.closest('.milestone-delete');
    if (mileDel) {
      const pid = mileDel.dataset.projectId;
      const mid = mileDel.dataset.milestoneId;
      const project = store.getProjectById(pid);
      if (project) {
        const milestones = (project.milestones || []).filter(m => m.id !== mid);
        store.updateProject(pid, { milestones });
        openProjectDetail(pid);
      }
      return;
    }

    // Add milestone
    const addMile = target.closest('.btn-add-milestone');
    if (addMile) {
      const pid = addMile.dataset.projectId;
      const nameInput = document.getElementById('milestone-name');
      const dateInput = document.getElementById('milestone-date');
      const name = nameInput ? nameInput.value.trim() : '';
      if (!name) { window.CRM.showToast('Milestone name required', 'error'); return; }
      const project = store.getProjectById(pid);
      if (project) {
        const milestones = [...(project.milestones || []), {
          id: generateId(),
          name,
          dueDate: dateInput ? dateInput.value || null : null,
          completed: false,
        }];
        store.updateProject(pid, { milestones });
        openProjectDetail(pid);
      }
      return;
    }

    // Checklist toggle
    const checkToggle = target.closest('.checklist-toggle');
    if (checkToggle) {
      const pid = checkToggle.dataset.projectId;
      const iid = checkToggle.dataset.itemId;
      const project = store.getProjectById(pid);
      if (project) {
        const checklist = (project.checklist || []).map(item =>
          item.id === iid ? { ...item, completed: !item.completed } : item
        );
        store.updateProject(pid, { checklist });
        openProjectDetail(pid);
      }
      return;
    }

    // Checklist delete
    const checkDel = target.closest('.checklist-delete');
    if (checkDel) {
      const pid = checkDel.dataset.projectId;
      const iid = checkDel.dataset.itemId;
      const project = store.getProjectById(pid);
      if (project) {
        const checklist = (project.checklist || []).filter(item => item.id !== iid);
        store.updateProject(pid, { checklist });
        openProjectDetail(pid);
      }
      return;
    }

    // Add checklist item
    const addCheck = target.closest('.btn-add-checklist');
    if (addCheck) {
      const pid = addCheck.dataset.projectId;
      const textInput = document.getElementById('checklist-text');
      const text = textInput ? textInput.value.trim() : '';
      if (!text) { window.CRM.showToast('Checklist item text required', 'error'); return; }
      const project = store.getProjectById(pid);
      if (project) {
        const checklist = [...(project.checklist || []), { id: generateId(), text, completed: false }];
        store.updateProject(pid, { checklist });
        openProjectDetail(pid);
      }
      return;
    }

    // Show payment form
    const showPayBtn = target.closest('.btn-show-payment-form');
    if (showPayBtn) {
      showPaymentForm(showPayBtn.dataset.projectId);
      return;
    }

    // Cancel payment form
    if (target.closest('.btn-cancel-payment')) {
      const pid = target.closest('form')?.dataset?.projectId;
      if (pid) openProjectDetail(pid);
      return;
    }

    // Delete payment
    const payDel = target.closest('.payment-delete');
    if (payDel) {
      store.removePayment(payDel.dataset.paymentId);
      window.CRM.showToast('Payment removed');
      openProjectDetail(payDel.dataset.projectId);
      return;
    }

    // Log activity
    const logBtn = target.closest('.btn-log-activity');
    if (logBtn) {
      showLogActivityForm(logBtn.dataset.projectId);
      return;
    }

    // Add task
    const taskBtn = target.closest('.btn-add-task');
    if (taskBtn) {
      showAddTaskForm(taskBtn.dataset.projectId);
      return;
    }

    // Detail modal status change
    // (handled by change listener below)

    // Contact link navigation
    const cLink = target.closest('.contact-link');
    if (cLink) {
      e.preventDefault();
      window.CRM.closeModal();
      window.CRM.navigate('contacts', cLink.dataset.contactId);
      return;
    }
  });

  // Change events for detail modal status select
  document.addEventListener('change', (e) => {
    if (e.target.classList.contains('detail-status-select')) {
      const pid = e.target.dataset.projectId;
      const newStatus = e.target.value;
      const updates = { status: newStatus };
      if (newStatus === 'Complete') updates.completedAt = new Date().toISOString();
      else updates.completedAt = null;
      store.updateProject(pid, updates);
      window.CRM.showToast(`Status changed to ${newStatus}`);
      render();
      openProjectDetail(pid);
    }
  });

  // Form submissions
  document.addEventListener('submit', (e) => {
    if (e.target.id === 'project-form') {
      e.preventDefault();
      handleProjectFormSubmit(e.target);
      return;
    }

    if (e.target.id === 'record-payment-form') {
      e.preventDefault();
      const form = e.target;
      const pid = form.dataset.projectId;
      const project = store.getProjectById(pid);
      if (!project) return;
      const amount = parseFloat(form.amount.value);
      if (!amount || amount <= 0) { window.CRM.showToast('Enter a valid amount', 'error'); return; }
      store.addPayment({
        projectId: pid,
        dealId: project.dealId || null,
        contactId: project.contactId || null,
        amount,
        date: form.date.value || new Date().toISOString().split('T')[0],
        method: form.method.value || '',
        notes: form.notes.value.trim(),
      });
      window.CRM.showToast('Payment recorded');
      openProjectDetail(pid);
      return;
    }

    if (e.target.id === 'project-activity-form') {
      e.preventDefault();
      const form = e.target;
      const pid = form.dataset.projectId;
      const desc = form.description.value.trim();
      if (!desc) return;
      store.addActivity({
        entityType: 'project',
        entityId: pid,
        type: form.type.value,
        description: desc,
      });
      window.CRM.showToast('Activity logged');
      openProjectDetail(pid);
      return;
    }

    if (e.target.id === 'project-task-form') {
      e.preventDefault();
      const form = e.target;
      const pid = form.dataset.projectId;
      const title = form.title.value.trim();
      if (!title) return;
      store.addTask({
        entityType: 'project',
        entityId: pid,
        title,
        dueDate: form.dueDate.value || null,
        completed: false,
      });
      window.CRM.showToast('Task added');
      window.CRM.updateTaskBadge();
      openProjectDetail(pid);
      return;
    }
  });

  render();
}
