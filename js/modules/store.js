// store.js - Central data layer for the CRM application

import { generateId } from './utils.js';

const KEYS = {
  leads: 'crm_leads',
  contacts: 'crm_contacts',
  deals: 'crm_deals',
  activities: 'crm_activities',
  tasks: 'crm_tasks',
  settings: 'crm_settings',
  notes: 'crm_notes',
  tags: 'crm_tags',
  projects: 'crm_projects',
  payments: 'crm_payments',
};

const OLD_KEYS = {
  leads: 'leadfinder_leads',
  apiKey: 'leadfinder_gapi_key',
};

const DEAL_STAGES = ['Qualification', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost'];
const ACTIVITY_TYPES = ['call', 'email', 'meeting', 'note', 'other'];
const TASK_PRIORITIES = ['low', 'medium', 'high'];
const PROJECT_STATUSES = ['Not Started', 'In Progress', 'Review', 'Complete'];
const PAYMENT_STATUSES = ['Unpaid', 'Partial', 'Paid'];

// In-memory cache - parsed once on init, written on every mutation
let cache = {
  leads: [],
  contacts: [],
  deals: [],
  activities: [],
  tasks: [],
  settings: { apiKey: '', userName: '', businessName: '', hunterApiKey: '', yelpApiKey: '', claudeApiKey: '', setupComplete: false },
  notes: [],
  tags: [],
  projects: [],
  payments: [],
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
    cache.settings = load(KEYS.settings, { apiKey: '', userName: '', businessName: '', hunterApiKey: '', yelpApiKey: '', claudeApiKey: '', setupComplete: false });
    cache.notes = load(KEYS.notes, []);
    cache.tags = load(KEYS.tags, []);
    cache.projects = load(KEYS.projects, []);
    cache.payments = load(KEYS.payments, []);

    // Run migration from old format if needed
    if (cache.leads.length === 0 && localStorage.getItem(KEYS.leads) === null) {
      migrate();
    }
  },

  // ---- Generic getter ----
  get(section) {
    return cache[section] || [];
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

  getProjects() {
    return cache.projects;
  },

  getPayments() {
    return cache.payments;
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

  getProjectById(id) {
    return cache.projects.find(p => p.id === id) || null;
  },

  getPaymentById(id) {
    return cache.payments.find(p => p.id === id) || null;
  },

  // ---- Relational queries ----

  getActivitiesFor(entityType, entityId) {
    const key = entityType + 'Id'; // contactId, leadId, dealId, or projectId
    return cache.activities.filter(a => a[key] === entityId);
  },

  getTasksFor(entityType, entityId) {
    const key = entityType + 'Id';
    return cache.tasks.filter(t => t[key] === entityId);
  },

  getDealsForContact(contactId) {
    return cache.deals.filter(d => d.contactId === contactId);
  },

  getProjectsForDeal(dealId) {
    return cache.projects.filter(p => p.dealId === dealId);
  },

  getProjectsForContact(contactId) {
    return cache.projects.filter(p => p.contactId === contactId);
  },

  getPaymentsForProject(projectId) {
    return cache.payments.filter(p => p.projectId === projectId);
  },

  getPaymentsForDeal(dealId) {
    return cache.payments.filter(p => p.dealId === dealId);
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
      // Enhanced contact fields
      email: lead.email || '',
      facebook: lead.facebook || '',
      instagram: lead.instagram || '',
      linkedin: lead.linkedin || '',
      yelp: lead.yelp || '',
      decisionMaker: lead.decisionMaker || '',
      decisionMakerTitle: lead.decisionMakerTitle || '',
      source: lead.source || 'google',
      hunterResults: lead.hunterResults || null,
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
      // Proposal fields
      proposalSent: deal.proposalSent || false,
      proposalDate: deal.proposalDate || null,
      proposalNotes: deal.proposalNotes || '',
      closeReason: deal.closeReason || '',
      closeNotes: deal.closeNotes || '',
      // Payment tracking
      paymentStatus: deal.paymentStatus || 'Unpaid',
      totalPaid: deal.totalPaid || 0,
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
      projectId: activity.projectId || null,
      summary: activity.summary || '',
      details: activity.details || '',
      timestamp: activity.timestamp || new Date().toISOString(),
      duration: activity.duration || null,
      // Enhanced fields
      discussed: activity.discussed || '',
      nextSteps: activity.nextSteps || '',
      followUpDate: activity.followUpDate || null,
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
      projectId: task.projectId || null,
      dueDate: task.dueDate || null,
      completed: task.completed || false,
      completedAt: task.completedAt || null,
      priority: TASK_PRIORITIES.includes(task.priority) ? task.priority : 'medium',
      createdAt: task.createdAt || now,
      isAutoGenerated: task.isAutoGenerated || false,
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

  // ---- Projects ----

  addProject(project) {
    const now = new Date().toISOString();
    const entry = {
      id: project.id || generateId(),
      name: project.name || '',
      dealId: project.dealId || null,
      contactId: project.contactId || null,
      status: PROJECT_STATUSES.includes(project.status) ? project.status : PROJECT_STATUSES[0],
      services: project.services || [],
      value: project.value || 0,
      startDate: project.startDate || null,
      dueDate: project.dueDate || null,
      completedAt: project.completedAt || null,
      notes: project.notes || '',
      milestones: project.milestones || [],
      checklist: project.checklist || [],
      createdAt: project.createdAt || now,
      updatedAt: project.updatedAt || now,
    };
    cache.projects.push(entry);
    persist('projects');
    return entry;
  },

  updateProject(id, updates) {
    const idx = cache.projects.findIndex(p => p.id === id);
    if (idx === -1) return null;
    updates.updatedAt = new Date().toISOString();
    if (updates.status === 'Complete' && !cache.projects[idx].completedAt) {
      updates.completedAt = new Date().toISOString();
    }
    Object.assign(cache.projects[idx], updates);
    persist('projects');
    return cache.projects[idx];
  },

  removeProject(id) {
    const idx = cache.projects.findIndex(p => p.id === id);
    if (idx === -1) return false;
    cache.projects.splice(idx, 1);
    persist('projects');
    return true;
  },

  // ---- Payments ----

  addPayment(payment) {
    const now = new Date().toISOString();
    const entry = {
      id: payment.id || generateId(),
      projectId: payment.projectId || null,
      dealId: payment.dealId || null,
      contactId: payment.contactId || null,
      amount: payment.amount || 0,
      date: payment.date || now.slice(0, 10),
      method: payment.method || '',
      notes: payment.notes || '',
      createdAt: payment.createdAt || now,
    };
    cache.payments.push(entry);
    persist('payments');
    return entry;
  },

  removePayment(id) {
    const idx = cache.payments.findIndex(p => p.id === id);
    if (idx === -1) return false;
    cache.payments.splice(idx, 1);
    persist('payments');
    return true;
  },

  // ---- Notes ----

  getNotes() {
    return cache.notes;
  },

  addNote(note) {
    const entry = {
      id: note.id || generateId(),
      entityType: note.entityType || '',
      entityId: note.entityId || '',
      text: note.text || '',
      createdAt: note.createdAt || new Date().toISOString(),
    };
    cache.notes.push(entry);
    persist('notes');
    return entry;
  },

  getNotesFor(entityType, entityId) {
    return cache.notes
      .filter(n => n.entityType === entityType && n.entityId === entityId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  removeNote(id) {
    const idx = cache.notes.findIndex(n => n.id === id);
    if (idx === -1) return false;
    cache.notes.splice(idx, 1);
    persist('notes');
    return true;
  },

  // ---- Tags ----

  TAG_COLORS: ['#e94560', '#0ea5e9', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'],

  getTags() {
    return cache.tags;
  },

  getTagById(id) {
    return cache.tags.find(t => t.id === id) || null;
  },

  addTag(tag) {
    const entry = {
      id: tag.id || generateId(),
      name: tag.name || '',
      color: tag.color || '#0ea5e9',
    };
    cache.tags.push(entry);
    persist('tags');
    return entry;
  },

  removeTag(id) {
    const idx = cache.tags.findIndex(t => t.id === id);
    if (idx === -1) return false;
    cache.tags.splice(idx, 1);
    persist('tags');
    return true;
  },

  // ---- Settings ----

  updateSettings(updates) {
    Object.assign(cache.settings, updates);
    persist('settings');
    return cache.settings;
  },

  // ---- Smart Reminders ----

  generateSmartReminders() {
    const reminders = [];
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Leads in "Contacted" with no activity for 3+ days
    cache.leads.filter(l => l.savedAt && l.status === 'Contacted').forEach(lead => {
      const activities = this.getActivitiesFor('lead', lead.id);
      const lastActivity = activities.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))[0];
      if (!lastActivity || new Date(lastActivity.timestamp) < threeDaysAgo) {
        reminders.push({
          type: 'follow_up_lead',
          entity: lead,
          entityType: 'lead',
          message: `Follow up with ${lead.name || 'Unnamed Lead'} - contacted ${lastActivity ? Math.floor((now - new Date(lastActivity.timestamp)) / 86400000) + ' days ago' : 'but no activity logged'}`,
          priority: 'high',
          section: 'leads',
        });
      }
    });

    // Deals in "Proposal" for 7+ days
    cache.deals.filter(d => d.stage === 'Proposal').forEach(deal => {
      if (deal.updatedAt && new Date(deal.updatedAt) < sevenDaysAgo) {
        const contact = this.getContactById(deal.contactId);
        reminders.push({
          type: 'stale_proposal',
          entity: deal,
          entityType: 'deal',
          message: `Proposal for "${deal.name}" (${contact ? contact.name : 'Unknown'}) has been waiting ${Math.floor((now - new Date(deal.updatedAt)) / 86400000)} days`,
          priority: 'medium',
          section: 'deals',
        });
      }
    });

    // Uncontacted leads (saved but still "New" for 2+ days)
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    cache.leads.filter(l => l.savedAt && (!l.status || l.status === 'New')).forEach(lead => {
      if (new Date(lead.savedAt) < twoDaysAgo) {
        reminders.push({
          type: 'uncontacted_lead',
          entity: lead,
          entityType: 'lead',
          message: `${lead.name || 'Unnamed Lead'} saved ${Math.floor((now - new Date(lead.savedAt)) / 86400000)} days ago but never contacted`,
          priority: 'low',
          section: 'leads',
        });
      }
    });

    // Overdue project milestones
    cache.projects.filter(p => p.status !== 'Complete').forEach(project => {
      (project.milestones || []).forEach(ms => {
        if (ms.dueDate && ms.dueDate < todayStr && !ms.completed) {
          reminders.push({
            type: 'overdue_milestone',
            entity: project,
            entityType: 'project',
            message: `Milestone "${ms.name}" for project "${project.name}" is overdue (due ${ms.dueDate})`,
            priority: 'high',
            section: 'projects',
          });
        }
      });
    });

    return reminders;
  },
};
