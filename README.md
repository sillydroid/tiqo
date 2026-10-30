# 🎟️ Tiko — Party for Less
> **Affordable entertainment — more vibes, less spend.**  
> Tiko is Kenya's fast, discounted multi-event ticketing platform for concerts, festivals, sports, and live shows.

---

## ⚡ The Tiko Booking Philosophy
Most ticketing platforms force users through cumbersome hoops:  
❌ *Register → Verify email → Create profile → Add card → Search → Re-enter password...*

**Tiko keeps it lightning fast & zero-friction:**
```
1. SEARCH  ➔  2. SELECT  ➔  3. DETAILS  ➔  4. M-PESA  ➔  5. TICKET
```
**No accounts. No passwords. No email verification hurdles.** Just pick your tickets, enter your name and phone, confirm the M-Pesa PIN prompt on your phone, and your verified digital ticket with gate QR code is generated instantly.

---

## 🎵 Features & Capabilities

### 1. Multi-Event Discovery & Instant Search
- **Categories**: 🎵 Concerts, 🎪 Festivals, ⚽ Sports, 🎭 Shows, 🎟️ Theatre.
- **Search**: Real-time filtering by artist, event title, or venue.
- **Simple Event Cards**: Visual poster, artist/event name, 📍 venue, 📅 date, starting price (`From KSh 2,000`), and a direct `[ BOOK NOW ]` button.
- **Past Event Handling**: Ended events are deprioritized to the bottom of the list with sales closed. Users cannot buy tickets for events whose dates have passed.

### 2. Dual Ticketing Models
- **General Admission**:
  - Admin-defined categories (e.g., *Regular*, *Gold*, *VIP*, *Platinum*).
  - Quantity controls (`[-] 2 [+]`) with dynamic price calculations.
  - Live inventory tracking (e.g., `20 tickets remaining`).
- **Assigned Seating**:
  - For stadiums and theatres where specific seats matter.
  - Cascading selectors: `Section A → Row 5 → Seat 12`.

### 3. Beautiful Digital Ticket
Every successful booking produces a high-resolution verified digital ticket:
```
┌──────────────────────────────────────────────┐
│                  TIKO PASS                   │
│              BOOKING CONFIRMED               │
│                                              │
│ Event: NE-YO LIVE IN CONCERT                 │
│ Venue: Ulinzi Sports Complex, Nairobi        │
│ Date:  20 October 2026 | 03:00 PM            │
│ Pass:  2 × VIP PASS                          │
│ Name:  JOHN DOE                              │
│                                              │
│              ████████████████                │
│              █  GATE QR CODE█                │
│              ████████████████                │
│                                              │
│ Booking Ref: TIKO-M7X2K-9412                 │
│ M-Pesa Code: QJH89421LK                      │
└──────────────────────────────────────────────┘
```
- Available immediately on screen and downloadable as an A5 landscape **Digital PDF Ticket**.

### 4. Referral System & Promo Codes
- **Strict Verification**: Codes can only be applied if they exist in the database and are currently active. Inactive, expired, or non-existent codes are strictly rejected.
- **Referral Program (No Account Needed)**:
  - Every customer's booking reference serves as their referral code.
  - The code is tied directly to their **M-Pesa phone number** and email.
  - When friends use the referral code, the reward is issued directly to the referrer's M-Pesa phone number or applied automatically to their next booking.
  - *Reward amounts (e.g. KSh 100) are illustrative and adjust based on campaigns or event settings.*
- **Promo Codes**: Admin-managed promotional codes (e.g. `TIKOO10` gives 10% discount).

### 5. Control Center (`dala.html`)
Admin controls every aspect of the platform with dedicated tabs:
- **📊 Overview & Live Stats**:
  - Total tickets sold, total revenue in KSh, active events count.
  - Per-event breakdown table: *Tickets Sold*, *Revenue*, *Remaining Inventory*, and *Status*.
- **🎵 Event & Category Creator & Editor**:
  - Create and Edit Events: Name, Venue, Date, Time, Description, Poster URL, Category, Ticketing Model.
  - Ticket Type Builder: Add / configure / edit custom tiers (e.g. *Regular: KSh 2,000 / 5,000 qty*, *VIP: KSh 10,000 / 500 qty*).
  - Publish / Unpublish / Cancel events with one click.
- **📋 Orders & Payment Reconciliation**:
  - Live stream of all customer orders.
  - Direct matching with Safaricom M-Pesa receipts.
  - Status indicators: `paid`, `pending`, `failed`, `expired`.
- **🏷️ Promo Codes**: Create percentage or fixed-amount discount codes.
- **🔒 Security & System Audit Trail**: Immutable logging of all sensitive operations.

---

## 🔒 Top-Tier Fraud & Payment Protection

The payment system **never** issues a ticket merely because the frontend claims payment succeeded. Everything is verified server-side:

1. **Authoritative Server-Side Pricing**: Prices are calculated exclusively from database records in Edge Functions. The browser cannot manipulate the amount charged.
2. **Cryptographic M-Pesa Callback Verification**: Webhook callbacks from FinoQ / PayHero are reconciled and verified before updating an order to `paid`.
3. **Idempotency & Duplicate-Payment Protection**: Unique database indexes on provider receipts ensure duplicate callbacks can never fulfill an order twice.
4. **Payment Reconciliation**: Edge function verifies `paid_amount >= expected_order_amount`. Underpayments are flagged and rejected.
5. **15-Minute Booking Expiry**: Pending orders and reserved seats lock inventory for 15 minutes. Unpaid reservations are automatically returned to available inventory.
6. **Audit Logs**: All admin actions and payment events are permanently logged in `public.audit_logs`.

---

## 🏗️ Architecture

```
┌────────────────────────────────────────────────────────┐
│                   Customer Website                     │
│         (index.html, event.html, app.js, event.js)     │
│                Hosted on GitHub Pages                  │
└───────────────────────────┬────────────────────────────┘
                            │ 1. POST /create-order
                            ▼
┌────────────────────────────────────────────────────────┐
│                Supabase Edge Functions                 │
│  - list-events   - create-order   - payment-callback   │
│  - check-order   - admin-api                           │
└──────────────┬───────────────────────────┬─────────────┘
               │                           │
               │ 2. Authoritative          │ 3. M-Pesa STK Push
               │    DB Queries             ▼
               ▼                  ┌────────────────────────────────────────┐
┌──────────────────────────────┐  │   FinoQ Africa (PayHero)               │
│     Supabase PostgreSQL      │  │   (M-Pesa STK Push to Phone)           │
│   - events                   │  └──────────────────┬─────────────────────┘
│   - ticket_categories        │                     │ 4. Webhook Callback
│   - orders                   │◄────────────────────┘
│   - payments (idempotent)    │
│   - seat_maps                │
│   - promo_codes              │
│   - referrals                │
│   - audit_logs               │
└──────────────────────────────┘
```

---

## 🚀 Setup & Deployment Guide

### Step 1: Run Database Migration
Apply the multi-event schema with sample events (Ne-Yo, Sol Fest, Mashemeji Derby):
```bash
supabase db push --include-all
```

---

### Step 2: Configure Supabase Secrets
Set your FinoQ API credentials and Admin Key in Supabase:
```bash
supabase secrets set FINOQ_API_KEY="your_finoq_key" FINOQ_API_SECRET="your_finoq_secret" FINOQ_CHANNEL_ID="your_channel_id" ADMIN_API_KEY="your_secure_admin_key" --project-ref atwdadrwcczczkaaoewo
```

---

### Step 3: Deploy Edge Functions
Deploy all 5 serverless functions to project `atwdadrwcczczkaaoewo`:
```bash
supabase functions deploy list-events --no-verify-jwt --project-ref atwdadrwcczczkaaoewo
supabase functions deploy create-order --no-verify-jwt --project-ref atwdadrwcczczkaaoewo
supabase functions deploy payment-callback --no-verify-jwt --project-ref atwdadrwcczczkaaoewo
supabase functions deploy check-order --no-verify-jwt --project-ref atwdadrwcczczkaaoewo
supabase functions deploy admin-api --no-verify-jwt --project-ref atwdadrwcczczkaaoewo
```

---

### Step 4: Deploy Frontend to GitHub Pages
1. Push changes to GitHub:
   ```bash
   git add .
   git commit -m "feat: multi-event Tiko ticketing platform with control center"
   git push origin main
   ```
2. In GitHub repository settings:
   - Navigate to **Settings** ➔ **Pages**.
   - Under **Build and deployment** ➔ **Source**, select **Deploy from a branch** (`main` branch, `/` root folder).
   - Click **Save**.

Your customer site will be live at `https://<username>.github.io/<repo>/` and the Control Center at `https://<username>.github.io/<repo>/dala`.

---

## 📁 Repository Structure
```
Tiko/
├── index.html           # Homepage: Event Discovery, Fast Search, Category Filter
├── event.html           # Event Page: Category Selector, Assigned Seats, M-Pesa Checkout, Digital Ticket
├── dala.html            # Control Center: Event Creator, Ticket Pricing Tiers, Live Stats, Promos, Audit
├── style.css            # Dark Concert Neon Design System & Responsive Styles
├── app.js               # Homepage Logic (Fast Client-Side Search, URL Cleaner & Event Rendering)
├── event.js             # Booking Flow, Strict Promo/Referral Check, M-Pesa Polling, jsPDF Digital Ticket
├── dala.js              # Control Center Controller (Event Edit/Create, Promo Manager, Orders)
├── assets/
│   └── logo.png         # Official Tiko Logo
├── supabase/
│   ├── .env.example     # Environment template
│   ├── migrations/
│   │   └── 20261031000000_tiko_multi_event.sql  # Full PostgreSQL Schema & Seeds
│   └── functions/
│       ├── list-events/index.ts      # Public events & categories listing
│       ├── create-order/index.ts     # Authoritative pricing & M-Pesa STK trigger
│       ├── payment-callback/index.ts # Idempotent M-Pesa verification & reconciliation
│       ├── check-order/index.ts      # Real-time order status polling, promo & referral check
│       └── admin-api/index.ts        # Admin operations (Events CRUD, Promos, Orders, Stats)
└── README.md
```

&copy; 2026 Tiko. Party for Less.
