# Frequency Match — Sparkverse free-tier lead magnet

## Product intent

Frequency Match is a **lead magnet** for the **Sparkverse free Lobby**.

| Stage | What happens |
|-------|----------------|
| Land on site | **Hard gate** — no collide until authorized |
| Join free | **Sparkverse Lobby** on Whop (free tier) |
| Sign in | Magic link with **same email as Whop** |
| First try | Unlocked when `is_player` **or** `is_pro` |
| Optional | **Frequency Pro** $4.99/mo — deep toolkit + library |

Access rule: **`is_pro` OR `is_player`**. Not open to the cold internet without Whop free join + sign-in.

## User flow

```
Visitor → frequency.thefirstspark.shop
  → Gate: “Join Sparkverse free”
  → Whop free Lobby join
  → Return → Sign in (same email)
  → Webhook sets is_player
  → Collide unlocked
  → Optional: upgrade to Frequency Pro
```

## Config (`js/config.js`)

```js
ACCESS_MODE: 'members',
WHOP_PLAYER_CHECKOUT_URL: 'https://whop.com/sparkverse-511c/the-sparkverse-lobby/',
WHOP_PLAYER_PLAN_ID: 'plan_…', // free Lobby plan id for webhook
WHOP_CHECKOUT_URL: 'https://whop.com/checkout/plan_gX14Qd9V6UEml', // Pro
```

## Whop setup checklist

1. **Free Lobby product** — Sparkverse free tier (or free access pass).  
2. Put that plan’s id in Supabase Edge secret:

```bash
WHOP_PRO_PLAN_IDS=plan_gX14Qd9V6UEml
WHOP_PLAYER_PLAN_IDS=plan_YOUR_FREE_LOBBY_PLAN
WHOP_WEBHOOK_SECRET=...
```

3. Webhook URL:

`https://qqlodxrzisbwapjcvjoj.supabase.co/functions/v1/whop-webhook`

Events: `membership.activated`, `membership.deactivated`, `membership.went_valid`, `membership.went_invalid`, `payment.succeeded`

4. Supabase SQL: run `supabase/migrations/20260806_player_access.sql` (`is_player` column).

5. Auth allowlist: Site URL `https://frequency.thefirstspark.shop`

## Manual grant (testing)

In Supabase `fm_profiles`, set `is_player = true` for your test email row after sign-in.

## Deploy

GitHub Pages: push `main`. Domain: `frequency.thefirstspark.shop` (CNAME).
