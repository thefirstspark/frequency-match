/**
 * Frequency Match freemium client
 * Free: FREE_MATCH_LIMIT collisions · Pro: unlimited + saves + deeper analysis
 */
(function (global) {
  const LS_USED = 'fm_free_matches_used';
  const LS_HISTORY = 'fm_local_history';

  const cfg = () => global.FM_CONFIG || {};
  const limit = () => Number(cfg().FREE_MATCH_LIMIT) || 3;

  let supabase = null;
  let session = null;
  let profile = null;
  let ready = false;

  function isConfigured() {
    return Boolean(cfg().SUPABASE_URL && cfg().SUPABASE_PUBLISHABLE_KEY);
  }

  function functionsBase() {
    if (cfg().FUNCTIONS_BASE) return cfg().FUNCTIONS_BASE.replace(/\/$/, '');
    if (cfg().SUPABASE_URL) return cfg().SUPABASE_URL.replace(/\/$/, '') + '/functions/v1';
    return '';
  }

  function getGuestUsed() {
    const n = parseInt(localStorage.getItem(LS_USED) || '0', 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function setGuestUsed(n) {
    localStorage.setItem(LS_USED, String(Math.max(0, n)));
  }

  function isPro() {
    if (profile && profile.is_pro) return true;
    return false;
  }

  function freeUsed() {
    if (session && profile) {
      return Math.max(profile.free_matches_used || 0, getGuestUsed());
    }
    return getGuestUsed();
  }

  function remaining() {
    if (isPro()) return null;
    return Math.max(limit() - freeUsed(), 0);
  }

  function canRunMatch() {
    if (isPro()) return true;
    return remaining() > 0;
  }

  async function init() {
    if (!isConfigured() || !global.supabase) {
      ready = true;
      emit('ready');
      return;
    }

    supabase = global.supabase.createClient(
      cfg().SUPABASE_URL,
      cfg().SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      }
    );

    const { data } = await supabase.auth.getSession();
    session = data.session || null;
    if (session) {
      await loadProfile();
      await mergeGuestUsage();
    }

    supabase.auth.onAuthStateChange(async (_event, s) => {
      session = s;
      if (session) {
        await loadProfile();
        await mergeGuestUsage();
      } else {
        profile = null;
      }
      emit('auth', { session, profile });
      emit('usage', getUsageSnapshot());
    });

    ready = true;
    emit('ready');
    emit('auth', { session, profile });
    emit('usage', getUsageSnapshot());
  }

  async function loadProfile() {
    if (!supabase || !session) {
      profile = null;
      return null;
    }
    const { data, error } = await supabase
      .from('fm_profiles')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle();

    if (error) {
      console.warn('[FM] loadProfile', error.message);
    }

    if (!data) {
      const { data: inserted } = await supabase
        .from('fm_profiles')
        .insert({ id: session.user.id, email: session.user.email })
        .select()
        .single();
      profile = inserted || null;
    } else {
      profile = data;
    }
    return profile;
  }

  async function mergeGuestUsage() {
    if (!supabase || !session) return;
    const guest = getGuestUsed();
    if (guest <= 0) return;
    const { data, error } = await supabase.rpc('fm_merge_guest_usage', {
      guest_used: guest,
    });
    if (error) {
      console.warn('[FM] mergeGuestUsage', error.message);
      return;
    }
    if (data) {
      profile = {
        ...(profile || {}),
        free_matches_used: data.free_matches_used,
        is_pro: data.is_pro,
      };
      // Align local with server (higher used wins already applied server-side)
      setGuestUsed(data.free_matches_used || guest);
    }
  }

  function getUsageSnapshot() {
    return {
      configured: isConfigured(),
      signedIn: Boolean(session),
      email: session?.user?.email || null,
      isPro: isPro(),
      freeUsed: freeUsed(),
      remaining: remaining(),
      limit: limit(),
      canRun: canRunMatch(),
      priceLabel: cfg().PRO_PRICE_LABEL || '$4.99/mo',
      proName: cfg().PRO_NAME || 'Frequency Pro',
    };
  }

  /**
   * Call before starting a collision. Returns { ok, reason?, usage }
   */
  async function authorizeMatch() {
    if (!canRunMatch()) {
      return { ok: false, reason: 'free_limit_reached', usage: getUsageSnapshot() };
    }
    return { ok: true, usage: getUsageSnapshot() };
  }

  /**
   * Call after a successful collision. Decrements free quota when not Pro.
   */
  async function recordMatch() {
    if (isPro()) {
      emit('usage', getUsageSnapshot());
      return { ok: true, usage: getUsageSnapshot() };
    }

    if (supabase && session) {
      const { data, error } = await supabase.rpc('fm_consume_match');
      if (error) {
        console.warn('[FM] consume', error.message);
        // Fall back to local
      } else if (data) {
        if (data.ok === false) {
          return { ok: false, reason: 'free_limit_reached', usage: getUsageSnapshot() };
        }
        profile = {
          ...(profile || {}),
          free_matches_used: data.free_matches_used,
          is_pro: data.is_pro,
        };
        setGuestUsed(data.free_matches_used || getGuestUsed());
        emit('usage', getUsageSnapshot());
        return { ok: true, usage: getUsageSnapshot() };
      }
    }

    const next = getGuestUsed() + 1;
    setGuestUsed(next);
    emit('usage', getUsageSnapshot());
    return { ok: true, usage: getUsageSnapshot() };
  }

  async function signInWithEmail(email) {
    if (!supabase) throw new Error('Supabase not configured');
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });
    if (error) throw error;
    return true;
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    profile = null;
    session = null;
    emit('auth', { session: null, profile: null });
    emit('usage', getUsageSnapshot());
  }

  async function saveMatch(matchPayload) {
    // Local history always (last 20)
    try {
      const list = JSON.parse(localStorage.getItem(LS_HISTORY) || '[]');
      list.unshift({
        id: 'local_' + Date.now(),
        created_at: new Date().toISOString(),
        ...matchPayload,
      });
      localStorage.setItem(LS_HISTORY, JSON.stringify(list.slice(0, 20)));
    } catch (_) { /* ignore */ }

    if (!isPro()) {
      return { saved: false, reason: 'pro_required', local: true };
    }
    if (!supabase || !session) {
      return { saved: false, reason: 'sign_in_required', local: true };
    }

    const row = {
      user_id: session.user.id,
      p1_name: matchPayload.p1_name,
      p1_date: matchPayload.p1_date,
      p1_place: matchPayload.p1_place || null,
      p2_name: matchPayload.p2_name,
      p2_date: matchPayload.p2_date,
      p2_place: matchPayload.p2_place || null,
      relationship_mode: matchPayload.relationship_mode || 'general',
      overall_score: matchPayload.overall_score,
      scores: matchPayload.scores || {},
      profiles: matchPayload.profiles || {},
      narrative: matchPayload.narrative || {},
      is_pro_analysis: Boolean(matchPayload.is_pro_analysis),
    };

    const { data, error } = await supabase
      .from('fm_matches')
      .insert(row)
      .select()
      .single();

    if (error) {
      console.warn('[FM] saveMatch', error.message);
      return { saved: false, reason: error.message, local: true };
    }
    return { saved: true, match: data, local: true };
  }

  async function listMatches() {
    const local = (() => {
      try {
        return JSON.parse(localStorage.getItem(LS_HISTORY) || '[]');
      } catch {
        return [];
      }
    })();

    if (!isPro() || !supabase || !session) {
      return { matches: local, source: 'local' };
    }

    const { data, error } = await supabase
      .from('fm_matches')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.warn('[FM] listMatches', error.message);
      return { matches: local, source: 'local' };
    }
    return { matches: data || [], source: 'cloud' };
  }

  async function startCheckout() {
    if (!isConfigured()) {
      throw new Error('Billing not configured yet. Add Supabase + Stripe keys in js/config.js');
    }
    if (!session) {
      throw new Error('Sign in first to subscribe');
    }
    if (!cfg().STRIPE_PRICE_ID) {
      throw new Error('STRIPE_PRICE_ID missing in js/config.js');
    }

    const base = functionsBase();
    const res = await fetch(base + '/create-checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: cfg().SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({
        priceId: cfg().STRIPE_PRICE_ID,
        successUrl: window.location.href.split('#')[0] + '?checkout=success',
        cancelUrl: window.location.href.split('#')[0] + '?checkout=cancel',
      }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.error || body.message || 'Checkout failed');
    }
    if (body.url) {
      window.location.href = body.url;
      return;
    }
    throw new Error('No checkout URL returned');
  }

  async function openBillingPortal() {
    if (!session) throw new Error('Sign in first');
    const base = functionsBase();
    const res = await fetch(base + '/create-portal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: cfg().SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({
        returnUrl: window.location.href.split('#')[0],
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || body.message || 'Portal failed');
    if (body.url) window.location.href = body.url;
  }

  // Simple event bus
  const listeners = {};
  function on(event, fn) {
    (listeners[event] = listeners[event] || []).push(fn);
  }
  function emit(event, payload) {
    (listeners[event] || []).forEach((fn) => {
      try {
        fn(payload);
      } catch (e) {
        console.error(e);
      }
    });
  }

  global.FM = {
    init,
    on,
    isConfigured,
    isPro,
    canRunMatch,
    remaining,
    getUsageSnapshot,
    authorizeMatch,
    recordMatch,
    signInWithEmail,
    signOut,
    saveMatch,
    listMatches,
    startCheckout,
    openBillingPortal,
    getSession: () => session,
    getProfile: () => profile,
    isReady: () => ready,
  };
})(window);
