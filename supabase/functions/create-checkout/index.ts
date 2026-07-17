import { withSupabase } from 'npm:@supabase/server'
import Stripe from 'npm:stripe'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!)

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204 })
    }
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 })
    }

    const body = await req.json().catch(() => ({}))
    const priceId = body.priceId || Deno.env.get('STRIPE_PRICE_ID')
    const successUrl =
      body.successUrl ||
      `${Deno.env.get('SITE_URL') || 'https://frequency.thefirstspark.shop'}/?checkout=success`
    const cancelUrl =
      body.cancelUrl ||
      `${Deno.env.get('SITE_URL') || 'https://frequency.thefirstspark.shop'}/?checkout=cancel`

    if (!priceId) {
      return Response.json({ error: 'Missing priceId' }, { status: 400 })
    }

    const userId = ctx.user!.id
    const email = ctx.user!.email

    const { data: profile } = await ctx.supabaseAdmin
      .from('fm_profiles')
      .select('stripe_customer_id, email')
      .eq('id', userId)
      .maybeSingle()

    let customerId = profile?.stripe_customer_id as string | null | undefined

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: email || profile?.email || undefined,
        metadata: { supabase_user_id: userId },
      })
      customerId = customer.id
      await ctx.supabaseAdmin.from('fm_profiles').upsert({
        id: userId,
        email: email || profile?.email,
        stripe_customer_id: customerId,
      })
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: userId,
      metadata: { supabase_user_id: userId },
      subscription_data: {
        metadata: { supabase_user_id: userId },
      },
      allow_promotion_codes: true,
    })

    return Response.json({ url: session.url })
  }),
}
