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
    const returnUrl =
      body.returnUrl ||
      Deno.env.get('SITE_URL') ||
      'https://frequency.thefirstspark.shop'

    const userId = ctx.user!.id
    const { data: profile } = await ctx.supabaseAdmin
      .from('fm_profiles')
      .select('stripe_customer_id')
      .eq('id', userId)
      .maybeSingle()

    if (!profile?.stripe_customer_id) {
      return Response.json(
        { error: 'No billing customer on file. Subscribe first.' },
        { status: 400 },
      )
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: returnUrl,
    })

    return Response.json({ url: portal.url })
  }),
}
