# 🎟️ Tiko — Party for Less
> **Affordable entertainment — more vibes, less spend.**  
> Tiko is the ultimate go-to for on-offer, discounted tickets.

This repository powers the ticket-commerce website offering discounted tickets for **Ne-Yo Live in Concert — One Night Only: Brunch Edition** at **Ulinzi Sports Complex, Nairobi** (Mashujaa Day, Tuesday 20 October 2026).

---

## 🏷️ Ticket Offers & Savings Reference

| Ticket Category | Original Price | Tiko Offer Price | Customer Saves | Attendees | Type |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Early Bird Gold** | KSh 7,500 | **KSh 5,500** | KSh 2,000 | 1 | Individual |
| **Wave 2 Gold** | KSh 10,000 | **KSh 8,000** | KSh 2,000 | 1 | Individual |
| **Gold Ticket** | KSh 15,000 | **KSh 13,000** | KSh 2,000 | 1 | Individual |
| **Gold Couple/Friends Package** | KSh 20,000 | **KSh 15,000** | **KSh 5,000** | 2 | Group Package |
| **Platinum Green Area — Individual** | KSh 40,000 | **KSh 36,000** | KSh 4,000 | 1 | Individual |
| **Platinum Green Area — 4-Seater Table** | KSh 160,000 | **KSh 140,000** | **KSh 20,000** | 4 | VIP Table (4) |
| **Platinum Green Area — 8-Seater Table** | KSh 320,000 | **KSh 280,000** | **KSh 40,000** | 8 | VIP Table (8) |

---

## 🏗️ Architecture

```
┌────────────────────────────────┐
│   Customer Website             │
│   (HTML, CSS, JS)              │
│   Hosted on GitHub Pages       │
└──────────────┬─────────────────┘
               │ 1. POST /create-order
               ▼
┌────────────────────────────────┐
│   Supabase Edge Functions      │
│   - create-order               │
│   - payment-callback           │
│   - check-order                │
└───────┬──────────────┬─────────┘
        │              │
        │ 2. Query     │ 3. POST /initiate-stk-push
        │    Price     │
        ▼              ▼
┌──────────────┐  ┌──────────────────────────────────┐
│   Supabase   │  │   PayHero / FinoQ                │
│  PostgreSQL  │  │   (M-Pesa STK Push to Customer)  │
│  - tickets   │  └────────────────┬─────────────────┘
│  - orders    │                   │ 4. Webhook Callback
│  - payments  │◄──────────────────┘
└──────────────┘
```

1. **Frontend (GitHub Pages):**
   - Zero-build lightweight static site (`index.html`, `style.css`, `app.js`).
   - Dynamic category filter (All, Gold, Platinum).
   - Quantity and attendees calculation.
   - M-Pesa phone number validation (`+254` format).
   - Real-time polling with countdown timer and fallback simulator for local preview.

2. **Supabase PostgreSQL:**
   - Authoritative `tickets` table with official offer prices (the client cannot manipulate prices).
   - `orders` table storing order status (`pending` ➔ `paid`), customer contact, and M-Pesa receipt codes.
   - `payments` table enforcing strict **idempotency** via unique constraint on provider reference.

3. **Supabase Edge Functions:**
   - `create-order`: Validates input, calculates total against authoritative DB price, generates `TIKO-XXX` reference, and triggers PayHero STK Push.
   - `payment-callback`: Secure webhook handler. Reconciles amount, prevents duplicate processing, and fulfills the order only on verified payment.
   - `check-order`: Polled by frontend every 3 seconds to confirm payment status.

4. **PayHero / FinoQ:**
   - Directly routes funds into your registered Safaricom M-Pesa Till or PayBill.

---

## 🚀 Setup & Deployment Guide

### Step 1: Database Setup in Supabase
1. Create a free project at [supabase.com](https://supabase.com).
2. Go to **SQL Editor** in your Supabase Dashboard.
3. Open `supabase/migrations/20261013000000_init_tiko_tables.sql` from this repository, copy its content, and execute it.
4. Your `tickets`, `orders`, and `payments` tables are now created and seeded with the exact ticket prices.

---

### Step 2: Configure Supabase Edge Function Secrets
Never put your PayHero API credentials or Supabase service-role key in public files.

In your Supabase project, go to **Project Settings** ➔ **Edge Functions** ➔ **Secrets** (or use the Supabase CLI):

```bash
supabase secrets set PAYHERO_API_USERNAME="your_payhero_api_username"
supabase secrets set PAYHERO_API_PASSWORD="your_payhero_api_password"
supabase secrets set PAYHERO_CHANNEL_ID="your_channel_id_number"
```

*Note: Your Channel ID is the numeric ID of your registered Till or Paybill on [app.payhero.co.ke](https://app.payhero.co.ke).*

---

### Step 3: Deploy Supabase Edge Functions
Install the Supabase CLI (if not already installed) and deploy the functions:

```bash
# Login to Supabase CLI
supabase login

# Link your project
supabase link --project-ref your-project-ref

# Deploy the 3 Edge Functions
supabase functions deploy create-order
supabase functions deploy payment-callback --no-verify-jwt
supabase functions deploy check-order
```
> **Important:** `--no-verify-jwt` is used for `payment-callback` because PayHero sends standard HTTP webhooks without Supabase user tokens.

---

### Step 4: Configure Webhook on PayHero / FinoQ
1. Log in to [PayHero Kenya (FinoQ)](https://app.payhero.co.ke/).
2. Navigate to **Channels** ➔ Select your Till / Paybill.
3. Set your Callback / Webhook URL to:
   ```
   https://<your-project-ref>.supabase.co/functions/v1/payment-callback
   ```

---

### Step 5: Connect Frontend to Supabase
In `app.js` (line 12), update `SUPABASE_FUNCTIONS_URL`:
```javascript
const CONFIG = {
  SUPABASE_FUNCTIONS_URL: "https://<your-project-ref>.supabase.co/functions/v1",
  POLL_INTERVAL: 3000,
  POLL_TIMEOUT_SEC: 90
};
```

---

### Step 6: Deploy to GitHub Pages
1. Push this repository to GitHub:
   ```bash
   git init
   git add .
   git commit -m "feat: launch Tiko ticket commerce site"
   git branch -M main
   git remote add origin https://github.com/<your-username>/tiko.git
   git push -u origin main
   ```
2. In your GitHub repository:
   - Go to **Settings** ➔ **Pages**.
   - Under **Build and deployment** ➔ **Source**, select **Deploy from a branch**.
   - Branch: `main` / Folder: `/ (root)`.
   - Click **Save**.
3. Your website will be live at `https://<your-username>.github.io/tiko/` within 60 seconds!

---

## 🔒 Security & Best Practices

- ✅ **Authoritative Pricing:** Total order amounts are calculated server-side inside the `create-order` Edge Function using the PostgreSQL `tickets` table. Client requests cannot tamper with prices.
- ✅ **Idempotent Callbacks:** The `payment-callback` Edge Function checks if an order is already marked as `paid` before processing. Duplicate webhook retries are harmless.
- ✅ **Receipt Verification:** Orders are only updated to `paid` when PayHero/FinoQ sends a confirmed webhook with `status: "success"` and the M-Pesa `provider_reference`.
- ✅ **No Credentials in Frontend:** Neither the PayHero credentials nor the Supabase Service Role Key are stored in client-side code.

---

## 📞 Support & Contacts
- **Event:** One Night Only: Brunch Edition (Ne-Yo Live)
- **Venue:** Ulinzi Sports Complex, Nairobi
- **Date:** Tuesday, 20 October 2026 (Mashujaa Day)
