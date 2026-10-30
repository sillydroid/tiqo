/**
 * TIKO — Party for Less
 * Homepage: Event Discovery, Fast Search & Category Filtering
 */

// Strip .html from the browser address bar without page reload
(function cleanUrlBar() {
  if (window.location.pathname.endsWith(".html") || window.location.pathname.endsWith("index.html")) {
    let cleanPath = window.location.pathname.replace(/index\.html$/, "").replace(/\.html$/, "");
    if (cleanPath === "") cleanPath = "/";
    const newUrl = cleanPath + window.location.search + window.location.hash;
    window.history.replaceState(null, "", newUrl);
  }
})();

const CONFIG = {
  SUPABASE_FUNCTIONS_URL: window.SUPABASE_FUNCTIONS_URL || "https://atwdadrwcczczkaaoewo.supabase.co/functions/v1"
};

// State
let allEvents = [];
let currentCategory = "all";
let currentSearch = "";

// DOM Elements
const eventsGrid = document.getElementById("events-grid");
const eventsCount = document.getElementById("events-count");
const searchInput = document.getElementById("event-search-input");
const categoryPills = document.querySelectorAll(".cat-pill");
const mobileMenuBtn = document.getElementById("mobile-menu-btn");
const mobileMenu = document.getElementById("mobile-menu");

// Format Currency
function formatKSh(amount) {
  return "KSh " + Number(amount || 0).toLocaleString("en-KE");
}

// Format Date
function formatEventDate(dateStr) {
  if (!dateStr) return "";
  try {
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      return d.toLocaleDateString("en-KE", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric"
      });
    }
  } catch (e) {
    console.warn("Date parse error:", e);
  }
  return dateStr;
}

// Init Splash Screen
function initSplash() {
  const splash = document.getElementById("splash-screen");
  if (!splash) return;

  setTimeout(() => {
    splash.classList.add("fade-out");
    setTimeout(() => {
      splash.style.display = "none";
    }, 700);
  }, 1200);
}

// Mobile Menu Toggle
if (mobileMenuBtn && mobileMenu) {
  mobileMenuBtn.addEventListener("click", () => {
    mobileMenu.classList.toggle("open");
  });
  mobileMenu.querySelectorAll("a").forEach(a => {
    a.addEventListener("click", () => mobileMenu.classList.remove("open"));
  });
}

// Fetch Events from Supabase Edge Function
async function fetchEvents() {
  try {
    const res = await fetch(`${CONFIG.SUPABASE_FUNCTIONS_URL}/list-events`);
    if (!res.ok) throw new Error("Failed to load events.");

    const data = await res.json();
    if (data.success && Array.isArray(data.events)) {
      allEvents = data.events;
      renderEvents();
    } else {
      renderError("No events currently listed. Please check back soon!");
    }
  } catch (err) {
    console.error("Fetch events error:", err);
    renderFallbackEvents();
  }
}

// Render Events Filtered by Category & Search Term
function renderEvents() {
  let filtered = allEvents;

  // Filter by category
  if (currentCategory !== "all") {
    filtered = filtered.filter(ev => (ev.category || "").toLowerCase() === currentCategory.toLowerCase());
  }

  // Filter by search query
  if (currentSearch.trim() !== "") {
    const term = currentSearch.toLowerCase();
    filtered = filtered.filter(ev => 
      (ev.name && ev.name.toLowerCase().includes(term)) ||
      (ev.venue && ev.venue.toLowerCase().includes(term)) ||
      (ev.description && ev.description.toLowerCase().includes(term))
    );
  }

  if (eventsCount) {
    eventsCount.textContent = `${filtered.length} event${filtered.length === 1 ? '' : 's'} found`;
  }

  if (filtered.length === 0) {
    eventsGrid.innerHTML = `
      <div class="state-box">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="1.5" style="margin-bottom:12px;">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <h3 style="font-size:1.2rem; margin-bottom:6px;">No events matched your search</h3>
        <p style="color:var(--text-secondary); font-size:0.9rem;">Try searching for another artist, city or reset the category filter.</p>
      </div>
    `;
    return;
  }

  eventsGrid.innerHTML = filtered.map(ev => {
    const isEnded = ev.is_ended || (ev.event_date && ev.event_date < new Date().toISOString().split("T")[0]);
    const startingPrice = ev.starting_price 
      ? formatKSh(ev.starting_price)
      : (ev.ticket_categories && ev.ticket_categories.length > 0 
          ? formatKSh(Math.min(...ev.ticket_categories.map(c => Number(c.price)))) 
          : "Free");

    const poster = ev.poster_url || "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?q=80&w=1200";
    const categoryName = (ev.category || "Event").toUpperCase();
    const formattedDate = formatEventDate(ev.event_date);

    return `
      <div class="event-card ${isEnded ? 'ended-event-card' : ''}" style="${isEnded ? 'opacity: 0.75;' : ''}">
        <div class="event-poster-wrapper">
          <img src="${poster}" alt="${ev.name}" class="event-poster" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=1200'">
          <span class="event-cat-tag">${categoryName}</span>
          ${isEnded ? '<span style="position:absolute; bottom:10px; right:10px; background:#ef4444; color:#fff; font-size:0.75rem; font-weight:800; padding:3px 8px; border-radius:4px;">EVENT ENDED</span>' : ''}
        </div>
        <div class="event-card-body">
          <h3 class="event-name">${ev.name}</h3>
          <div class="event-meta-list">
            <div class="event-meta-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z"></path>
                <circle cx="12" cy="10" r="3"></circle>
              </svg>
              <span>${ev.venue}</span>
            </div>
            <div class="event-meta-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
              <span>${formattedDate} · ${ev.event_time || ''}</span>
            </div>
          </div>
          <div class="event-card-footer">
            <div class="event-price-box">
              <span class="price-label">${isEnded ? 'Tickets' : 'From'}</span>
              <span class="price-amount" style="${isEnded ? 'color:var(--text-muted); font-size:1rem;' : ''}">
                ${isEnded ? 'Sales Closed' : startingPrice}
              </span>
            </div>
            <a href="event.html?id=${ev.id || ev.slug}" class="btn ${isEnded ? 'btn-outline' : 'btn-primary'} btn-sm">
              ${isEnded ? 'View Details' : 'BOOK NOW →'}
            </a>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Fallback Events
function renderFallbackEvents() {
  allEvents = [
    {
      id: "ne-yo-live-in-nairobi",
      name: "Ne-Yo Live in Concert — Brunch Edition",
      venue: "Ulinzi Sports Complex, Nairobi",
      event_date: "2026-10-20",
      event_time: "3:00 PM — 11:00 PM",
      poster_url: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?q=80&w=1200&auto=format&fit=crop",
      category: "concert",
      starting_price: 2000,
      is_ended: false
    },
    {
      id: "sol-fest-nairobi-2026",
      name: "Sol Fest Nairobi 2026",
      venue: "Carnivore Grounds, Nairobi",
      event_date: "2026-11-14",
      event_time: "12:00 PM — 11:59 PM",
      poster_url: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=1200&auto=format&fit=crop",
      category: "festival",
      starting_price: 2500,
      is_ended: false
    },
    {
      id: "mashemeji-derby-2026",
      name: "Mashemeji Derby 2026: Gor Mahia vs AFC Leopards",
      venue: "Nyayo National Stadium, Nairobi",
      event_date: "2026-11-28",
      event_time: "2:00 PM — 6:00 PM",
      poster_url: "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?q=80&w=1200&auto=format&fit=crop",
      category: "sports",
      starting_price: 1000,
      is_ended: false
    }
  ];
  renderEvents();
}

function renderError(msg) {
  eventsGrid.innerHTML = `
    <div class="state-box">
      <p style="color:var(--text-secondary);">${msg}</p>
    </div>
  `;
}

// Event Listeners
if (searchInput) {
  searchInput.addEventListener("input", (e) => {
    currentSearch = e.target.value;
    renderEvents();
  });
}

categoryPills.forEach(pill => {
  pill.addEventListener("click", () => {
    categoryPills.forEach(p => p.classList.remove("active"));
    pill.classList.add("active");
    currentCategory = pill.dataset.category || "all";
    renderEvents();
  });
});

// Initialization
document.addEventListener("DOMContentLoaded", () => {
  initSplash();
  fetchEvents();
});
