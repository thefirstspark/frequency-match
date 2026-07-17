import { withSupabase } from 'npm:@supabase/server'
import Stripe from 'npm:stripe'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!)

// deno-lint-ignore no-explicit-any
async function setProByCustomer(admin: any, customerId: string, fields: Record<string, unknown>) {
  await admin
    .from('fm_profiles')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('stripe_customer_id', customerId)
}

// deno-lint-ignore no-explicit-any
async function setProByUserId(admin: any, userId: string, fields: Record<string, unknown>) {
  await admin
    .from('fm_profiles')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', userId)
}

export default {
  fetch: withSupabase({ auth: 'none' }, async (req, ctx) => {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 })
    }

    const body = await req.text()
    const sig = req.headers.get('stripe-signature')
    if (!sig) {
      return Response.json({ error: 'Missing signature' }, { status: 401 })
    }

    let event: Stripe.Event
    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        sig,
        Deno.env.get('STRIPE_WEBHOOK_SECRET')!,
      )
    } catch {
      return Response.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const admin = ctx.supabaseAdmin

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId =
          session.client_reference_id ||
          session.metadata?.supabase_user_id ||
          null
        const customerId =
          typeof session.customer === 'string'
            ? session.customer
            : session.customer?.id
        const subId =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id

        const fields = {
          is_pro: true,
          stripe_customer_id: customerId,
          stripe_subscription_id: subId,
        }

        if (userId) {
          await setProByUserId(admin, userId, fields)
        } else if (customerId) {
          await setProByCustomer(admin, customerId, fields)
        }
        break
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const customerId =
          typeof sub.customer === 'string' ? sub.customer : sub.customer.id
        const active = ['active', 'trialing'].includes(sub.status)
        const userId = sub.metadata?.supabase_user_id

        const fields = {
          is_pro: active,
          stripe_subscription_id: sub.id,
          pro_until: sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null,
        }

        if (userId) {
          await setProByUserId(admin, userId, {
            ...fields,
            stripe_customer_id: customerId,
          })
        } else {
          await setProByCustomer(admin, customerId, fields)
        }
        break
      }
    }

    return Response.json({ received: true })
  }),
}
