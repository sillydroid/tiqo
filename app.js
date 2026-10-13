/**
 * TIKO — Party for Less
 * Client-side Ticket Booking, Real PayHero M-Pesa Integration & PDF Ticket Generation
 */

// ==================== CONFIGURATION ====================
const CONFIG = {
  // Live Supabase Edge Functions URL for project tiqo
  SUPABASE_FUNCTIONS_URL: window.SUPABASE_FUNCTIONS_URL || "https://atwdadrwcczczkaaoewo.supabase.co/functions/v1",
  POLL_INTERVAL: 3000,
  POLL_TIMEOUT_SEC: 90
};

// ==================== TICKET DATA ====================
const TICKETS = [
  {
    id: "early-bird-gold",
    name: "Early Bird Gold",
    category: "gold",
    type: "individual",
    attendees: 1,
    originalPrice: 7500,
    offerPrice: 5500,
    savings: 2000,
    badge: "Limited Stock",
    featured: false,
    description: "Individual Gold Access to Ne-Yo Live in Nairobi.",
    features: ["Gold Stage View", "General Area Access", "Instant QR Delivery"]
  },
  {
    id: "wave-2-gold",
    name: "Wave 2 Gold",
    category: "gold",
    type: "individual",
    attendees: 1,
    originalPrice: 10000,
    offerPrice: 8000,
    savings: 2000,
    badge: null,
    featured: false,
    description: "Wave 2 entry for individual concert goers.",
    features: ["Gold Stage View", "General Area Access", "Instant QR Delivery"]
  },
  {
    id: "gold-ticket",
    name: "Gold Ticket",
    category: "gold",
    type: "individual",
    attendees: 1,
    originalPrice: 15000,
    offerPrice: 13000,
    savings: 2000,
    badge: null,
    featured: false,
    description: "Standard Gold Gate Pass for the Brunch Edition.",
    features: ["Full Gold Zone Access", "Entry from 3:00 PM", "Instant QR Delivery"]
  },
  {
    id: "gold-couple-friends",
    name: "Gold Couple / Friends Package",
    category: "gold",
    type: "package",
    attendees: 2,
    originalPrice: 20000,
    offerPrice: 15000,
    savings: 5000,
    badge: "🔥 Best Value Bundle",
    featured: true,
    description: "Combo package for 2 tickets. Perfect for couples or duos.",
    features: ["2 Tickets Included", "Save KSh 5,000 together", "Separate QR codes sent"]
  },
  {
    id: "platinum-individual",
    name: "Platinum Green Area — Individual Seat",
    category: "platinum",
    type: "individual",
    attendees: 1,
    originalPrice: 40000,
    offerPrice: 36000,
    savings: 4000,
    badge: "VIP",
    featured: false,
    description: "Reserved single seat in the VIP Platinum Green Area.",
    features: ["Reserved Seat in Green Area", "VIP Bar & Restrooms", "Fast-track Entry"]
  },
  {
    id: "platinum-4-seater",
    name: "Platinum Green Area — 4-Seater Table",
    category: "platinum",
    type: "package",
    attendees: 4,
    originalPrice: 160000,
    offerPrice: 140000,
    savings: 20000,
    badge: "VIP Table (4)",
    featured: true,
    description: "Private 4-seater table in the premium VIP Green Area.",
    features: ["4 VIP Passes Included", "Dedicated Table Service", "Save KSh 20,000"]
  },
  {
    id: "platinum-8-seater",
    name: "Platinum Green Area — 8-Seater Table",
    category: "platinum",
    type: "package",
    attendees: 8,
    originalPrice: 320000,
    offerPrice: 280000,
    savings: 40000,
    badge: "Ultimate VIP Table (8)",
    featured: true,
    description: "Exclusive 8-seater table in the heart of the VIP Green Area.",
    features: ["8 VIP Passes Included", "Prime Sightline to Stage", "Save KSh 40,000"]
  }
];

// ==================== STATE ====================
let selectedTicketId = null;
let selectedQuantity = 1;
let currentPollTimer = null;
let pollStartTime = 0;
let lastPaidOrder = null; // Stores verified paid order details for PDF ticket generation

// ==================== FORMATTERS ====================
function formatKSh(amount) {
  return "KSh " + Number(amount).toLocaleString("en-KE");
}

// ==================== DOM ELEMENTS ====================
const ticketGrid = document.getElementById("ticket-grid");
const tabButtons = document.querySelectorAll(".tab-btn");
const checkoutModal = document.getElementById("checkout-modal");
const modalCloseBtn = document.getElementById("modal-close");
const floatingCta = document.getElementById("floating-cta");
const floatingCount = document.getElementById("floating-count");
const floatingTotal = document.getElementById("floating-total");
const floatingCheckoutBtn = document.getElementById("floating-checkout-btn");

// Modal Steps
const stepSummary = document.getElementById("step-summary");
const stepDetails = document.getElementById("step-details");
const stepProcessing = document.getElementById("step-processing");
const stepSuccess = document.getElementById("step-success");
const stepError = document.getElementById("step-error");

// Modal Buttons
const btnToDetails = document.getElementById("btn-to-details");
const btnBackSummary = document.getElementById("btn-back-summary");
const checkoutForm = document.getElementById("checkout-form");
const btnPayAmount = document.getElementById("btn-pay-amount");
const btnDone = document.getElementById("btn-done");
const btnRetry = document.getElementById("btn-retry");
const btnDownloadPdf = document.getElementById("btn-download-pdf");

// ==================== SPLASH SCREEN ====================
function initSplashScreen() {
  const splash = document.getElementById("splash-screen");
  if (!splash) return;

  // Let splash display boldly for 1.6s, then smoothly fade out
  setTimeout(() => {
    splash.classList.add("fade-out");
    setTimeout(() => {
      splash.style.display = "none";
    }, 750);
  }, 1600);
}

// ==================== RENDER TICKETS ====================
function renderTickets(category = "all") {
  const filtered = category === "all" 
    ? TICKETS 
    : TICKETS.filter(t => t.category === category);

  ticketGrid.innerHTML = filtered.map(ticket => {
    const isSelected = ticket.id === selectedTicketId;
    const qty = isSelected ? selectedQuantity : 1;
    const isPackage = ticket.type === "package";
    const attendeesText = isPackage 
      ? `Group Package · <strong>${ticket.attendees} Attendees</strong> included`
      : `Single Ticket · <strong>1 Attendee</strong>`;

    return `
      <div class="ticket-card ${ticket.featured ? 'featured' : ''} ${isSelected ? 'selected' : ''}" id="card-${ticket.id}">
        ${ticket.badge ? `<div class="ticket-ribbon">${ticket.badge}</div>` : ''}
        <div class="ticket-header">
          <span class="ticket-category-pill ${ticket.category}">${ticket.category.toUpperCase()}</span>
          <h3 class="ticket-name">${ticket.name}</h3>
          <div class="ticket-attendees">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            <span>${attendeesText}</span>
          </div>
        </div>

        <div class="ticket-pricing">
          <div class="price-row">
            <span class="price-offer">${formatKSh(ticket.offerPrice)}</span>
            <span class="price-original">${formatKSh(ticket.originalPrice)}</span>
          </div>
          <div class="savings-tag">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
            Save ${formatKSh(ticket.savings)}
          </div>
        </div>

        <ul class="ticket-features">
          ${ticket.features.map(f => `
            <li>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
              <span>${f}</span>
            </li>
          `).join('')}
        </ul>

        <div class="ticket-actions">
          <div class="qty-control" aria-label="Quantity selector">
            <button class="qty-btn" onclick="updateQty('${ticket.id}', -1)" aria-label="Decrease quantity">−</button>
            <span class="qty-display" id="qty-${ticket.id}">${qty}</span>
            <button class="qty-btn" onclick="updateQty('${ticket.id}', 1)" aria-label="Increase quantity">+</button>
          </div>
          <button class="btn btn-primary btn-select" onclick="selectTicket('${ticket.id}')">
            Select Offer
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// ==================== TICKET INTERACTIONS ====================
window.updateQty = function(ticketId, delta) {
  if (selectedTicketId !== ticketId) {
    selectedTicketId = ticketId;
    selectedQuantity = 1;
  }
  selectedQuantity = Math.max(1, Math.min(10, selectedQuantity + delta));
  const qtyElem = document.getElementById(`qty-${ticketId}`);
  if (qtyElem) qtyElem.textContent = selectedQuantity;
  updateFloatingCta();
};

window.selectTicket = function(ticketId) {
  selectedTicketId = ticketId;
  const qtyElem = document.getElementById(`qty-${ticketId}`);
  if (qtyElem) {
    selectedQuantity = parseInt(qtyElem.textContent, 10) || 1;
  }
  openCheckout();
};

function updateFloatingCta() {
  if (!selectedTicketId) {
    floatingCta.classList.add("hidden");
    return;
  }
  const ticket = TICKETS.find(t => t.id === selectedTicketId);
  if (!ticket) return;

  const total = ticket.offerPrice * selectedQuantity;
  const totalAttendees = ticket.attendees * selectedQuantity;
  floatingCount.textContent = `${selectedQuantity} × ${ticket.name} (${totalAttendees} attendees)`;
  floatingTotal.textContent = formatKSh(total);
  floatingCta.classList.remove("hidden");
}

// ==================== CHECKOUT FLOW ====================
function openCheckout() {
  const ticket = TICKETS.find(t => t.id === selectedTicketId);
  if (!ticket) return;

  const totalOffer = ticket.offerPrice * selectedQuantity;
  const totalOriginal = ticket.originalPrice * selectedQuantity;
  const totalSavings = ticket.savings * selectedQuantity;
  const totalAttendees = ticket.attendees * selectedQuantity;

  // Render Summary
  document.getElementById("order-summary").innerHTML = `
    <div class="order-item-row">
      <div>
        <div class="order-item-title">${ticket.name}</div>
        <div class="order-item-sub">${selectedQuantity} package${selectedQuantity > 1 ? 's' : ''} · ${totalAttendees} attendee(s)</div>
      </div>
      <div class="order-item-price">${formatKSh(totalOffer)}</div>
    </div>
    <div class="order-item-row">
      <div class="order-item-sub">Original Price</div>
      <div class="order-item-sub" style="text-decoration: line-through;">${formatKSh(totalOriginal)}</div>
    </div>
  `;

  document.getElementById("order-total-price").textContent = formatKSh(totalOffer);
  document.getElementById("order-savings-amount").textContent = formatKSh(totalSavings);
  btnPayAmount.textContent = formatKSh(totalOffer);

  switchStep("summary");
  checkoutModal.classList.add("open");
}

function closeCheckout() {
  checkoutModal.classList.remove("open");
  if (currentPollTimer) {
    clearInterval(currentPollTimer);
    currentPollTimer = null;
  }
}

function switchStep(stepName) {
  [stepSummary, stepDetails, stepProcessing, stepSuccess, stepError].forEach(step => {
    step.classList.remove("active");
  });

  if (stepName === "summary") stepSummary.classList.add("active");
  if (stepName === "details") stepDetails.classList.add("active");
  if (stepName === "processing") stepProcessing.classList.add("active");
  if (stepName === "success") stepSuccess.classList.add("active");
  if (stepName === "error") stepError.classList.add("active");
}

// Step navigation
btnToDetails.addEventListener("click", () => switchStep("details"));
btnBackSummary.addEventListener("click", () => switchStep("summary"));
modalCloseBtn.addEventListener("click", closeCheckout);
floatingCheckoutBtn.addEventListener("click", openCheckout);
btnDone.addEventListener("click", closeCheckout);
btnRetry.addEventListener("click", () => switchStep("details"));
if (btnDownloadPdf) {
  btnDownloadPdf.addEventListener("click", () => generateTicketPDF());
}

// Close on backdrop click
checkoutModal.addEventListener("click", (e) => {
  if (e.target === checkoutModal) closeCheckout();
});

// ==================== REAL PAYMENT INITIATION ====================
checkoutForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const nameInput = document.getElementById("cust-name");
  const emailInput = document.getElementById("cust-email");
  const phoneInput = document.getElementById("cust-phone");

  const errName = document.getElementById("error-name");
  const errEmail = document.getElementById("error-email");
  const errPhone = document.getElementById("error-phone");

  errName.textContent = "";
  errEmail.textContent = "";
  errPhone.textContent = "";

  const name = nameInput.value.trim();
  const email = emailInput.value.trim();
  let phone = phoneInput.value.trim().replace(/\D/g, "");

  let valid = true;
  if (!name) {
    errName.textContent = "Please enter attendee full name";
    valid = false;
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errEmail.textContent = "Please enter a valid email address";
    valid = false;
  }

  // Kenyan phone normalization: accept 07..., 01..., 254..., 7..., 1...
  let normalizedPhone = phone;
  if (normalizedPhone.startsWith("254")) {
    normalizedPhone = "0" + normalizedPhone.substring(3);
  }
  if ((normalizedPhone.startsWith("7") || normalizedPhone.startsWith("1")) && normalizedPhone.length === 9) {
    normalizedPhone = "0" + normalizedPhone;
  }

  // Validate all Kenyan mobile prefixes (07XX, 01XX) - 10 digits total
  if (!/^(07|01)\d{8}$/.test(normalizedPhone)) {
    errPhone.textContent = "Enter a valid Safaricom number (e.g. 0712345678 or 0112345678)";
    valid = false;
  }

  if (!valid) return;

  const ticket = TICKETS.find(t => t.id === selectedTicketId);

  // Switch to processing modal
  switchStep("processing");
  document.getElementById("processing-status").textContent = "Sending M-Pesa STK push to " + normalizedPhone + "...";

  try {
    // REAL CALL TO SUPABASE EDGE FUNCTION
    const response = await fetch(`${CONFIG.SUPABASE_FUNCTIONS_URL}/create-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticket_id: ticket.id,
        quantity: selectedQuantity,
        customer_name: name,
        customer_email: email,
        phone_number: normalizedPhone
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || "Failed to trigger payment. Please try again.");
    }

    // STK prompt was dispatched to phone
    document.getElementById("processing-status").textContent = "M-Pesa PIN prompt sent to your phone! Please enter your PIN...";

    // Start real polling
    startPollingPayment(data.order_reference, {
      name,
      email,
      phone: normalizedPhone,
      ticketName: ticket.name,
      category: ticket.category,
      quantity: selectedQuantity,
      totalAttendees: ticket.attendees * selectedQuantity,
      total: ticket.offerPrice * selectedQuantity
    });

  } catch (err) {
    console.error("Order creation error:", err);
    document.getElementById("error-message").textContent = err.message || "Payment initiation failed. Please check your network and phone number.";
    switchStep("error");
  }
});

// ==================== REAL ORDER POLLING ====================
function startPollingPayment(orderReference, orderMeta) {
  pollStartTime = Date.now();
  if (currentPollTimer) clearInterval(currentPollTimer);

  currentPollTimer = setInterval(async () => {
    const elapsed = (Date.now() - pollStartTime) / 1000;
    if (elapsed > CONFIG.POLL_TIMEOUT_SEC) {
      clearInterval(currentPollTimer);
      currentPollTimer = null;
      document.getElementById("error-message").textContent = "Payment request timed out. If you entered your M-Pesa PIN, please allow a moment for confirmation or reach out to support.";
      switchStep("error");
      return;
    }

    try {
      const res = await fetch(`${CONFIG.SUPABASE_FUNCTIONS_URL}/check-order?reference=${encodeURIComponent(orderReference)}`);
      if (!res.ok) return;

      const data = await res.json();
      
      // ONLY MARK PAID IF SERVER ACTUALLY CONFIRMS IT!
      if (data.status === "paid" || data.status === "success") {
        clearInterval(currentPollTimer);
        currentPollTimer = null;
        showSuccessScreen(data, orderMeta);
      } else if (data.status === "failed") {
        clearInterval(currentPollTimer);
        currentPollTimer = null;
        document.getElementById("error-message").textContent = data.message || "Payment request was cancelled or declined on M-Pesa.";
        switchStep("error");
      }
    } catch (e) {
      console.warn("Polling error:", e);
    }
  }, CONFIG.POLL_INTERVAL);
}

// ==================== SUCCESS SCREEN & STATE ====================
function showSuccessScreen(orderData, orderMeta) {
  const receipt = orderData.provider_reference || "M-Pesa Confirmed";
  const ref = orderData.order_reference || orderMeta.reference;

  // Save in global state for PDF generator
  lastPaidOrder = {
    orderReference: ref,
    providerReference: receipt,
    customerName: orderMeta.name,
    customerEmail: orderMeta.email,
    phoneNumber: orderMeta.phone,
    ticketName: orderMeta.ticketName,
    category: orderMeta.category ? orderMeta.category.toUpperCase() : "GOLD",
    quantity: orderMeta.quantity,
    totalAttendees: orderMeta.totalAttendees,
    amountPaid: orderMeta.total,
    eventDate: "Tuesday, 20 October 2026 (Mashujaa Day)",
    eventTime: "3:00 PM – 11:00 PM",
    venue: "Ulinzi Sports Complex, Nairobi"
  };

  document.getElementById("success-details").innerHTML = `
    <div class="detail-row">
      <span>Order Reference:</span>
      <span>${ref}</span>
    </div>
    <div class="detail-row">
      <span>M-Pesa Receipt:</span>
      <span>${receipt}</span>
    </div>
    <div class="detail-row">
      <span>Attendee Name:</span>
      <span>${orderMeta.name}</span>
    </div>
    <div class="detail-row">
      <span>Ticket Category:</span>
      <span>${lastPaidOrder.category} (${orderMeta.ticketName})</span>
    </div>
    <div class="detail-row">
      <span>People Allowed:</span>
      <span style="color:#a78bfa; font-weight:700;">${orderMeta.totalAttendees} Attendee(s)</span>
    </div>
    <div class="detail-row">
      <span>Amount Paid:</span>
      <span style="color:#10b981; font-weight:800;">${formatKSh(orderMeta.total)}</span>
    </div>
  `;

  switchStep("success");
}

// ==================== PDF TICKET GENERATOR ====================
async function generateTicketPDF() {
  if (!lastPaidOrder) {
    alert("No active paid ticket found to download.");
    return;
  }

  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) {
    alert("PDF library is still loading, please try again in a moment.");
    return;
  }

  try {
    // Generate QR Code data URL
    const qrContainer = document.getElementById("qrcode-hidden");
    qrContainer.innerHTML = "";
    
    // QR code payload contains verified ticket URL & unique reference
    const qrText = `https://atwdadrwcczczkaaoewo.supabase.co/functions/v1/check-order?reference=${lastPaidOrder.orderReference}`;
    
    let qrDataUrl = "";
    if (window.QRCode) {
      new QRCode(qrContainer, {
        text: qrText,
        width: 140,
        height: 140,
        correctLevel: QRCode.CorrectLevel.H
      });
      // Wait for canvas render
      await new Promise(r => setTimeout(r, 120));
      const qrCanvas = qrContainer.querySelector("canvas");
      if (qrCanvas) {
        qrDataUrl = qrCanvas.toDataURL("image/png");
      }
    }

    // A5 Landscape VIP Pass: 210mm wide x 148mm high
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: [210, 148]
    });

    // 1. Dark Concert Background
    doc.setFillColor(11, 10, 18);
    doc.rect(0, 0, 210, 148, "F");

    // Radial gradient-like glow in top-left
    doc.setFillColor(24, 18, 45);
    doc.rect(0, 0, 210, 42, "F");

    // Decorative Borders
    doc.setDrawColor(112, 66, 248);
    doc.setLineWidth(0.8);
    doc.roundedRect(6, 6, 198, 136, 4, 4, "S");

    // Sub-frame
    doc.setDrawColor(255, 255, 255, 0.08);
    doc.setLineWidth(0.3);
    doc.roundedRect(8, 8, 194, 132, 3, 3, "S");

    // 2. Header Branding: TIKO
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(26);
    doc.setFont("helvetica", "bold");
    doc.text("TIKO", 14, 22);

    // Purple square accent next to TIKO
    doc.setFillColor(112, 66, 248);
    doc.roundedRect(42, 14, 6, 6, 1, 1, "F");

    // Slogan & Tagline
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(167, 139, 250);
    doc.text("PARTY FOR LESS", 14, 28);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text("Affordable entertainment — more vibes, less spend", 14, 33);

    // VIP Category Badge (Top Right)
    const isPlatinum = lastPaidOrder.category.includes("PLATINUM");
    if (isPlatinum) {
      doc.setFillColor(16, 185, 129);
      doc.setTextColor(10, 10, 15);
    } else {
      doc.setFillColor(245, 158, 11);
      doc.setTextColor(10, 10, 15);
    }
    doc.roundedRect(144, 14, 52, 10, 2, 2, "F");
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(lastPaidOrder.category + " PASS", 170, 20.5, { align: "center" });

    // Divider Line
    doc.setDrawColor(112, 66, 248);
    doc.setLineWidth(0.5);
    doc.line(14, 40, 196, 40);

    // 3. Concert Event Details
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("NE-YO LIVE IN CONCERT", 14, 50);

    doc.setFontSize(11);
    doc.setTextColor(245, 158, 11);
    doc.text("One Night Only: Brunch Edition", 14, 56);

    // Date & Venue Details
    doc.setFontSize(9);
    doc.setTextColor(203, 213, 225);
    doc.setFont("helvetica", "bold");
    doc.text("DATE: ", 14, 64);
    doc.setFont("helvetica", "normal");
    doc.text(lastPaidOrder.eventDate, 32, 64);

    doc.setFont("helvetica", "bold");
    doc.text("TIME: ", 14, 70);
    doc.setFont("helvetica", "normal");
    doc.text(lastPaidOrder.eventTime, 32, 70);

    doc.setFont("helvetica", "bold");
    doc.text("VENUE: ", 14, 76);
    doc.setFont("helvetica", "normal");
    doc.text(lastPaidOrder.venue, 32, 76);

    // 4. Ticket Holder & Attendees Info Box (Middle-Left)
    doc.setFillColor(18, 17, 30);
    doc.roundedRect(14, 84, 120, 48, 3, 3, "F");
    doc.setDrawColor(255, 255, 255, 0.1);
    doc.roundedRect(14, 84, 120, 48, 3, 3, "S");

    // Attendee Name
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(148, 163, 184);
    doc.text("ATTENDEE NAME", 18, 92);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(lastPaidOrder.customerName.toUpperCase(), 18, 98);

    // Ticket Package
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text("TICKET PACKAGE", 18, 106);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(203, 213, 225);
    doc.text(lastPaidOrder.ticketName, 18, 111);

    // People Allowed (Prominent)
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text("PEOPLE ALLOWED", 18, 119);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(16, 185, 129);
    doc.text(`${lastPaidOrder.totalAttendees} Person(s) / Attendee(s) Allowed`, 18, 125);

    // Amount & Receipt
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text("AMOUNT PAID: ", 75, 119);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(formatKSh(lastPaidOrder.amountPaid), 102, 119);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text("M-PESA REF: ", 75, 125);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(lastPaidOrder.providerReference, 102, 125);

    // 5. Tear-Off Strip & QR Code (Right Side)
    // Perforated line effect
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

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(203, 213, 225);
    doc.text("GATE QR CODE", 173, 100, { align: "center" });

    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text("Scan for instant entry", 173, 104, { align: "center" });

    // Order Reference
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(245, 158, 11);
    doc.text(lastPaidOrder.orderReference, 173, 112, { align: "center" });

    // Security Notice
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text("Official Verified Tiko Ticket", 173, 122, { align: "center" });
    doc.text("Show printed or on mobile device", 173, 126, { align: "center" });

    // Save PDF
    const filename = `Tiko-Ticket-${lastPaidOrder.orderReference}.pdf`;
    doc.save(filename);

  } catch (err) {
    console.error("PDF generation error:", err);
    alert("Could not generate PDF ticket. Please contact support with your order reference.");
  }
}

// ==================== COUNTDOWN TIMER ====================
function initCountdown() {
  const eventDate = new Date("2026-10-20T15:00:00+03:00").getTime();

  function update() {
    const now = Date.now();
    const diff = eventDate - now;

    if (diff <= 0) {
      document.getElementById("countdown").innerHTML = "<span>EVENT IS LIVE NOW!</span>";
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);

    const pad = n => String(n).padStart(2, '0');
    const dElem = document.getElementById("cd-days");
    const hElem = document.getElementById("cd-hours");
    const mElem = document.getElementById("cd-mins");
    const sElem = document.getElementById("cd-secs");

    if (dElem) dElem.textContent = pad(days);
    if (hElem) hElem.textContent = pad(hours);
    if (mElem) mElem.textContent = pad(mins);
    if (sElem) sElem.textContent = pad(secs);
  }

  update();
  setInterval(update, 1000);
}

// ==================== TABS & MOBILE NAV ====================
tabButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    tabButtons.forEach(b => {
      b.classList.remove("active");
      b.setAttribute("aria-selected", "false");
    });
    btn.classList.add("active");
    btn.setAttribute("aria-selected", "true");
    renderTickets(btn.dataset.category);
  });
});

const mobileBtn = document.getElementById("mobile-menu-btn");
const mobileMenu = document.getElementById("mobile-menu");
if (mobileBtn && mobileMenu) {
  mobileBtn.addEventListener("click", () => {
    mobileMenu.classList.toggle("open");
  });
  mobileMenu.querySelectorAll("a").forEach(a => {
    a.addEventListener("click", () => mobileMenu.classList.remove("open"));
  });
}

// ==================== INITIALIZATION ====================
document.addEventListener("DOMContentLoaded", () => {
  initSplashScreen();
  renderTickets("all");
  initCountdown();
});
