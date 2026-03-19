// tasks.js - Task management module with dashboard sections

import { store } from './store.js';
import { escapeHtml, generateId, formatDate, formatDateTime, timeAgo, formatCurrency } from './utils.js';

const PRIORITY_COLORS = {
  high:   '#ef4444',
  medium: '#f59e0b',
  low:    '#22c55e',
};

let showCompleted = false;

// ---- Helpers ----

function getTaskSections() {
  const tasks = store.getTasks().filter(t => !t.completed);
  const today = new Date().toISOString().slice(0, 10);
  return {
    overdue: tasks.filter(t => t.dueDate < today).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    today: tasks.filter(t => t.dueDate === today),
    upcoming: tasks.filter(t => t.dueDate > today).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    completed: store.getTasks().filter(t => t.completed).sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || '')).slice(0, 10),
  };
}

function linkedEntityLabel(task) {
  if (task.contactId) {
    const c = store.getContactById(task.contactId);
    if (c) {
      const name = escapeHtml(c.name || c.businessName || 'Unnamed');
      return `<a href="#" class="task-entity-link" data-nav="contacts" data-entity-id="${escapeHtml(c.id)}" style="font-size:0.75rem;color:#2563eb;text-decoration:none;">Re: ${name}</a>`;
    }
  }
  if (task.leadId) {
    const l = store.getLeadById(task.leadId);
    if (l) {
      const name = escapeHtml(l.name || 'Unnamed Lead');
      return `<a href="#" class="task-entity-link" data-nav="leads" data-entity-id="${escapeHtml(l.id)}" style="font-size:0.75rem;color:#2563eb;text-decoration:none;">Re: ${name}</a>`;
    }
  }
  if (task.dealId) {
    const d = store.getDealById(task.dealId);
    if (d) {
      const name = escapeHtml(d.name || 'Unnamed Deal');
      return `<a href="#" class="task-entity-link" data-nav="deals" data-entity-id="${escapeHtml(d.id)}" style="font-size:0.75rem;color:#2563eb;text-decoration:none;">Re: ${name}</a>`;
    }
  }
  return '';
}

function isOverdue(dueDate) {
  if (!dueDate) return false;
  return dueDate < new Date().toISOString().slice(0, 10);
}

function renderTaskCard(task) {
  const priorityColor = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium;
  const overdue = !task.completed && isOverdue(task.dueDate);
  const entity = linkedEntityLabel(task);

  return `
    <div class="task-card" data-task-id="${escapeHtml(task.id)}" style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:6px;">
      <input type="checkbox" class="task-checkbox" data-task-id="${escapeHtml(task.id)}" ${task.completed ? 'checked' : ''} style="margin-top:3px;cursor:pointer;width:16px;height:16px;accent-color:#2563eb;flex-shrink:0;">
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:6px;">
          <span class="priority-dot" style="width:8px;height:8px;border-radius:50%;background:${priorityColor};flex-shrink:0;"></span>
          <span class="task-title" style="font-weight:500;font-size:0.9rem;${task.completed ? 'text-decoration:line-through;color:#9ca3af;' : ''}">${escapeHtml(task.title)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px;margin-top:4px;flex-wrap:wrap;">
          ${task.dueDate ? `<span style="font-size:0.75rem;${overdue ? 'color:#ef4444;font-weight:600;' : 'color:#6b7280;'}">${formatDate(task.dueDate)}${overdue ? ' (overdue)' : ''}</span>` : ''}
          ${entity}
        </div>
      </div>
      <button class="btn-delete-task" data-task-id="${escapeHtml(task.id)}" title="Delete task" style="background:none;border:none;color:#d1d5db;cursor:pointer;font-size:1rem;line-height:1;padding:2px 6px;flex-shrink:0;">&times;</button>
    </div>`;
}

function renderSection(title, tasks, bgTint, badgeColor) {
  if (tasks.length === 0) return '';

  return `
    <div class="task-section" style="margin-bottom:20px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:8px 12px;background:${bgTint};border-radius:6px;">
        <h3 style="margin:0;font-size:0.95rem;">${title}</h3>
        <span style="background:${badgeColor};color:#fff;padding:1px 10px;border-radius:9999px;font-size:0.75rem;font-weight:600;">${tasks.length}</span>
      </div>
      <div class="task-list">
        ${tasks.map(t => renderTaskCard(t)).join('')}
      </div>
    </div>`;
}

// ---- Render ----

function renderHeader() {
  const incompleteCount = store.getTasks().filter(t => !t.completed).length;

  return `
    <div class="section-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:16px;">
      <h2 style="margin:0;font-size:1.4rem;">Tasks <span style="font-size:0.9rem;font-weight:400;color:#6b7280;">(${incompleteCount} pending)</span></h2>
      <button class="btn-new-task" style="padding:8px 16px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:0.85rem;font-weight:500;">+ New Task</button>
    </div>`;
}

function renderDashboard() {
  const sections = getTaskSections();

  const overdueHtml = renderSection('Overdue', sections.overdue, '#fef2f2', '#ef4444');
  const todayHtml = renderSection('Today', sections.today, '#fffbeb', '#f59e0b');
  const upcomingHtml = renderSection('Upcoming', sections.upcoming, '#f9fafb', '#6b7280');

  const completedToggle = sections.completed.length > 0 ? `
    <div class="task-section" style="margin-bottom:20px;">
      <button class="btn-toggle-completed" style="display:flex;align-items:center;gap:8px;width:100%;padding:8px 12px;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:6px;cursor:pointer;text-align:left;font-size:0.9rem;font-weight:500;color:#6b7280;">
        <span style="transform:rotate(${showCompleted ? '90' : '0'}deg);transition:transform 0.2s;">&#9654;</span>
        Recently Completed
        <span style="background:#9ca3af;color:#fff;padding:1px 10px;border-radius:9999px;font-size:0.75rem;font-weight:600;">${sections.completed.length}</span>
      </button>
      ${showCompleted ? `<div class="task-list" style="margin-top:8px;">${sections.completed.map(t => renderTaskCard(t)).join('')}</div>` : ''}
    </div>` : '';

  const empty = sections.overdue.length === 0 && sections.today.length === 0 && sections.upcoming.length === 0 && sections.completed.length === 0;

  if (empty) {
    return '<div style="text-align:center;padding:48px 16px;color:#9ca3af;font-size:0.95rem;">No tasks yet. Create one to get started.</div>';
  }

  return overdueHtml + todayHtml + upcomingHtml + completedToggle;
}

export function render() {
  const container = document.getElementById('section-tasks');
  if (!container) return;

  container.innerHTML = renderHeader() + renderDashboard();
}

// ---- Create/Edit Modal ----

function openTaskModal(taskId) {
  const task = taskId ? store.getTasks().find(t => t.id === taskId) : null;
  const isEdit = !!task;

  const contacts = store.getContacts();
  const leads = store.getLeads();
  const deals = store.getDeals();

  // Determine current link type
  let linkType = 'none';
  let linkEntityId = '';
  if (task) {
    if (task.contactId) { linkType = 'contact'; linkEntityId = task.contactId; }
    else if (task.leadId) { linkType = 'lead'; linkEntityId = task.leadId; }
    else if (task.dealId) { linkType = 'deal'; linkEntityId = task.dealId; }
  }

  function entityOptions(items, selectedId, labelFn) {
    return items.map(item => {
      const selected = item.id === selectedId ? 'selected' : '';
      return `<option value="${escapeHtml(item.id)}" ${selected}>${escapeHtml(labelFn(item))}</option>`;
    }).join('');
  }

  const contactOpts = entityOptions(contacts, linkEntityId, c => c.name || c.businessName || 'Unnamed');
  const leadOpts = entityOptions(leads, linkEntityId, l => l.name || 'Unnamed Lead');
  const dealOpts = entityOptions(deals, linkEntityId, d => d.name || 'Unnamed Deal');

  const html = `
    <form id="task-form" data-task-id="${task ? escapeHtml(task.id) : ''}">
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div>
          <label style="display:block;font-weight:500;margin-bottom:4px;font-size:0.85rem;">Title *</label>
          <input type="text" name="title" value="${task ? escapeHtml(task.title) : ''}" required style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;">
        </div>
        <div>
          <label style="display:block;font-weight:500;margin-bottom:4px;font-size:0.85rem;">Description</label>
          <textarea name="description" rows="3" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;resize:vertical;">${task ? escapeHtml(task.description || '') : ''}</textarea>
        </div>
        <div>
          <label style="display:block;font-weight:500;margin-bottom:4px;font-size:0.85rem;">Due Date *</label>
          <input type="date" name="dueDate" value="${task ? (task.dueDate || '') : ''}" required style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;">
        </div>
        <div>
          <label style="display:block;font-weight:500;margin-bottom:4px;font-size:0.85rem;">Priority</label>
          <select name="priority" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;">
            <option value="low" ${task && task.priority === 'low' ? 'selected' : ''}>Low</option>
            <option value="medium" ${!task || task.priority === 'medium' ? 'selected' : ''}>Medium</option>
            <option value="high" ${task && task.priority === 'high' ? 'selected' : ''}>High</option>
          </select>
        </div>
        <div>
          <label style="display:block;font-weight:500;margin-bottom:4px;font-size:0.85rem;">Link To</label>
          <div style="display:flex;gap:8px;">
            <select name="linkType" id="task-link-type" style="padding:8px;border:1px solid #d1d5db;border-radius:6px;min-width:120px;">
              <option value="none" ${linkType === 'none' ? 'selected' : ''}>None</option>
              <option value="contact" ${linkType === 'contact' ? 'selected' : ''}>Contact</option>
              <option value="lead" ${linkType === 'lead' ? 'selected' : ''}>Lead</option>
              <option value="deal" ${linkType === 'deal' ? 'selected' : ''}>Deal</option>
            </select>
            <select name="linkEntity" id="task-link-entity" style="flex:1;padding:8px;border:1px solid #d1d5db;border-radius:6px;${linkType === 'none' ? 'display:none;' : ''}">
              <option value="">Select...</option>
              <optgroup label="Contacts" class="entity-group-contact" ${linkType !== 'contact' ? 'style="display:none;"' : ''}>${contactOpts}</optgroup>
              <optgroup label="Leads" class="entity-group-lead" ${linkType !== 'lead' ? 'style="display:none;"' : ''}>${leadOpts}</optgroup>
              <optgroup label="Deals" class="entity-group-deal" ${linkType !== 'deal' ? 'style="display:none;"' : ''}>${dealOpts}</optgroup>
            </select>
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px;">
          <button type="button" class="btn-cancel-task" style="padding:8px 16px;background:#f3f4f6;color:#374151;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;">Cancel</button>
          <button type="submit" style="padding:8px 20px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:500;">${isEdit ? 'Update' : 'Create'} Task</button>
        </div>
      </div>
    </form>`;

  window.CRM.showModal(isEdit ? 'Edit Task' : 'New Task', html);

  // Wire up the link type dropdown to toggle entity list
  requestAnimationFrame(() => {
    const linkTypeSelect = document.getElementById('task-link-type');
    const linkEntitySelect = document.getElementById('task-link-entity');
    if (linkTypeSelect && linkEntitySelect) {
      linkTypeSelect.addEventListener('change', () => {
        const val = linkTypeSelect.value;
        if (val === 'none') {
          linkEntitySelect.style.display = 'none';
          linkEntitySelect.value = '';
        } else {
          linkEntitySelect.style.display = '';
          // Show only the relevant optgroup
          linkEntitySelect.querySelectorAll('optgroup').forEach(og => {
            og.style.display = 'none';
            og.querySelectorAll('option').forEach(o => o.disabled = true);
          });
          const activeGroup = linkEntitySelect.querySelector(`.entity-group-${val}`);
          if (activeGroup) {
            activeGroup.style.display = '';
            activeGroup.querySelectorAll('option').forEach(o => o.disabled = false);
          }
          linkEntitySelect.value = '';
        }
      });
    }
  });
}

function handleTaskFormSubmit(form) {
  const taskId = form.dataset.taskId;
  const title = form.title.value.trim();
  const dueDate = form.dueDate.value;
  if (!title || !dueDate) return;

  const linkType = form.linkType.value;
  const linkEntity = form.linkEntity ? form.linkEntity.value : '';

  const data = {
    title,
    description: form.description.value.trim(),
    dueDate,
    priority: form.priority.value,
    contactId: linkType === 'contact' ? linkEntity : null,
    leadId: linkType === 'lead' ? linkEntity : null,
    dealId: linkType === 'deal' ? linkEntity : null,
  };

  if (taskId) {
    store.updateTask(taskId, data);
    window.CRM.showToast('Task updated');
  } else {
    store.addTask(data);
    window.CRM.showToast('Task created');
  }

  window.CRM.closeModal();
  render();
  updateBadge();
}

function updateBadge() {
  if (typeof window.CRM.updateTaskBadge === 'function') {
    window.CRM.updateTaskBadge();
  }
}

// ---- Event Delegation ----

export function init() {
  const section = document.getElementById('section-tasks');
  if (!section) return;

  section.addEventListener('click', (e) => {
    const target = e.target;

    // New Task button
    if (target.closest('.btn-new-task')) {
      openTaskModal(null);
      return;
    }

    // Toggle completed section
    if (target.closest('.btn-toggle-completed')) {
      showCompleted = !showCompleted;
      render();
      return;
    }

    // Delete task
    const delBtn = target.closest('.btn-delete-task');
    if (delBtn) {
      e.stopPropagation();
      const taskId = delBtn.dataset.taskId;
      store.removeTask(taskId);
      window.CRM.showToast('Task deleted');
      render();
      updateBadge();
      return;
    }

    // Entity link navigation
    const entityLink = target.closest('.task-entity-link');
    if (entityLink) {
      e.preventDefault();
      const nav = entityLink.dataset.nav;
      const entityId = entityLink.dataset.entityId;
      if (nav && window.CRM.navigate) {
        window.CRM.navigate(nav, entityId);
      }
      return;
    }

    // Click on task card to edit (but not on checkbox or delete)
    const card = target.closest('.task-card');
    if (card && !target.closest('.task-checkbox') && !target.closest('.btn-delete-task')) {
      openTaskModal(card.dataset.taskId);
      return;
    }
  });

  // Checkbox toggle
  section.addEventListener('change', (e) => {
    if (e.target.classList.contains('task-checkbox')) {
      const taskId = e.target.dataset.taskId;
      const checked = e.target.checked;
      store.updateTask(taskId, { completed: checked });
      window.CRM.showToast(checked ? 'Task completed' : 'Task reopened');
      render();
      updateBadge();
    }
  });

  // Modal-level event delegation
  document.addEventListener('click', (e) => {
    if (e.target.closest('.btn-cancel-task')) {
      window.CRM.closeModal();
      return;
    }
  });

  document.addEventListener('submit', (e) => {
    if (e.target.id === 'task-form') {
      e.preventDefault();
      handleTaskFormSubmit(e.target);
      return;
    }
  });

  render();
}
