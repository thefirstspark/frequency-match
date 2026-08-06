# Frequency Match — Whop members access

## Product

| Tier | Price | What you get |
|------|-------|----------------|
| **Locked** | — | No collide until entitled |
| **Players** | $0 (player pass) | Core collide, score, cards, download + share |
| **Frequency Pro** | **$4.99/month** (Whop) | Everything players get + saved history · relationship lens · deep dimensions |

Access rule: **`is_pro` OR `is_player`**. Not free unless you pay $4.99/mo or hold a player pass.

Built to run as a **Whop embedded app** (iframe) and as the standalone site.

## User flow

1. Open app (Whop experience or https://frequency.thefirstspark.shop).
2. Hard gate until entitled — sign in with the **same email as Whop**.
3. Subscribe to Pro ($4.99/mo) **or** claim / hold a Players access pass.
4. Whop webhook sets `is_pro` / `is_player` on `fm_profiles`.
5. Collide unlocks. Pro also unlocks deep toolkit + cloud library.

## Stack

- **Frontend:** static HTML/JS (GitHub Pages) + Supabase JS CDN
- **Auth / DB:** Supabase project **linktree** (`qqlodxrzisbwapjcvjoj`) — tables `fm_profiles`, `fm_matches`
- **Billing:** **Whop** checkout `plan_gX14Qd9V6UEml` + `whop-webhook` Edge Function
- **Live config:** `js/config.js` — `ACCESS_MODE: 'members'`, `WHOP_CHECKOUT_URL`

## Setup checklist

### 1. Supabase schema

SQL Editor → run:

1. `supabase/schema.sql`
2. `supabase/migrations/20260719_whop_columns.sql` (if not already applied)
3. `supabase/migrations/20260806_player_access.sql` (**required** for `is_player`)

### 2. Config

Copy `js/config.example.js` → `js/config.js`:

```js
window.FM_CONFIG = {
  SUPABASE_URL: 'https://YOUR_PROJECT.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_...',
  WHOP_CHECKOUT_URL: 'https://whop.com/checkout/plan_gX14Qd9V6UEml',
  WHOP_PLAN_ID: 'plan_gX14Qd9V6UEml',
  WHOP_PLAYER_CHECKOUT_URL: 'https://whop.com/checkout/plan_PLAYERS', // optional free pass
  WHOP_PLAYER_PLAN_ID: 'plan_PLAYERS',
  WHOP_APP_ID: 'app_...', // Whop Developer app id when embedded
  ACCESS_MODE: 'members', // 'open' = legacy free core
  PRO_PRICE_LABEL: '$4.99/month',
};
```

Do **not** put secret keys in the frontend.

### 3. Whop product + embed

1. Create **Frequency Pro** plan at $4.99/month (live: `plan_gX14Qd9V6UEml`).
2. Optional: create a free **Players** access pass for existing community players.
3. Whop Dashboard → **Apps** → create embedded app pointing at:
   - `https://frequency.thefirstspark.shop`
   - Optional query `?whop_embed=1` (auto-detected via iframe anyway)
4. Attach the app experience to your company so only entitled members reach it **or** rely on the in-app gate (both is fine).

### 4. Whop webhooks

1. Developer → **Webhooks** → URL:
   `https://qqlodxrzisbwapjcvjoj.supabase.co/functions/v1/whop-webhook`
2. Events: `membership.activated`, `membership.deactivated`, `membership.went_valid`, `membership.went_invalid`, `payment.succeeded`
3. Secrets on Supabase Edge Functions:

```bash
WHOP_WEBHOOK_SECRET=...
WHOP_PRO_PLAN_IDS=plan_gX14Qd9V6UEml
WHOP_PLAYER_PLAN_IDS=plan_YOUR_PLAYERS_PASS
```

If both plan id lists are empty, any activating membership grants **Pro** (legacy behavior).

### 5. Deploy webhook

```bash
npx supabase functions deploy whop-webhook --project-ref qqlodxrzisbwapjcvjoj
```

### 6. Auth URL allowlist

Supabase Auth → URL configuration:

- Site URL: `https://frequency.thefirstspark.shop`
- Redirects: same + `http://localhost:5500/**` for local dev

### 7. Manual player grants

SQL (support / comps):

```sql
update public.fm_profiles
set is_player = true, updated_at = now()
where lower(email) = lower('player@example.com');
```

## Demo mode

If `SUPABASE_URL` is empty, the gate stays open (local preview).

Set `ACCESS_MODE: 'open'` to restore unrestricted core collide without entitlements.

## Abuse notes

- Entitlements come from Whop webhook (or manual SQL) — never trust the client alone for real enforcement beyond UX.
- Sign-in email must match Whop buyer email.
- Client-side gate can be bypassed by a determined user; pair with Whop experience access controls for hard platform enforcement.
