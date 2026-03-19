// calendar.js - Calendar view module with task pills and follow-up suggestions

import { store } from './store.js';
import { escapeHtml, formatDate, formatCurrency } from './utils.js';

const PRIORITY_COLORS = {
  high:   '#ef4444',
  medium: '#f59e0b',
  low:    '#3b82f6',
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let selectedDate = null;

// ---- Calendar Generation ----

function generateCalendar(year, month) {
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells = [];

  // Previous month's trailing days
  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, otherMonth: true, date: null });
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, otherMonth: false, date: dateStr });
  }

  // Next month's leading days to complete the last row
  while (cells.length % 7 !== 0) {
    cells.push({ day: cells.length - firstDay - daysInMonth + 1, otherMonth: true, date: null });
  }

  return cells;
}

// ---- Data Helpers ----

function getTasksForDate(dateStr) {
  if (!dateStr) return [];
  return store.getTasks().filter(t => t.dueDate === dateStr);
}

function getFollowUpSuggestions() {
  const leads = store.getLeads().filter(l => l.savedAt && l.status === 'Contacted');
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  return leads.filter(lead => {
    const activities = store.getActivitiesFor('lead', lead.id);
    if (!activities.length) return true;
    const lastActivity = activities.sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
    return new Date(lastActivity.timestamp) < threeDaysAgo;
  });
}

function getTodayStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// ---- Rendering ----

function renderHeader() {
  return `
    <div class="section-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:16px;">
      <h2 style="margin:0;font-size:1.4rem;">Calendar</h2>
      <div style="display:flex;align-items:center;gap:8px;">
        <button class="cal-nav-prev" style="padding:6px 12px;background:rgba(255,255,255,0.08);color:#e0e0e0;border:1px solid rgba(255,255,255,0.12);border-radius:6px;cursor:pointer;font-size:1rem;" title="Previous month">&larr;</button>
        <button class="cal-nav-today" style="padding:6px 14px;background:rgba(255,255,255,0.08);color:#e0e0e0;border:1px solid rgba(255,255,255,0.12);border-radius:6px;cursor:pointer;font-size:0.85rem;font-weight:500;">Today</button>
        <button class="cal-nav-next" style="padding:6px 12px;background:rgba(255,255,255,0.08);color:#e0e0e0;border:1px solid rgba(255,255,255,0.12);border-radius:6px;cursor:pointer;font-size:1rem;" title="Next month">&rarr;</button>
      </div>
    </div>
    <div style="text-align:center;margin-bottom:16px;">
      <span style="font-size:1.15rem;font-weight:600;color:#e0e0e0;">${MONTH_NAMES[currentMonth]} ${currentYear}</span>
    </div>`;
}

function renderPill(text, color, dimmed) {
  const opacity = dimmed ? '0.5' : '1';
  const textDecor = dimmed ? 'text-decoration:line-through;' : '';
  return `<div style="padding:1px 6px;border-radius:4px;font-size:0.65rem;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;background:${color};color:#fff;opacity:${opacity};${textDecor}">${escapeHtml(text)}</div>`;
}

function renderDayCell(cell, todayStr, followUps) {
  const isToday = cell.date === todayStr;
  const isSelected = cell.date === selectedDate;

  let bgColor = 'transparent';
  if (isToday) bgColor = 'rgba(37,99,235,0.15)';
  if (isSelected) bgColor = 'rgba(37,99,235,0.25)';

  const textColor = cell.otherMonth ? '#555' : '#e0e0e0';
  const todayBorder = isToday ? 'border:1px solid #2563eb;' : 'border:1px solid rgba(255,255,255,0.06);';
  const cursor = cell.date ? 'cursor:pointer;' : '';

  // Gather items for this cell
  const items = [];

  if (cell.date) {
    const tasks = getTasksForDate(cell.date);
    for (const task of tasks) {
      const color = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium;
      items.push({ text: task.title || 'Untitled', color, dimmed: !!task.completed });
    }

    // Show follow-up suggestions on today's cell
    if (cell.date === todayStr) {
      for (const lead of followUps) {
        items.push({ text: `Follow up: ${lead.name || 'Unnamed'}`, color: '#f59e0b', dimmed: false });
      }
    }
  }

  const maxShow = 3;
  const visibleItems = items.slice(0, maxShow);
  const overflow = items.length - maxShow;

  const pillsHtml = visibleItems.map(item => renderPill(item.text, item.color, item.dimmed)).join('');
  const overflowHtml = overflow > 0 ? `<div style="font-size:0.6rem;color:#a0a0b0;margin-top:1px;">+${overflow} more</div>` : '';

  return `
    <div class="calendar-day${cell.otherMonth ? ' other-month' : ''}${isToday ? ' today' : ''}"
         data-date="${cell.date || ''}"
         style="min-height:80px;padding:4px 6px;background:${bgColor};${todayBorder}border-radius:6px;${cursor}transition:background 0.15s;">
      <div style="font-size:0.8rem;font-weight:${isToday ? '700' : '500'};color:${textColor};margin-bottom:2px;">${cell.day}</div>
      <div style="display:flex;flex-direction:column;gap:2px;">
        ${pillsHtml}
        ${overflowHtml}
      </div>
    </div>`;
}

function renderCalendarGrid() {
  const cells = generateCalendar(currentYear, currentMonth);
  const todayStr = getTodayStr();
  const followUps = getFollowUpSuggestions();

  const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const headersHtml = dayHeaders.map(d =>
    `<div class="calendar-header" style="padding:8px 4px;text-align:center;font-size:0.75rem;font-weight:600;color:#a0a0b0;text-transform:uppercase;">${d}</div>`
  ).join('');

  const cellsHtml = cells.map(cell => renderDayCell(cell, todayStr, followUps)).join('');

  return `
    <div class="calendar-grid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:16px;">
      ${headersHtml}
      ${cellsHtml}
    </div>`;
}

function renderDayDetail() {
  if (!selectedDate) return '';

  const tasks = getTasksForDate(selectedDate);
  const todayStr = getTodayStr();
  const followUps = selectedDate === todayStr ? getFollowUpSuggestions() : [];
  const dateLabel = formatDate(selectedDate + 'T00:00:00');

  let content = '';

  if (tasks.length === 0 && followUps.length === 0) {
    content = '<div style="text-align:center;padding:16px;color:#9ca3af;font-size:0.9rem;">No tasks or follow-ups for this day.</div>';
  } else {
    if (tasks.length > 0) {
      content += '<h4 style="margin:0 0 8px 0;font-size:0.9rem;color:#e0e0e0;">Tasks</h4>';
      content += tasks.map(task => {
        const priorityColor = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium;
        const completedStyle = task.completed ? 'text-decoration:line-through;opacity:0.5;' : '';
        const entityLabel = getTaskEntityLabel(task);
        return `
          <div class="day-detail-task" data-task-id="${escapeHtml(task.id)}" style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:6px;margin-bottom:4px;cursor:pointer;">
            <span style="width:8px;height:8px;border-radius:50%;background:${priorityColor};flex-shrink:0;"></span>
            <div style="flex:1;min-width:0;${completedStyle}">
              <div style="font-size:0.85rem;font-weight:500;color:#e0e0e0;">${escapeHtml(task.title || 'Untitled')}</div>
              ${task.description ? `<div style="font-size:0.75rem;color:#a0a0b0;margin-top:2px;">${escapeHtml(task.description)}</div>` : ''}
              ${entityLabel ? `<div style="font-size:0.7rem;color:#6b9bd2;margin-top:2px;">${entityLabel}</div>` : ''}
            </div>
            <span style="font-size:0.7rem;color:#a0a0b0;text-transform:capitalize;">${escapeHtml(task.priority || 'medium')}</span>
          </div>`;
      }).join('');
    }

    if (followUps.length > 0) {
      content += '<h4 style="margin:12px 0 8px 0;font-size:0.9rem;color:#f59e0b;">Follow-up Suggestions</h4>';
      content += followUps.map(lead => `
        <div class="day-detail-followup" data-lead-id="${escapeHtml(lead.id)}" style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:6px;margin-bottom:4px;cursor:pointer;">
          <span style="width:8px;height:8px;border-radius:50%;background:#f59e0b;flex-shrink:0;"></span>
          <div style="flex:1;min-width:0;">
            <div style="font-size:0.85rem;font-weight:500;color:#e0e0e0;">${escapeHtml(lead.name || 'Unnamed Lead')}</div>
            <div style="font-size:0.7rem;color:#a0a0b0;">Status: Contacted &mdash; No recent activity</div>
          </div>
        </div>`
      ).join('');
    }
  }

  return `
    <div class="day-detail-panel" style="padding:16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h3 style="margin:0;font-size:1rem;color:#e0e0e0;">${dateLabel}</h3>
        <button class="btn-add-task-for-date" data-date="${escapeHtml(selectedDate)}" style="padding:6px 14px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:0.8rem;font-weight:500;">+ Add Task</button>
      </div>
      ${content}
    </div>`;
}

function getTaskEntityLabel(task) {
  if (task.contactId) {
    const c = store.getContactById(task.contactId);
    if (c) return `Re: ${c.name || c.businessName || 'Unnamed'}`;
  }
  if (task.leadId) {
    const l = store.getLeadById(task.leadId);
    if (l) return `Re: ${l.name || 'Unnamed Lead'}`;
  }
  if (task.dealId) {
    const d = store.getDealById(task.dealId);
    if (d) return `Re: ${d.name || 'Unnamed Deal'}`;
  }
  return '';
}

// ---- Public API ----

export function render() {
  const container = document.getElementById('section-calendar');
  if (!container) return;

  container.innerHTML = renderHeader() + renderCalendarGrid() + renderDayDetail();
}

export function init() {
  const section = document.getElementById('section-calendar');
  if (!section) return;

  section.addEventListener('click', (e) => {
    const target = e.target;

    // Previous month
    if (target.closest('.cal-nav-prev')) {
      currentMonth--;
      if (currentMonth < 0) { currentMonth = 11; currentYear--; }
      selectedDate = null;
      render();
      return;
    }

    // Next month
    if (target.closest('.cal-nav-next')) {
      currentMonth++;
      if (currentMonth > 11) { currentMonth = 0; currentYear++; }
      selectedDate = null;
      render();
      return;
    }

    // Today button
    if (target.closest('.cal-nav-today')) {
      const now = new Date();
      currentMonth = now.getMonth();
      currentYear = now.getFullYear();
      selectedDate = getTodayStr();
      render();
      return;
    }

    // Day cell click
    const dayCell = target.closest('.calendar-day');
    if (dayCell) {
      const date = dayCell.dataset.date;
      if (date) {
        selectedDate = selectedDate === date ? null : date;
        render();
      }
      return;
    }

    // Add task for selected date
    const addTaskBtn = target.closest('.btn-add-task-for-date');
    if (addTaskBtn) {
      const date = addTaskBtn.dataset.date;
      if (window.CRM.openTaskModalForDate) {
        window.CRM.openTaskModalForDate(date);
      } else if (window.CRM.showModal) {
        openQuickTaskModal(date);
      }
      return;
    }

    // Follow-up click -> navigate to lead
    const followupEl = target.closest('.day-detail-followup');
    if (followupEl) {
      const leadId = followupEl.dataset.leadId;
      if (leadId && window.CRM.navigate) {
        window.CRM.navigate('leads', leadId);
      }
      return;
    }

    // Task detail click -> navigate to tasks
    const taskDetailEl = target.closest('.day-detail-task');
    if (taskDetailEl) {
      const taskId = taskDetailEl.dataset.taskId;
      if (taskId && window.CRM.navigate) {
        window.CRM.navigate('tasks', taskId);
      }
      return;
    }
  });

  render();
}

// ---- Quick Task Modal ----

function openQuickTaskModal(date) {
  const html = `
    <form id="calendar-task-form">
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div>
          <label style="display:block;font-weight:500;margin-bottom:4px;font-size:0.85rem;">Title *</label>
          <input type="text" name="title" required style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;">
        </div>
        <div>
          <label style="display:block;font-weight:500;margin-bottom:4px;font-size:0.85rem;">Due Date</label>
          <input type="date" name="dueDate" value="${escapeHtml(date)}" required style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;">
        </div>
        <div>
          <label style="display:block;font-weight:500;margin-bottom:4px;font-size:0.85rem;">Priority</label>
          <select name="priority" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;">
            <option value="low">Low</option>
            <option value="medium" selected>Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px;">
          <button type="button" class="btn-cancel-cal-task" style="padding:8px 16px;background:#f3f4f6;color:#374151;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;">Cancel</button>
          <button type="submit" style="padding:8px 20px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:500;">Create Task</button>
        </div>
      </div>
    </form>`;

  window.CRM.showModal('New Task', html);
}

// Modal-level event delegation (calendar-specific forms)
document.addEventListener('click', (e) => {
  if (e.target.closest('.btn-cancel-cal-task')) {
    window.CRM.closeModal();
  }
});

document.addEventListener('submit', (e) => {
  if (e.target.id === 'calendar-task-form') {
    e.preventDefault();
    const form = e.target;
    const title = form.title.value.trim();
    const dueDate = form.dueDate.value;
    if (!title || !dueDate) return;

    store.addTask({
      title,
      dueDate,
      priority: form.priority.value,
    });

    window.CRM.closeModal();
    window.CRM.showToast('Task created');
    render();

    if (typeof window.CRM.updateTaskBadge === 'function') {
      window.CRM.updateTaskBadge();
    }
  }
});
