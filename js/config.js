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
  // Optional free Players pass claim URL (set when you create a Players access pass on Whop)
  WHOP_PLAYER_CHECKOUT_URL: '',
  WHOP_PLAYER_PLAN_ID: '',
  WHOP_APP_ID: '',
  WHOP_MANAGE_URL: 'https://whop.com/orders',
  FUNCTIONS_BASE: 'https://qqlodxrzisbwapjcvjoj.supabase.co/functions/v1',
  // Embedded Whop app: not free unless Pro ($4.99/mo) or player
  ACCESS_MODE: 'members',
  PRO_PRICE_LABEL: '$4.99/month',
  PRO_NAME: 'Frequency Pro',
  SITE_NAME: 'Frequency Match',
};
