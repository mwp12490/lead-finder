// store.js - Central data layer for the CRM application

import { generateId } from './utils.js';

const KEYS = {
  leads: 'crm_leads',
  contacts: 'crm_contacts',
  deals: 'crm_deals',
  activities: 'crm_activities',
  tasks: 'crm_tasks',
  settings: 'crm_settings',
};

const OLD_KEYS = {
  leads: 'leadfinder_leads',
  apiKey: 'leadfinder_gapi_key',
};

const DEAL_STAGES = ['Qualification', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost'];
const ACTIVITY_TYPES = ['call', 'email', 'meeting', 'note', 'other'];
const TASK_PRIORITIES = ['low', 'medium', 'high'];

// In-memory cache - parsed once on init, written on every mutation
let cache = {
  leads: [],
  contacts: [],
  deals: [],
  activities: [],
  tasks: [],
  settings: { apiKey: '', userName: '', businessName: '' },
};

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function persist(section) {
  localStorage.setItem(KEYS[section], JSON.stringify(cache[section]));
}

function migrate() {
  // If crm_leads already exists, migration has been done (or is not needed)
  if (localStorage.getItem(KEYS.leads) !== null) return;

  const oldLeads = load(OLD_KEYS.leads, null);
  if (oldLeads && Array.isArray(oldLeads)) {
    cache.leads = oldLeads;
    persist('leads');
  }

  const oldApiKey = localStorage.getItem(OLD_KEYS.apiKey);
  if (oldApiKey) {
    cache.settings.apiKey = oldApiKey;
    persist('settings');
  }
  // Old keys are intentionally kept as backup
}

export const store = {
  // ---- Lifecycle ----

  init() {
    cache.leads = load(KEYS.leads, []);
    cache.contacts = load(KEYS.contacts, []);
    cache.deals = load(KEYS.deals, []);
    cache.activities = load(KEYS.activities, []);
    cache.tasks = load(KEYS.tasks, []);
    cache.settings = load(KEYS.settings, { apiKey: '', userName: '', businessName: '' });

    // Run migration from old format if needed
    if (cache.leads.length === 0 && localStorage.getItem(KEYS.leads) === null) {
      migrate();
    }
  },

  // ---- Getters ----

  getLeads() {
    return cache.leads;
  },

  getContacts() {
    return cache.contacts;
  },

  getDeals() {
    return cache.deals;
  },

  getActivities() {
    return cache.activities;
  },

  getTasks() {
    return cache.tasks;
  },

  getSettings() {
    return cache.settings;
  },

  // ---- By-ID lookups ----

  getLeadById(id) {
    return cache.leads.find(l => l.id === id) || null;
  },

  getContactById(id) {
    return cache.contacts.find(c => c.id === id) || null;
  },

  getDealById(id) {
    return cache.deals.find(d => d.id === id) || null;
  },

  // ---- Relational queries ----

  getActivitiesFor(entityType, entityId) {
    const key = entityType + 'Id'; // contactId, leadId, or dealId
    return cache.activities.filter(a => a[key] === entityId);
  },

  getTasksFor(entityType, entityId) {
    const key = entityType + 'Id';
    return cache.tasks.filter(t => t[key] === entityId);
  },

  getDealsForContact(contactId) {
    return cache.deals.filter(d => d.contactId === contactId);
  },

  // ---- Leads ----

  addLead(lead) {
    const entry = {
      id: lead.id || generateId(),
      name: lead.name || '',
      address: lead.address || '',
      rating: lead.rating || null,
      reviewCount: lead.reviewCount || 0,
      priceLevel: lead.priceLevel || null,
      category: lead.category || '',
      city: lead.city || '',
      isOpen: lead.isOpen ?? null,
      photo: lead.photo || '',
      types: lead.types || [],
      lat: lead.lat || null,
      lng: lead.lng || null,
      phone: lead.phone || '',
      website: lead.website || '',
      hours: lead.hours || null,
      enriched: lead.enriched || false,
      savedAt: lead.savedAt || new Date().toISOString(),
      notes: lead.notes || '',
      status: lead.status || '',
      convertedToContactId: lead.convertedToContactId || null,
      tags: lead.tags || [],
      lastActivityAt: lead.lastActivityAt || null,
    };
    cache.leads.push(entry);
    persist('leads');
    return entry;
  },

  updateLead(id, updates) {
    const idx = cache.leads.findIndex(l => l.id === id);
    if (idx === -1) return null;
    Object.assign(cache.leads[idx], updates);
    persist('leads');
    return cache.leads[idx];
  },

  removeLead(id) {
    const idx = cache.leads.findIndex(l => l.id === id);
    if (idx === -1) return false;
    cache.leads.splice(idx, 1);
    persist('leads');
    return true;
  },

  // ---- Contacts ----

  addContact(contact) {
    const now = new Date().toISOString();
    const entry = {
      id: contact.id || generateId(),
      name: contact.name || '',
      businessName: contact.businessName || '',
      email: contact.email || '',
      phone: contact.phone || '',
      website: contact.website || '',
      address: contact.address || '',
      city: contact.city || '',
      category: contact.category || '',
      notes: contact.notes || '',
      tags: contact.tags || [],
      createdAt: contact.createdAt || now,
      updatedAt: contact.updatedAt || now,
      sourceLeadId: contact.sourceLeadId || null,
      originalRating: contact.originalRating || null,
      originalReviewCount: contact.originalReviewCount || null,
      originalScore: contact.originalScore || null,
    };
    cache.contacts.push(entry);
    persist('contacts');
    return entry;
  },

  updateContact(id, updates) {
    const idx = cache.contacts.findIndex(c => c.id === id);
    if (idx === -1) return null;
    updates.updatedAt = new Date().toISOString();
    Object.assign(cache.contacts[idx], updates);
    persist('contacts');
    return cache.contacts[idx];
  },

  removeContact(id) {
    const idx = cache.contacts.findIndex(c => c.id === id);
    if (idx === -1) return false;
    cache.contacts.splice(idx, 1);
    persist('contacts');
    return true;
  },

  // ---- Deals ----

  addDeal(deal) {
    const now = new Date().toISOString();
    const entry = {
      id: deal.id || generateId(),
      name: deal.name || '',
      contactId: deal.contactId || null,
      value: deal.value || 0,
      stage: DEAL_STAGES.includes(deal.stage) ? deal.stage : DEAL_STAGES[0],
      expectedCloseDate: deal.expectedCloseDate || null,
      notes: deal.notes || '',
      createdAt: deal.createdAt || now,
      updatedAt: deal.updatedAt || now,
      closedAt: deal.closedAt || null,
      services: deal.services || [],
    };
    cache.deals.push(entry);
    persist('deals');
    return entry;
  },

  updateDeal(id, updates) {
    const idx = cache.deals.findIndex(d => d.id === id);
    if (idx === -1) return null;
    updates.updatedAt = new Date().toISOString();
    // Auto-set closedAt when moving to a closed stage
    if (updates.stage && (updates.stage === 'Closed Won' || updates.stage === 'Closed Lost') && !cache.deals[idx].closedAt) {
      updates.closedAt = new Date().toISOString();
    }
    Object.assign(cache.deals[idx], updates);
    persist('deals');
    return cache.deals[idx];
  },

  removeDeal(id) {
    const idx = cache.deals.findIndex(d => d.id === id);
    if (idx === -1) return false;
    cache.deals.splice(idx, 1);
    persist('deals');
    return true;
  },

  // ---- Activities ----

  addActivity(activity) {
    const entry = {
      id: activity.id || generateId(),
      type: ACTIVITY_TYPES.includes(activity.type) ? activity.type : 'other',
      contactId: activity.contactId || null,
      leadId: activity.leadId || null,
      dealId: activity.dealId || null,
      summary: activity.summary || '',
      details: activity.details || '',
      timestamp: activity.timestamp || new Date().toISOString(),
      duration: activity.duration || null,
    };
    cache.activities.push(entry);
    persist('activities');
    return entry;
  },

  // ---- Tasks ----

  addTask(task) {
    const now = new Date().toISOString();
    const entry = {
      id: task.id || generateId(),
      title: task.title || '',
      description: task.description || '',
      contactId: task.contactId || null,
      leadId: task.leadId || null,
      dealId: task.dealId || null,
      dueDate: task.dueDate || null,
      completed: task.completed || false,
      completedAt: task.completedAt || null,
      priority: TASK_PRIORITIES.includes(task.priority) ? task.priority : 'medium',
      createdAt: task.createdAt || now,
    };
    cache.tasks.push(entry);
    persist('tasks');
    return entry;
  },

  updateTask(id, updates) {
    const idx = cache.tasks.findIndex(t => t.id === id);
    if (idx === -1) return null;
    // Auto-set completedAt when marking complete
    if (updates.completed === true && !cache.tasks[idx].completedAt) {
      updates.completedAt = new Date().toISOString();
    } else if (updates.completed === false) {
      updates.completedAt = null;
    }
    Object.assign(cache.tasks[idx], updates);
    persist('tasks');
    return cache.tasks[idx];
  },

  removeTask(id) {
    const idx = cache.tasks.findIndex(t => t.id === id);
    if (idx === -1) return false;
    cache.tasks.splice(idx, 1);
    persist('tasks');
    return true;
  },

  // ---- Settings ----

  updateSettings(updates) {
    Object.assign(cache.settings, updates);
    persist('settings');
    return cache.settings;
  },
};
