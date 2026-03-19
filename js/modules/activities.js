// activities.js - Activity utility module for the CRM application

import { store } from './store.js';
import { escapeHtml, timeAgo } from './utils.js';

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
      ${activities.map(a => `
        <div class="activity-item">
          ${activityIcon(a.type)}
          <div class="activity-content">
            <div class="activity-summary">${escapeHtml(a.summary)}</div>
            <div class="activity-meta">${timeAgo(a.timestamp)} &middot; ${escapeHtml(a.type)}${a.duration ? ' &middot; ' + a.duration + ' min' : ''}</div>
            ${a.details ? `<div class="activity-details">${escapeHtml(a.details)}</div>` : ''}
          </div>
        </div>
      `).join('')}
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
        return `
          <div class="activity-item">
            ${activityIcon(a.type)}
            <div class="activity-content">
              <div class="activity-summary">${escapeHtml(a.summary)}</div>
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
        <input type="number" placeholder="Duration (min)" class="activity-duration-input" data-field="duration">
        <button class="btn btn-primary btn-sm save-activity-btn" data-action="save-activity" data-entity-type="${entityType}" data-entity-id="${entityId}">Log Activity</button>
      </div>
    </div>
  `;
}

export function init() {
  // No-op: activities module has no standalone section or event listeners.
  // Activity form save handling is managed by the parent module that embeds the form.
}

export function render() {
  // No-op: activities do not have their own section.
}
