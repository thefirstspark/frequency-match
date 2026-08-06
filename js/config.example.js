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
  // Optional free Players pass checkout / claim URL (Whop access pass)
  WHOP_PLAYER_CHECKOUT_URL: '',
  WHOP_PLAYER_PLAN_ID: '',
  // Whop Developer app id (for iframe embed detection / future SDK)
  WHOP_APP_ID: '',
  WHOP_MANAGE_URL: 'https://whop.com/orders',
  FUNCTIONS_BASE: 'https://YOUR_PROJECT.supabase.co/functions/v1',
  // members = must be Pro ($4.99) OR player; open = legacy free core collide
  ACCESS_MODE: 'members',
  PRO_PRICE_LABEL: '$4.99/month',
  PRO_NAME: 'Frequency Pro',
  SITE_NAME: 'Frequency Match',
};
