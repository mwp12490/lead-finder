// ai.js - AI Assistant module for the CRM application

import { store } from './store.js';
import { escapeHtml, formatDate, formatCurrency } from './utils.js';

// ---- State ----

let currentTool = null;
let chatHistory = [];
let isLoading = false;
let lastResult = null;
let lastToolConfig = null; // stores params for regenerate

// ---- Styles ----

const STYLES = {
    card: 'background:#16213e;border-radius:12px;padding:24px;cursor:pointer;transition:transform 0.15s,box-shadow 0.15s;border:1px solid rgba(255,255,255,0.06);',
    cardHover: 'transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,0.3);',
    btn: 'background:#e94560;color:#fff;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;transition:opacity 0.15s;',
    btnSecondary: 'background:#0ea5e9;color:#fff;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;transition:opacity 0.15s;',
    btnOutline: 'background:transparent;color:#0ea5e9;border:1px solid #0ea5e9;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:500;transition:background 0.15s;',
    select: 'background:#0f1a30;color:#e0e0e0;border:1px solid rgba(255,255,255,0.1);padding:10px 14px;border-radius:8px;font-size:14px;width:100%;',
    textarea: 'background:#0f1a30;color:#e0e0e0;border:1px solid rgba(255,255,255,0.1);padding:12px;border-radius:8px;font-size:14px;width:100%;min-height:120px;resize:vertical;font-family:inherit;',
    resultBox: 'background:#0f1a30;border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:20px;white-space:pre-wrap;line-height:1.7;font-size:14px;color:#d0d0d0;',
    heading: 'color:#fff;font-size:20px;font-weight:700;margin:0 0 6px;',
    subtext: 'color:#8899aa;font-size:13px;margin:0;',
    label: 'color:#aab;font-size:13px;font-weight:600;margin-bottom:6px;display:block;',
    spinner: 'display:inline-block;width:18px;height:18px;border:2px solid rgba(255,255,255,0.2);border-top-color:#e94560;border-radius:50%;animation:aispin 0.6s linear infinite;',
};

// ---- Claude API Helper ----

async function callClaude(systemPrompt, userMessage) {
    const apiKey = store.getSettings().claudeApiKey;
    if (!apiKey) {
        window.CRM.showToast('Please add your Claude API key in Settings', 'error');
        return null;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            system: systemPrompt,
            messages: [{ role: 'user', content: userMessage }],
        }),
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return data.content[0].text;
}

async function callClaudeChat(systemPrompt, messages) {
    const apiKey = store.getSettings().claudeApiKey;
    if (!apiKey) {
        window.CRM.showToast('Please add your Claude API key in Settings', 'error');
        return null;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            system: systemPrompt,
            messages,
        }),
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return data.content[0].text;
}

// ---- Pipeline summary for context ----

function getPipelineSummary() {
    const leads = store.getLeads();
    const contacts = store.getContacts();
    const deals = store.getDeals();
    const tasks = store.getTasks();
    const openDeals = deals.filter(d => d.stage !== 'Closed Won' && d.stage !== 'Closed Lost');
    const wonDeals = deals.filter(d => d.stage === 'Closed Won');
    const overdueTasks = tasks.filter(t => !t.completedAt && t.dueDate && new Date(t.dueDate) < new Date());

    return `Pipeline Overview:
- Total Leads: ${leads.length}
- Total Contacts: ${contacts.length}
- Open Deals: ${openDeals.length} (value: ${formatCurrency(openDeals.reduce((s, d) => s + (Number(d.value) || 0), 0))})
- Won Deals: ${wonDeals.length} (value: ${formatCurrency(wonDeals.reduce((s, d) => s + (Number(d.value) || 0), 0))})
- Total Tasks: ${tasks.length}, Overdue: ${overdueTasks.length}
- Deal Stages: ${['Qualification', 'Proposal', 'Negotiation'].map(st => `${st}: ${deals.filter(d => d.stage === st).length}`).join(', ')}`;
}

// ---- Copy to clipboard helper ----

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        window.CRM.showToast('Copied to clipboard', 'success');
    }).catch(() => {
        window.CRM.showToast('Failed to copy', 'error');
    });
}

// ---- Spinner keyframe injection ----

function ensureSpinnerStyle() {
    if (document.getElementById('ai-spin-style')) return;
    const style = document.createElement('style');
    style.id = 'ai-spin-style';
    style.textContent = '@keyframes aispin{to{transform:rotate(360deg)}}';
    document.head.appendChild(style);
}

// ---- Tool card icon SVGs ----

function toolIcon(name) {
    const icons = {
        outreach: '<svg width="28" height="28" fill="none" stroke="#e94560" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
        coach: '<svg width="28" height="28" fill="none" stroke="#0ea5e9" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
        meeting: '<svg width="28" height="28" fill="none" stroke="#22c55e" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
        proposal: '<svg width="28" height="28" fill="none" stroke="#f59e0b" stroke-width="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>',
        focus: '<svg width="28" height="28" fill="none" stroke="#a855f7" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
        followup: '<svg width="28" height="28" fill="none" stroke="#ec4899" stroke-width="2" viewBox="0 0 24 24"><polyline points="9,11 12,14 22,4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>',
    };
    return icons[name] || '';
}

// ---- Loading & result rendering helpers ----

function loadingHtml(message) {
    return `<div style="text-align:center;padding:40px 20px;">
        <div style="${STYLES.spinner}"></div>
        <p style="color:#8899aa;margin-top:14px;font-size:14px;">${escapeHtml(message || 'Thinking...')}</p>
    </div>`;
}

function resultHtml(text, showRegenerate = true) {
    const escaped = escapeHtml(text);
    return `<div style="${STYLES.resultBox}">${escaped}</div>
    <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;">
        <button onclick="document.dispatchEvent(new CustomEvent('ai-copy'))" style="${STYLES.btnSecondary}">Copy to Clipboard</button>
        ${showRegenerate ? `<button onclick="document.dispatchEvent(new CustomEvent('ai-regenerate'))" style="${STYLES.btnOutline}">Regenerate</button>` : ''}
        <button onclick="document.dispatchEvent(new CustomEvent('ai-back'))" style="${STYLES.btnOutline}">Back to Tools</button>
    </div>`;
}

function errorHtml(message) {
    return `<div style="background:rgba(233,69,96,0.1);border:1px solid #e94560;border-radius:8px;padding:16px;color:#e94560;font-size:14px;">
        <strong>Error:</strong> ${escapeHtml(message)}
    </div>
    <div style="margin-top:14px;">
        <button onclick="document.dispatchEvent(new CustomEvent('ai-regenerate'))" style="${STYLES.btn}">Try Again</button>
        <button onclick="document.dispatchEvent(new CustomEvent('ai-back'))" style="${STYLES.btnOutline};margin-left:10px;">Back to Tools</button>
    </div>`;
}

// ---- No API key view ----

function renderNoApiKey() {
    return `<div style="text-align:center;padding:60px 20px;max-width:480px;margin:0 auto;">
        <svg width="48" height="48" fill="none" stroke="#e94560" stroke-width="2" viewBox="0 0 24 24" style="margin-bottom:16px;">
            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
        </svg>
        <h2 style="color:#fff;font-size:22px;margin:0 0 10px;">Claude API Key Required</h2>
        <p style="color:#8899aa;font-size:14px;line-height:1.6;margin:0 0 24px;">
            To use AI-powered tools, add your Claude API key in Settings. You can get one from
            <a href="https://console.anthropic.com/" target="_blank" style="color:#0ea5e9;text-decoration:none;">console.anthropic.com</a>.
        </p>
        <button onclick="window.CRM.navigate('settings')" style="${STYLES.btn}">Go to Settings</button>
    </div>`;
}

// ---- Main dashboard (tool cards) ----

function renderDashboard() {
    const tools = [
        { id: 'outreach', icon: 'outreach', title: 'Write Outreach Message', desc: 'Generate personalized outreach for any lead' },
        { id: 'coach', icon: 'coach', title: 'Sales Coach Chat', desc: 'Get contextual sales and business advice' },
        { id: 'meeting', icon: 'meeting', title: 'Meeting Prep Briefing', desc: 'Prepare talking points for a contact meeting' },
        { id: 'proposal', icon: 'proposal', title: 'Proposal Generator', desc: 'Generate proposal content for a deal' },
        { id: 'focus', icon: 'focus', title: 'What Should I Focus On?', desc: 'AI analyzes your pipeline and tells you what to do today' },
        { id: 'followup', icon: 'followup', title: 'Follow-Up Message Writer', desc: 'Write contextual follow-up messages' },
    ];

    return `<div style="margin-bottom:28px;">
        <h1 style="color:#fff;font-size:26px;font-weight:800;margin:0 0 6px;">AI Assistant</h1>
        <p style="color:#8899aa;font-size:14px;margin:0;">AI-powered tools to boost your sales workflow</p>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:18px;">
        ${tools.map(t => `
            <div class="ai-tool-card" data-tool="${t.id}"
                 style="${STYLES.card}"
                 onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(0,0,0,0.3)'"
                 onmouseout="this.style.transform='';this.style.boxShadow=''">
                <div style="margin-bottom:14px;">${toolIcon(t.icon)}</div>
                <h3 style="${STYLES.heading};font-size:16px;">${escapeHtml(t.title)}</h3>
                <p style="${STYLES.subtext}">${escapeHtml(t.desc)}</p>
            </div>
        `).join('')}
    </div>`;
}

// ---- Tool: Write Outreach Message ----

function renderOutreach() {
    const leads = store.getLeads();
    const leadOptions = leads.map(l => `<option value="${l.id}">${escapeHtml(l.name)}${l.category ? ' - ' + escapeHtml(l.category) : ''}</option>`).join('');

    return `<div>
        <button onclick="document.dispatchEvent(new CustomEvent('ai-back'))" style="${STYLES.btnOutline};margin-bottom:20px;">&#8592; Back</button>
        <h2 style="${STYLES.heading}">Write Outreach Message</h2>
        <p style="${STYLES.subtext};margin-bottom:20px;">Select a lead and channel to generate a personalized message.</p>
        <div style="display:grid;gap:16px;max-width:500px;">
            <div>
                <label style="${STYLES.label}">Select Lead</label>
                <select id="ai-outreach-lead" style="${STYLES.select}">
                    <option value="">-- Choose a lead --</option>
                    ${leadOptions}
                </select>
            </div>
            <div>
                <label style="${STYLES.label}">Channel</label>
                <select id="ai-outreach-channel" style="${STYLES.select}">
                    <option value="Email">Email</option>
                    <option value="LinkedIn">LinkedIn</option>
                    <option value="Phone Script">Phone Script</option>
                </select>
            </div>
            <button id="ai-outreach-go" style="${STYLES.btn}">Generate Message</button>
        </div>
        <div id="ai-outreach-result" style="margin-top:24px;"></div>
    </div>`;
}

async function handleOutreach() {
    const leadId = document.getElementById('ai-outreach-lead')?.value;
    const channel = document.getElementById('ai-outreach-channel')?.value;
    if (!leadId) { window.CRM.showToast('Please select a lead', 'error'); return; }

    const lead = store.getLeadById(leadId);
    if (!lead) return;

    lastToolConfig = { tool: 'outreach', leadId, channel };
    const resultDiv = document.getElementById('ai-outreach-result');
    resultDiv.innerHTML = loadingHtml('Crafting your message...');
    isLoading = true;

    const systemPrompt = `You are a sales copywriting expert. Write a compelling, personalized outreach message for the specified channel. Keep it concise, professional, and natural. Don't be overly salesy. Reference specific details about the business to show you've done research. For email, include a subject line. For LinkedIn, keep it under 300 characters for connection requests. For phone scripts, include an opening, key points, and a close.`;

    const userMessage = `Write a ${channel} outreach message for this business:
- Business Name: ${lead.name}
- Category: ${lead.category || 'Unknown'}
- City: ${lead.city || 'Unknown'}
- Rating: ${lead.rating || 'N/A'} stars (${lead.reviewCount || 0} reviews)
- Website: ${lead.website || 'None listed'}
- Price Level: ${lead.priceLevel || 'N/A'}
- Status: ${lead.status || 'New lead'}
- Notes: ${lead.notes || 'None'}`;

    try {
        const result = await callClaude(systemPrompt, userMessage);
        if (result) {
            lastResult = result;
            resultDiv.innerHTML = resultHtml(result);
        }
    } catch (err) {
        resultDiv.innerHTML = errorHtml(err.message);
    }
    isLoading = false;
}

// ---- Tool: Sales Coach Chat ----

function renderCoach() {
    const messagesHtml = chatHistory.map(m => {
        const isUser = m.role === 'user';
        return `<div style="display:flex;justify-content:${isUser ? 'flex-end' : 'flex-start'};margin-bottom:12px;">
            <div style="max-width:80%;padding:12px 16px;border-radius:12px;font-size:14px;line-height:1.6;
                background:${isUser ? '#e94560' : '#16213e'};color:${isUser ? '#fff' : '#d0d0d0'};">
                ${escapeHtml(m.content)}
            </div>
        </div>`;
    }).join('');

    return `<div style="display:flex;flex-direction:column;height:calc(100vh - 200px);max-height:700px;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
            <button onclick="document.dispatchEvent(new CustomEvent('ai-back'))" style="${STYLES.btnOutline}">&#8592; Back</button>
            <div>
                <h2 style="${STYLES.heading};margin:0;">Sales Coach</h2>
                <p style="${STYLES.subtext};margin:0;">Ask anything about sales, strategy, or your pipeline</p>
            </div>
            <button onclick="document.dispatchEvent(new CustomEvent('ai-coach-clear'))" style="${STYLES.btnOutline};margin-left:auto;font-size:12px;">Clear Chat</button>
        </div>
        <div id="ai-coach-messages" style="flex:1;overflow-y:auto;padding:16px;background:#0f1a30;border-radius:8px;border:1px solid rgba(255,255,255,0.06);">
            ${messagesHtml || '<p style="color:#556;text-align:center;margin-top:40px;">Ask a question to get started...</p>'}
        </div>
        <div style="display:flex;gap:10px;margin-top:12px;">
            <input id="ai-coach-input" type="text" placeholder="Ask your sales coach..."
                   style="${STYLES.select};flex:1;" onkeydown="if(event.key==='Enter')document.dispatchEvent(new CustomEvent('ai-coach-send'))">
            <button onclick="document.dispatchEvent(new CustomEvent('ai-coach-send'))" style="${STYLES.btn}" id="ai-coach-btn">Send</button>
        </div>
    </div>`;
}

async function handleCoachSend() {
    const input = document.getElementById('ai-coach-input');
    const msg = input?.value?.trim();
    if (!msg || isLoading) return;

    chatHistory.push({ role: 'user', content: msg });
    input.value = '';
    renderCurrentView();

    const messagesDiv = document.getElementById('ai-coach-messages');
    if (messagesDiv) messagesDiv.scrollTop = messagesDiv.scrollHeight;

    isLoading = true;
    const sendBtn = document.getElementById('ai-coach-btn');
    if (sendBtn) sendBtn.textContent = '...';

    const systemPrompt = `You are an expert sales coach and business advisor embedded in a CRM app. You have deep knowledge of sales strategies, negotiation, follow-ups, pricing, and closing deals. Give practical, actionable advice. Be encouraging but honest. Keep responses concise (2-4 paragraphs max).

Here is the user's current CRM data for context:
${getPipelineSummary()}`;

    const apiMessages = chatHistory.map(m => ({ role: m.role, content: m.content }));

    try {
        const result = await callClaudeChat(systemPrompt, apiMessages);
        if (result) {
            chatHistory.push({ role: 'assistant', content: result });
        }
    } catch (err) {
        chatHistory.push({ role: 'assistant', content: `Sorry, I encountered an error: ${err.message}` });
    }

    isLoading = false;
    renderCurrentView();
    const msgs = document.getElementById('ai-coach-messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
}

// ---- Tool: Meeting Prep Briefing ----

function renderMeeting() {
    const contacts = store.getContacts();
    const contactOptions = contacts.map(c => `<option value="${c.id}">${escapeHtml(c.name)}${c.businessName ? ' - ' + escapeHtml(c.businessName) : ''}</option>`).join('');

    return `<div>
        <button onclick="document.dispatchEvent(new CustomEvent('ai-back'))" style="${STYLES.btnOutline};margin-bottom:20px;">&#8592; Back</button>
        <h2 style="${STYLES.heading}">Meeting Prep Briefing</h2>
        <p style="${STYLES.subtext};margin-bottom:20px;">Select a contact to generate a comprehensive meeting briefing.</p>
        <div style="max-width:500px;">
            <label style="${STYLES.label}">Select Contact</label>
            <select id="ai-meeting-contact" style="${STYLES.select}">
                <option value="">-- Choose a contact --</option>
                ${contactOptions}
            </select>
            <button id="ai-meeting-go" style="${STYLES.btn};margin-top:16px;">Generate Briefing</button>
        </div>
        <div id="ai-meeting-result" style="margin-top:24px;"></div>
    </div>`;
}

async function handleMeeting() {
    const contactId = document.getElementById('ai-meeting-contact')?.value;
    if (!contactId) { window.CRM.showToast('Please select a contact', 'error'); return; }

    const contact = store.getContactById(contactId);
    if (!contact) return;

    lastToolConfig = { tool: 'meeting', contactId };
    const deals = store.getDealsForContact(contactId);
    const activities = store.getActivitiesFor('contact', contactId);
    const resultDiv = document.getElementById('ai-meeting-result');
    resultDiv.innerHTML = loadingHtml('Preparing your briefing...');
    isLoading = true;

    const systemPrompt = `You are a meeting preparation specialist for a sales professional. Generate a comprehensive but concise meeting briefing. Format it with clear sections using headers (plain text, use === underlines). Include: Business Overview, Likely Pain Points, Suggested Talking Points, Pricing Recommendations, and Relationship History.`;

    const userMessage = `Prepare a meeting briefing for this contact:
- Name: ${contact.name}
- Business: ${contact.businessName || 'Unknown'}
- Category: ${contact.category || 'Unknown'}
- Email: ${contact.email || 'N/A'}
- Phone: ${contact.phone || 'N/A'}
- Website: ${contact.website || 'N/A'}
- City: ${contact.city || 'Unknown'}
- Notes: ${contact.notes || 'None'}
- Original Rating: ${contact.originalRating || 'N/A'} (${contact.originalReviewCount || 0} reviews)
- Active Deals: ${deals.length > 0 ? deals.map(d => `${d.name} (${d.stage}, ${formatCurrency(d.value)})`).join('; ') : 'None'}
- Recent Activities: ${activities.length > 0 ? activities.slice(-5).map(a => `${a.type}: ${a.description || a.notes || 'No details'} (${formatDate(a.date || a.createdAt)})`).join('; ') : 'None'}`;

    try {
        const result = await callClaude(systemPrompt, userMessage);
        if (result) {
            lastResult = result;
            resultDiv.innerHTML = resultHtml(result);
        }
    } catch (err) {
        resultDiv.innerHTML = errorHtml(err.message);
    }
    isLoading = false;
}

// ---- Tool: Proposal Generator ----

function renderProposal() {
    const deals = store.getDeals().filter(d => d.stage !== 'Closed Won' && d.stage !== 'Closed Lost');
    const dealOptions = deals.map(d => {
        const contact = d.contactId ? store.getContactById(d.contactId) : null;
        const label = `${d.name} - ${formatCurrency(d.value)}${contact ? ' (' + contact.name + ')' : ''}`;
        return `<option value="${d.id}">${escapeHtml(label)}</option>`;
    }).join('');

    return `<div>
        <button onclick="document.dispatchEvent(new CustomEvent('ai-back'))" style="${STYLES.btnOutline};margin-bottom:20px;">&#8592; Back</button>
        <h2 style="${STYLES.heading}">Proposal Generator</h2>
        <p style="${STYLES.subtext};margin-bottom:20px;">Select an open deal to generate proposal content.</p>
        <div style="max-width:500px;">
            <label style="${STYLES.label}">Select Deal</label>
            <select id="ai-proposal-deal" style="${STYLES.select}">
                <option value="">-- Choose a deal --</option>
                ${dealOptions}
            </select>
            <button id="ai-proposal-go" style="${STYLES.btn};margin-top:16px;">Generate Proposal</button>
        </div>
        <div id="ai-proposal-result" style="margin-top:24px;"></div>
    </div>`;
}

async function handleProposal() {
    const dealId = document.getElementById('ai-proposal-deal')?.value;
    if (!dealId) { window.CRM.showToast('Please select a deal', 'error'); return; }

    const deal = store.getDealById(dealId);
    if (!deal) return;

    lastToolConfig = { tool: 'proposal', dealId };
    const contact = deal.contactId ? store.getContactById(deal.contactId) : null;
    const resultDiv = document.getElementById('ai-proposal-result');
    resultDiv.innerHTML = loadingHtml('Generating proposal...');
    isLoading = true;

    const businessName = store.getSettings().businessName || 'Our Company';

    const systemPrompt = `You are a professional proposal writer for ${businessName}. Generate well-structured proposal content with these sections: Introduction, Scope of Work, Timeline, Pricing, and Next Steps. Be professional but personable. Make the proposal specific to the client and services described. Use plain text formatting with clear section headers (=== underlines). Include placeholder brackets [like this] for any details that need to be filled in.`;

    const userMessage = `Generate a proposal for this deal:
- Deal Name: ${deal.name}
- Client: ${contact ? contact.name + (contact.businessName ? ' at ' + contact.businessName : '') : 'Unknown'}
- Category: ${contact?.category || 'Unknown'}
- Deal Value: ${formatCurrency(deal.value)}
- Stage: ${deal.stage}
- Services: ${deal.services?.length ? deal.services.join(', ') : 'General services'}
- Expected Close Date: ${deal.expectedCloseDate ? formatDate(deal.expectedCloseDate) : 'TBD'}
- Notes: ${deal.notes || 'None'}
- Proposal Notes: ${deal.proposalNotes || 'None'}`;

    try {
        const result = await callClaude(systemPrompt, userMessage);
        if (result) {
            lastResult = result;
            resultDiv.innerHTML = resultHtml(result);
        }
    } catch (err) {
        resultDiv.innerHTML = errorHtml(err.message);
    }
    isLoading = false;
}

// ---- Tool: What Should I Focus On? ----

function renderFocus() {
    return `<div>
        <button onclick="document.dispatchEvent(new CustomEvent('ai-back'))" style="${STYLES.btnOutline};margin-bottom:20px;">&#8592; Back</button>
        <h2 style="${STYLES.heading}">What Should I Focus On?</h2>
        <p style="${STYLES.subtext};margin-bottom:20px;">AI will analyze your entire pipeline and tell you exactly what to prioritize today.</p>
        <button id="ai-focus-go" style="${STYLES.btn}">Analyze My Pipeline</button>
        <div id="ai-focus-result" style="margin-top:24px;"></div>
    </div>`;
}

async function handleFocus() {
    lastToolConfig = { tool: 'focus' };
    const resultDiv = document.getElementById('ai-focus-result');
    resultDiv.innerHTML = loadingHtml('Analyzing your pipeline...');
    isLoading = true;

    const leads = store.getLeads();
    const contacts = store.getContacts();
    const deals = store.getDeals();
    const tasks = store.getTasks();
    const activities = store.getActivities();

    const openDeals = deals.filter(d => d.stage !== 'Closed Won' && d.stage !== 'Closed Lost');
    const overdueTasks = tasks.filter(t => !t.completedAt && t.dueDate && new Date(t.dueDate) < new Date());
    const todayTasks = tasks.filter(t => {
        if (t.completedAt || !t.dueDate) return false;
        const due = new Date(t.dueDate).toDateString();
        return due === new Date().toDateString();
    });
    const newLeads = leads.filter(l => !l.status || l.status === '' || l.status === 'New');
    const staleContacts = contacts.filter(c => {
        const acts = store.getActivitiesFor('contact', c.id);
        if (acts.length === 0) return true;
        const lastAct = acts.sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt))[0];
        const daysSince = (Date.now() - new Date(lastAct.date || lastAct.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        return daysSince > 7;
    });
    const negotiationDeals = deals.filter(d => d.stage === 'Negotiation');
    const proposalDeals = deals.filter(d => d.stage === 'Proposal');

    const systemPrompt = `You are a sales productivity coach. Analyze the user's CRM pipeline data and give specific, actionable advice on what to focus on today. Prioritize by urgency and revenue impact. Be specific - reference actual numbers and suggest concrete next steps. Format with clear numbered priorities. Keep it concise but thorough.`;

    const userMessage = `Here's my current CRM state. What should I focus on today?

${getPipelineSummary()}

Overdue Tasks (${overdueTasks.length}):
${overdueTasks.slice(0, 10).map(t => `- ${t.title || t.description} (due: ${formatDate(t.dueDate)}, priority: ${t.priority || 'medium'})`).join('\n') || '- None'}

Today's Tasks (${todayTasks.length}):
${todayTasks.slice(0, 10).map(t => `- ${t.title || t.description} (priority: ${t.priority || 'medium'})`).join('\n') || '- None'}

Deals in Negotiation (${negotiationDeals.length}):
${negotiationDeals.map(d => `- ${d.name}: ${formatCurrency(d.value)}${d.expectedCloseDate ? ', expected close: ' + formatDate(d.expectedCloseDate) : ''}`).join('\n') || '- None'}

Deals in Proposal Stage (${proposalDeals.length}):
${proposalDeals.map(d => `- ${d.name}: ${formatCurrency(d.value)}`).join('\n') || '- None'}

New Leads Not Yet Contacted (${newLeads.length}):
${newLeads.slice(0, 10).map(l => `- ${l.name} (${l.category || 'uncategorized'}, ${l.city || 'no city'})`).join('\n') || '- None'}

Contacts With No Recent Activity (${staleContacts.length}):
${staleContacts.slice(0, 10).map(c => `- ${c.name}${c.businessName ? ' at ' + c.businessName : ''}`).join('\n') || '- None'}`;

    try {
        const result = await callClaude(systemPrompt, userMessage);
        if (result) {
            lastResult = result;
            resultDiv.innerHTML = resultHtml(result);
        }
    } catch (err) {
        resultDiv.innerHTML = errorHtml(err.message);
    }
    isLoading = false;
}

// ---- Tool: Follow-Up Message Writer ----

function renderFollowup() {
    const contacts = store.getContacts();
    const contactOptions = contacts.map(c => `<option value="${c.id}">${escapeHtml(c.name)}${c.businessName ? ' - ' + escapeHtml(c.businessName) : ''}</option>`).join('');

    return `<div>
        <button onclick="document.dispatchEvent(new CustomEvent('ai-back'))" style="${STYLES.btnOutline};margin-bottom:20px;">&#8592; Back</button>
        <h2 style="${STYLES.heading}">Follow-Up Message Writer</h2>
        <p style="${STYLES.subtext};margin-bottom:20px;">Write a contextual follow-up message based on your history with a contact.</p>
        <div style="display:grid;gap:16px;max-width:500px;">
            <div>
                <label style="${STYLES.label}">Select Contact</label>
                <select id="ai-followup-contact" style="${STYLES.select}">
                    <option value="">-- Choose a contact --</option>
                    ${contactOptions}
                </select>
            </div>
            <div>
                <label style="${STYLES.label}">Follow-Up Context</label>
                <select id="ai-followup-context" style="${STYLES.select}">
                    <option value="After Meeting">After Meeting</option>
                    <option value="After Proposal">After Proposal</option>
                    <option value="General Check-In">General Check-In</option>
                </select>
            </div>
            <button id="ai-followup-go" style="${STYLES.btn}">Generate Follow-Up</button>
        </div>
        <div id="ai-followup-result" style="margin-top:24px;"></div>
    </div>`;
}

async function handleFollowup() {
    const contactId = document.getElementById('ai-followup-contact')?.value;
    const context = document.getElementById('ai-followup-context')?.value;
    if (!contactId) { window.CRM.showToast('Please select a contact', 'error'); return; }

    const contact = store.getContactById(contactId);
    if (!contact) return;

    lastToolConfig = { tool: 'followup', contactId, context };
    const activities = store.getActivitiesFor('contact', contactId);
    const deals = store.getDealsForContact(contactId);
    const resultDiv = document.getElementById('ai-followup-result');
    resultDiv.innerHTML = loadingHtml('Writing your follow-up...');
    isLoading = true;

    const recentActivities = activities
        .sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt))
        .slice(0, 8);

    const systemPrompt = `You are an expert at writing professional follow-up messages. Write a warm, personalized follow-up email based on the context and activity history. Include a subject line. Keep it concise (3-5 short paragraphs). Reference specific past interactions to show attentiveness. End with a clear but soft call to action.`;

    const userMessage = `Write a "${context}" follow-up email for this contact:
- Name: ${contact.name}
- Business: ${contact.businessName || 'Unknown'}
- Category: ${contact.category || 'Unknown'}
- Active Deals: ${deals.length > 0 ? deals.map(d => `${d.name} (${d.stage}, ${formatCurrency(d.value)})`).join('; ') : 'None'}
- Recent Activity History:
${recentActivities.length > 0 ? recentActivities.map(a => `  - [${formatDate(a.date || a.createdAt)}] ${a.type}: ${a.description || a.notes || 'No details'}`).join('\n') : '  - No recorded activities'}
- Contact Notes: ${contact.notes || 'None'}`;

    try {
        const result = await callClaude(systemPrompt, userMessage);
        if (result) {
            lastResult = result;
            resultDiv.innerHTML = resultHtml(result);
        }
    } catch (err) {
        resultDiv.innerHTML = errorHtml(err.message);
    }
    isLoading = false;
}

// ---- Regenerate handler ----

async function handleRegenerate() {
    if (!lastToolConfig || isLoading) return;
    const cfg = lastToolConfig;

    switch (cfg.tool) {
        case 'outreach': {
            const leadSel = document.getElementById('ai-outreach-lead');
            const chanSel = document.getElementById('ai-outreach-channel');
            if (leadSel) leadSel.value = cfg.leadId;
            if (chanSel) chanSel.value = cfg.channel;
            await handleOutreach();
            break;
        }
        case 'meeting': {
            const sel = document.getElementById('ai-meeting-contact');
            if (sel) sel.value = cfg.contactId;
            await handleMeeting();
            break;
        }
        case 'proposal': {
            const sel = document.getElementById('ai-proposal-deal');
            if (sel) sel.value = cfg.dealId;
            await handleProposal();
            break;
        }
        case 'focus':
            await handleFocus();
            break;
        case 'followup': {
            const cSel = document.getElementById('ai-followup-contact');
            const ctxSel = document.getElementById('ai-followup-context');
            if (cSel) cSel.value = cfg.contactId;
            if (ctxSel) ctxSel.value = cfg.context;
            await handleFollowup();
            break;
        }
    }
}

// ---- View Router ----

function renderCurrentView() {
    const container = document.getElementById('section-ai');
    if (!container) return;

    const apiKey = store.getSettings().claudeApiKey;

    let html;
    if (!apiKey) {
        html = renderNoApiKey();
    } else if (!currentTool) {
        html = renderDashboard();
    } else {
        switch (currentTool) {
            case 'outreach': html = renderOutreach(); break;
            case 'coach': html = renderCoach(); break;
            case 'meeting': html = renderMeeting(); break;
            case 'proposal': html = renderProposal(); break;
            case 'focus': html = renderFocus(); break;
            case 'followup': html = renderFollowup(); break;
            default: html = renderDashboard();
        }
    }

    container.innerHTML = html;
    bindToolEvents();
}

// ---- Event binding ----

function bindToolEvents() {
    // Tool card clicks
    document.querySelectorAll('.ai-tool-card').forEach(card => {
        card.addEventListener('click', () => {
            currentTool = card.dataset.tool;
            lastResult = null;
            lastToolConfig = null;
            renderCurrentView();
        });
    });

    // Tool-specific buttons
    document.getElementById('ai-outreach-go')?.addEventListener('click', handleOutreach);
    document.getElementById('ai-meeting-go')?.addEventListener('click', handleMeeting);
    document.getElementById('ai-proposal-go')?.addEventListener('click', handleProposal);
    document.getElementById('ai-focus-go')?.addEventListener('click', handleFocus);
    document.getElementById('ai-followup-go')?.addEventListener('click', handleFollowup);
}

// ---- Global event listeners ----

let listenersAttached = false;

function attachGlobalListeners() {
    if (listenersAttached) return;
    listenersAttached = true;

    document.addEventListener('ai-back', () => {
        currentTool = null;
        lastResult = null;
        lastToolConfig = null;
        renderCurrentView();
    });

    document.addEventListener('ai-copy', () => {
        if (lastResult) copyToClipboard(lastResult);
    });

    document.addEventListener('ai-regenerate', () => {
        handleRegenerate();
    });

    document.addEventListener('ai-coach-send', () => {
        handleCoachSend();
    });

    document.addEventListener('ai-coach-clear', () => {
        chatHistory = [];
        renderCurrentView();
    });
}

// ---- Public API ----

export function init() {
    ensureSpinnerStyle();
    attachGlobalListeners();
}

export function render() {
    renderCurrentView();
}
