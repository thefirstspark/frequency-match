/**
 * Copy to config.js and fill in values.
 * config.js is safe to commit with empty strings; never put secret keys here.
 */
window.FM_CONFIG = {
  SUPABASE_URL: 'https://YOUR_PROJECT.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_...',
  // Frequency Pro — $4.99/month
  WHOP_CHECKOUT_URL: 'https://whop.com/checkout/plan_XXXX',
  WHOP_PLAN_ID: 'plan_XXXX',
  // Sparkverse free tier (lead magnet) — join Lobby before first collide
  WHOP_PLAYER_CHECKOUT_URL:
    'https://whop.com/sparkverse-511c/the-sparkverse-lobby/',
  // Free Lobby plan id(s) for webhook → sets is_player (comma-separated ok in secrets)
  WHOP_PLAYER_PLAN_ID: 'plan_YOUR_FREE_LOBBY_PLAN',
  WHOP_APP_ID: '',
  WHOP_MANAGE_URL: 'https://whop.com/orders',
  FUNCTIONS_BASE: 'https://YOUR_PROJECT.supabase.co/functions/v1',
  // members = must join free Lobby (is_player) OR Pro before one try
  ACCESS_MODE: 'members',
  PRO_PRICE_LABEL: '$4.99/month',
  PRO_NAME: 'Frequency Pro',
  SITE_NAME: 'Frequency Match',
  FREE_TIER_NAME: 'Sparkverse Lobby',
};
