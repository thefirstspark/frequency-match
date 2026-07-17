/**
 * Frequency Match — public client config
 * Fill SUPABASE_* and STRIPE_PRICE_ID before go-live.
 * Never put secret keys here.
 */
window.FM_CONFIG = {
  // Shared First Spark Supabase project (MarketShop + Frequency Match)
  SUPABASE_URL: 'https://ffqcoewjggjgwfsriavj.supabase.co',
  // Dashboard → Project Settings → API → publishable / anon key
  // Paste key here (or set via local override). Empty = free-limit still works offline.
  SUPABASE_PUBLISHABLE_KEY: '',
  // Stripe Price ID for Frequency Pro $4.99/mo recurring
  STRIPE_PRICE_ID: '',
  FUNCTIONS_BASE: 'https://ffqcoewjggjgwfsriavj.supabase.co/functions/v1',
  FREE_MATCH_LIMIT: 3,
  PRO_PRICE_LABEL: '$4.99/mo',
  PRO_NAME: 'Frequency Pro',
  SITE_NAME: 'Frequency Match',
};
