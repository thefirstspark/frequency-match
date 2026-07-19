/**
 * Frequency Match — public client config
 * Never put secret keys here.
 */
window.FM_CONFIG = {
  SUPABASE_URL: 'https://qqlodxrzisbwapjcvjoj.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_SPYW_M9_RCnKJOz8RhAIUA_CC2j3SSi',
  // Billing via Whop (not Stripe)
  WHOP_CHECKOUT_URL: 'https://whop.com/checkout/plan_gX14Qd9V6UEml',
  WHOP_PLAN_ID: 'plan_gX14Qd9V6UEml',
  WHOP_MANAGE_URL: 'https://whop.com/orders',
  FUNCTIONS_BASE: 'https://qqlodxrzisbwapjcvjoj.supabase.co/functions/v1',
  // Core collide is free forever for players (no match cap)
  PLAYERS_FREE: true,
  PRO_PRICE_LABEL: '$4.99/month',
  PRO_NAME: 'Frequency Pro',
  SITE_NAME: 'Frequency Match',
};
