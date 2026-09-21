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
  // Sparkverse free membership (email gate)
  WHOP_PLAYER_CHECKOUT_URL:
    'https://thefirstspark.shop/join.html',
  WHOP_PLAYER_PLAN_ID: '',
  WHOP_APP_ID: '',
  WHOP_MANAGE_URL: 'https://whop.com/orders',
  FUNCTIONS_BASE: 'https://YOUR_PROJECT.supabase.co/functions/v1',
  // open = collide is free; members = Pro or is_player
  ACCESS_MODE: 'open',
  PRO_PRICE_LABEL: '$4.99/month',
  PRO_NAME: 'Frequency Pro',
  SITE_NAME: 'Frequency Match',
  FREE_TIER_NAME: 'Sparkverse Lobby',
};
