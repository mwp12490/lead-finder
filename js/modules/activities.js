// activities.js - Enhanced Activity utility module with discussed/next steps/follow-up

import { store } from './store.js';
import { escapeHtml, timeAgo, formatDate } from './utils.js';

function activityIcon(type) {
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

function resolveEntityName(activity) {
  if (activity.contactId) {
    const contact = store.getContactById(activity.contactId);
    return contact ? contact.name : '';
  }
  if (activity.leadId) {
    const lead = store.getLeadById(activity.leadId);
    return lead ? lead.name : '';
  }
  if (activity.dealId) {
    const deal = store.getDealById(activity.dealId);
    return deal ? deal.name : '';
  }
  if (activity.projectId) {
    const project = store.getProjectById(activity.projectId);
    return project ? project.name : '';
  }
  return '';
}

export function renderTimeline(containerId, entityType, entityId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const activities = store.getActivitiesFor(entityType, entityId)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  if (activities.length === 0) {
    container.innerHTML = '<p class="text-muted">No activities yet.</p>';
    return;
  }

  container.innerHTML = `
    <div class="activity-timeline">
      ${activities.map(a => {
        let extras = '';
        if (a.discussed) {
          extras += `<div style="margin-top:4px;font-size:0.8rem;color:#a0a0b0;"><strong style="color:#e0e0e0;">Discussed:</strong> ${escapeHtml(a.discussed)}</div>`;
        }
        if (a.nextSteps) {
          extras += `<div style="margin-top:2px;font-size:0.8rem;color:#a0a0b0;"><strong style="color:#0ea5e9;">Next Steps:</strong> ${escapeHtml(a.nextSteps)}</div>`;
        }
        if (a.followUpDate) {
          const isOverdue = a.followUpDate < new Date().toISOString().slice(0, 10);
          extras += `<div style="margin-top:2px;"><span style="display:inline-block;padding:1px 8px;border-radius:4px;font-size:0.72rem;font-weight:600;background:${isOverdue ? 'rgba(239,68,68,0.15)' : 'rgba(14,165,233,0.15)'};color:${isOverdue ? '#ef4444' : '#0ea5e9'};">Follow-up: ${formatDate(a.followUpDate)}${isOverdue ? ' (overdue)' : ''}</span></div>`;
        }
        return `
          <div class="activity-item">
            ${activityIcon(a.type)}
            <div class="activity-content">
              <div class="activity-summary">${escapeHtml(a.summary)}</div>
              <div class="activity-meta">${timeAgo(a.timestamp)} &middot; ${escapeHtml(a.type)}${a.duration ? ' &middot; ' + a.duration + ' min' : ''}</div>
              ${a.details ? `<div class="activity-details">${escapeHtml(a.details)}</div>` : ''}
              ${extras}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

export function renderActivityFeed(containerId, limit) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const activities = store.getActivities()
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit || 20);

  if (activities.length === 0) {
    container.innerHTML = '<p class="text-muted">No recent activity.</p>';
    return;
  }

  container.innerHTML = `
    <div class="activity-feed">
      ${activities.map(a => {
        const entityName = resolveEntityName(a);
        let condensedExtras = '';
        if (a.nextSteps) {
          condensedExtras = ` <span style="color:#0ea5e9;font-size:0.75rem;">&rarr; ${escapeHtml(a.nextSteps.substring(0, 60))}${a.nextSteps.length > 60 ? '...' : ''}</span>`;
        }
        if (a.followUpDate) {
          const isOverdue = a.followUpDate < new Date().toISOString().slice(0, 10);
          condensedExtras += ` <span style="padding:1px 6px;border-radius:3px;font-size:0.65rem;font-weight:600;background:${isOverdue ? 'rgba(239,68,68,0.15)' : 'rgba(14,165,233,0.1)'};color:${isOverdue ? '#ef4444' : '#0ea5e9'};">F/U: ${a.followUpDate}</span>`;
        }
        return `
          <div class="activity-item">
            ${activityIcon(a.type)}
            <div class="activity-content">
              <div class="activity-summary">${escapeHtml(a.summary)}${condensedExtras}</div>
              <div class="activity-meta">
                ${entityName ? escapeHtml(entityName) + ' &middot; ' : ''}${timeAgo(a.timestamp)}
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

export function showLogActivityForm(entityType, entityId, defaultType) {
  const types = ['call', 'email', 'meeting', 'note'];
  const selectedType = defaultType || 'call';

  return `
    <div class="activity-form">
      <div class="form-row">
        <select class="activity-type-select" data-field="type">
          ${types.map(t => `<option value="${t}" ${t === selectedType ? 'selected' : ''}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join('')}
        </select>
        <input type="text" placeholder="Summary..." class="activity-summary-input" data-field="summary">
      </div>
      <textarea placeholder="Details (optional)..." class="activity-details-input" data-field="details"></textarea>
      <div class="form-row">
        <input type="number" placeholder="Duration (min)" class="activity-duration-input" data-field="duration" min="0">
      </div>

      <div style="margin-top:0.75rem;padding-top:0.75rem;border-top:1px solid rgba(255,255,255,0.06);">
        <div style="font-size:0.78rem;font-weight:600;color:#a0a0b0;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.5rem;">Enhanced Tracking</div>
        <textarea placeholder="What was discussed?" class="activity-discussed-input" data-field="discussed" rows="2" style="width:100%;margin-bottom:0.5rem;padding:0.5rem;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:6px;color:#e0e0e0;font-family:inherit;font-size:0.85rem;resize:vertical;"></textarea>
        <textarea placeholder="Next steps..." class="activity-nextsteps-input" data-field="nextSteps" rows="2" style="width:100%;margin-bottom:0.5rem;padding:0.5rem;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:6px;color:#e0e0e0;font-family:inherit;font-size:0.85rem;resize:vertical;"></textarea>
        <div style="display:flex;align-items:center;gap:0.5rem;">
          <label style="font-size:0.82rem;color:#a0a0b0;white-space:nowrap;">Follow-up date:</label>
          <input type="date" class="activity-followup-input" data-field="followUpDate" style="flex:1;padding:0.4rem;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:6px;color:#e0e0e0;font-family:inherit;font-size:0.85rem;">
          <span style="font-size:0.7rem;color:#a0a0b0;">Auto-creates a task</span>
        </div>
      </div>

      <div class="form-row" style="margin-top:0.75rem;">
        <button class="btn btn-primary btn-sm save-activity-btn" data-action="save-activity" data-entity-type="${entityType}" data-entity-id="${entityId}">Log Activity</button>
      </div>
    </div>
  `;
}

/**
 * Collect activity form data and save to store.
 * Called by parent modules that embed the activity form.
 */
export function saveActivityFromForm(formContainer, entityType, entityId) {
  if (!formContainer) return null;

  const type = formContainer.querySelector('[data-field="type"]')?.value || 'other';
  const summary = formContainer.querySelector('[data-field="summary"]')?.value?.trim();
  const details = formContainer.querySelector('[data-field="details"]')?.value?.trim() || '';
  const duration = formContainer.querySelector('[data-field="duration"]')?.value || null;
  const discussed = formContainer.querySelector('[data-field="discussed"]')?.value?.trim() || '';
  const nextSteps = formContainer.querySelector('[data-field="nextSteps"]')?.value?.trim() || '';
  const followUpDate = formContainer.querySelector('[data-field="followUpDate"]')?.value || null;

  if (!summary) {
    window.CRM.showToast('Please enter a summary.', 'error');
    return null;
  }

  const activityData = {
    type,
    summary,
    details,
    duration: duration ? parseInt(duration) : null,
    discussed,
    nextSteps,
    followUpDate,
  };

  // Set the entity link
  if (entityType === 'contact') activityData.contactId = entityId;
  else if (entityType === 'lead') activityData.leadId = entityId;
  else if (entityType === 'deal') activityData.dealId = entityId;
  else if (entityType === 'project') activityData.projectId = entityId;

  const activity = store.addActivity(activityData);

  // Auto-create follow-up task if date is set
  if (followUpDate) {
    store.addTask({
      title: `Follow up: ${summary}`,
      dueDate: followUpDate,
      description: nextSteps || `Follow up on: ${summary}`,
      [entityType + 'Id']: entityId,
      priority: 'medium',
      isAutoGenerated: true,
    });
    if (typeof window.CRM.updateTaskBadge === 'function') {
      window.CRM.updateTaskBadge();
    }
  }

  return activity;
}

export function init() {
  // Activities module has no standalone section.
}

export function render() {
  // Activities do not have their own section.
}
