# 🎟️ Tiko — Party for Less
> **Affordable entertainment — more vibes, less spend.**  
> Tiko is the ultimate go-to for on-offer, discounted tickets.

This repository powers the ticket-commerce website offering discounted tickets for **Ne-Yo Live in Concert — One Night Only: Brunch Edition** at **Ulinzi Sports Complex, Nairobi** (Mashujaa Day, Tuesday 20 October 2026).

---

## 🏷️ Ticket Offers & Savings Reference

| Ticket Category | Original Price | Tiko Offer Price | Customer Saves | Attendees Included | Type |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Early Bird Gold** | KSh 7,500 | **KSh 5,500** | KSh 2,000 | 1 Attendee | Individual Pass |
| **Wave 2 Gold** | KSh 10,000 | **KSh 8,000** | KSh 2,000 | 1 Attendee | Individual Pass |
| **Gold Ticket** | KSh 15,000 | **KSh 13,000** | KSh 2,000 | 1 Attendee | Individual Pass |
| **Gold Couple/Friends Package** | KSh 20,000 | **KSh 15,000** | **KSh 5,000** | 2 Attendees | Group Bundle |
| **Platinum Green Area — Individual** | KSh 40,000 | **KSh 36,000** | KSh 4,000 | 1 Attendee | VIP Pass |
| **Platinum Green Area — 4-Seater Table** | KSh 160,000 | **KSh 140,000** | **KSh 20,000** | 4 Attendees | VIP Table (4) |
| **Platinum Green Area — 8-Seater Table** | KSh 320,000 | **KSh 280,000** | **KSh 40,000** | 8 Attendees | VIP Table (8) |

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────┐
│   Customer Website                       │
│   (HTML5, CSS3, JavaScript)              │
│   Hosted on GitHub Pages                 │
└────────────────────┬─────────────────────┘
                     │ 1. POST /create-order
                     ▼
┌──────────────────────────────────────────┐
│   Supabase Edge Functions                │
│   - create-order                         │
│   - payment-callback                     │
│   - check-order                          │
└─────────┬──────────────────────┬─────────┘
          │                      │
          │ 2. Authoritative     │ 3. POST /api/v2/payments
          │    DB Price Lookup   │    (M-Pesa STK Push)
          ▼                      ▼
┌──────────────────┐  ┌────────────────────────────────────────┐
│   Supabase       │  │   FinoQ Africa (PayHero)               │
│   PostgreSQL     │  │   (M-Pesa STK Push to Customer Phone)  │
│   - tickets      │  └──────────────────┬─────────────────────┘
│   - orders       │                     │ 4. Webhook Callback
│   - payments     │◄────────────────────┘
└──────────────────┘
```

1. **Frontend (GitHub Pages):**
   - High-impact dark concert design system with neon accents.
   - Opening full-screen splash animation loading the bold Tiko logo.
   - Accepts all natural Kenyan Safaricom phone prefixes (`07XXXXXXXX` or `01XXXXXXXX`).
   - Generates and downloads downloadable **VIP PDF Tickets** featuring the Tiko logo, branding, attendee name, people allowed, order reference, amount paid, and gate QR code upon verified payment.

2. **Supabase PostgreSQL Database:**
   - Authoritative `tickets` table with official offer prices. Price cannot be tampered with on client side.
   - `orders` table storing order status (`pending`, `processing`, `paid`, `failed`), customer details, and M-Pesa receipt references.
   - `payments` table enforcing strict **idempotency** to guarantee duplicate webhooks cannot credit an order twice.

3. **Supabase Edge Functions:**
   - `create-order`: Validates parameters, queries the database for authoritative ticket pricing, generates `TIKO-XXX` reference, and dispatches M-Pesa STK Push via FinoQ Africa API.
   - `payment-callback`: Webhook receiver from FinoQ. Reconciles amount paid, marks order as paid, and logs receipt.
   - `check-order`: Polling endpoint queried by the frontend to confirm real-time payment status.

---

## 🚀 Setup & Deployment Guide

### Step 1: Push Migrations to Supabase Database
Run the included migrations to create the schema and seed official ticket pricing:
```bash
supabase db push --include-all
```

---

### Step 2: Configure FinoQ Secrets in Supabase
Set your FinoQ API credentials as Supabase Edge Function Secrets (never store credentials in source code):
```bash
supabase secrets set FINOQ_API_USERNAME="your_finoq_api_username" FINOQ_API_PASSWORD="your_finoq_api_password" FINOQ_CHANNEL_ID="your_channel_id" --project-ref <your-project-ref>
```

---

### Step 3: Deploy Edge Functions
Deploy the serverless Edge Functions to Supabase:
```bash
supabase functions deploy create-order --no-verify-jwt --use-api
supabase functions deploy payment-callback --no-verify-jwt --use-api
supabase functions deploy check-order --no-verify-jwt --use-api
```

---

### Step 4: Deploy to GitHub Pages
1. Push this repository to GitHub:
   ```bash
   git add .
   git commit -m "feat: complete Tiko ticket commerce platform"
   git push -u origin main
   ```
2. In your GitHub repository:
   - Navigate to **Settings** ➔ **Pages**.
   - Under **Build and deployment** ➔ **Source**, select **Deploy from a branch**.
   - Branch: `main` / Folder: `/ (root)`.
   - Click **Save**.

---

## 🔒 Security & Integrity

- ✅ **Server-Side Pricing**: The client browser cannot manipulate prices. The Edge Function calculates total amounts strictly from the database.
- ✅ **Idempotent Webhooks**: Payment callbacks are deduplicated to prevent double-fulfillment.
- ✅ **No Secrets in Frontend**: API keys and service-role keys are stored exclusively in Supabase Secrets.
