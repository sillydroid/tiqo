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

function formatTime(dateStr) {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleTimeString("en-KE", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });
  } catch {
    return "";
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
    if (btn.dataset.tab === "tab-referrals") loadReferralsList();
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
        <td><strong style="color:#00f576;">${(ev.tickets_sold || 0).toLocaleString()}</strong></td>
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
          <td><span style="font-size:0.8rem; color:#38bdf8;">${ev.seating_model}</span></td>
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
  
  // Handle Category & "Other" specification
  const standardCats = ["concert", "festival", "sports", "show", "theatre"];
  const catVal = (ev.category || "concert").toLowerCase();
  const evCatSelect = document.getElementById("ev-cat");
  const evCatOtherWrapper = document.getElementById("ev-cat-other-wrapper");
  const evCatOtherInput = document.getElementById("ev-cat-other");

  if (standardCats.includes(catVal)) {
    evCatSelect.value = catVal;
    evCatOtherWrapper.style.display = "none";
    evCatOtherInput.value = "";
  } else {
    evCatSelect.value = "other";
    evCatOtherWrapper.style.display = "block";
    evCatOtherInput.value = ev.category || "";
  }

  document.getElementById("ev-model").value = ev.seating_model || "general_admission";
  document.getElementById("ev-poster").value = ev.poster_url || "";
  document.getElementById("ev-desc").value = ev.description || "";

  // Poster preview
  const posterPreviewBox = document.getElementById("ev-poster-preview-box");
  const posterPreview = document.getElementById("ev-poster-preview");
  if (ev.poster_url) {
    posterPreview.src = ev.poster_url;
    posterPreviewBox.style.display = "block";
  } else {
    posterPreviewBox.style.display = "none";
  }

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

// Toggle "Other" category input
const evCatSelect = document.getElementById("ev-cat");
const evCatOtherWrapper = document.getElementById("ev-cat-other-wrapper");
const evCatOtherInput = document.getElementById("ev-cat-other");

if (evCatSelect) {
  evCatSelect.addEventListener("change", () => {
    if (evCatSelect.value === "other") {
      evCatOtherWrapper.style.display = "block";
      evCatOtherInput.focus();
    } else {
      evCatOtherWrapper.style.display = "none";
      evCatOtherInput.value = "";
    }
  });
}

// Upload Poster to Supabase Storage Bucket
const evPosterFileInput = document.getElementById("ev-poster-file");
const evPosterInput = document.getElementById("ev-poster");
const evUploadStatus = document.getElementById("ev-upload-status");
const evPosterPreviewBox = document.getElementById("ev-poster-preview-box");
const evPosterPreview = document.getElementById("ev-poster-preview");

if (evPosterFileInput) {
  evPosterFileInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please select a valid image file (PNG, JPG, WEBP).");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Image file size should be less than 5 MB.");
      return;
    }

    evUploadStatus.style.display = "inline";
    evUploadStatus.textContent = "Uploading to bucket...";

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64Data = reader.result;
        const res = await callAdminApi("upload-poster", {
          file_base64: base64Data,
          file_name: file.name,
          mime_type: file.type
        });

        if (res.success && res.url) {
          evPosterInput.value = res.url;
          evPosterPreview.src = res.url;
          evPosterPreviewBox.style.display = "block";
          evUploadStatus.textContent = "✓ Uploaded!";
          setTimeout(() => { evUploadStatus.style.display = "none"; }, 3500);
        } else {
          throw new Error(res.message || "Upload failed.");
        }
      } catch (uploadErr) {
        console.error("Upload error:", uploadErr);
        evUploadStatus.textContent = "Upload failed: " + uploadErr.message;
        alert("Image upload failed: " + uploadErr.message);
      }
    };
    reader.readAsDataURL(file);
  });
}

if (evPosterInput) {
  evPosterInput.addEventListener("input", () => {
    const val = evPosterInput.value.trim();
    if (val) {
      evPosterPreview.src = val;
      evPosterPreviewBox.style.display = "block";
    } else {
      evPosterPreviewBox.style.display = "none";
    }
  });
}

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

  // Reset custom category & preview
  if (evCatOtherWrapper) evCatOtherWrapper.style.display = "none";
  if (evPosterPreviewBox) evPosterPreviewBox.style.display = "none";
  if (evUploadStatus) evUploadStatus.style.display = "none";

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
  
  let category = document.getElementById("ev-cat").value;
  if (category === "other") {
    const customCat = document.getElementById("ev-cat-other").value.trim();
    if (!customCat) {
      alert("Please specify the custom category name (e.g. Comedy, Gala, Workshop).");
      document.getElementById("ev-cat-other").focus();
      return;
    }
    category = customCat.toLowerCase();
  }

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

let currentOrdersData = [];

// 6. ORDERS & PAYMENTS RECONCILIATION
async function loadOrdersList() {
  try {
    const data = await callAdminApi("list-orders", { limit: 100 });
    const orders = data.orders || [];
    currentOrdersData = orders;
    const tbody = document.getElementById("orders-list-body");
    const gatewayAlert = document.getElementById("orders-gateway-alert");
    const gatewayMsg = document.getElementById("orders-gateway-msg");

    if (orders.length === 0) {
      tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;">No orders recorded yet.</td></tr>`;
      if (gatewayAlert) gatewayAlert.style.display = "none";
      return;
    }

    // Diagnostic check for PayHero account or channel issues
    const merchantIssueOrder = orders.find(o => 
      o.status === 'failed' && 
      o.failure_reason && 
      (o.failure_reason.toLowerCase().includes("merchant account inactive") || 
       o.failure_reason.toLowerCase().includes("payhero") || 
       o.failure_reason.toLowerCase().includes("channel"))
    );

    if (merchantIssueOrder && gatewayAlert && gatewayMsg) {
      gatewayAlert.style.display = "block";
      gatewayMsg.innerHTML = `
        PayHero returned: <strong style="color:#fff;">"${merchantIssueOrder.failure_reason}"</strong> on recent order <code>${merchantIssueOrder.order_reference}</code>.<br>
        <strong>Required Action:</strong> Sign in to your PayHero Kenya dashboard (<a href="https://backend.payhero.co.ke" target="_blank" style="color:#38bdf8; text-decoration:underline; font-weight:700;">backend.payhero.co.ke</a>), navigate to <strong>Payment Channels</strong>, ensure your M-Pesa channel is switched to <strong>Active</strong>, and verify your credentials.
      `;
    } else if (gatewayAlert) {
      gatewayAlert.style.display = "none";
    }

    tbody.innerHTML = orders.map(ord => {
      const receipt = ord.provider_reference || "—";
      const statusClass = ord.status === 'paid' ? 'paid' : (ord.status === 'pending' ? 'pending' : 'failed');
      const failureHtml = (ord.status === 'failed' && ord.failure_reason)
        ? `<div style="color:#f87171; font-size:0.75rem; margin-top:4px; font-weight:600; line-height:1.3; max-width:240px; background:rgba(239,68,68,0.1); padding:4px 8px; border-radius:4px; border:1px solid rgba(239,68,68,0.25);" title="${ord.failure_reason}">⚠️ ${ord.failure_reason}</div>`
        : '';

      const ticketActionHtml = ord.status === 'paid'
        ? `<div style="display:flex; gap:6px; align-items:center;">
             <button type="button" class="btn btn-sm btn-download-admin-pass" data-ref="${ord.order_reference}" style="padding:4px 8px; font-size:0.75rem; background:rgba(0,245,118,0.15); border:1px solid #00f576; color:#00f576; border-radius:4px; font-weight:700; cursor:pointer;" title="Download PDF Pass">
               📥 PDF
             </button>
             <button type="button" class="btn btn-sm btn-view-admin-pass" data-ref="${ord.order_reference}" style="padding:4px 8px; font-size:0.75rem; background:rgba(56,189,248,0.15); border:1px solid #38bdf8; color:#38bdf8; border-radius:4px; font-weight:700; cursor:pointer;" title="View Digital Pass">
               👁️ View
             </button>
           </div>`
        : `<span style="color:var(--text-muted); font-size:0.75rem;">—</span>`;

      return `
        <tr>
          <td><strong style="color:#00f576;">${ord.order_reference}</strong></td>
          <td>${ord.customer_name}<br><small style="color:var(--text-muted);">${ord.customer_email}</small></td>
          <td>${ord.phone_number}</td>
          <td>${ord.events?.name || '—'}</td>
          <td>${ord.ticket_categories?.name || '—'}</td>
          <td>${ord.quantity}</td>
          <td><strong style="color:#10b981;">${formatKSh(ord.total_amount)}</strong></td>
          <td><span style="font-family:monospace; color:#fbbf24;">${receipt}</span></td>
          <td>
            <span class="status-pill ${statusClass}">${ord.status.toUpperCase()}</span>
            ${failureHtml}
          </td>
          <td>
            <small style="font-weight:600; color:var(--text-main);">${formatDate(ord.created_at)}</small><br>
            <small style="color:var(--text-muted); font-size:0.75rem;">${formatTime(ord.created_at)}</small>
          </td>
          <td>${ticketActionHtml}</td>
        </tr>
      `;
    }).join('');

    // Attach click listeners to download and view buttons
    tbody.querySelectorAll(".btn-download-admin-pass").forEach(btn => {
      btn.addEventListener("click", () => {
        const ref = btn.dataset.ref;
        if (ref) downloadAdminTicketPDF(ref);
      });
    });

    tbody.querySelectorAll(".btn-view-admin-pass").forEach(btn => {
      btn.addEventListener("click", () => {
        const ref = btn.dataset.ref;
        if (ref) viewAdminTicketPass(ref);
      });
    });

  } catch (err) {
    console.error("Error loading orders list:", err);
  }
}

function viewAdminTicketPass(orderRef) {
  const ord = currentOrdersData.find(o => o.order_reference === orderRef);
  if (!ord) return;

  const modal = document.getElementById("admin-ticket-preview-modal");
  if (!modal) return;

  document.getElementById("adm-dt-event").textContent = ord.events?.name || "Tiko Event";
  document.getElementById("adm-dt-venue-date").textContent = `${formatDate(ord.events?.event_date)} · ${ord.events?.event_time || ''} · ${ord.events?.venue || ''}`;
  document.getElementById("adm-dt-attendee").textContent = ord.customer_name || "Valued Guest";
  document.getElementById("adm-dt-category").textContent = ord.ticket_categories?.name || "General Admission";
  document.getElementById("adm-dt-qty").textContent = ord.quantity;
  document.getElementById("adm-dt-total").textContent = formatKSh(ord.total_amount);
  document.getElementById("adm-dt-receipt").textContent = ord.provider_reference || "CONFIRMED";
  document.getElementById("adm-dt-ref").textContent = ord.order_reference;

  const qrContainer = document.getElementById("adm-dt-qrcode");
  if (qrContainer) {
    qrContainer.innerHTML = "";
    if (window.QRCode) {
      new QRCode(qrContainer, {
        text: `${CONFIG.SUPABASE_FUNCTIONS_URL}/check-order?reference=${ord.order_reference}`,
        width: 140,
        height: 140,
        correctLevel: QRCode.CorrectLevel.H
      });
    }
  }

  const btnDownload = document.getElementById("btn-adm-modal-download");
  if (btnDownload) {
    btnDownload.onclick = () => downloadAdminTicketPDF(ord.order_reference);
  }

  const linkPublic = document.getElementById("link-adm-modal-public");
  if (linkPublic) {
    linkPublic.href = `event.html?ref=${encodeURIComponent(ord.order_reference)}&id=${encodeURIComponent(ord.event_id || '')}`;
  }

  modal.style.display = "flex";
}

async function downloadAdminTicketPDF(orderRef) {
  const ord = currentOrdersData.find(o => o.order_reference === orderRef);
  if (!ord) {
    alert("Order not found: " + orderRef);
    return;
  }
  if (ord.status !== "paid") {
    alert("Only confirmed and paid orders have digital tickets.");
    return;
  }

  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) {
    alert("PDF generator library is still loading, please try again in a few moments.");
    return;
  }

  try {
    const hiddenQr = document.getElementById("admin-qrcode-hidden");
    if (hiddenQr) hiddenQr.innerHTML = "";
    let qrDataUrl = "";

    if (window.QRCode && hiddenQr) {
      new QRCode(hiddenQr, {
        text: `${CONFIG.SUPABASE_FUNCTIONS_URL}/check-order?reference=${ord.order_reference}`,
        width: 150,
        height: 150,
        correctLevel: QRCode.CorrectLevel.H
      });
      await new Promise(r => setTimeout(r, 150));
      const qrCanvas = hiddenQr.querySelector("canvas");
      if (qrCanvas) qrDataUrl = qrCanvas.toDataURL("image/png");
    }

    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: [210, 148]
    });

    // Dark sleek background
    doc.setFillColor(11, 10, 18);
    doc.rect(0, 0, 210, 148, "F");

    // Header banner
    doc.setFillColor(24, 18, 45);
    doc.rect(0, 0, 210, 42, "F");

    // Outer border
    doc.setDrawColor(43, 76, 250);
    doc.setLineWidth(0.8);
    doc.roundedRect(6, 6, 198, 136, 4, 4, "S");

    // Brand logo & title
    // White logo on dark bg — logo.png is 1024×576 (aspect ~1.78)
    try {
      await new Promise((resolve, reject) => {
        const logoImg = new Image();
        logoImg.onload = () => {
          // Place at X=14, Y=8, W=32, H=18
          doc.addImage(logoImg, "PNG", 14, 8, 32, 18);
          resolve();
        };
        logoImg.onerror = reject;
        logoImg.src = "assets/logo.png";
      });
    } catch (_logoErr) {
      // Fallback: text TIKO if image fails
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(26);
      doc.setFont("helvetica", "bold");
      doc.text("TIKO", 14, 22);
    }

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(167, 139, 250);
    doc.text("PARTY FOR LESS", 14, 30);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text("Affordable entertainment — more vibes, less spend", 14, 35);

    // Verified badge
    doc.setFillColor(16, 185, 129);
    doc.setTextColor(10, 10, 15);
    doc.roundedRect(144, 14, 52, 10, 2, 2, "F");
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("VERIFIED PASS", 170, 20.5, { align: "center" });

    // Divider
    doc.setDrawColor(43, 76, 250);
    doc.setLineWidth(0.5);
    doc.line(14, 40, 196, 40);

    // Event Details
    const eventName = ord.events?.name || "TIKO EVENT";
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15);
    doc.setFont("helvetica", "bold");
    doc.text(eventName.toUpperCase(), 14, 50);

    doc.setFontSize(9);
    doc.setTextColor(203, 213, 225);
    doc.setFont("helvetica", "bold");
    doc.text("DATE: ", 14, 60);
    doc.setFont("helvetica", "normal");
    doc.text(formatDate(ord.events?.event_date) || "TBA", 32, 60);

    doc.setFont("helvetica", "bold");
    doc.text("TIME: ", 14, 66);
    doc.setFont("helvetica", "normal");
    doc.text(ord.events?.event_time || "Doors Open", 32, 66);

    doc.setFont("helvetica", "bold");
    doc.text("VENUE: ", 14, 72);
    doc.setFont("helvetica", "normal");
    doc.text(ord.events?.venue || "Nairobi, Kenya", 32, 72);

    // Attendee Card Box
    doc.setFillColor(18, 17, 30);
    doc.roundedRect(14, 80, 120, 52, 3, 3, "F");
    doc.setDrawColor(255, 255, 255, 0.1);
    doc.roundedRect(14, 80, 120, 52, 3, 3, "S");

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(148, 163, 184);
    doc.text("ATTENDEE", 18, 88);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text((ord.customer_name || "VALUED GUEST").toUpperCase(), 18, 95);

    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text("CATEGORY & SEAT", 18, 103);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(245, 158, 11);
    const seatInfo = ord.selected_seats && ord.selected_seats.length > 0 ? ord.selected_seats.join(", ") : "General Admission";
    doc.text(`${ord.quantity} × ${ord.ticket_categories?.name || "Pass"} (${seatInfo})`, 18, 109);

    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text("AMOUNT PAID: ", 18, 119);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(16, 185, 129);
    doc.text(formatKSh(ord.total_amount), 45, 119);

    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text("M-PESA REF: ", 18, 126);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(ord.provider_reference || "CONFIRMED", 45, 126);

    // Perforated Tear Line
    doc.setDrawColor(255, 255, 255, 0.2);
    doc.setLineDashPattern([2, 2], 0);
    doc.line(142, 40, 142, 138);
    doc.setLineDashPattern([], 0);

    // QR Code Frame
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(150, 48, 46, 46, 2, 2, "F");

    if (qrDataUrl) {
      doc.addImage(qrDataUrl, "PNG", 152, 50, 42, 42);
    }

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(203, 213, 225);
    doc.text("GATE QR CODE", 173, 100, { align: "center" });

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(245, 158, 11);
    doc.text(ord.order_reference, 173, 108, { align: "center" });

    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text("Scan for instant entry", 173, 116, { align: "center" });
    doc.text("Official Verified Tiko Pass", 173, 120, { align: "center" });

    doc.save(`Tiko-Pass-${ord.order_reference}.pdf`);

  } catch (err) {
    console.error("Admin PDF ticket generation error:", err);
    alert("Error generating PDF ticket: " + err.message);
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

// 8. REFERRALS MANAGEMENT
async function loadReferralsList() {
  try {
    const data = await callAdminApi("list-referrals");
    const referrals = data.referrals || [];
    const tbody = document.getElementById("referrals-list-body");

    const totalCount = referrals.length;
    const qualifiedCount = referrals.filter(r => r.status === 'credited' || r.status === 'qualified').length;
    const appliedCount = referrals.filter(r => r.status === 'applied').length;

    const statTotal = document.getElementById("stat-referrals-total");
    const statQual = document.getElementById("stat-referrals-qualified");
    const statApp = document.getElementById("stat-referrals-applied");

    if (statTotal) statTotal.textContent = totalCount;
    if (statQual) statQual.textContent = qualifiedCount;
    if (statApp) statApp.textContent = appliedCount;

    if (!tbody) return;

    if (referrals.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">No customer referrals recorded yet. When customers share their booking references and friends book tickets, they will appear here.</td></tr>`;
      return;
    }

    tbody.innerHTML = referrals.map(ref => {
      const referrerName = ref.referrer?.customer_name || 'Verified Customer';
      const referrerPhone = ref.referrer?.phone_number || ref.referrer_code;
      const refereeName = ref.referee?.customer_name || 'Customer';
      const refereeRef = ref.referee?.order_reference || '—';
      const eventName = ref.referee?.events?.name || 'Event';
      const isApplied = ref.status === 'applied';

      const statusBadge = isApplied 
        ? `<span class="status-pill paid">DISCOUNT APPLIED</span>` 
        : (ref.status === 'revoked' 
            ? `<span class="status-pill failed">REVOKED</span>` 
            : `<span class="status-pill pending">QUALIFIED</span>`);

      return `
        <tr>
          <td>
            <strong style="color:#00f576; font-family:monospace; font-size:1rem;">${ref.referrer_code}</strong>
          </td>
          <td>
            <strong>${referrerName}</strong><br>
            <small style="color:var(--text-muted);">${referrerPhone}</small>
          </td>
          <td>
            ${refereeName}<br>
            <small style="color:var(--text-muted); font-family:monospace;">${refereeRef}</small>
          </td>
          <td>${eventName}</td>
          <td>
            <span style="color:#38bdf8; font-weight:700;">KSh ${Number(ref.reward_amount || 100).toLocaleString()} OFF Next Ticket</span><br>
            <small style="color:var(--text-muted);">(Ticket Discount)</small>
          </td>
          <td>${statusBadge}</td>
          <td>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              ${!isApplied ? `
                <button class="btn btn-primary btn-sm" onclick="applyReferralDiscount('${ref.id}')" title="Approve and mark discount as applied on customer's next booking">
                  ✓ Apply Discount
                </button>
                <button class="btn btn-outline btn-sm" style="color:#ef4444;" onclick="revokeReferralDiscount('${ref.id}')">
                  Revoke
                </button>
              ` : `
                <span style="color:#10b981; font-size:0.85rem; font-weight:700;">✓ Applied on Ticket</span>
              `}
            </div>
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error("Error loading referrals:", err);
  }
}

window.applyReferralDiscount = async function(referralId) {
  if (!confirm("Confirm applying this referral discount on customer's next ticket booking?")) return;
  try {
    await callAdminApi("update-referral", {
      referral_id: referralId,
      status: "applied",
      admin_notes: "Approved by admin for next ticket discount"
    });
    alert("Referral discount successfully applied!");
    loadReferralsList();
  } catch (err) {
    alert("Failed to apply discount: " + err.message);
  }
};

window.revokeReferralDiscount = async function(referralId) {
  if (!confirm("Are you sure you want to revoke this referral credit?")) return;
  try {
    await callAdminApi("update-referral", {
      referral_id: referralId,
      status: "revoked",
      admin_notes: "Revoked by admin"
    });
    loadReferralsList();
  } catch (err) {
    alert("Failed to revoke: " + err.message);
  }
};

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
          <td><span style="color:#38bdf8; font-weight:700;">${u.role}</span></td>
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
        <td><strong style="color:#00f576;">${l.action}</strong></td>
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
  const btnCloseModal = document.getElementById("btn-close-admin-ticket-modal");
  const adminModal = document.getElementById("admin-ticket-preview-modal");
  if (btnCloseModal && adminModal) {
    btnCloseModal.addEventListener("click", () => {
      adminModal.style.display = "none";
    });
    adminModal.addEventListener("click", (e) => {
      if (e.target === adminModal) adminModal.style.display = "none";
    });
  }

  if (adminToken) {
    showDashboard();
  } else {
    // Pre-populate demo / initial admin email for convenience
    if (adminEmailInput) adminEmailInput.value = "vitupoaapp@gmail.com";
  }
});
