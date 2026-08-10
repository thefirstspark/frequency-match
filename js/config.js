/**
 * Frequency Match — public client config
 * Never put secret keys here.
 *
 * Lead magnet: must join Sparkverse free tier (Whop) + sign in
 * before any collide. Pro is optional deep toolkit.
 */
window.FM_CONFIG = {
  SUPABASE_URL: 'https://qqlodxrzisbwapjcvjoj.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_SPYW_M9_RCnKJOz8RhAIUA_CC2j3SSi',

  // Frequency Pro (paid deep toolkit)
  WHOP_CHECKOUT_URL: 'https://whop.com/checkout/plan_gX14Qd9V6UEml',
  WHOP_PLAN_ID: 'plan_gX14Qd9V6UEml',

  // Sparkverse free tier — join Lobby before first try
  WHOP_PLAYER_CHECKOUT_URL:
    'https://whop.com/sparkverse-511c/the-sparkverse-lobby/',
  // Set this to the free Lobby plan id when Whop webhook should set is_player
  WHOP_PLAYER_PLAN_ID: '',
  WHOP_APP_ID: '',
  WHOP_MANAGE_URL: 'https://whop.com/orders',

  FUNCTIONS_BASE: 'https://qqlodxrzisbwapjcvjoj.supabase.co/functions/v1',

  // members = hard gate until is_player (free Lobby) OR is_pro
  ACCESS_MODE: 'members',

  PRO_PRICE_LABEL: '$4.99/month',
  PRO_NAME: 'Frequency Pro',
  SITE_NAME: 'Frequency Match',
  FREE_TIER_NAME: 'Sparkverse Lobby',
};
