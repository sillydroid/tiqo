/**
 * TIKO — Party for Less
 * Event Details, Multi-Category Ticket Selection, M-Pesa STK Push & Digital Ticket PDF
 */

// Strip .html from the address bar without page reload
(function cleanUrlBar() {
  if (window.location.pathname.endsWith(".html") || window.location.pathname.endsWith("event.html")) {
    let cleanPath = window.location.pathname.replace(/event\.html$/, "event").replace(/\.html$/, "");
    const newUrl = cleanPath + window.location.search + window.location.hash;
    window.history.replaceState(null, "", newUrl);
  }
})();

const CONFIG = {
  SUPABASE_FUNCTIONS_URL: window.SUPABASE_FUNCTIONS_URL || "https://atwdadrwcczczkaaoewo.supabase.co/functions/v1",
  POLL_INTERVAL: 3000,
  POLL_TIMEOUT_SEC: 90
};

// Global State
let currentEvent = null;
let selectedCategoryId = null;
let selectedQuantity = 1;
let selectedSeats = [];
let appliedPromoCode = "";
let promoDiscountType = "percentage";
let promoDiscountValue = 0;
let appliedReferralCode = "";
let referralDiscount = 0;
let currentPollTimer = null;
let pollStartTime = 0;
let lastPaidOrder = null;

// DOM Elements
const eventBadge = document.getElementById("event-badge");
const eventTitle = document.getElementById("event-title");
const eventDate = document.getElementById("event-date");
const eventTime = document.getElementById("event-time");
const eventVenue = document.getElementById("event-venue");
const eventDesc = document.getElementById("event-desc");
const eventHero = document.getElementById("event-hero");
const eventEndedAlert = document.getElementById("event-ended-alert");
const categoriesContainer = document.getElementById("ticket-categories-container");

// Seat Picker Elements
const seatPickerSection = document.getElementById("seat-picker-section");
const seatSectionSelect = document.getElementById("seat-section-select");
const seatRowSelect = document.getElementById("seat-row-select");
const seatNumberSelect = document.getElementById("seat-number-select");
const selectedSeatsBadge = document.getElementById("selected-seats-badge");

// Sidebar Summary Elements
const sidebarTicketInfo = document.getElementById("sidebar-ticket-info");
const calcSubtotal = document.getElementById("calc-subtotal");
const calcDiscount = document.getElementById("calc-discount");
const calcTotal = document.getElementById("calc-total");
const rowDiscount = document.getElementById("row-discount");
const btnOpenCheckout = document.getElementById("btn-open-checkout");

// Promo & Referral
const promoCodeInput = document.getElementById("promo-code-input");
const btnApplyPromo = document.getElementById("btn-apply-promo");
const promoMsg = document.getElementById("promo-msg");
const referralCodeInput = document.getElementById("referral-code-input");
const btnApplyReferral = document.getElementById("btn-apply-referral");
const referralMsg = document.getElementById("referral-msg");

// Modal Elements
const checkoutModal = document.getElementById("checkout-modal");
const modalClose = document.getElementById("modal-close");
const checkoutForm = document.getElementById("checkout-form");
const stepDetails = document.getElementById("step-details");
const stepProcessing = document.getElementById("step-processing");
const stepSuccess = document.getElementById("step-success");
const stepError = document.getElementById("step-error");
const processingStatus = document.getElementById("processing-status");
const errorMessage = document.getElementById("error-message");
const btnRetry = document.getElementById("btn-retry");
const btnDownloadPdf = document.getElementById("btn-download-pdf");

// Formatting
function formatKSh(amount) {
  return "KSh " + Number(amount || 0).toLocaleString("en-KE");
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return "";
  try {
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      return d.toLocaleDateString("en-KE", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
      });
    }
  } catch (e) {
    console.warn(e);
  }
  return dateStr;
}

// 1. Fetch Event Details on Load
async function loadEventData() {
  const params = new URLSearchParams(window.location.search);
  const eventIdOrSlug = params.get("id") || params.get("slug") || "ne-yo-live-in-nairobi";

  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventIdOrSlug);
    const queryParam = isUuid ? `id=${eventIdOrSlug}` : `slug=${eventIdOrSlug}`;

    const res = await fetch(`${CONFIG.SUPABASE_FUNCTIONS_URL}/list-events?${queryParam}`);
    const data = await res.json();

    if (data.success && data.event) {
      currentEvent = data.event;
      renderEventDetails();
    } else {
      fallbackEventLoad(eventIdOrSlug);
    }
  } catch (err) {
    console.error("Error loading event:", err);
    fallbackEventLoad(eventIdOrSlug);
  }
}

// Fallback if offline
function fallbackEventLoad(key) {
  currentEvent = {
    id: "c0000000-0000-0000-0000-000000000001",
    name: "Ne-Yo Live in Concert — Brunch Edition",
    venue: "Ulinzi Sports Complex, Nairobi",
    event_date: "2026-10-20",
    event_time: "3:00 PM — 11:00 PM",
    poster_url: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?q=80&w=1200&auto=format&fit=crop",
    category: "concert",
    seating_model: "general_admission",
    description: "Grammy-award winning R&B icon Ne-Yo brings his electrifying Brunch Edition live to Nairobi. Experience hits like Miss Independent, So Sick, and Closer with top sound and production.",
    ticket_categories: [
      { id: "d1", name: "Regular Entry", price: 2000, original_price: 3000, remaining_quantity: 4850, total_quantity: 5000 },
      { id: "d2", name: "Gold Ticket", price: 5000, original_price: 7500, remaining_quantity: 850, total_quantity: 1000 },
      { id: "d3", name: "VIP Pass", price: 10000, original_price: 15000, remaining_quantity: 320, total_quantity: 500 },
      { id: "d4", name: "Platinum Green Area", price: 20000, original_price: 25000, remaining_quantity: 45, total_quantity: 100 }
    ],
    is_ended: false
  };
  renderEventDetails();
}

// Render Event Header & Details
function renderEventDetails() {
  if (!currentEvent) return;

  document.title = `${currentEvent.name} — Tickets | Tiko`;

  const isEnded = currentEvent.is_ended || (currentEvent.event_date && currentEvent.event_date < new Date().toISOString().split("T")[0]);

  if (eventBadge) {
    eventBadge.textContent = isEnded 
      ? `⌛ EVENT ENDED` 
      : `🎵 ${(currentEvent.category || 'Event').toUpperCase()}`;
    if (isEnded) eventBadge.style.borderColor = "#ef4444";
  }

  if (eventTitle) eventTitle.textContent = currentEvent.name;
  if (eventDate) eventDate.textContent = formatDateDisplay(currentEvent.event_date);
  if (eventTime) eventTime.textContent = currentEvent.event_time || "Doors open 3:00 PM";
  if (eventVenue) eventVenue.textContent = currentEvent.venue;
  if (eventDesc) eventDesc.textContent = currentEvent.description || "Join us for an unforgettable live experience.";

  if (currentEvent.poster_url && eventHero) {
    eventHero.style.backgroundImage = `url('${currentEvent.poster_url}')`;
  }

  // If event has ended, show alert and disable booking
  if (isEnded) {
    if (eventEndedAlert) eventEndedAlert.style.display = "block";
    if (btnOpenCheckout) {
      btnOpenCheckout.disabled = true;
      btnOpenCheckout.innerHTML = "<span>TICKET SALES CLOSED</span>";
      btnOpenCheckout.style.background = "#374151";
      btnOpenCheckout.style.cursor = "not-allowed";
    }
  }

  // Render Ticket Categories
  renderTicketCategories(isEnded);

  // If Assigned Seating, prepare seats dropdown
  if (currentEvent.seating_model === "assigned_seating" && seatPickerSection && !isEnded) {
    seatPickerSection.style.display = "flex";
    populateSeatPicker();
  }
}

// Render Ticket Categories
function renderTicketCategories(isEnded = false) {
  const categories = currentEvent.ticket_categories || [];

  if (categories.length === 0) {
    categoriesContainer.innerHTML = `<p style="color:var(--text-secondary);">No ticket categories listed for this event yet.</p>`;
    return;
  }

  if (!selectedCategoryId && categories.length > 0) {
    selectedCategoryId = categories[0].id;
  }

  categoriesContainer.innerHTML = categories.map(cat => {
    const isSelected = cat.id === selectedCategoryId;
    const price = Number(cat.price);
    const origPrice = cat.original_price ? Number(cat.original_price) : null;
    const remaining = Number(cat.remaining_quantity);
    const isLow = remaining < 50;
    const isDisabled = isEnded || remaining <= 0;

    return `
      <div class="ticket-cat-row ${isSelected && !isEnded ? 'selected' : ''}" id="cat-row-${cat.id}" style="${isEnded ? 'opacity:0.6;' : ''}">
        <div class="cat-info-col">
          <h4>${cat.name}</h4>
          <span class="cat-remaining ${isLow ? 'low' : ''}">
            ${isEnded ? '● Sales Closed' : (remaining > 0 ? `● ${remaining.toLocaleString()} tickets remaining` : '● Sold Out')}
          </span>
        </div>
        <div class="cat-price-col">
          <div class="cat-price">${formatKSh(price)}</div>
          ${origPrice && origPrice > price ? `<div class="cat-orig-price">${formatKSh(origPrice)}</div>` : ''}
        </div>
        <div class="cat-action-col">
          <div class="qty-control" aria-label="Quantity">
            <button class="qty-btn" onclick="handleQtyChange('${cat.id}', -1)" ${isDisabled ? 'disabled' : ''}>−</button>
            <span class="qty-display" id="qty-val-${cat.id}">${isSelected ? selectedQuantity : 1}</span>
            <button class="qty-btn" onclick="handleQtyChange('${cat.id}', 1)" ${isDisabled ? 'disabled' : ''}>+</button>
          </div>
          <button class="btn ${isSelected ? 'btn-primary' : 'btn-outline'} btn-sm" onclick="selectTicketCategory('${cat.id}')" ${isDisabled ? 'disabled' : ''}>
            ${isEnded ? 'Closed' : (isSelected ? 'Selected ✓' : 'Select')}
          </button>
        </div>
      </div>
    `;
  }).join('');

  updateCalculations(isEnded);
}

// Handle Category Selection
window.selectTicketCategory = function(catId) {
  if (currentEvent?.is_ended) return;
  selectedCategoryId = catId;
  const qtyElem = document.getElementById(`qty-val-${catId}`);
  if (qtyElem) {
    selectedQuantity = parseInt(qtyElem.textContent, 10) || 1;
  }
  renderTicketCategories();
};

// Handle Quantity Buttons
window.handleQtyChange = function(catId, delta) {
  if (currentEvent?.is_ended) return;
  const cat = (currentEvent.ticket_categories || []).find(c => c.id === catId);
  if (!cat) return;

  if (selectedCategoryId !== catId) {
    selectedCategoryId = catId;
    selectedQuantity = 1;
  }

  const maxAllowed = Math.min(10, Number(cat.remaining_quantity) || 10);
  selectedQuantity = Math.max(1, Math.min(maxAllowed, selectedQuantity + delta));

  const qtyElem = document.getElementById(`qty-val-${catId}`);
  if (qtyElem) qtyElem.textContent = selectedQuantity;

  updateCalculations();
};

// Update Sidebar Summary Calculations
function updateCalculations(isEnded = false) {
  const cat = (currentEvent?.ticket_categories || []).find(c => c.id === selectedCategoryId);
  if (!cat || isEnded || currentEvent?.is_ended) {
    if (btnOpenCheckout) btnOpenCheckout.disabled = true;
    return;
  }

  if (btnOpenCheckout) btnOpenCheckout.disabled = false;
  const unitPrice = Number(cat.price);
  const subtotal = unitPrice * selectedQuantity;

  let totalDiscount = 0;
  if (promoDiscountValue > 0) {
    if (promoDiscountType === "percentage") {
      totalDiscount += (subtotal * (promoDiscountValue / 100));
    } else {
      totalDiscount += promoDiscountValue;
    }
  }
  if (referralDiscount > 0) {
    totalDiscount += referralDiscount;
  }

  const finalTotal = Math.max(1, Math.round(subtotal - totalDiscount));

  if (sidebarTicketInfo) {
    sidebarTicketInfo.innerHTML = `
      <div style="font-weight:700; color:#fff; font-size:1.05rem; margin-bottom:4px;">
        ${cat.name}
      </div>
      <div>${selectedQuantity} ticket${selectedQuantity > 1 ? 's' : ''} × ${formatKSh(unitPrice)}</div>
    `;
  }

  if (calcSubtotal) calcSubtotal.textContent = formatKSh(subtotal);
  if (calcTotal) calcTotal.textContent = formatKSh(finalTotal);

  if (totalDiscount > 0) {
    rowDiscount.style.display = "flex";
    calcDiscount.textContent = `- ${formatKSh(totalDiscount)}`;
  } else {
    rowDiscount.style.display = "none";
  }
}

// Seat Picker for Assigned Seating
function populateSeatPicker() {
  const seats = currentEvent.seats || [];
  if (seats.length === 0) return;

  const sections = [...new Set(seats.map(s => s.section))];
  seatSectionSelect.innerHTML = '<option value="">Select Section</option>' + 
    sections.map(sec => `<option value="${sec}">${sec}</option>`).join('');

  seatSectionSelect.addEventListener("change", () => {
    const sec = seatSectionSelect.value;
    seatRowSelect.innerHTML = '<option value="">Select Row</option>';
    seatNumberSelect.innerHTML = '<option value="">Select Seat</option>';
    seatNumberSelect.disabled = true;

    if (!sec) {
      seatRowSelect.disabled = true;
      return;
    }

    const rows = [...new Set(seats.filter(s => s.section === sec).map(s => s.row_name))];
    seatRowSelect.innerHTML += rows.map(r => `<option value="${r}">${r}</option>`).join('');
    seatRowSelect.disabled = false;
  });

  seatRowSelect.addEventListener("change", () => {
    const sec = seatSectionSelect.value;
    const row = seatRowSelect.value;
    seatNumberSelect.innerHTML = '<option value="">Select Seat</option>';

    if (!row) {
      seatNumberSelect.disabled = true;
      return;
    }

    const availableSeats = seats.filter(s => s.section === sec && s.row_name === row && s.status === "available");
    seatNumberSelect.innerHTML += availableSeats.map(s => `<option value="${s.seat_number}">${s.seat_number}</option>`).join('');
    seatNumberSelect.disabled = false;
  });

  seatNumberSelect.addEventListener("change", () => {
    const sec = seatSectionSelect.value;
    const row = seatRowSelect.value;
    const num = seatNumberSelect.value;
    if (sec && row && num) {
      selectedSeats = [{ section: sec, row: row, seat: num }];
      selectedSeatsBadge.textContent = `✓ Selected: ${sec} → ${row} → ${num}`;
    }
  });
}

// Strict Real Promo Code Verification
btnApplyPromo.addEventListener("click", async () => {
  const code = (promoCodeInput.value || "").trim().toUpperCase();
  if (!code) return;

  promoMsg.style.color = "#94a3b8";
  promoMsg.textContent = "Verifying promo code...";

  try {
    const eventIdParam = currentEvent?.id ? `&event_id=${encodeURIComponent(currentEvent.id)}` : '';
    const res = await fetch(`${CONFIG.SUPABASE_FUNCTIONS_URL}/check-order?promo=${encodeURIComponent(code)}${eventIdParam}`);
    const data = await res.json();

    if (data.valid === true) {
      appliedPromoCode = code;
      promoDiscountType = data.discount_type || "percentage";
      promoDiscountValue = Number(data.discount_value) || 0;

      promoMsg.style.color = "#10b981";
      promoMsg.textContent = `✓ ${data.message}`;
      updateCalculations();
    } else {
      // CODE DOES NOT EXIST OR EXPIRED - DO NOT APPLY!
      appliedPromoCode = "";
      promoDiscountValue = 0;
      promoMsg.style.color = "#ef4444";
      promoMsg.textContent = `✗ ${data.message || 'Invalid or expired promo code.'}`;
      updateCalculations();
    }
  } catch (err) {
    promoMsg.style.color = "#ef4444";
    promoMsg.textContent = "Could not verify promo code. Please try again.";
  }
});

// Strict Real Referral Code Verification
btnApplyReferral.addEventListener("click", async () => {
  const code = (referralCodeInput.value || "").trim().toUpperCase();
  if (!code) return;

  referralMsg.style.color = "#94a3b8";
  referralMsg.textContent = "Verifying referral code...";

  try {
    const res = await fetch(`${CONFIG.SUPABASE_FUNCTIONS_URL}/check-order?referral=${encodeURIComponent(code)}`);
    const data = await res.json();

    if (data.valid === true) {
      appliedReferralCode = code;
      referralDiscount = Number(data.discount_amount) || 100;

      referralMsg.style.color = "#10b981";
      referralMsg.textContent = `✓ ${data.message}`;
      updateCalculations();
    } else {
      // REFERRAL CODE DOES NOT EXIST - DO NOT APPLY!
      appliedReferralCode = "";
      referralDiscount = 0;
      referralMsg.style.color = "#ef4444";
      referralMsg.textContent = `✗ ${data.message || 'Referral code not found.'}`;
      updateCalculations();
    }
  } catch (err) {
    referralMsg.style.color = "#ef4444";
    referralMsg.textContent = "Could not verify referral code. Please check your network.";
  }
});

// Open Checkout Modal
btnOpenCheckout.addEventListener("click", () => {
  if (currentEvent?.is_ended) {
    alert("Ticket sales for this event are closed as the event date has passed.");
    return;
  }

  const cat = (currentEvent?.ticket_categories || []).find(c => c.id === selectedCategoryId);
  if (!cat) return;

  if (currentEvent.seating_model === "assigned_seating" && selectedSeats.length === 0) {
    alert("Please select your assigned Section, Row and Seat before proceeding.");
    return;
  }

  document.getElementById("modal-event-name").textContent = currentEvent.name;
  document.getElementById("modal-ticket-summary").textContent = `${selectedQuantity} × ${cat.name}`;
  document.getElementById("modal-total-amount").textContent = calcTotal.textContent;

  switchModalStep("details");
  checkoutModal.classList.add("open");
});

modalClose.addEventListener("click", () => {
  checkoutModal.classList.remove("open");
  if (currentPollTimer) clearInterval(currentPollTimer);
});

function switchModalStep(stepName) {
  [stepDetails, stepProcessing, stepSuccess, stepError].forEach(step => {
    if (step) step.classList.remove("active");
  });
  if (stepName === "details") stepDetails.classList.add("active");
  if (stepName === "processing") stepProcessing.classList.add("active");
  if (stepName === "success") stepSuccess.classList.add("active");
  if (stepName === "error") stepError.classList.add("error");
}

// Checkout Form Submission (Trigger Real M-Pesa STK Push)
checkoutForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const nameInput = document.getElementById("cust-name");
  const emailInput = document.getElementById("cust-email");
  const phoneInput = document.getElementById("cust-phone");

  const errName = document.getElementById("err-name");
  const errEmail = document.getElementById("err-email");
  const errPhone = document.getElementById("err-phone");

  errName.textContent = "";
  errEmail.textContent = "";
  errPhone.textContent = "";

  const name = nameInput.value.trim();
  const email = emailInput.value.trim();
  let phone = phoneInput.value.trim().replace(/\D/g, "");

  let valid = true;
  if (!name) {
    errName.textContent = "Attendee full name is required";
    valid = false;
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errEmail.textContent = "A valid email address is required for ticket delivery";
    valid = false;
  }

  let cleanPhone = phone;
  if (cleanPhone.startsWith("254")) cleanPhone = "0" + cleanPhone.substring(3);
  if ((cleanPhone.startsWith("7") || cleanPhone.startsWith("1")) && cleanPhone.length === 9) {
    cleanPhone = "0" + cleanPhone;
  }

  if (!/^(07|01)\d{8}$/.test(cleanPhone)) {
    errPhone.textContent = "Enter a valid Safaricom number (e.g. 0712345678 or 0112345678)";
    valid = false;
  }

  if (!valid) return;

  const cat = (currentEvent.ticket_categories || []).find(c => c.id === selectedCategoryId);

  switchModalStep("processing");
  processingStatus.textContent = `Sending M-Pesa STK push to ${cleanPhone}...`;

  try {
    const res = await fetch(`${CONFIG.SUPABASE_FUNCTIONS_URL}/create-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: currentEvent.id,
        ticket_category_id: cat.id,
        quantity: selectedQuantity,
        customer_name: name,
        customer_email: email,
        phone_number: cleanPhone,
        promo_code: appliedPromoCode || undefined,
        referral_code: appliedReferralCode || undefined,
        selected_seats: selectedSeats.length > 0 ? selectedSeats : undefined
      })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.message || "Could not initiate M-Pesa STK push.");
    }

    processingStatus.textContent = "M-Pesa PIN prompt sent to your phone! Please enter your PIN...";

    startOrderPolling(data.order_reference, {
      name,
      email,
      phone: cleanPhone,
      categoryName: cat.name,
      quantity: selectedQuantity,
      totalAmount: data.total_amount
    });

  } catch (err) {
    console.error("Order initiation error:", err);
    errorMessage.textContent = err.message || "Payment initiation failed. Please verify your phone and try again.";
    switchModalStep("error");
  }
});

btnRetry.addEventListener("click", () => {
  switchModalStep("details");
});

function startOrderPolling(orderRef, meta) {
  pollStartTime = Date.now();
  if (currentPollTimer) clearInterval(currentPollTimer);

  currentPollTimer = setInterval(async () => {
    const elapsed = (Date.now() - pollStartTime) / 1000;
    if (elapsed > CONFIG.POLL_TIMEOUT_SEC) {
      clearInterval(currentPollTimer);
      currentPollTimer = null;
      errorMessage.textContent = "Payment verification timed out. If you already entered your PIN, please contact support with reference: " + orderRef;
      switchModalStep("error");
      return;
    }

    try {
      const res = await fetch(`${CONFIG.SUPABASE_FUNCTIONS_URL}/check-order?reference=${encodeURIComponent(orderRef)}`);
      if (!res.ok) return;

      const data = await res.json();

      if (data.status === "paid" || data.status === "success") {
        clearInterval(currentPollTimer);
        currentPollTimer = null;
        displaySuccessDigitalTicket(data, meta);
      } else if (data.status === "failed") {
        clearInterval(currentPollTimer);
        currentPollTimer = null;
        errorMessage.textContent = data.message || "M-Pesa transaction was cancelled or declined.";
        switchModalStep("error");
      }
    } catch (e) {
      console.warn("Polling retry error:", e);
    }
  }, CONFIG.POLL_INTERVAL);
}

function displaySuccessDigitalTicket(orderData, meta) {
  const receipt = orderData.provider_reference || "M-Pesa Verified";
  const ref = orderData.order_reference;

  lastPaidOrder = {
    orderReference: ref,
    providerReference: receipt,
    customerName: meta.name,
    customerEmail: meta.email,
    phoneNumber: meta.phone,
    eventName: currentEvent.name,
    venue: currentEvent.venue,
    eventDate: formatDateDisplay(currentEvent.event_date),
    eventTime: currentEvent.event_time,
    categoryName: meta.categoryName,
    quantity: meta.quantity,
    totalAmount: meta.totalAmount,
    seats: selectedSeats.length > 0 ? `${selectedSeats[0].section} - ${selectedSeats[0].row} - ${selectedSeats[0].seat}` : "General Admission"
  };

  document.getElementById("dt-event-name").textContent = currentEvent.name;
  document.getElementById("dt-date-time").textContent = `${formatDateDisplay(currentEvent.event_date)} · ${currentEvent.event_time}`;
  document.getElementById("dt-venue").textContent = currentEvent.venue;
  document.getElementById("dt-attendee").textContent = meta.name.toUpperCase();
  document.getElementById("dt-category").textContent = `${meta.quantity} × ${meta.categoryName}`;
  document.getElementById("dt-amount").textContent = formatKSh(meta.totalAmount);
  document.getElementById("dt-receipt").textContent = receipt;
  document.getElementById("dt-ref").textContent = ref;
  document.getElementById("dt-referral-code").textContent = ref;

  if (selectedSeats.length > 0) {
    document.getElementById("dt-seat-row").style.display = "flex";
    document.getElementById("dt-seat").textContent = lastPaidOrder.seats;
  }

  const qrDisplay = document.getElementById("qrcode-display");
  qrDisplay.innerHTML = "";
  if (window.QRCode) {
    new QRCode(qrDisplay, {
      text: `${CONFIG.SUPABASE_FUNCTIONS_URL}/check-order?reference=${ref}`,
      width: 140,
      height: 140,
      correctLevel: QRCode.CorrectLevel.H
    });
  }

  switchModalStep("success");
}

async function generateDigitalTicketPDF() {
  if (!lastPaidOrder) {
    alert("No active paid ticket found to download.");
    return;
  }

  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) {
    alert("PDF generator library is loading, please try again in a few seconds.");
    return;
  }

  try {
    const hiddenQr = document.getElementById("qrcode-hidden");
    hiddenQr.innerHTML = "";
    let qrDataUrl = "";

    if (window.QRCode) {
      new QRCode(hiddenQr, {
        text: `${CONFIG.SUPABASE_FUNCTIONS_URL}/check-order?reference=${lastPaidOrder.orderReference}`,
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

    doc.setFillColor(11, 10, 18);
    doc.rect(0, 0, 210, 148, "F");

    doc.setFillColor(24, 18, 45);
    doc.rect(0, 0, 210, 42, "F");

    doc.setDrawColor(112, 66, 248);
    doc.setLineWidth(0.8);
    doc.roundedRect(6, 6, 198, 136, 4, 4, "S");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(26);
    doc.setFont("helvetica", "bold");
    doc.text("TIKO", 14, 22);

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(167, 139, 250);
    doc.text("PARTY FOR LESS", 14, 28);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text("Affordable entertainment — more vibes, less spend", 14, 33);

    doc.setFillColor(16, 185, 129);
    doc.setTextColor(10, 10, 15);
    doc.roundedRect(144, 14, 52, 10, 2, 2, "F");
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("VERIFIED PASS", 170, 20.5, { align: "center" });

    doc.setDrawColor(112, 66, 248);
    doc.setLineWidth(0.5);
    doc.line(14, 40, 196, 40);

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15);
    doc.setFont("helvetica", "bold");
    doc.text(lastPaidOrder.eventName.toUpperCase(), 14, 50);

    doc.setFontSize(9);
    doc.setTextColor(203, 213, 225);
    doc.setFont("helvetica", "bold");
    doc.text("DATE: ", 14, 60);
    doc.setFont("helvetica", "normal");
    doc.text(lastPaidOrder.eventDate, 32, 60);

    doc.setFont("helvetica", "bold");
    doc.text("TIME: ", 14, 66);
    doc.setFont("helvetica", "normal");
    doc.text(lastPaidOrder.eventTime, 32, 66);

    doc.setFont("helvetica", "bold");
    doc.text("VENUE: ", 14, 72);
    doc.setFont("helvetica", "normal");
    doc.text(lastPaidOrder.venue, 32, 72);

    doc.setFillColor(18, 17, 30);
    doc.roundedRect(14, 80, 120, 52, 3, 3, "F");
    doc.setDrawColor(255, 255, 255, 0.1);
    doc.roundedRect(14, 80, 120, 52, 3, 3, "S");

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(148, 163, 184);
    doc.text("PASSENGER / ATTENDEE", 18, 88);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(lastPaidOrder.customerName.toUpperCase(), 18, 95);

    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text("CATEGORY & SEAT", 18, 103);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(245, 158, 11);
    doc.text(`${lastPaidOrder.quantity} × ${lastPaidOrder.categoryName} (${lastPaidOrder.seats})`, 18, 109);

    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text("AMOUNT PAID: ", 18, 119);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(16, 185, 129);
    doc.text(formatKSh(lastPaidOrder.totalAmount), 45, 119);

    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text("M-PESA REF: ", 18, 126);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(lastPaidOrder.providerReference, 45, 126);

    doc.setDrawColor(255, 255, 255, 0.2);
    doc.setLineDashPattern([2, 2], 0);
    doc.line(142, 40, 142, 138);
    doc.setLineDashPattern([], 0);

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
    doc.text(lastPaidOrder.orderReference, 173, 108, { align: "center" });

    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text("Scan for instant entry", 173, 116, { align: "center" });
    doc.text("Official Verified Tiko Pass", 173, 120, { align: "center" });

    doc.save(`Tiko-Pass-${lastPaidOrder.orderReference}.pdf`);

  } catch (err) {
    console.error("PDF generation error:", err);
    alert("Could not generate PDF. Please save your Booking Reference: " + lastPaidOrder.orderReference);
  }
}

btnDownloadPdf.addEventListener("click", generateDigitalTicketPDF);

document.addEventListener("DOMContentLoaded", () => {
  loadEventData();
});
