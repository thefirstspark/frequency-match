/**
 * Frequency Match — public client config
 * Never put secret keys here.
 *
 * Collide is free. Frequency Pro ($4.99/mo) is the optional deep toolkit.
 * Join the Sparkverse at thefirstspark.shop/join.html — email, not Whop.
 */
window.FM_CONFIG = {
  SUPABASE_URL: 'https://qqlodxrzisbwapjcvjoj.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_SPYW_M9_RCnKJOz8RhAIUA_CC2j3SSi',

  // Frequency Pro (paid deep toolkit)
  WHOP_CHECKOUT_URL: 'https://whop.com/checkout/plan_gX14Qd9V6UEml',
  WHOP_PLAN_ID: 'plan_gX14Qd9V6UEml',

  // Sparkverse free membership (email gate, not Whop)
  WHOP_PLAYER_CHECKOUT_URL:
    'https://thefirstspark.shop/join.html',
  WHOP_PLAYER_PLAN_ID: '',
  WHOP_APP_ID: '',
  WHOP_MANAGE_URL: 'https://whop.com/orders',

  FUNCTIONS_BASE: 'https://qqlodxrzisbwapjcvjoj.supabase.co/functions/v1',

  // open = collide is free; members = Pro or is_player
  ACCESS_MODE: 'open',

  PRO_PRICE_LABEL: '$4.99/month',
  PRO_NAME: 'Frequency Pro',
  SITE_NAME: 'Frequency Match',
  FREE_TIER_NAME: 'Sparkverse Lobby',
};
