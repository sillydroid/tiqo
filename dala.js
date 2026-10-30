/**
 * TIKO — Party for Less
 * Control Center Controller (dala.js)
 */

// Strip .html from the address bar without page reload
(function cleanUrlBar() {
  if (window.location.pathname.endsWith(".html") || window.location.pathname.endsWith("dala.html")) {
    let cleanPath = window.location.pathname.replace(/dala\.html$/, "dala").replace(/\.html$/, "");
    const newUrl = cleanPath + window.location.search + window.location.hash;
    window.history.replaceState(null, "", newUrl);
  }
})();

const CONFIG = {
  SUPABASE_FUNCTIONS_URL: window.SUPABASE_FUNCTIONS_URL || "https://atwdadrwcczczkaaoewo.supabase.co/functions/v1"
};

// Session State
let adminToken = sessionStorage.getItem("tiko_admin_key") || "";
let currentAdminUser = JSON.parse(sessionStorage.getItem("tiko_admin_user") || "null");
let loadedEventsCache = [];

// DOM Elements
const adminAuth = document.getElementById("admin-auth");
const adminDashboard = document.getElementById("admin-dashboard");
const loginForm = document.getElementById("login-form");
const adminEmailInput = document.getElementById("admin-email-input");
const adminPasswordInput = document.getElementById("admin-password-input");
const loginError = document.getElementById("login-error");
const btnLogout = document.getElementById("btn-logout");
const currentAdminNameBadge = document.getElementById("current-admin-name-badge");

// Navigation
const navButtons = document.querySelectorAll(".admin-nav-btn");
const tabPanes = document.querySelectorAll(".admin-tab-pane");

// Create / Edit Event
const btnShowCreateEvent = document.getElementById("btn-show-create-event");
const createEventPanel = document.getElementById("create-event-panel");
const eventFormTitle = document.getElementById("event-form-title");
const btnSubmitEventForm = document.getElementById("btn-submit-event-form");
const evEditId = document.getElementById("ev-edit-id");
const btnCancelCreate = document.getElementById("btn-cancel-create");
const createEventForm = document.getElementById("create-event-form");
const catRowsContainer = document.getElementById("cat-rows-container");
const btnAddCatRow = document.getElementById("btn-add-cat-row");

// Create Promo
const btnShowCreatePromo = document.getElementById("btn-show-create-promo");
const createPromoPanel = document.getElementById("create-promo-panel");
const btnCancelPromo = document.getElementById("btn-cancel-promo");
const createPromoForm = document.getElementById("create-promo-form");

// Admin Users Management
const btnShowCreateAdmin = document.getElementById("btn-show-create-admin");
const createAdminPanel = document.getElementById("create-admin-panel");
const btnCancelAdmin = document.getElementById("btn-cancel-admin");
const createAdminForm = document.getElementById("create-admin-form");

// Profile Forms
const profileNameForm = document.getElementById("profile-name-form");
const profileNameInput = document.getElementById("profile-name-input");
const profileEmailInput = document.getElementById("profile-email-input");
const profileNameStatus = document.getElementById("profile-name-status");
const profilePasswordForm = document.getElementById("profile-password-form");
const curPassInput = document.getElementById("cur-pass-input");
const newPassInput = document.getElementById("new-pass-input");
const confirmPassInput = document.getElementById("confirm-pass-input");
const profilePassStatus = document.getElementById("profile-pass-status");

// Formatting
function formatKSh(amount) {
  return "KSh " + Number(amount || 0).toLocaleString("en-KE");
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-KE", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  } catch {
    return dateStr;
  }
}

// 1. Generic API Call to Edge Function
async function callAdminApi(action, payload = {}) {
  const res = await fetch(`${CONFIG.SUPABASE_FUNCTIONS_URL}/admin-api`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${adminToken}`
    },
    body: JSON.stringify({ action, ...payload })
  });

  const data = await res.json();
  if (!res.ok || data.success === false) {
    throw new Error(data.message || `Admin API action '${action}' failed.`);
  }
  return data;
}

// 2. Authentication Handling
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";

  const email = adminEmailInput.value.trim();
  const password = adminPasswordInput.value.trim();
  if (!email || !password) return;

  try {
    const res = await fetch(`${CONFIG.SUPABASE_FUNCTIONS_URL}/admin-api`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "admin-login", email, password })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || "Invalid email or password.");
    }

    adminToken = data.token;
    currentAdminUser = data.user;
    sessionStorage.setItem("tiko_admin_key", adminToken);
    sessionStorage.setItem("tiko_admin_user", JSON.stringify(currentAdminUser));

    showDashboard();

  } catch (err) {
    loginError.textContent = err.message || "Sign in failed. Check your credentials.";
  }
});

btnLogout.addEventListener("click", () => {
  sessionStorage.removeItem("tiko_admin_key");
  sessionStorage.removeItem("tiko_admin_user");
  adminToken = "";
  currentAdminUser = null;
  adminDashboard.classList.remove("active");
  adminAuth.style.display = "flex";
  adminPasswordInput.value = "";
});

function showDashboard() {
  adminAuth.style.display = "none";
  adminDashboard.classList.add("active");

  if (currentAdminUser && currentAdminNameBadge) {
    currentAdminNameBadge.textContent = currentAdminUser.name || currentAdminUser.email;
  }

  loadOverviewStats();
}

// 3. Tab Switching
navButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    navButtons.forEach(b => b.classList.remove("active"));
    tabPanes.forEach(p => p.classList.remove("active"));

    btn.classList.add("active");
    const targetTab = document.getElementById(btn.dataset.tab);
    if (targetTab) targetTab.classList.add("active");

    if (btn.dataset.tab === "tab-overview") loadOverviewStats();
    if (btn.dataset.tab === "tab-events") loadEventsList();
    if (btn.dataset.tab === "tab-orders") loadOrdersList();
    if (btn.dataset.tab === "tab-promos") loadPromosList();
    if (btn.dataset.tab === "tab-admins") loadAdminsList();
    if (btn.dataset.tab === "tab-profile") loadProfileTab();
    if (btn.dataset.tab === "tab-audit") loadAuditLogs();
  });
});

// 4. OVERVIEW STATS
async function loadOverviewStats() {
  try {
    const data = await callAdminApi("dashboard-stats");
    const stats = data.stats || {};

    document.getElementById("stat-revenue").textContent = formatKSh(stats.total_revenue || 0);
    document.getElementById("stat-sold").textContent = (stats.total_tickets_sold || 0).toLocaleString();
    document.getElementById("stat-events").textContent = (stats.total_events || 0).toString();

    const tbody = document.getElementById("overview-events-body");
    const events = stats.events || [];

    if (events.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">No events created yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = events.map(ev => `
      <tr>
        <td><strong>${ev.name}</strong></td>
        <td>${ev.date}</td>
        <td>${ev.venue}</td>
        <td><strong style="color:#c4b5fd;">${(ev.tickets_sold || 0).toLocaleString()}</strong></td>
        <td><strong style="color:#10b981;">${formatKSh(ev.revenue || 0)}</strong></td>
        <td>${(ev.remaining || 0).toLocaleString()}</td>
        <td><span class="status-pill ${ev.status}">${ev.status}</span></td>
      </tr>
    `).join('');

  } catch (err) {
    console.error("Error loading overview stats:", err);
  }
}

// 5. EVENTS & TICKET CATEGORIES (WITH EDIT CAPABILITY)
async function loadEventsList() {
  try {
    const data = await callAdminApi("list-events");
    loadedEventsCache = data.events || [];
    const tbody = document.getElementById("events-list-body");

    if (loadedEventsCache.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">No events created yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = loadedEventsCache.map(ev => {
      const cats = ev.ticket_categories || [];
      const catsSummary = cats.map(c => `${c.name} (${formatKSh(c.price)})`).join(', ') || "No categories";

      return `
        <tr>
          <td><strong>${ev.name}</strong></td>
          <td>${ev.venue}</td>
          <td>${ev.event_date}</td>
          <td style="font-size:0.8rem; color:var(--text-secondary); max-width:250px;">${catsSummary}</td>
          <td><span style="font-size:0.8rem; color:#a78bfa;">${ev.seating_model}</span></td>
          <td><span class="status-pill ${ev.status}">${ev.status}</span></td>
          <td>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              <button class="btn btn-outline btn-sm" onclick="openEditEvent('${ev.id}')">✏️ Edit</button>
              ${ev.status === 'published' 
                ? `<button class="btn btn-outline btn-sm" onclick="togglePublish('${ev.id}', 'draft')">Unpublish</button>` 
                : `<button class="btn btn-primary btn-sm" onclick="togglePublish('${ev.id}', 'published')">Publish</button>`}
              <button class="btn btn-sm" style="background:rgba(239,68,68,0.15); color:#ef4444;" onclick="deleteEvent('${ev.id}')">Cancel</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error("Error loading events list:", err);
  }
}

window.openEditEvent = function(eventId) {
  const ev = loadedEventsCache.find(e => e.id === eventId);
  if (!ev) return;

  evEditId.value = ev.id;
  eventFormTitle.textContent = `Edit Event: ${ev.name}`;
  btnSubmitEventForm.textContent = "Save Changes";

  document.getElementById("ev-name").value = ev.name || "";
  document.getElementById("ev-venue").value = ev.venue || "";
  document.getElementById("ev-date").value = ev.event_date || "";
  document.getElementById("ev-time").value = ev.event_time || "";
  document.getElementById("ev-cat").value = ev.category || "concert";
  document.getElementById("ev-model").value = ev.seating_model || "general_admission";
  document.getElementById("ev-poster").value = ev.poster_url || "";
  document.getElementById("ev-desc").value = ev.description || "";

  catRowsContainer.innerHTML = "";
  const cats = ev.ticket_categories || [];
  if (cats.length > 0) {
    cats.forEach(c => addCategoryRow(c.name, c.price, c.original_price, c.total_quantity, c.id));
  } else {
    addCategoryRow("Regular", 2000, 3000, 5000);
  }

  createEventPanel.style.display = "block";
  createEventPanel.scrollIntoView({ behavior: "smooth" });
};

window.togglePublish = async function(eventId, status) {
  try {
    await callAdminApi("publish-event", { event_id: eventId, status });
    loadEventsList();
    loadOverviewStats();
  } catch (err) {
    alert(err.message);
  }
};

window.deleteEvent = async function(eventId) {
  if (!confirm("Are you sure you want to cancel this event?")) return;
  try {
    await callAdminApi("delete-event", { event_id: eventId });
    loadEventsList();
    loadOverviewStats();
  } catch (err) {
    alert(err.message);
  }
};

function addCategoryRow(name = "", price = "", origPrice = "", qty = 1000, catId = "") {
  const rowId = "cat-row-" + Date.now() + Math.random().toString(36).substring(2, 6);
  const row = document.createElement("div");
  row.className = "cat-builder-row";
  row.id = rowId;
  row.innerHTML = `
    <input type="hidden" class="cat-id" value="${catId}">
    <input type="text" class="input-sm cat-name" placeholder="Category (e.g. VIP, Gold, Regular)" value="${name}" required>
    <input type="number" class="input-sm cat-price" placeholder="Price (KSh)" value="${price}" required min="0">
    <input type="number" class="input-sm cat-orig" placeholder="Original Price" value="${origPrice}">
    <input type="number" class="input-sm cat-qty" placeholder="Quantity" value="${qty}" required min="1">
    <button type="button" class="btn btn-sm" style="background:rgba(239,68,68,0.2); color:#ef4444;" onclick="document.getElementById('${rowId}').remove()">×</button>
  `;
  catRowsContainer.appendChild(row);
}

btnAddCatRow.addEventListener("click", () => addCategoryRow());

btnShowCreateEvent.addEventListener("click", () => {
  evEditId.value = "";
  eventFormTitle.textContent = "Create New Event";
  btnSubmitEventForm.textContent = "Publish Event & Tickets";
  createEventForm.reset();

  createEventPanel.style.display = "block";
  catRowsContainer.innerHTML = "";
  addCategoryRow("Regular", 2000, 3000, 5000);
  addCategoryRow("Gold", 5000, 7500, 1000);
  addCategoryRow("VIP", 10000, 15000, 500);
  addCategoryRow("Platinum", 20000, 25000, 100);
  createEventPanel.scrollIntoView({ behavior: "smooth" });
});

btnCancelCreate.addEventListener("click", () => {
  createEventPanel.style.display = "none";
});

createEventForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const isEdit = Boolean(evEditId.value);
  const eventId = evEditId.value;

  const name = document.getElementById("ev-name").value.trim();
  const venue = document.getElementById("ev-venue").value.trim();
  const event_date = document.getElementById("ev-date").value;
  const event_time = document.getElementById("ev-time").value.trim();
  const category = document.getElementById("ev-cat").value;
  const seating_model = document.getElementById("ev-model").value;
  const poster_url = document.getElementById("ev-poster").value.trim();
  const description = document.getElementById("ev-desc").value.trim();

  const catRows = catRowsContainer.querySelectorAll(".cat-builder-row");
  const ticket_categories = [];

  catRows.forEach((r, idx) => {
    const cId = r.querySelector(".cat-id").value;
    const cName = r.querySelector(".cat-name").value.trim();
    const cPrice = Number(r.querySelector(".cat-price").value);
    const cOrig = r.querySelector(".cat-orig").value ? Number(r.querySelector(".cat-orig").value) : null;
    const cQty = Number(r.querySelector(".cat-qty").value);

    if (cName && cPrice >= 0 && cQty > 0) {
      ticket_categories.push({
        id: cId || undefined,
        name: cName,
        price: cPrice,
        original_price: cOrig,
        total_quantity: cQty,
        sort_order: idx + 1
      });
    }
  });

  if (ticket_categories.length === 0) {
    alert("Please define at least one ticket category (e.g. VIP, Regular).");
    return;
  }

  try {
    if (isEdit) {
      await callAdminApi("update-event", {
        event_id: eventId,
        name,
        venue,
        event_date,
        event_time,
        category,
        seating_model,
        poster_url,
        description,
        ticket_categories
      });
      alert(`Event "${name}" updated successfully!`);
    } else {
      await callAdminApi("create-event", {
        name,
        venue,
        event_date,
        event_time,
        category,
        seating_model,
        poster_url,
        description,
        ticket_categories
      });
      alert("Event & Ticket Categories published successfully!");
    }

    createEventForm.reset();
    createEventPanel.style.display = "none";
    loadEventsList();
    loadOverviewStats();
  } catch (err) {
    alert(err.message);
  }
});

// 6. ORDERS & PAYMENTS RECONCILIATION
async function loadOrdersList() {
  try {
    const data = await callAdminApi("list-orders", { limit: 100 });
    const orders = data.orders || [];
    const tbody = document.getElementById("orders-list-body");

    if (orders.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;">No orders recorded yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = orders.map(ord => {
      const receipt = ord.provider_reference || "—";
      const statusClass = ord.status === 'paid' ? 'paid' : (ord.status === 'pending' ? 'pending' : 'failed');

      return `
        <tr>
          <td><strong style="color:#a78bfa;">${ord.order_reference}</strong></td>
          <td>${ord.customer_name}<br><small style="color:var(--text-muted);">${ord.customer_email}</small></td>
          <td>${ord.phone_number}</td>
          <td>${ord.events?.name || '—'}</td>
          <td>${ord.ticket_categories?.name || '—'}</td>
          <td>${ord.quantity}</td>
          <td><strong style="color:#10b981;">${formatKSh(ord.total_amount)}</strong></td>
          <td><span style="font-family:monospace; color:#fbbf24;">${receipt}</span></td>
          <td><span class="status-pill ${statusClass}">${ord.status}</span></td>
          <td><small>${formatDate(ord.created_at)}</small></td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error("Error loading orders list:", err);
  }
}

// 7. PROMO CODES
async function loadPromosList() {
  try {
    const data = await callAdminApi("list-promos");
    const promos = data.promos || [];
    const tbody = document.getElementById("promos-list-body");

    if (promos.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">No active promo codes.</td></tr>`;
      return;
    }

    tbody.innerHTML = promos.map(p => `
      <tr>
        <td><strong style="color:#fbbf24; font-family:monospace; font-size:1.05rem;">${p.code}</strong></td>
        <td>${p.discount_type === 'percentage' ? 'Percentage (%)' : 'Fixed Amount (KSh)'}</td>
        <td>${p.discount_type === 'percentage' ? `${p.discount_value}%` : formatKSh(p.discount_value)}</td>
        <td>${p.current_uses} ${p.max_uses ? `/ ${p.max_uses}` : ''}</td>
        <td><span class="status-pill ${p.is_active ? 'paid' : 'failed'}">${p.is_active ? 'Active' : 'Inactive'}</span></td>
      </tr>
    `).join('');

  } catch (err) {
    console.error("Error loading promos:", err);
  }
}

btnShowCreatePromo.addEventListener("click", () => {
  createPromoPanel.style.display = "block";
});

btnCancelPromo.addEventListener("click", () => {
  createPromoPanel.style.display = "none";
});

createPromoForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = document.getElementById("promo-code").value.trim().toUpperCase();
  const discount_type = document.getElementById("promo-type").value;
  const discount_value = Number(document.getElementById("promo-val").value);

  try {
    await callAdminApi("create-promo", {
      code,
      discount_type,
      discount_value
    });
    alert(`Promo Code ${code} created successfully!`);
    createPromoForm.reset();
    createPromoPanel.style.display = "none";
    loadPromosList();
  } catch (err) {
    alert(err.message);
  }
});

// 8. ADMIN USERS MANAGEMENT
async function loadAdminsList() {
  try {
    const data = await callAdminApi("list-admin-users");
    const users = data.users || [];
    const tbody = document.getElementById("admins-list-body");

    if (users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No admin users found.</td></tr>`;
      return;
    }

    tbody.innerHTML = users.map(u => {
      const isCurrent = currentAdminUser && currentAdminUser.id === u.id;
      return `
        <tr>
          <td><strong>${u.name}</strong> ${isCurrent ? '<span style="color:#10b981; font-size:0.75rem;">(You)</span>' : ''}</td>
          <td>${u.email}</td>
          <td><span style="color:#a78bfa; font-weight:700;">${u.role}</span></td>
          <td><span class="status-pill ${u.is_active ? 'paid' : 'failed'}">${u.is_active ? 'Active' : 'Disabled'}</span></td>
          <td><small>${formatDate(u.created_at)}</small></td>
          <td>
            ${isCurrent ? '—' : `<button class="btn btn-sm" style="background:rgba(239,68,68,0.15); color:#ef4444;" onclick="deleteAdminUser('${u.id}', '${u.name}')">Delete</button>`}
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error("Error loading admins:", err);
  }
}

window.deleteAdminUser = async function(userId, name) {
  if (!confirm(`Are you sure you want to delete admin user "${name}"?`)) return;
  try {
    await callAdminApi("delete-admin-user", { user_id: userId });
    alert("Admin user deleted.");
    loadAdminsList();
  } catch (err) {
    alert(err.message);
  }
};

btnShowCreateAdmin.addEventListener("click", () => {
  createAdminPanel.style.display = "block";
});

btnCancelAdmin.addEventListener("click", () => {
  createAdminPanel.style.display = "none";
});

createAdminForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("new-admin-name").value.trim();
  const email = document.getElementById("new-admin-email").value.trim();
  const password = document.getElementById("new-admin-pass").value;
  const role = document.getElementById("new-admin-role").value;

  try {
    await callAdminApi("create-admin-user", { name, email, password, role });
    alert(`Admin user "${name}" created successfully!`);
    createAdminForm.reset();
    createAdminPanel.style.display = "none";
    loadAdminsList();
  } catch (err) {
    alert(err.message);
  }
});

// 9. PROFILE & PASSWORD EDIT
function loadProfileTab() {
  if (currentAdminUser) {
    profileNameInput.value = currentAdminUser.name || "";
    profileEmailInput.value = currentAdminUser.email || "";
  }
  profileNameStatus.textContent = "";
  profilePassStatus.textContent = "";
}

profileNameForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  profileNameStatus.textContent = "Saving...";
  profileNameStatus.style.color = "#94a3b8";

  const newName = profileNameInput.value.trim();
  if (!newName) return;

  try {
    const res = await callAdminApi("update-admin-profile", {
      user_id: currentAdminUser?.id,
      name: newName
    });

    if (currentAdminUser) {
      currentAdminUser.name = newName;
      sessionStorage.setItem("tiko_admin_user", JSON.stringify(currentAdminUser));
      currentAdminNameBadge.textContent = newName;
    }

    profileNameStatus.style.color = "#10b981";
    profileNameStatus.textContent = "✓ Name updated successfully!";
  } catch (err) {
    profileNameStatus.style.color = "#ef4444";
    profileNameStatus.textContent = err.message;
  }
});

profilePasswordForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  profilePassStatus.textContent = "Updating...";
  profilePassStatus.style.color = "#94a3b8";

  const curPass = curPassInput.value;
  const newPass = newPassInput.value;
  const confirmPass = confirmPassInput.value;

  if (newPass !== confirmPass) {
    profilePassStatus.style.color = "#ef4444";
    profilePassStatus.textContent = "New passwords do not match.";
    return;
  }

  try {
    await callAdminApi("change-password", {
      user_id: currentAdminUser?.id,
      current_password: curPass,
      new_password: newPass
    });

    profilePassStatus.style.color = "#10b981";
    profilePassStatus.textContent = "✓ Password changed successfully!";
    profilePasswordForm.reset();
  } catch (err) {
    profilePassStatus.style.color = "#ef4444";
    profilePassStatus.textContent = err.message;
  }
});

// 10. AUDIT LOGS
async function loadAuditLogs() {
  try {
    const data = await callAdminApi("list-audit-logs");
    const logs = data.logs || [];
    const tbody = document.getElementById("audit-logs-body");

    if (logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">No audit log entries recorded.</td></tr>`;
      return;
    }

    tbody.innerHTML = logs.map(l => `
      <tr>
        <td><small style="color:var(--text-muted);">${new Date(l.created_at).toLocaleString('en-KE')}</small></td>
        <td><strong style="color:#c4b5fd;">${l.action}</strong></td>
        <td>${l.entity_type || '—'}</td>
        <td><span style="color:#10b981;">${l.performed_by || 'system'}</span></td>
        <td><small style="color:var(--text-secondary);">${JSON.stringify(l.details || {})}</small></td>
      </tr>
    `).join('');

  } catch (err) {
    console.error("Error loading audit logs:", err);
  }
}

// Auto-login on load if session exists
document.addEventListener("DOMContentLoaded", () => {
  if (adminToken) {
    showDashboard();
  } else {
    // Pre-populate demo / initial admin email for convenience
    if (adminEmailInput) adminEmailInput.value = "vitupoaapp@gmail.com";
  }
});
