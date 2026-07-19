# Frequency Match — Freemium Model

## Product

| Tier | Price | What you get |
|------|-------|----------------|
| **Free** | $0 | **3** full collisions. Player cards, score, 5 core dimensions, strengths/tensions/pattern, download + share. |
| **Frequency Pro** | **$4.99/mo** | Unlimited collisions · saved match history · deeper analysis (relationship mode, expression/personality dimensions, extended narrative) |

After the 3rd free match, the next “Collide” opens the paywall (sign in + subscribe).

## User flow

1. Guest runs matches → local counter decrements (banner: “2 free matches left”).
2. At 0 remaining → paywall modal.
3. Sign in (magic link) → free remaining syncs to cloud (anti-abuse across devices is soft; Pro is the real unlock).
4. Subscribe via Stripe Checkout → webhook sets `is_pro`.
5. Pro: unlimited runs, auto-save to library, Pro dimensions + relationship lens.

## Stack

- **Frontend:** static HTML/JS (GitHub Pages) + Supabase JS CDN
- **Auth / DB:** Supabase project **linktree** (`qqlodxrzisbwapjcvjoj`) — tables `fm_profiles`, `fm_matches` (isolated; free-tier project limit blocked a dedicated project)
- **Billing:** Stripe Checkout + Customer Portal + webhook Edge Function
- **Live config:** `js/config.js` (publishable key wired; `STRIPE_PRICE_ID` still empty until Stripe product exists)

## Setup checklist

### 1. Supabase schema

SQL Editor → paste and run:

`supabase/schema.sql`

### 2. Config

Copy `js/config.example.js` → `js/config.js` (already present; fill keys):

```js
window.FM_CONFIG = {
  SUPABASE_URL: 'https://YOUR_PROJECT.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_...',
  STRIPE_PRICE_ID: 'price_...',           // $4.99/mo recurring
  FUNCTIONS_BASE: 'https://YOUR_PROJECT.supabase.co/functions/v1',
  FREE_MATCH_LIMIT: 3,
  PRO_PRICE_LABEL: '$4.99/mo',
};
```

Do **not** put Stripe secret keys in the frontend.

### 3. Stripe

1. Create product **Frequency Pro** — $4.99/month recurring.
2. Copy Price ID → `STRIPE_PRICE_ID`.
3. Deploy Edge Functions (below).
4. Stripe Dashboard → Webhooks →  
   `https://YOUR_PROJECT.supabase.co/functions/v1/stripe-webhook`  
   Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.
5. Secrets:

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_live_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase secrets set SITE_URL=https://frequency.thefirstspark.shop
```

### 4. Deploy functions

```bash
cd frequency-match
supabase functions deploy create-checkout
supabase functions deploy create-portal
supabase functions deploy stripe-webhook
```

`config.toml` sets `verify_jwt = false` for webhook + checkout as required.

### 5. Auth URL allowlist

Supabase Auth → URL configuration:

- Site URL: `https://frequency.thefirstspark.shop`
- Redirects: same + `http://localhost:5500/**` for local dev

## Demo mode

If `SUPABASE_URL` is empty, freemium still runs on **localStorage only**:

- Free limit enforced
- Paywall copy shown
- Subscribe button alerts that billing is not configured
- History is local-only

## Abuse notes

- Guest limit is localStorage (clearable).
- Signed-in free users use `fm_profiles.free_matches_used` (harder to reset).
- Pro status comes from Stripe webhook only — never trust the client.
