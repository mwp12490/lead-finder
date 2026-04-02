// leadFinder.js - Lead Finder module for the CRM application
// Extracts and enhances lead finder functionality from the original single-file app.

import { store } from './store.js';
import { escapeHtml, generateId, formatDate, timeAgo } from './utils.js';

// ── Module-level state (not persisted in store) ──
let currentResults = [];
let currentModalLead = null;
let currentTemplateType = 'email';
let currentLeadTab = 'results';
let searchPanelCollapsed = false;
let bulkSelectMode = false;
let bulkSelectedIds = new Set();
let openTagPopoverId = null;

const PIPELINE_STAGES = ['New', 'Contacted', 'Responded', 'Meeting Set', 'Closed', 'Not Interested'];

const CATEGORIES = [
    { group: 'Home Services', items: [
        { value: 'plumber', label: 'Plumbing' },
        { value: 'electrician', label: 'Electrical' },
        { value: 'roofing contractor', label: 'Roofing' },
        { value: 'HVAC contractor', label: 'HVAC' },
        { value: 'painter', label: 'Painting' },
        { value: 'landscaper', label: 'Landscaping' },
        { value: 'general contractor', label: 'General Contractor' },
        { value: 'pest control', label: 'Pest Control' },
        { value: 'cleaning service', label: 'Cleaning Services' },
        { value: 'garage door service', label: 'Garage Door' },
        { value: 'fencing contractor', label: 'Fencing' },
        { value: 'tree service', label: 'Tree Service' },
        { value: 'pool service', label: 'Pool Service' },
        { value: 'home remodeling', label: 'Remodeling' },
        { value: 'flooring contractor', label: 'Flooring' },
        { value: 'window installation', label: 'Windows' },
    ]},
    { group: 'Health & Wellness', items: [
        { value: 'dentist', label: 'Dentist' },
        { value: 'chiropractor', label: 'Chiropractor' },
        { value: 'physical therapist', label: 'Physical Therapy' },
        { value: 'veterinarian', label: 'Veterinarian' },
        { value: 'optometrist', label: 'Optometrist' },
        { value: 'dermatologist', label: 'Dermatologist' },
        { value: 'med spa', label: 'Med Spa' },
        { value: 'mental health counselor', label: 'Counseling / Therapy' },
    ]},
    { group: 'Professional Services', items: [
        { value: 'lawyer', label: 'Law Firm / Attorney' },
        { value: 'accountant', label: 'Accounting / CPA' },
        { value: 'financial advisor', label: 'Financial Advisor' },
        { value: 'insurance agent', label: 'Insurance' },
        { value: 'real estate agent', label: 'Real Estate' },
        { value: 'property management', label: 'Property Management' },
    ]},
    { group: 'Auto Services', items: [
        { value: 'auto repair', label: 'Auto Repair' },
        { value: 'auto detailing', label: 'Auto Detailing' },
        { value: 'auto body shop', label: 'Body Shop' },
        { value: 'tire shop', label: 'Tires' },
    ]},
    { group: 'Personal Services', items: [
        { value: 'hair salon', label: 'Hair Salon / Barber' },
        { value: 'day spa', label: 'Day Spa' },
        { value: 'personal trainer', label: 'Personal Training' },
        { value: 'photography studio', label: 'Photography' },
        { value: 'tattoo parlor', label: 'Tattoo Shop' },
    ]},
    { group: 'Other', items: [
        { value: 'moving company', label: 'Moving Company' },
        { value: 'storage facility', label: 'Storage' },
        { value: 'printing service', label: 'Printing' },
        { value: 'catering', label: 'Catering' },
        { value: 'event planner', label: 'Event Planning' },
        { value: 'dog grooming', label: 'Pet Grooming' },
        { value: 'tutoring service', label: 'Tutoring' },
    ]},
];

// ── Scoring ──

export function calculateScore(lead) {
    let score = 0;
    if (lead.reviewCount < 10) score += 3;
    else if (lead.reviewCount < 30) score += 2;
    else if (lead.reviewCount < 50) score += 1;

    if (lead.rating && lead.rating < 3.5) score += 2;
    else if (lead.rating && lead.rating < 4.2) score += 1;

    if (lead.enriched && !lead.website) score += 3;
    if (lead.enriched && !lead.phone) score += 1;
    if (!lead.rating) score += 1;
    // Bonus: leads with contact info are more actionable
    if (lead.email) score += 1;
    if (lead.decisionMaker) score += 1;

    return Math.min(score, 10);
}

function getScoreClass(score) {
    if (score >= 7) return 'score-hot';
    if (score >= 4) return 'score-warm';
    return 'score-cold';
}

// ── Signals ──

export function getSignals(lead) {
    const signals = [];

    if (lead.reviewCount < 10) {
        signals.push({ text: 'Few reviews \u2014 needs visibility', type: 'opportunity' });
    } else if (lead.reviewCount < 50) {
        signals.push({ text: lead.reviewCount + ' reviews', type: 'warn' });
    } else {
        signals.push({ text: lead.reviewCount + ' reviews', type: 'good' });
    }

    if (lead.rating && lead.rating < 3.5) {
        signals.push({ text: 'Low rating (' + lead.rating + ') \u2014 reputation help needed', type: 'opportunity' });
    } else if (lead.rating && lead.rating >= 4.5) {
        signals.push({ text: lead.rating + ' stars', type: 'good' });
    } else if (lead.rating) {
        signals.push({ text: lead.rating + ' stars', type: 'warn' });
    }

    if (lead.reviewCount > 0 && lead.reviewCount < 30 && lead.rating && lead.rating >= 4.0) {
        signals.push({ text: 'Good service, low visibility \u2014 great prospect', type: 'opportunity' });
    }

    if (lead.enriched) {
        if (!lead.website) {
            signals.push({ text: 'No website found', type: 'opportunity' });
        } else {
            signals.push({ text: 'Has website', type: 'good' });
        }
        if (!lead.phone) {
            signals.push({ text: 'No phone listed', type: 'opportunity' });
        } else {
            signals.push({ text: 'Phone listed', type: 'good' });
        }
    }

    return signals;
}

// ── Duplicate Detection ──

function isDuplicate(lead) {
    return store.getLeads().some(s => s.id === lead.id);
}

function isPossibleDuplicate(lead) {
    const normalize = str => str.toLowerCase().replace(/[^a-z0-9]/g, '');
    const leadName = normalize(lead.name);
    return store.getLeads().some(s => {
        if (s.id === lead.id) return false;
        const savedName = normalize(s.name);
        return (leadName.includes(savedName) || savedName.includes(leadName)) && leadName.length > 3;
    });
}

function findDuplicates() {
    const savedLeads = store.getLeads();
    const normalize = str => str.toLowerCase().replace(/[^a-z0-9]/g, '');
    const dupes = [];
    for (let i = 0; i < savedLeads.length; i++) {
        for (let j = i + 1; j < savedLeads.length; j++) {
            const a = normalize(savedLeads[i].name);
            const b = normalize(savedLeads[j].name);
            if (savedLeads[i].id === savedLeads[j].id || ((a.includes(b) || b.includes(a)) && a.length > 3)) {
                dupes.push([savedLeads[i].name, savedLeads[j].name]);
            }
        }
    }
    if (dupes.length === 0) {
        window.CRM.showToast('No duplicates found in your saved leads.', 'info');
    } else {
        const msg = dupes.map(d => `"${d[0]}" \u2194 "${d[1]}"`).join('\n');
        window.CRM.showToast(`Found ${dupes.length} possible duplicate(s). Check console for details.`, 'warning');
        console.log('Possible duplicates:\n' + msg);
    }
}

// ── Google Maps API ──

function loadGoogleMaps(apiKey) {
    if (document.getElementById('gmaps-script')) return;
    const s = document.createElement('script');
    s.id = 'gmaps-script';
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    s.onerror = () => {
        // Remove the failed script so we can retry
        s.remove();
        window.CRM.showToast('Failed to load Google Maps. Check your API key and internet connection.', 'error');
    };
    s.onload = () => {
        console.log('Google Maps API loaded successfully');
    };
    document.head.appendChild(s);
}

// ── Format a Places API result into our lead shape ──

function formatPlace(place, category, city) {
    return {
        id: place.place_id,
        name: place.name,
        address: place.vicinity || '',
        rating: place.rating || null,
        reviewCount: place.user_ratings_total || 0,
        priceLevel: place.price_level,
        category: category,
        city: city || '',
        isOpen: place.opening_hours ? place.opening_hours.isOpen() : null,
        photo: place.photos && place.photos.length ? place.photos[0].getUrl({ maxWidth: 400 }) : null,
        types: place.types || [],
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
        phone: null,
        website: null,
        hours: null,
        enriched: false,
    };
}

// ── Enrichment ──

function enrichSingleLead(service, lead) {
    return new Promise(resolve => {
        // Timeout per-lead enrichment after 8 seconds
        const timeout = setTimeout(() => {
            lead.enriched = true;
            resolve();
        }, 8000);

        try {
            service.getDetails({
                placeId: lead.id,
                fields: ['formatted_phone_number', 'website', 'opening_hours'],
            }, (place, status) => {
                clearTimeout(timeout);
                if (status === google.maps.places.PlacesServiceStatus.OK && place) {
                    lead.phone = place.formatted_phone_number || null;
                    lead.website = place.website || null;
                    lead.hours = place.opening_hours && place.opening_hours.weekday_text
                        ? place.opening_hours.weekday_text.join(', ')
                        : null;
                }
                lead.enriched = true;
                resolve();
            });
        } catch (err) {
            clearTimeout(timeout);
            lead.enriched = true;
            resolve();
        }
    });
}

async function enrichResults(service) {
    const notice = document.getElementById('lf-enrichingNotice');
    if (notice) notice.style.display = 'inline';

    // Process in batches of 3 with a small delay to avoid rate limiting
    const batchSize = 3;
    for (let i = 0; i < currentResults.length; i += batchSize) {
        const batch = currentResults.slice(i, i + batchSize);
        await Promise.all(batch.map(lead => enrichSingleLead(service, lead)));
        renderResultsGrid();
        // Small delay between batches to avoid hitting Google rate limits
        if (i + batchSize < currentResults.length) {
            await new Promise(r => setTimeout(r, 300));
        }
    }

    if (notice) notice.style.display = 'none';
}

// ── Search ──

function searchBusinesses() {
    const locationInput = document.getElementById('lf-locationInput');
    const categorySelect = document.getElementById('lf-categorySelect');
    const customCategory = document.getElementById('lf-customCategory');
    const radiusSelect = document.getElementById('lf-radiusSelect');
    const searchBtn = document.getElementById('lf-searchBtn');

    const location = locationInput.value.trim();
    const category = customCategory.value.trim() || categorySelect.value;
    const radiusMiles = parseInt(radiusSelect.value);

    if (!location) { window.CRM.showToast('Please enter a location.', 'error'); return; }
    if (!category) { window.CRM.showToast('Please select or type a business category.', 'error'); return; }

    const settings = store.getSettings();
    if (!settings.apiKey) { window.CRM.showToast('Please set up your Google API key first.', 'error'); return; }

    // Check if Google Maps is actually loaded before trying to use it
    if (typeof google === 'undefined' || !google.maps || !google.maps.places) {
        window.CRM.showToast('Google Maps is still loading. Please wait a moment and try again.', 'error');
        // Try reloading the script
        loadGoogleMaps(settings.apiKey);
        return;
    }

    searchBtn.disabled = true;
    searchBtn.textContent = 'Searching...';

    const resultsContainer = document.getElementById('lf-resultsContainer');
    resultsContainer.innerHTML = '<div class="loading"><div class="spinner"></div><p style="margin-top:1rem;color:#888;">Searching for businesses...</p></div>';

    // Make sure we show results tab
    switchLeadTab('results');

    // Safety timeout — if Google never calls back, reset UI after 30 seconds
    const searchTimeout = setTimeout(() => {
        if (searchBtn.disabled) {
            searchBtn.disabled = false;
            searchBtn.textContent = 'Search';
            resultsContainer.innerHTML = '<div class="empty-state"><h3>Search timed out</h3><p>Google Places API took too long to respond. This can happen with large search areas. Try a smaller radius or check your API key permissions.</p></div>';
            window.CRM.showToast('Search timed out. Try a smaller radius.', 'error');
        }
    }, 30000);

    try {
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ address: location }, (results, status) => {
            if (status !== 'OK' || !results[0]) {
                clearTimeout(searchTimeout);
                searchBtn.disabled = false;
                searchBtn.textContent = 'Search';
                const msg = status === 'OVER_QUERY_LIMIT'
                    ? 'API quota exceeded. Try again later or check your Google API billing.'
                    : status === 'REQUEST_DENIED'
                    ? 'API request denied. Check that your Google API key has Geocoding API enabled.'
                    : 'Location not found. Try a more specific location like "Austin, TX" or a ZIP code.';
                resultsContainer.innerHTML = `<div class="empty-state"><h3>${status === 'OK' ? 'Location not found' : 'Geocoding Error'}</h3><p>${msg}</p></div>`;
                return;
            }

            const loc = results[0].geometry.location;
            const searchCity = results[0].address_components.find(c => c.types.includes('locality'));
            const cityName = searchCity ? searchCity.long_name : location;

            const service = new google.maps.places.PlacesService(document.createElement('div'));
            const radiusMeters = radiusMiles * 1609.34;

            service.nearbySearch({
                location: loc,
                radius: Math.min(radiusMeters, 50000),
                keyword: category,
                type: 'establishment',
            }, (places, searchStatus, pagination) => {
                clearTimeout(searchTimeout);
                searchBtn.disabled = false;
                searchBtn.textContent = 'Search';

                if (searchStatus === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
                    resultsContainer.innerHTML = '<div class="empty-state"><h3>No results found</h3><p>No businesses matched that category in this area. Try a broader category or larger radius.</p></div>';
                    return;
                }

                if (searchStatus === google.maps.places.PlacesServiceStatus.OVER_QUERY_LIMIT) {
                    resultsContainer.innerHTML = '<div class="empty-state"><h3>API Quota Exceeded</h3><p>You\'ve hit the Google Places API rate limit. Wait a minute and try again, or check your billing dashboard.</p></div>';
                    return;
                }

                if (searchStatus === google.maps.places.PlacesServiceStatus.REQUEST_DENIED) {
                    resultsContainer.innerHTML = '<div class="empty-state"><h3>API Request Denied</h3><p>Your Google API key may not have the Places API enabled. Go to the <a href="https://console.cloud.google.com/apis/library/places-backend.googleapis.com" target="_blank" style="color:var(--accent-primary);">Google Cloud Console</a> and enable it.</p></div>';
                    return;
                }

                if (searchStatus !== google.maps.places.PlacesServiceStatus.OK || !places || !places.length) {
                    resultsContainer.innerHTML = '<div class="empty-state"><h3>No results found</h3><p>Try a different category or expand your search radius.</p></div>';
                    return;
                }

                currentResults = places.map(p => formatPlace(p, category, cityName));
                renderResultsGrid();
                // Enrich in background — don't block the UI
                enrichResults(service);
            });
        });
    } catch (err) {
        clearTimeout(searchTimeout);
        searchBtn.disabled = false;
        searchBtn.textContent = 'Search';
        console.error('Search error:', err);
        resultsContainer.innerHTML = `<div class="empty-state"><h3>Search Error</h3><p>${escapeHtml(err.message || 'An unexpected error occurred. Check the browser console for details.')}</p></div>`;
    }
}

// ── Sorting ──

function sortAndRender() {
    const sortSelect = document.getElementById('lf-sortSelect');
    if (!sortSelect) return;
    const sortVal = sortSelect.value;
    switch (sortVal) {
        case 'score-desc':
            currentResults.sort((a, b) => calculateScore(b) - calculateScore(a));
            break;
        case 'score-asc':
            currentResults.sort((a, b) => calculateScore(a) - calculateScore(b));
            break;
        case 'rating-desc':
            currentResults.sort((a, b) => (b.rating || 0) - (a.rating || 0));
            break;
        case 'reviews-asc':
            currentResults.sort((a, b) => a.reviewCount - b.reviewCount);
            break;
    }
    renderResultsGrid();
}

// ── Notes Log for Leads ──

function renderLeadNotesLog(leadId) {
    const notes = store.getNotesFor('lead', leadId);
    if (!notes.length) return '<p style="font-size:0.8rem;color:var(--text-secondary);">No notes yet.</p>';
    return notes.map(n => `
        <div class="lf-note-item" style="display:flex;align-items:flex-start;gap:0.5rem;padding:0.35rem 0;border-bottom:1px solid var(--border-light);">
            <div style="flex:1;min-width:0;">
                <div style="font-size:0.85rem;">${escapeHtml(n.text)}</div>
                <div style="font-size:0.72rem;color:var(--text-secondary);">${timeAgo(n.createdAt)}</div>
            </div>
            <button class="lf-delete-note-btn" data-note-id="${n.id}" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;padding:0.2rem 0.4rem;font-size:0.85rem;" title="Delete note">&times;</button>
        </div>
    `).join('');
}

// ── Hunter.io Email Finder ──

function renderHunterResults(results) {
    if (!results || !results.emails || !results.emails.length) {
        return '<p class="text-muted" style="font-size:0.8rem;margin-top:0.5rem;">No emails found for this domain.</p>';
    }
    return `
        <div class="hunter-email-list" style="margin-top:0.5rem;">
            ${results.emails.map(e => `
                <div class="hunter-email-item">
                    <a href="mailto:${escapeHtml(e.value)}" class="hunter-email-addr">${escapeHtml(e.value)}</a>
                    <span class="hunter-email-meta">
                        ${e.first_name ? escapeHtml(e.first_name + ' ' + (e.last_name || '')) : ''}
                        ${e.position ? ' &middot; ' + escapeHtml(e.position) : ''}
                        ${e.confidence ? ` <span class="hunter-confidence">${e.confidence}%</span>` : ''}
                    </span>
                    <button class="btn btn-sm lf-use-hunter-email" data-email="${escapeHtml(e.value)}" data-name="${escapeHtml((e.first_name || '') + ' ' + (e.last_name || ''))}" data-title="${escapeHtml(e.position || '')}" data-lead-id="${escapeHtml(results._leadId || '')}" style="font-size:0.7rem;padding:0.15rem 0.4rem;">Use</button>
                </div>
            `).join('')}
        </div>`;
}

async function hunterLookup(leadId, domain) {
    const settings = store.getSettings();
    if (!settings.hunterApiKey) {
        window.CRM.showToast('Please add your Hunter.io API key in Settings first.', 'error');
        return;
    }

    const container = document.getElementById(`lf-hunterResults-${CSS.escape(leadId)}`);
    if (container) container.innerHTML = '<p style="font-size:0.8rem;color:var(--text-secondary);">Looking up emails...</p>';

    try {
        const url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${encodeURIComponent(settings.hunterApiKey)}`;
        const resp = await fetch(url);
        const data = await resp.json();

        if (data.errors) {
            const errMsg = data.errors[0]?.details || 'Hunter.io lookup failed.';
            if (container) container.innerHTML = `<p class="text-muted" style="font-size:0.8rem;margin-top:0.5rem;">${escapeHtml(errMsg)}</p>`;
            window.CRM.showToast(errMsg, 'error');
            return;
        }

        const results = {
            _leadId: leadId,
            domain: domain,
            emails: (data.data?.emails || []).slice(0, 5),
            organization: data.data?.organization || '',
        };

        // Save results to lead
        store.updateLead(leadId, { hunterResults: results });

        if (container) container.innerHTML = renderHunterResults(results);
        window.CRM.showToast(`Found ${results.emails.length} email(s) for ${domain}`);
    } catch (err) {
        if (container) container.innerHTML = '<p class="text-muted" style="font-size:0.8rem;margin-top:0.5rem;">Network error. Check your connection.</p>';
        window.CRM.showToast('Hunter.io lookup failed. Check your API key and connection.', 'error');
    }
}

// ── Yelp Fusion API Search ──

async function yelpSearch() {
    const settings = store.getSettings();
    if (!settings.yelpApiKey) {
        window.CRM.showToast('Please add your Yelp Fusion API key in Settings first.', 'error');
        return;
    }

    const locationInput = document.getElementById('lf-locationInput');
    const categorySelect = document.getElementById('lf-categorySelect');
    const customCategory = document.getElementById('lf-customCategory');

    const location = locationInput ? locationInput.value.trim() : '';
    const category = (customCategory && customCategory.value.trim()) || (categorySelect ? categorySelect.value : '');

    if (!location) { window.CRM.showToast('Please enter a location.', 'error'); return; }
    if (!category) { window.CRM.showToast('Please select a business category.', 'error'); return; }

    const yelpBtn = document.getElementById('lf-yelpSearchBtn');
    if (yelpBtn) { yelpBtn.disabled = true; yelpBtn.textContent = 'Searching Yelp...'; }

    const resultsContainer = document.getElementById('lf-resultsContainer');
    switchLeadTab('results');

    try {
        // Yelp API requires CORS proxy for browser-based access
        const corsProxy = 'https://corsproxy.io/?';
        const yelpUrl = `https://api.yelp.com/v3/businesses/search?term=${encodeURIComponent(category)}&location=${encodeURIComponent(location)}&limit=20&sort_by=rating`;
        const resp = await fetch(corsProxy + encodeURIComponent(yelpUrl), {
            headers: { 'Authorization': `Bearer ${settings.yelpApiKey}` }
        });
        const data = await resp.json();

        if (data.error) {
            window.CRM.showToast(data.error.description || 'Yelp search failed.', 'error');
            if (yelpBtn) { yelpBtn.disabled = false; yelpBtn.textContent = 'Search Yelp'; }
            return;
        }

        const yelpResults = (data.businesses || []).map(biz => ({
            id: 'yelp_' + biz.id,
            name: biz.name,
            address: (biz.location?.display_address || []).join(', '),
            rating: biz.rating || null,
            reviewCount: biz.review_count || 0,
            priceLevel: biz.price ? biz.price.length : null,
            category: category,
            city: biz.location?.city || '',
            isOpen: !biz.is_closed,
            photo: biz.image_url || null,
            types: biz.categories ? biz.categories.map(c => c.alias) : [],
            lat: biz.coordinates?.latitude || null,
            lng: biz.coordinates?.longitude || null,
            phone: biz.display_phone || biz.phone || null,
            website: biz.url || null,
            hours: null,
            enriched: true,
            yelp: biz.url || '',
            source: 'yelp',
        }));

        // Merge with existing results (don't duplicate)
        const existingIds = new Set(currentResults.map(r => r.name.toLowerCase()));
        const newResults = yelpResults.filter(r => !existingIds.has(r.name.toLowerCase()));
        currentResults = [...currentResults, ...newResults];

        renderResultsGrid();
        window.CRM.showToast(`Added ${newResults.length} businesses from Yelp.`);
    } catch (err) {
        window.CRM.showToast('Yelp search failed. Check your API key.', 'error');
    }

    if (yelpBtn) { yelpBtn.disabled = false; yelpBtn.textContent = 'Search Yelp'; }
}

// ── Card Builder ──

function buildCard(lead, signals, isSaved, showExtras, possibleDup) {
    const signalHtml = signals.map(s =>
        `<span class="signal signal-${escapeHtml(s.type)}">${escapeHtml(s.text)}</span>`
    ).join('');

    const score = calculateScore(lead);
    const scoreHtml = `<div class="score-badge ${getScoreClass(score)}" title="Lead Score: ${score}/10">${score}</div>`;

    const dupBadge = isSaved ? '<span class="dup-badge">Saved</span>' :
                     possibleDup ? '<span class="dup-badge">Possible Duplicate</span>' : '';

    const escapedId = escapeHtml(lead.id);

    const notesHtml = showExtras ? `
        <div class="notes-area">
            <div style="display:flex;gap:0.5rem;margin-bottom:0.5rem;">
                <input type="text" class="lf-note-add-input" data-lead-id="${escapedId}" placeholder="Add a note..." style="flex:1;padding:0.4rem 0.6rem;border:1px solid var(--border-input);border-radius:4px;font-size:0.85rem;background:var(--bg-input);color:var(--text-primary);">
                <button class="btn btn-sm btn-primary lf-add-note-btn" data-lead-id="${escapedId}">Add</button>
            </div>
            <div class="lf-notes-log" data-lead-id="${escapedId}">
                ${renderLeadNotesLog(lead.id)}
            </div>
        </div>` : '';

    const statusHtml = showExtras ? `
        <div class="status-row">
            <label>Status:</label>
            <select class="lf-status-select" data-lead-id="${escapedId}">
                ${PIPELINE_STAGES.map(s => `<option value="${escapeHtml(s)}" ${lead.status === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
            </select>
        </div>` : '';

    const convertBtn = showExtras ? `
        <button class="btn btn-secondary btn-sm lf-convert-btn" data-lead-id="${escapedId}">Convert to Contact</button>` : '';

    // Tags display
    const leadTags = (lead.tags || []).map(tid => store.getTagById(tid)).filter(Boolean);
    const tagsDisplayHtml = showExtras && leadTags.length ? `
        <div class="tags-row">
            ${leadTags.map(t => `<span class="tag-badge" style="background:${escapeHtml(t.color)}">${escapeHtml(t.name)}</span>`).join('')}
        </div>` : '';

    const tagBtn = showExtras ? `
        <button class="btn btn-outline btn-sm lf-tag-btn" data-lead-id="${escapedId}" style="position:relative;">Tag</button>` : '';

    // Bulk select checkbox
    const bulkCheckbox = (showExtras && bulkSelectMode) ? `
        <input type="checkbox" class="bulk-select-checkbox lf-bulk-checkbox" data-lead-id="${escapedId}" ${bulkSelectedIds.has(lead.id) ? 'checked' : ''}>` : '';

    const googleMapsUrl = `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(lead.id)}`;

    let contactHtml = '';
    if (lead.phone) {
        contactHtml += `<div class="info-row"><span class="label">Phone</span> <a href="tel:${escapeHtml(lead.phone)}">${escapeHtml(lead.phone)}</a></div>`;
    }
    if (lead.email) {
        contactHtml += `<div class="info-row"><span class="label">Email</span> <a href="mailto:${escapeHtml(lead.email)}">${escapeHtml(lead.email)}</a></div>`;
    }
    if (lead.website) {
        const displayUrl = lead.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
        contactHtml += `<div class="info-row"><span class="label">Website</span> <a href="${escapeHtml(lead.website)}" target="_blank" rel="noopener">${escapeHtml(displayUrl.substring(0, 40))}</a></div>`;
    }
    if (lead.decisionMaker) {
        contactHtml += `<div class="info-row"><span class="label">Contact</span> ${escapeHtml(lead.decisionMaker)}${lead.decisionMakerTitle ? ' (' + escapeHtml(lead.decisionMakerTitle) + ')' : ''}</div>`;
    }

    // Social media links (only show if populated)
    let socialHtml = '';
    if (lead.facebook || lead.instagram || lead.linkedin || lead.yelp) {
        const socialLinks = [];
        if (lead.facebook) socialLinks.push(`<a href="${escapeHtml(lead.facebook)}" target="_blank" rel="noopener" class="social-link social-facebook" title="Facebook"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg></a>`);
        if (lead.instagram) socialLinks.push(`<a href="${escapeHtml(lead.instagram)}" target="_blank" rel="noopener" class="social-link social-instagram" title="Instagram"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="5"/><circle cx="17.5" cy="6.5" r="1.5"/></svg></a>`);
        if (lead.linkedin) socialLinks.push(`<a href="${escapeHtml(lead.linkedin)}" target="_blank" rel="noopener" class="social-link social-linkedin" title="LinkedIn"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2zM4 6a2 2 0 100-4 2 2 0 000 4z"/></svg></a>`);
        if (lead.yelp) socialLinks.push(`<a href="${escapeHtml(lead.yelp)}" target="_blank" rel="noopener" class="social-link social-yelp" title="Yelp"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg></a>`);
        socialHtml = `<div class="social-links-row">${socialLinks.join('')}</div>`;
    }

    // Research Panel (only on saved leads)
    const searchName = encodeURIComponent(lead.name);
    const searchCity = encodeURIComponent(lead.city || '');
    const searchFull = encodeURIComponent(lead.name + ' ' + (lead.city || lead.address));
    const websiteDomain = lead.website ? lead.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '') : '';

    const researchPanelHtml = showExtras ? `
        <details class="research-panel">
            <summary class="research-panel-toggle">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                Research &amp; Find Contact Info
            </summary>
            <div class="research-panel-body">
                <div class="research-section">
                    <div class="research-section-title">Find This Business On:</div>
                    <div class="research-links">
                        <a href="https://www.google.com/search?q=${searchFull}" target="_blank" rel="noopener" class="research-link research-google"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg> Google</a>
                        <a href="https://www.google.com/search?q=site:facebook.com+%22${searchName}%22+%22${searchCity}%22" target="_blank" rel="noopener" class="research-link research-facebook"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg> Facebook</a>
                        <a href="https://www.google.com/search?q=site:linkedin.com+%22${searchName}%22+%22${searchCity}%22" target="_blank" rel="noopener" class="research-link research-linkedin"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-4 0v7h-4v-7a6 6 0 016-6zM2 9h4v12H2zM4 6a2 2 0 100-4 2 2 0 000 4z"/></svg> LinkedIn</a>
                        <a href="https://www.yelp.com/search?find_desc=${searchName}&find_loc=${searchCity}" target="_blank" rel="noopener" class="research-link research-yelp"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/></svg> Yelp</a>
                        <a href="https://www.instagram.com/explore/search/keyword/?q=${searchName}" target="_blank" rel="noopener" class="research-link research-instagram"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="5"/></svg> Instagram</a>
                        <a href="https://www.bbb.org/search?find_country=US&find_text=${searchName}&find_loc=${searchCity}" target="_blank" rel="noopener" class="research-link research-bbb">BBB</a>
                        <a href="https://www.google.com/search?q=%22${searchName}%22+%22${searchCity}%22+email+OR+contact" target="_blank" rel="noopener" class="research-link research-email-search"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 7L2 7"/></svg> Find Email</a>
                        ${websiteDomain ? `<a href="https://${escapeHtml(websiteDomain)}/contact" target="_blank" rel="noopener" class="research-link research-contact-page"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg> Contact Page</a>` : ''}
                    </div>
                </div>
                ${websiteDomain ? `
                <div class="research-section">
                    <div class="research-section-title">Email Finder:</div>
                    <div class="research-links">
                        <button class="research-link research-hunter lf-hunter-btn" data-lead-id="${escapedId}" data-domain="${escapeHtml(websiteDomain)}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 7L2 7"/></svg> Hunter.io Lookup</button>
                        <a href="https://hunter.io/search/${escapeHtml(websiteDomain)}" target="_blank" rel="noopener" class="research-link research-hunter-web">Hunter.io (Web)</a>
                    </div>
                    <div class="hunter-results" id="lf-hunterResults-${escapedId}">
                        ${lead.hunterResults ? renderHunterResults(lead.hunterResults) : ''}
                    </div>
                </div>` : ''}
                <div class="research-section">
                    <div class="research-section-title">Quick Add Contact Info:</div>
                    <div class="research-quick-add">
                        <div class="quick-add-row">
                            <input type="email" class="form-control lf-quick-email" data-lead-id="${escapedId}" placeholder="Email address" value="${escapeHtml(lead.email || '')}">
                            <button class="btn btn-sm btn-primary lf-save-email-btn" data-lead-id="${escapedId}">Save</button>
                        </div>
                        <div class="quick-add-row">
                            <input type="text" class="form-control lf-quick-decision-maker" data-lead-id="${escapedId}" placeholder="Decision maker name" value="${escapeHtml(lead.decisionMaker || '')}">
                            <input type="text" class="form-control lf-quick-decision-title" data-lead-id="${escapedId}" placeholder="Title (e.g. Owner)" value="${escapeHtml(lead.decisionMakerTitle || '')}" style="max-width:140px;">
                        </div>
                        <div class="quick-add-row">
                            <input type="url" class="form-control lf-quick-facebook" data-lead-id="${escapedId}" placeholder="Facebook URL" value="${escapeHtml(lead.facebook || '')}">
                            <input type="url" class="form-control lf-quick-instagram" data-lead-id="${escapedId}" placeholder="Instagram URL" value="${escapeHtml(lead.instagram || '')}" style="max-width:200px;">
                        </div>
                        <div class="quick-add-row">
                            <input type="url" class="form-control lf-quick-linkedin" data-lead-id="${escapedId}" placeholder="LinkedIn URL" value="${escapeHtml(lead.linkedin || '')}">
                            <input type="url" class="form-control lf-quick-yelp" data-lead-id="${escapedId}" placeholder="Yelp URL" value="${escapeHtml(lead.yelp || '')}" style="max-width:200px;">
                        </div>
                        <button class="btn btn-sm btn-secondary lf-save-contact-info-btn" data-lead-id="${escapedId}">Save All Contact Info</button>
                    </div>
                </div>
            </div>
        </details>` : '';

    const ratingRow = lead.rating
        ? `<div class="info-row"><span class="label">Rating</span> ${'&#9733;'.repeat(Math.round(lead.rating))} ${escapeHtml(String(lead.rating))}/5 (${escapeHtml(String(lead.reviewCount))} reviews)</div>`
        : '<div class="info-row"><span class="label">Rating</span> No reviews yet</div>';

    return `
        <div class="lead-card ${isSaved ? 'saved' : ''} ${possibleDup ? 'duplicate' : ''} ${showExtras && bulkSelectMode ? 'bulk-mode' : ''}" data-card-lead-id="${escapedId}">
            ${bulkCheckbox}
            <button class="save-btn ${isSaved ? 'saved' : ''} lf-save-btn" data-lead-id="${escapedId}" title="${isSaved ? 'Remove from saved' : 'Save lead'}">
                ${isSaved ? '&#9733;' : '&#9734;'}
            </button>
            ${scoreHtml}
            <h3>${escapeHtml(lead.name)} ${dupBadge}</h3>
            <span class="category-tag">${escapeHtml(lead.category)}</span>
            ${tagsDisplayHtml}
            ${socialHtml}
            <div class="info-row"><span class="label">Address</span> ${escapeHtml(lead.address)}</div>
            ${ratingRow}
            ${contactHtml}
            <div class="signals">${signalHtml}</div>
            <div class="actions">
                <a href="${escapeHtml(googleMapsUrl)}" target="_blank" rel="noopener" class="btn btn-outline btn-sm">Maps</a>
                ${lead.website ? `<a href="${escapeHtml(lead.website)}" target="_blank" rel="noopener" class="btn btn-outline btn-sm">Website</a>` : ''}
                <button class="btn btn-success btn-sm lf-message-btn" data-lead-id="${escapedId}">Message</button>
                ${tagBtn}
            </div>
            ${researchPanelHtml}
            ${statusHtml}
            ${notesHtml}
            ${convertBtn}
        </div>`;
}

// ── Render: Results Grid ──

function renderResultsGrid() {
    const savedLeads = store.getLeads();
    const savedIds = new Set(savedLeads.map(l => l.id));

    const resultsBadge = document.getElementById('lf-resultsBadge');
    const resultCount = document.getElementById('lf-resultCount');
    const statsBar = document.getElementById('lf-statsBar');

    if (resultsBadge) { resultsBadge.style.display = currentResults.length ? 'inline' : 'none'; resultsBadge.textContent = currentResults.length; }
    if (resultCount) resultCount.textContent = currentResults.length;
    if (statsBar) statsBar.style.display = currentResults.length ? 'flex' : 'none';

    const container = document.getElementById('lf-resultsContainer');
    if (!container) return;

    if (!currentResults.length) {
        container.innerHTML = '<div class="empty-state"><h3>Search for Local Businesses</h3><p>Enter a location and category above to find businesses in your target area.</p></div>';
        return;
    }

    const html = currentResults.map(lead => {
        const isSaved = savedIds.has(lead.id);
        const signals = getSignals(lead);
        const possibleDup = !isSaved && isPossibleDuplicate(lead);
        return buildCard(lead, signals, isSaved, false, possibleDup);
    }).join('');

    container.innerHTML = '<div class="results-grid">' + html + '</div>';
    updateBadges();
}

// ── Render: Saved Tab ──

function renderSaved() {
    const savedLeads = store.getLeads();
    const savedCount = document.getElementById('lf-savedCount');
    if (savedCount) savedCount.textContent = savedLeads.length;

    const container = document.getElementById('lf-savedContainer');
    if (!container) return;

    if (!savedLeads.length) {
        container.innerHTML = '<div class="empty-state"><h3>No Saved Leads Yet</h3><p>Click the bookmark icon on any result to save it here.</p></div>';
        updateBadges();
        return;
    }

    const html = savedLeads.map(lead => {
        const signals = getSignals(lead);
        return buildCard(lead, signals, true, true, false);
    }).join('');

    container.innerHTML = '<div class="results-grid">' + html + '</div>';
    updateBadges();
}

// ── Render: Pipeline ──

function renderPipeline() {
    const savedLeads = store.getLeads();
    const pipelineCount = document.getElementById('lf-pipelineCount');
    if (pipelineCount) pipelineCount.textContent = savedLeads.length;

    const container = document.getElementById('lf-pipelineContainer');
    if (!container) return;

    if (!savedLeads.length) {
        container.innerHTML = '<div class="empty-state"><h3>No Leads in Pipeline</h3><p>Save some leads first, then track them through your sales process here.</p></div>';
        updateBadges();
        return;
    }

    const grouped = {};
    PIPELINE_STAGES.forEach(s => grouped[s] = []);
    savedLeads.forEach(lead => {
        const stage = lead.status || 'New';
        if (grouped[stage]) grouped[stage].push(lead);
    });

    const columnsHtml = PIPELINE_STAGES.map(stage => {
        const leads = grouped[stage];
        const cardsHtml = leads.map(lead => {
            const score = calculateScore(lead);
            const escapedId = escapeHtml(lead.id);
            return `
                <div class="pipeline-card">
                    <h5><span class="pipe-score ${getScoreClass(score)}">${score}</span>${escapeHtml(lead.name)}</h5>
                    <div class="meta">${escapeHtml(lead.category)} &bull; ${escapeHtml(lead.city || lead.address)}</div>
                    ${lead.phone ? `<div class="meta"><a href="tel:${escapeHtml(lead.phone)}" style="color:#2E86C1;text-decoration:none;">${escapeHtml(lead.phone)}</a></div>` : ''}
                    <select class="lf-pipeline-status" data-lead-id="${escapedId}">
                        ${PIPELINE_STAGES.map(s => `<option value="${escapeHtml(s)}" ${stage === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
                    </select>
                </div>`;
        }).join('');

        return `
            <div class="pipeline-column">
                <h4>${escapeHtml(stage)} <span class="col-count">${leads.length}</span></h4>
                ${cardsHtml || '<p style="font-size:0.8rem;color:#aaa;text-align:center;">No leads</p>'}
            </div>`;
    }).join('');

    container.innerHTML = '<div class="pipeline-container">' + columnsHtml + '</div>';
    updateBadges();
}

// ── Badge Updates ──

function updateBadges() {
    const savedLeads = store.getLeads();

    const savedBadge = document.getElementById('lf-savedBadge');
    if (savedBadge) {
        savedBadge.style.display = savedLeads.length ? 'inline' : 'none';
        savedBadge.textContent = savedLeads.length;
    }

    const pipelineBadge = document.getElementById('lf-pipelineBadge');
    if (pipelineBadge) {
        const active = savedLeads.filter(l => l.status && l.status !== 'Not Interested' && l.status !== 'Closed').length;
        pipelineBadge.style.display = active ? 'inline' : 'none';
        pipelineBadge.textContent = active;
    }
}

// ── Save / Remove ──

function toggleSave(placeId) {
    const savedLeads = store.getLeads();
    const existing = savedLeads.find(l => l.id === placeId);

    if (existing) {
        store.removeLead(existing.id);
    } else {
        const lead = currentResults.find(l => l.id === placeId);
        if (lead) {
            store.addLead({
                ...lead,
                savedAt: new Date().toISOString(),
                notes: '',
                status: 'New',
            });
        }
    }

    renderResultsGrid();
    if (currentLeadTab === 'saved') renderSaved();
    if (currentLeadTab === 'pipeline') renderPipeline();
}

function saveAllResults() {
    const savedIds = new Set(store.getLeads().map(l => l.id));
    let count = 0;
    currentResults.forEach(lead => {
        if (!savedIds.has(lead.id)) {
            store.addLead({
                ...lead,
                savedAt: new Date().toISOString(),
                notes: '',
                status: 'New',
            });
            count++;
        }
    });
    renderResultsGrid();
    window.CRM.showToast(`Saved ${count} new lead(s).`, 'success');
}

function updateNote(placeId, note) {
    const lead = store.getLeads().find(l => l.id === placeId);
    if (lead) {
        store.updateLead(lead.id, { notes: note });
    }
}

function updateStatus(placeId, status) {
    const lead = store.getLeads().find(l => l.id === placeId);
    if (lead) {
        store.updateLead(lead.id, { status: status });

        // Auto-create follow-up task when moved to "Contacted"
        if (status === 'Contacted') {
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 3);
            const dueDateStr = dueDate.toISOString().slice(0, 10);
            store.addTask({
                title: `Follow up with ${lead.name}`,
                dueDate: dueDateStr,
                priority: 'medium',
                leadId: lead.id,
            });
            window.CRM.showToast('Follow-up task created for 3 days from now');
        }

        if (currentLeadTab === 'saved') renderSaved();
        if (currentLeadTab === 'pipeline') renderPipeline();
    }
}

// ── Refresh Scores ──

async function refreshScores() {
    if (typeof google === 'undefined' || !google.maps || !google.maps.places) {
        window.CRM.showToast('Google Maps API is not loaded. Please set your API key first.', 'error');
        return;
    }

    const savedLeads = store.getLeads().filter(l => l.id && l.savedAt);
    if (savedLeads.length === 0) {
        window.CRM.showToast('No saved leads to refresh.', 'info');
        return;
    }

    const refreshBtn = document.getElementById('lf-refreshScoresBtn');
    const progressEl = document.getElementById('lf-refreshProgress');
    if (refreshBtn) refreshBtn.disabled = true;
    if (progressEl) progressEl.style.display = 'inline';

    const service = new google.maps.places.PlacesService(document.createElement('div'));
    const batchSize = 3;
    const delayMs = 500;
    let updated = 0;

    for (let i = 0; i < savedLeads.length; i += batchSize) {
        const batch = savedLeads.slice(i, i + batchSize);
        if (progressEl) progressEl.textContent = `Refreshing ${i + 1} of ${savedLeads.length}...`;

        await Promise.all(batch.map(lead => new Promise(resolve => {
            service.getDetails({
                placeId: lead.id,
                fields: ['formatted_phone_number', 'website', 'opening_hours', 'rating', 'user_ratings_total'],
            }, (place, status) => {
                if (status === google.maps.places.PlacesServiceStatus.OK && place) {
                    const updates = {
                        phone: place.formatted_phone_number || lead.phone,
                        website: place.website || lead.website,
                        hours: place.opening_hours && place.opening_hours.weekday_text
                            ? place.opening_hours.weekday_text.join(', ')
                            : lead.hours,
                        rating: place.rating != null ? place.rating : lead.rating,
                        reviewCount: place.user_ratings_total != null ? place.user_ratings_total : lead.reviewCount,
                        enriched: true,
                    };
                    store.updateLead(lead.id, updates);
                    updated++;
                }
                resolve();
            });
        })));

        if (i + batchSize < savedLeads.length) {
            await new Promise(r => setTimeout(r, delayMs));
        }
    }

    if (refreshBtn) refreshBtn.disabled = false;
    if (progressEl) progressEl.style.display = 'none';
    window.CRM.showToast(`${updated} leads updated`);
    renderSaved();
}

function clearSaved() {
    if (!confirm('Remove all saved leads? This cannot be undone.')) return;
    const leads = store.getLeads().slice();
    leads.forEach(l => store.removeLead(l.id));
    renderSaved();
    if (currentResults.length) renderResultsGrid();
}

// ── CSV Export ──

function exportCSV() {
    const savedLeads = store.getLeads();
    if (!savedLeads.length) { window.CRM.showToast('No saved leads to export.', 'error'); return; }

    const headers = ['Name', 'Category', 'Address', 'City', 'Rating', 'Reviews', 'Phone', 'Email', 'Website', 'Decision Maker', 'Decision Maker Title', 'Facebook', 'Instagram', 'LinkedIn', 'Yelp', 'Score', 'Status', 'Signals', 'Notes', 'Source', 'Google Maps', 'Saved Date'];
    const rows = savedLeads.map(l => {
        const signals = getSignals(l).map(s => s.text).join('; ');
        const score = calculateScore(l);
        return [
            l.name,
            l.category,
            l.address,
            l.city || '',
            l.rating || 'N/A',
            l.reviewCount,
            l.phone || '',
            l.email || '',
            l.website || '',
            l.decisionMaker || '',
            l.decisionMakerTitle || '',
            l.facebook || '',
            l.instagram || '',
            l.linkedin || '',
            l.yelp || '',
            score,
            l.status || 'New',
            signals,
            (l.notes || '').replace(/\n/g, ' '),
            l.source || 'google',
            `https://www.google.com/maps/place/?q=place_id:${l.id}`,
            l.savedAt ? new Date(l.savedAt).toLocaleDateString() : '',
        ];
    });

    const csv = [headers, ...rows].map(row =>
        row.map(cell => '"' + String(cell).replace(/"/g, '""') + '"').join(',')
    ).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ── Tab Switching ──

function switchLeadTab(tab) {
    currentLeadTab = tab;
    const tabButtons = document.querySelectorAll('#section-leads .lf-tab');
    tabButtons.forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tab);
    });

    const resultsTab = document.getElementById('lf-resultsTab');
    const savedTab = document.getElementById('lf-savedTab');
    const pipelineTab = document.getElementById('lf-pipelineTab');

    if (resultsTab) resultsTab.style.display = tab === 'results' ? 'block' : 'none';
    if (savedTab) savedTab.style.display = tab === 'saved' ? 'block' : 'none';
    if (pipelineTab) pipelineTab.style.display = tab === 'pipeline' ? 'block' : 'none';

    if (tab === 'saved') renderSaved();
    if (tab === 'pipeline') renderPipeline();
}

// ── Outreach Template Modal ──

function openTemplateModal(placeId) {
    const lead = currentResults.find(l => l.id === placeId) || store.getLeads().find(l => l.id === placeId);
    if (!lead) return;

    currentModalLead = lead;
    currentTemplateType = 'email';

    const score = calculateScore(lead);
    const signals = getSignals(lead);
    const opportunities = signals.filter(s => s.type === 'opportunity').map(s => s.text);
    const city = lead.city || lead.address.split(',').pop().trim();
    const categoryLabel = lead.category.charAt(0).toUpperCase() + lead.category.slice(1);

    let pitchPoints = '';
    if (opportunities.length) {
        pitchPoints = opportunities.map(o => `  \u2022 ${o}`).join('\n');
    } else {
        pitchPoints = '  \u2022 Increase your online visibility\n  \u2022 Attract more local customers';
    }

    const templates = {
        email: `Subject: Quick idea for ${lead.name}\n\nHi there,\n\nI came across ${lead.name} while researching ${categoryLabel.toLowerCase()} businesses in ${city}, and I had a few ideas that could help bring in more customers.\n\nI noticed a couple of things:\n${pitchPoints}\n\nI help local businesses like yours get more visibility and leads through targeted marketing \u2014 things like Google optimization, landing pages, and email campaigns.\n\nWould you be open to a quick 10-minute call this week to see if it\u2019s a fit? No pressure at all.\n\nBest,\n[Your Name]\n[Your Phone]\n[Your Website]`,

        linkedin: `Hi! I came across ${lead.name} and noticed some opportunities to boost your online presence in ${city}.\n\nA few things stood out:\n${pitchPoints}\n\nI work with ${categoryLabel.toLowerCase()} businesses on getting more customers through better marketing. Would you be open to connecting?`,

        phone: `PHONE SCRIPT \u2014 ${lead.name}\n${'='.repeat(40)}\n\nINTRO:\n"Hi, is this the owner/manager of ${lead.name}? My name is [Your Name], I help local ${categoryLabel.toLowerCase()} businesses in ${city} get more customers."\n\nWHY I\u2019M CALLING:\n"I was looking at your online presence and noticed a few things that could be improved:\n${pitchPoints}\n\nI think there\u2019s a real opportunity to get you more visibility and more leads."\n\nASK:\n"Would you have 10 minutes this week for a quick call? I can share exactly what I\u2019d recommend \u2014 no cost, no obligation."\n\nIF THEY SAY NO:\n"No problem at all. Can I send you a quick email with some ideas? What\u2019s the best email for you?"\n\nNOTES:\n\u2022 Rating: ${lead.rating || 'N/A'}/5 (${lead.reviewCount} reviews)\n\u2022 Lead Score: ${score}/10\n\u2022 Phone: ${lead.phone || 'N/A'}\n\u2022 Website: ${lead.website || 'None found'}`,
    };

    const modalHtml = `
        <h2>Outreach Templates \u2014 <span id="lf-modalLeadName">${escapeHtml(lead.name)}</span></h2>
        <div class="template-tabs">
            <button class="template-tab active lf-template-tab" data-type="email">Cold Email</button>
            <button class="template-tab lf-template-tab" data-type="linkedin">LinkedIn Message</button>
            <button class="template-tab lf-template-tab" data-type="phone">Phone Script</button>
        </div>
        <div class="template-content" id="lf-templateContent">${escapeHtml(templates.email)}</div>
        <div class="template-actions" style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;">
            <button class="btn btn-primary btn-sm" id="lf-copyTemplateBtn">Copy to Clipboard</button>
            <button class="btn btn-sm btn-outline" id="lf-openGmailBtn">Open in Gmail</button>
            <button class="btn btn-sm btn-outline" id="lf-openOutlookBtn">Open in Outlook</button>
            <span class="copy-feedback" id="lf-copyFeedback">Copied!</span>
        </div>`;

    window.CRM.showModal(modalHtml);

    // Bind template tab switching
    const modal = document.querySelector('.modal');
    if (!modal) return;

    modal.querySelectorAll('.lf-template-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const type = tab.dataset.type;
            currentTemplateType = type;
            modal.querySelectorAll('.lf-template-tab').forEach(t => t.classList.toggle('active', t.dataset.type === type));
            const contentEl = document.getElementById('lf-templateContent');
            if (contentEl) contentEl.textContent = templates[type];
        });
    });

    // Copy button
    const copyBtn = document.getElementById('lf-copyTemplateBtn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const contentEl = document.getElementById('lf-templateContent');
            if (!contentEl) return;
            navigator.clipboard.writeText(contentEl.textContent).then(() => {
                const feedback = document.getElementById('lf-copyFeedback');
                if (feedback) {
                    feedback.style.display = 'inline';
                    setTimeout(() => { feedback.style.display = 'none'; }, 2000);
                }
            });
        });
    }

    // Gmail button
    const gmailBtn = document.getElementById('lf-openGmailBtn');
    if (gmailBtn) {
        gmailBtn.addEventListener('click', () => {
            const contentEl = document.getElementById('lf-templateContent');
            if (!contentEl) return;
            const text = contentEl.textContent;
            const subjectMatch = text.match(/^Subject:\s*(.+)/m);
            const subject = subjectMatch ? subjectMatch[1].trim() : `Outreach to ${lead.name}`;
            const body = subjectMatch ? text.replace(/^Subject:\s*.+\n\n?/m, '') : text;
            const toEmail = lead.email || '';
            const gmailUrl = `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(toEmail)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
            window.open(gmailUrl, '_blank');
        });
    }

    // Outlook button
    const outlookBtn = document.getElementById('lf-openOutlookBtn');
    if (outlookBtn) {
        outlookBtn.addEventListener('click', () => {
            const contentEl = document.getElementById('lf-templateContent');
            if (!contentEl) return;
            const text = contentEl.textContent;
            const subjectMatch = text.match(/^Subject:\s*(.+)/m);
            const subject = subjectMatch ? subjectMatch[1].trim() : `Outreach to ${lead.name}`;
            const body = subjectMatch ? text.replace(/^Subject:\s*.+\n\n?/m, '') : text;
            const toEmailOl = lead.email || '';
            const outlookUrl = `https://outlook.live.com/mail/0/deeplink/compose?to=${encodeURIComponent(toEmailOl)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
            window.open(outlookUrl, '_blank');
        });
    }
}

// ── Convert to Contact ──

function openConvertModal(placeId) {
    const lead = store.getLeads().find(l => l.id === placeId);
    if (!lead) return;

    if (lead.convertedToContactId) {
        window.CRM.showToast('This lead has already been converted to a contact.', 'info');
        return;
    }

    const score = calculateScore(lead);

    const formHtml = `
        <h2>Convert Lead to Contact</h2>
        <p style="font-size:0.9rem;color:#555;margin-bottom:1rem;">Create a new contact from <strong>${escapeHtml(lead.name)}</strong>.</p>
        <div style="display:grid;gap:0.75rem;">
            <div class="search-field">
                <label>Contact Name</label>
                <input type="text" id="lf-conv-name" value="${escapeHtml(lead.name)}" />
            </div>
            <div class="search-field">
                <label>Business Name</label>
                <input type="text" id="lf-conv-business" value="${escapeHtml(lead.name)}" />
            </div>
            <div class="search-field">
                <label>Phone</label>
                <input type="text" id="lf-conv-phone" value="${escapeHtml(lead.phone || '')}" />
            </div>
            <div class="search-field">
                <label>Email</label>
                <input type="email" id="lf-conv-email" value="${escapeHtml(lead.email || '')}" placeholder="Enter email address..." />
            </div>
            <div class="search-field">
                <label>Website</label>
                <input type="text" id="lf-conv-website" value="${escapeHtml(lead.website || '')}" />
            </div>
            <div class="search-field">
                <label>Decision Maker</label>
                <input type="text" id="lf-conv-decision-maker" value="${escapeHtml(lead.decisionMaker || '')}" placeholder="Owner/Manager name" />
            </div>
            <div class="search-field">
                <label>Address</label>
                <input type="text" id="lf-conv-address" value="${escapeHtml(lead.address || '')}" />
            </div>
            <div class="search-field">
                <label>City</label>
                <input type="text" id="lf-conv-city" value="${escapeHtml(lead.city || '')}" />
            </div>
            <div class="search-field">
                <label>Category</label>
                <input type="text" id="lf-conv-category" value="${escapeHtml(lead.category || '')}" />
            </div>
            <div style="margin-top:0.5rem;">
                <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;font-size:0.9rem;">
                    <input type="checkbox" id="lf-conv-createDeal" />
                    Also create a deal
                </label>
            </div>
            <div id="lf-conv-dealFields" style="display:none;padding:0.75rem;background:#F4F7FA;border-radius:6px;">
                <div class="search-field" style="margin-bottom:0.5rem;">
                    <label>Deal Name</label>
                    <input type="text" id="lf-conv-dealName" value="${escapeHtml(lead.name + ' - New Deal')}" />
                </div>
                <div class="search-field" style="margin-bottom:0.5rem;">
                    <label>Deal Value ($)</label>
                    <input type="number" id="lf-conv-dealValue" placeholder="0" min="0" step="100" />
                </div>
                <div class="search-field">
                    <label>Stage</label>
                    <select id="lf-conv-dealStage">
                        <option value="Qualification" selected>Qualification</option>
                        <option value="Proposal">Proposal</option>
                        <option value="Negotiation">Negotiation</option>
                        <option value="Closed Won">Closed Won</option>
                        <option value="Closed Lost">Closed Lost</option>
                    </select>
                </div>
            </div>
            <div style="display:flex;gap:0.5rem;margin-top:0.5rem;">
                <button class="btn btn-primary" id="lf-conv-submit">Create Contact</button>
                <button class="btn btn-outline" id="lf-conv-cancel">Cancel</button>
            </div>
        </div>`;

    window.CRM.showModal(formHtml);

    // Toggle deal fields
    const dealCheckbox = document.getElementById('lf-conv-createDeal');
    const dealFields = document.getElementById('lf-conv-dealFields');
    if (dealCheckbox && dealFields) {
        dealCheckbox.addEventListener('change', () => {
            dealFields.style.display = dealCheckbox.checked ? 'block' : 'none';
        });
    }

    // Cancel
    const cancelBtn = document.getElementById('lf-conv-cancel');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => window.CRM.closeModal());
    }

    // Submit
    const submitBtn = document.getElementById('lf-conv-submit');
    if (submitBtn) {
        submitBtn.addEventListener('click', () => {
            const name = document.getElementById('lf-conv-name').value.trim();
            const businessName = document.getElementById('lf-conv-business').value.trim();
            const phone = document.getElementById('lf-conv-phone').value.trim();
            const email = document.getElementById('lf-conv-email').value.trim();
            const website = document.getElementById('lf-conv-website').value.trim();
            const address = document.getElementById('lf-conv-address').value.trim();
            const city = document.getElementById('lf-conv-city').value.trim();
            const category = document.getElementById('lf-conv-category').value.trim();

            if (!name) { window.CRM.showToast('Contact name is required.', 'error'); return; }

            const contact = store.addContact({
                name,
                businessName,
                phone,
                email,
                website,
                address,
                city,
                category,
                sourceLeadId: lead.id,
                originalRating: lead.rating,
                originalReviewCount: lead.reviewCount,
                originalScore: score,
            });

            store.updateLead(lead.id, { convertedToContactId: contact.id });

            // Create deal if requested
            if (dealCheckbox && dealCheckbox.checked) {
                const dealName = document.getElementById('lf-conv-dealName').value.trim() || (name + ' - New Deal');
                const dealValue = parseFloat(document.getElementById('lf-conv-dealValue').value) || 0;
                const dealStage = document.getElementById('lf-conv-dealStage').value || 'Qualification';

                store.addDeal({
                    name: dealName,
                    contactId: contact.id,
                    value: dealValue,
                    stage: dealStage,
                });
            }

            window.CRM.closeModal();
            window.CRM.showToast(`Contact "${name}" created successfully!`, 'success');
            renderSaved();
        });
    }
}

// ── Build category options HTML ──

function buildCategoryOptions() {
    let html = '<option value="">-- Select Category --</option>';
    CATEGORIES.forEach(group => {
        html += `<optgroup label="${escapeHtml(group.group)}">`;
        group.items.forEach(item => {
            html += `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`;
        });
        html += '</optgroup>';
    });
    return html;
}

// ── Toggle Search Panel ──

function toggleSearchPanel() {
    searchPanelCollapsed = !searchPanelCollapsed;
    const panel = document.getElementById('lf-searchPanel');
    const toggleBtn = document.getElementById('lf-toggleSearch');
    if (panel) panel.style.display = searchPanelCollapsed ? 'none' : 'block';
    if (toggleBtn) toggleBtn.textContent = searchPanelCollapsed ? 'Show Search' : 'Hide Search';
}

// ── Event Delegation ──

// ── Tag Popover ──

function showTagPopover(leadId, anchorEl) {
    // Close any existing popover
    closeTagPopover();
    openTagPopoverId = leadId;

    const tags = store.getTags();
    const lead = store.getLeadById(leadId);
    if (!lead) return;

    const leadTagIds = lead.tags || [];

    const popover = document.createElement('div');
    popover.className = 'tag-popover';
    popover.id = 'lf-tagPopover';

    if (!tags.length) {
        popover.innerHTML = '<div class="no-tags-msg">No tags created yet. Go to Settings to create tags.</div>';
    } else {
        popover.innerHTML = tags.map(t => {
            const checked = leadTagIds.includes(t.id);
            return `
                <label class="tag-option">
                    <input type="checkbox" class="lf-tag-checkbox" data-tag-id="${escapeHtml(t.id)}" data-lead-id="${escapeHtml(leadId)}" ${checked ? 'checked' : ''}>
                    <span class="tag-color-dot" style="background:${escapeHtml(t.color)}"></span>
                    <span class="tag-option-label">${escapeHtml(t.name)}</span>
                </label>`;
        }).join('');
    }

    // Position relative to anchor
    const rect = anchorEl.getBoundingClientRect();
    popover.style.position = 'fixed';
    popover.style.top = (rect.bottom + 4) + 'px';
    popover.style.left = rect.left + 'px';

    document.body.appendChild(popover);

    // Close on outside click
    setTimeout(() => {
        document.addEventListener('click', closeTagPopoverOnOutsideClick);
    }, 0);
}

function closeTagPopover() {
    const existing = document.getElementById('lf-tagPopover');
    if (existing) existing.remove();
    openTagPopoverId = null;
    document.removeEventListener('click', closeTagPopoverOnOutsideClick);
}

function closeTagPopoverOnOutsideClick(e) {
    if (!e.target.closest('.tag-popover') && !e.target.closest('.lf-tag-btn')) {
        closeTagPopover();
    }
}

function toggleLeadTag(leadId, tagId) {
    const lead = store.getLeadById(leadId);
    if (!lead) return;
    const tags = lead.tags || [];
    const idx = tags.indexOf(tagId);
    if (idx === -1) {
        tags.push(tagId);
    } else {
        tags.splice(idx, 1);
    }
    store.updateLead(leadId, { tags: tags });
}

// ── Bulk Actions ──

function toggleBulkMode() {
    bulkSelectMode = !bulkSelectMode;
    bulkSelectedIds.clear();
    renderSaved();
}

function toggleBulkSelect(leadId) {
    if (bulkSelectedIds.has(leadId)) {
        bulkSelectedIds.delete(leadId);
    } else {
        bulkSelectedIds.add(leadId);
    }
    updateBulkActionBar();
    // Update checkbox state without full re-render
    const checkbox = document.querySelector(`.lf-bulk-checkbox[data-lead-id="${CSS.escape(leadId)}"]`);
    if (checkbox) checkbox.checked = bulkSelectedIds.has(leadId);
}

function selectAllLeads() {
    store.getLeads().forEach(l => bulkSelectedIds.add(l.id));
    renderSaved();
}

function deselectAllLeads() {
    bulkSelectedIds.clear();
    renderSaved();
}

function updateBulkActionBar() {
    const bar = document.getElementById('lf-bulkActionBar');
    if (!bar) return;
    const count = bulkSelectedIds.size;
    bar.style.display = count > 0 ? 'flex' : 'none';
    const countEl = bar.querySelector('.bulk-count');
    if (countEl) countEl.textContent = `${count} selected`;
}

function bulkUpdateStatus(status) {
    bulkSelectedIds.forEach(id => {
        store.updateLead(id, { status });
    });
    window.CRM.showToast(`Updated ${bulkSelectedIds.size} lead(s) to "${status}".`);
    bulkSelectedIds.clear();
    renderSaved();
}

function bulkAddTag(tagId) {
    bulkSelectedIds.forEach(id => {
        const lead = store.getLeadById(id);
        if (lead) {
            const tags = lead.tags || [];
            if (!tags.includes(tagId)) {
                tags.push(tagId);
                store.updateLead(id, { tags });
            }
        }
    });
    window.CRM.showToast(`Tag added to ${bulkSelectedIds.size} lead(s).`);
    renderSaved();
}

function bulkExportSelected() {
    const selectedLeads = store.getLeads().filter(l => bulkSelectedIds.has(l.id));
    if (!selectedLeads.length) return;

    const headers = ['Name', 'Category', 'Address', 'City', 'Rating', 'Reviews', 'Phone', 'Email', 'Website', 'Decision Maker', 'Facebook', 'LinkedIn', 'Score', 'Status', 'Notes', 'Saved Date'];
    const rows = selectedLeads.map(l => {
        const score = calculateScore(l);
        return [
            l.name, l.category, l.address, l.city || '', l.rating || 'N/A', l.reviewCount,
            l.phone || '', l.email || '', l.website || '', l.decisionMaker || '',
            l.facebook || '', l.linkedin || '', score, l.status || 'New',
            (l.notes || '').replace(/\n/g, ' '),
            l.savedAt ? new Date(l.savedAt).toLocaleDateString() : '',
        ];
    });

    const csv = [headers, ...rows].map(row =>
        row.map(cell => '"' + String(cell).replace(/"/g, '""') + '"').join(',')
    ).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-selected-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    window.CRM.showToast(`Exported ${selectedLeads.length} lead(s).`);
}

function bulkDeleteSelected() {
    if (!confirm(`Delete ${bulkSelectedIds.size} selected lead(s)? This cannot be undone.`)) return;
    bulkSelectedIds.forEach(id => store.removeLead(id));
    window.CRM.showToast(`Deleted ${bulkSelectedIds.size} lead(s).`);
    bulkSelectedIds.clear();
    renderSaved();
}

function showBulkTagPopover(anchorEl) {
    closeTagPopover();
    const tags = store.getTags();

    const popover = document.createElement('div');
    popover.className = 'tag-popover';
    popover.id = 'lf-tagPopover';

    if (!tags.length) {
        popover.innerHTML = '<div class="no-tags-msg">No tags created yet.</div>';
    } else {
        popover.innerHTML = tags.map(t => `
            <div class="tag-option lf-bulk-tag-option" data-tag-id="${escapeHtml(t.id)}" style="cursor:pointer;">
                <span class="tag-color-dot" style="background:${escapeHtml(t.color)}"></span>
                <span class="tag-option-label">${escapeHtml(t.name)}</span>
            </div>
        `).join('');
    }

    const rect = anchorEl.getBoundingClientRect();
    popover.style.position = 'fixed';
    popover.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
    popover.style.left = rect.left + 'px';

    document.body.appendChild(popover);
    setTimeout(() => {
        document.addEventListener('click', closeTagPopoverOnOutsideClick);
    }, 0);
}

// ── Event Delegation ──

function attachEvents() {
    const section = document.getElementById('section-leads');
    if (!section) return;

    section.addEventListener('click', (e) => {
        const target = e.target;

        // Save button
        const saveBtn = target.closest('.lf-save-btn');
        if (saveBtn) {
            e.preventDefault();
            toggleSave(saveBtn.dataset.leadId);
            return;
        }

        // Message button
        const msgBtn = target.closest('.lf-message-btn');
        if (msgBtn) {
            e.preventDefault();
            openTemplateModal(msgBtn.dataset.leadId);
            return;
        }

        // Convert to Contact
        const convertBtn = target.closest('.lf-convert-btn');
        if (convertBtn) {
            e.preventDefault();
            openConvertModal(convertBtn.dataset.leadId);
            return;
        }

        // Tab switching
        const tabBtn = target.closest('.lf-tab');
        if (tabBtn) {
            e.preventDefault();
            switchLeadTab(tabBtn.dataset.tab);
            return;
        }

        // Save API key
        if (target.id === 'lf-saveApiKeyBtn') {
            e.preventDefault();
            saveApiKey();
            return;
        }

        // Search
        if (target.id === 'lf-searchBtn') {
            e.preventDefault();
            searchBusinesses();
            return;
        }

        // Save All
        if (target.id === 'lf-saveAllBtn') {
            e.preventDefault();
            saveAllResults();
            return;
        }

        // Find Duplicates
        if (target.id === 'lf-findDupesBtn') {
            e.preventDefault();
            findDuplicates();
            return;
        }

        // Export CSV
        if (target.id === 'lf-exportCsvBtn') {
            e.preventDefault();
            exportCSV();
            return;
        }

        // Refresh Scores
        if (target.id === 'lf-refreshScoresBtn') {
            e.preventDefault();
            refreshScores();
            return;
        }

        // Clear Saved
        if (target.id === 'lf-clearSavedBtn') {
            e.preventDefault();
            clearSaved();
            return;
        }

        // Toggle search panel
        if (target.id === 'lf-toggleSearch') {
            e.preventDefault();
            toggleSearchPanel();
            return;
        }

        // Add note to lead
        const addNoteBtn = target.closest('.lf-add-note-btn');
        if (addNoteBtn) {
            e.preventDefault();
            const leadId = addNoteBtn.dataset.leadId;
            const input = section.querySelector(`.lf-note-add-input[data-lead-id="${leadId}"]`);
            if (!input) return;
            const text = input.value.trim();
            if (!text) { window.CRM.showToast('Please enter a note.', 'error'); return; }
            store.addNote({ entityType: 'lead', entityId: leadId, text });
            window.CRM.showToast('Note added.');
            renderSaved();
            return;
        }

        // Delete note from lead
        const deleteNoteBtn = target.closest('.lf-delete-note-btn');
        if (deleteNoteBtn) {
            e.preventDefault();
            store.removeNote(deleteNoteBtn.dataset.noteId);
            window.CRM.showToast('Note deleted.');
            renderSaved();
            return;
        }

        // Hunter.io lookup button
        const hunterBtn = target.closest('.lf-hunter-btn');
        if (hunterBtn) {
            e.preventDefault();
            hunterLookup(hunterBtn.dataset.leadId, hunterBtn.dataset.domain);
            return;
        }

        // Use Hunter email result
        const useHunterBtn = target.closest('.lf-use-hunter-email');
        if (useHunterBtn) {
            e.preventDefault();
            const leadId = useHunterBtn.dataset.leadId;
            const email = useHunterBtn.dataset.email;
            const name = useHunterBtn.dataset.name?.trim();
            const title = useHunterBtn.dataset.title?.trim();
            const updates = { email };
            if (name) updates.decisionMaker = name;
            if (title) updates.decisionMakerTitle = title;
            store.updateLead(leadId, updates);
            window.CRM.showToast(`Email ${email} saved to lead.`);
            renderSaved();
            return;
        }

        // Save email quick-add
        const saveEmailBtn = target.closest('.lf-save-email-btn');
        if (saveEmailBtn) {
            e.preventDefault();
            const leadId = saveEmailBtn.dataset.leadId;
            const input = document.querySelector(`.lf-quick-email[data-lead-id="${CSS.escape(leadId)}"]`);
            if (input && input.value.trim()) {
                store.updateLead(leadId, { email: input.value.trim() });
                window.CRM.showToast('Email saved.');
                renderSaved();
            }
            return;
        }

        // Save all contact info
        const saveContactInfoBtn = target.closest('.lf-save-contact-info-btn');
        if (saveContactInfoBtn) {
            e.preventDefault();
            const leadId = saveContactInfoBtn.dataset.leadId;
            const esc = (sel) => {
                const el = document.querySelector(`${sel}[data-lead-id="${CSS.escape(leadId)}"]`);
                return el ? el.value.trim() : '';
            };
            const updates = {
                email: esc('.lf-quick-email') || undefined,
                decisionMaker: esc('.lf-quick-decision-maker') || undefined,
                decisionMakerTitle: esc('.lf-quick-decision-title') || undefined,
                facebook: esc('.lf-quick-facebook') || undefined,
                instagram: esc('.lf-quick-instagram') || undefined,
                linkedin: esc('.lf-quick-linkedin') || undefined,
                yelp: esc('.lf-quick-yelp') || undefined,
            };
            // Remove undefined keys
            Object.keys(updates).forEach(k => { if (updates[k] === undefined) delete updates[k]; });
            if (Object.keys(updates).length) {
                store.updateLead(leadId, updates);
                window.CRM.showToast('Contact info saved.');
                renderSaved();
            } else {
                window.CRM.showToast('No info to save.', 'info');
            }
            return;
        }

        // Yelp search button
        if (target.id === 'lf-yelpSearchBtn' || target.closest('#lf-yelpSearchBtn')) {
            e.preventDefault();
            yelpSearch();
            return;
        }

        // Tag button on lead card
        const tagBtn = target.closest('.lf-tag-btn');
        if (tagBtn) {
            e.preventDefault();
            e.stopPropagation();
            showTagPopover(tagBtn.dataset.leadId, tagBtn);
            return;
        }

        // Bulk select toggle button
        if (target.id === 'lf-bulkSelectBtn' || target.closest('#lf-bulkSelectBtn')) {
            e.preventDefault();
            toggleBulkMode();
            return;
        }

        // Select All / Deselect All
        if (target.id === 'lf-selectAllBtn') { e.preventDefault(); selectAllLeads(); return; }
        if (target.id === 'lf-deselectAllBtn') { e.preventDefault(); deselectAllLeads(); return; }

        // Bulk delete
        if (target.id === 'lf-bulkDeleteBtn' || target.closest('#lf-bulkDeleteBtn')) {
            e.preventDefault(); bulkDeleteSelected(); return;
        }

        // Bulk export
        if (target.id === 'lf-bulkExportBtn' || target.closest('#lf-bulkExportBtn')) {
            e.preventDefault(); bulkExportSelected(); return;
        }

        // Bulk tag button
        if (target.id === 'lf-bulkTagBtn' || target.closest('#lf-bulkTagBtn')) {
            e.preventDefault();
            e.stopPropagation();
            showBulkTagPopover(target.closest('#lf-bulkTagBtn') || target);
            return;
        }
    });

    // Change events (status dropdowns, sort, notes)
    section.addEventListener('change', (e) => {
        const target = e.target;

        if (target.classList.contains('lf-status-select') || target.classList.contains('lf-pipeline-status')) {
            updateStatus(target.dataset.leadId, target.value);
            return;
        }

        if (target.id === 'lf-sortSelect') {
            sortAndRender();
            return;
        }

        // Bulk status dropdown
        if (target.id === 'lf-bulkStatusSelect') {
            const status = target.value;
            if (status) {
                bulkUpdateStatus(status);
                target.value = '';
            }
            return;
        }

        // Bulk checkbox on lead card
        if (target.classList.contains('lf-bulk-checkbox')) {
            toggleBulkSelect(target.dataset.leadId);
            return;
        }
    });

    // Document-level handlers for popovers (appended to body)
    document.addEventListener('change', (e) => {
        // Tag checkbox in tag popover
        if (e.target.classList.contains('lf-tag-checkbox')) {
            toggleLeadTag(e.target.dataset.leadId, e.target.dataset.tagId);
            renderSaved();
        }
    });

    document.addEventListener('click', (e) => {
        // Bulk tag option in popover
        const bulkTagOption = e.target.closest('.lf-bulk-tag-option');
        if (bulkTagOption) {
            e.preventDefault();
            bulkAddTag(bulkTagOption.dataset.tagId);
            closeTagPopover();
        }
    });

    // Keydown events (Enter to add note)
    section.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.classList.contains('lf-note-add-input')) {
            e.preventDefault();
            const leadId = e.target.dataset.leadId;
            const text = e.target.value.trim();
            if (!text) return;
            store.addNote({ entityType: 'lead', entityId: leadId, text });
            window.CRM.showToast('Note added.');
            renderSaved();
        }
    });
}

// ── Save API Key ──

function saveApiKey() {
    const input = document.getElementById('lf-apiKeyInput');
    if (!input) return;
    const key = input.value.trim();
    if (!key) return;
    store.updateSettings({ apiKey: key });
    const banner = document.getElementById('lf-setupBanner');
    if (banner) banner.style.display = 'none';
    loadGoogleMaps(key);
    window.CRM.showToast('API key saved successfully.', 'success');
}

// ── Main Render ──

export function render() {
    const section = document.getElementById('section-leads');
    if (!section) return;

    const settings = store.getSettings();
    const savedLeads = store.getLeads();
    const hasApiKey = !!settings.apiKey;

    // Setup banner
    const setupBannerHtml = !hasApiKey ? `
        <div class="setup-banner" id="lf-setupBanner">
            <h3>One-Time Setup: Google Places API Key</h3>
            <p>This tool uses Google Places API to find real local businesses. You need a free API key:</p>
            <ol>
                <li>Go to <strong>Google Cloud Console</strong> &rarr; Create a project</li>
                <li>Enable the <strong>Places API</strong> and <strong>Maps JavaScript API</strong></li>
                <li>Create an API key under <strong>Credentials</strong></li>
                <li>Paste it below (stored only in your browser, never sent to any server)</li>
            </ol>
            <div class="api-input-row">
                <input type="text" id="lf-apiKeyInput" placeholder="Paste your Google API key here...">
                <button id="lf-saveApiKeyBtn" class="btn btn-primary">Save Key</button>
            </div>
        </div>` : '';

    // Search panel
    const searchPanelHtml = `
        <div style="text-align:right;max-width:1200px;margin:0.5rem auto 0;">
            <button id="lf-toggleSearch" class="btn btn-outline btn-sm">${searchPanelCollapsed ? 'Show Search' : 'Hide Search'}</button>
        </div>
        <div class="search-panel" id="lf-searchPanel" style="${searchPanelCollapsed ? 'display:none;' : ''}">
            <div class="search-row">
                <div class="search-field" style="flex:1.5;">
                    <label>Location</label>
                    <input type="text" id="lf-locationInput" placeholder="e.g. Austin, TX or 90210">
                </div>
                <div class="search-field">
                    <label>Business Category</label>
                    <select id="lf-categorySelect">
                        ${buildCategoryOptions()}
                    </select>
                </div>
                <div class="search-field" style="flex:0.7;">
                    <label>Radius (miles)</label>
                    <select id="lf-radiusSelect">
                        <option value="5">5 miles</option>
                        <option value="10" selected>10 miles</option>
                        <option value="25">25 miles</option>
                        <option value="50">50 miles</option>
                    </select>
                </div>
                <div class="search-field" style="flex:0; min-width: auto;">
                    <label>&nbsp;</label>
                    <div style="display:flex;gap:0.4rem;">
                        <button class="btn btn-primary" id="lf-searchBtn">Search</button>
                        <button class="btn btn-outline" id="lf-yelpSearchBtn" title="Search Yelp (requires Yelp API key)">Yelp</button>
                    </div>
                </div>
            </div>
            <div style="margin-top:0.75rem;">
                <label style="font-size:0.8rem; color:#888; display:flex; align-items:center; gap:0.4rem;">
                    <input type="text" id="lf-customCategory" placeholder="Or type a custom category..." style="padding:0.4rem 0.6rem; border:1px solid #D6EAF8; border-radius:4px; font-size:0.85rem; width:280px;">
                </label>
            </div>
        </div>`;

    // Tabs
    const savedCount = savedLeads.length;
    const activeCount = savedLeads.filter(l => l.status && l.status !== 'Not Interested' && l.status !== 'Closed').length;

    const tabsHtml = `
        <div class="tabs">
            <button class="tab lf-tab ${currentLeadTab === 'results' ? 'active' : ''}" data-tab="results">Search Results <span class="badge" id="lf-resultsBadge" style="display:${currentResults.length ? 'inline' : 'none'};">${currentResults.length}</span></button>
            <button class="tab lf-tab ${currentLeadTab === 'saved' ? 'active' : ''}" data-tab="saved">Saved Leads <span class="badge" id="lf-savedBadge" style="display:${savedCount ? 'inline' : 'none'};">${savedCount}</span></button>
            <button class="tab lf-tab ${currentLeadTab === 'pipeline' ? 'active' : ''}" data-tab="pipeline">Pipeline <span class="badge" id="lf-pipelineBadge" style="display:${activeCount ? 'inline' : 'none'};">${activeCount}</span></button>
        </div>`;

    // Results area
    const resultsTabHtml = `
        <div id="lf-resultsTab" style="display:${currentLeadTab === 'results' ? 'block' : 'none'};">
            <div class="stats-bar" id="lf-statsBar" style="display:${currentResults.length ? 'flex' : 'none'};">
                <div>
                    <span class="stat">Found <strong id="lf-resultCount">${currentResults.length}</strong> businesses</span>
                    <span class="enriching-notice" id="lf-enrichingNotice" style="display:none;">Fetching contact details...</span>
                </div>
                <div style="display:flex; gap:0.5rem; align-items:center;">
                    <select id="lf-sortSelect" style="padding:0.4rem 0.6rem; border:1.5px solid #D6EAF8; border-radius:4px; font-size:0.8rem;">
                        <option value="default">Sort: Default</option>
                        <option value="score-desc">Score: High to Low</option>
                        <option value="score-asc">Score: Low to High</option>
                        <option value="rating-desc">Rating: High to Low</option>
                        <option value="reviews-asc">Reviews: Low to High</option>
                    </select>
                    <button class="btn btn-outline btn-sm" id="lf-saveAllBtn">Save All</button>
                </div>
            </div>
            <div id="lf-resultsContainer">
                <div class="empty-state">
                    <h3>Search for Local Businesses</h3>
                    <p>Enter a location and category above to find businesses in your target area.</p>
                </div>
            </div>
        </div>`;

    const savedTabHtml = `
        <div id="lf-savedTab" style="display:${currentLeadTab === 'saved' ? 'block' : 'none'};">
            <div class="stats-bar">
                <div>
                    <span class="stat">You have <strong id="lf-savedCount">${savedCount}</strong> saved leads</span>
                    <span id="lf-refreshProgress" style="display:none;margin-left:8px;font-size:0.8rem;color:#2563eb;"></span>
                </div>
                <div style="display:flex; gap:0.5rem;">
                    <button class="btn btn-outline btn-sm" id="lf-refreshScoresBtn">Refresh Scores</button>
                    <button class="btn btn-outline btn-sm" id="lf-findDupesBtn">Find Duplicates</button>
                    <button class="btn btn-outline btn-sm" id="lf-exportCsvBtn">Export CSV</button>
                    <button class="btn ${bulkSelectMode ? 'btn-secondary' : 'btn-outline'} btn-sm" id="lf-bulkSelectBtn">${bulkSelectMode ? 'Cancel Select' : 'Select'}</button>
                    <button class="btn btn-danger btn-sm" id="lf-clearSavedBtn">Clear All</button>
                </div>
            </div>
            ${bulkSelectMode ? `
                <div style="display:flex;gap:0.5rem;margin-bottom:0.75rem;">
                    <button class="btn btn-outline btn-sm" id="lf-selectAllBtn">Select All</button>
                    <button class="btn btn-outline btn-sm" id="lf-deselectAllBtn">Deselect All</button>
                </div>` : ''}
            <div id="lf-savedContainer">
                <div class="empty-state">
                    <h3>No Saved Leads Yet</h3>
                    <p>Click the bookmark icon on any result to save it here.</p>
                </div>
            </div>
            ${bulkSelectMode ? `
                <div class="bulk-action-bar" id="lf-bulkActionBar" style="display:${bulkSelectedIds.size > 0 ? 'flex' : 'none'};">
                    <span class="bulk-count">${bulkSelectedIds.size} selected</span>
                    <select id="lf-bulkStatusSelect" class="btn btn-outline btn-sm" style="padding:0.35rem 0.5rem;">
                        <option value="">Update Status...</option>
                        ${PIPELINE_STAGES.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('')}
                    </select>
                    <button class="btn btn-outline btn-sm" id="lf-bulkTagBtn">Add Tag</button>
                    <button class="btn btn-outline btn-sm" id="lf-bulkExportBtn">Export Selected</button>
                    <button class="btn btn-danger btn-sm" id="lf-bulkDeleteBtn">Delete Selected</button>
                </div>` : ''}
        </div>`;

    const pipelineTabHtml = `
        <div id="lf-pipelineTab" style="display:${currentLeadTab === 'pipeline' ? 'block' : 'none'};">
            <div class="stats-bar">
                <div>
                    <span class="stat">Pipeline: <strong id="lf-pipelineCount">${savedCount}</strong> leads across all stages</span>
                </div>
            </div>
            <div id="lf-pipelineContainer"></div>
        </div>`;

    section.innerHTML = `
        <div class="container">
            ${setupBannerHtml}
        </div>
        ${searchPanelHtml}
        ${tabsHtml}
        <div class="results-area">
            ${resultsTabHtml}
            ${savedTabHtml}
            ${pipelineTabHtml}
        </div>`;

    // Render sub-content for the active tab
    if (currentResults.length && currentLeadTab === 'results') {
        renderResultsGrid();
    }
    if (currentLeadTab === 'saved') {
        renderSaved();
    }
    if (currentLeadTab === 'pipeline') {
        renderPipeline();
    }
}

// ── Init ──

export function init() {
    const settings = store.getSettings();

    // Migrate old saved leads that don't have a status
    store.getLeads().forEach(l => {
        if (!l.status) store.updateLead(l.id, { status: 'New' });
    });

    // Load Google Maps if key is available
    if (settings.apiKey) {
        loadGoogleMaps(settings.apiKey);
    }

    // Attach event delegation
    attachEvents();
}
