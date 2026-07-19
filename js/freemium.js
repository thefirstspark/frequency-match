/**
 * Frequency Match freemium client
 * Players: FREE forever (unlimited core collisions)
 * Frequency Pro ($4.99/month via Whop): saves, history, deep analysis, relationship lens
 */
(function (global) {
  const LS_HISTORY = 'fm_local_history';
  const LS_MATCH_COUNT = 'fm_match_count'; // stats only, never blocks

  const cfg = () => global.FM_CONFIG || {};

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

  function isPro() {
    return Boolean(profile && profile.is_pro);
  }

  /** Core collide is always free for players. */
  function canRunMatch() {
    return true;
  }

  function matchCount() {
    const n = parseInt(localStorage.getItem(LS_MATCH_COUNT) || '0', 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function bumpMatchCount() {
    localStorage.setItem(LS_MATCH_COUNT, String(matchCount() + 1));
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
    if (session) await loadProfile();

    supabase.auth.onAuthStateChange(async (_event, s) => {
      session = s;
      if (session) {
        await loadProfile();
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
      // Keep email fresh for Whop webhook matching
      if (session.user.email && data.email !== session.user.email) {
        await supabase
          .from('fm_profiles')
          .update({ email: session.user.email })
          .eq('id', session.user.id);
        profile = { ...data, email: session.user.email };
      }
    }
    return profile;
  }

  function getUsageSnapshot() {
    return {
      configured: isConfigured(),
      signedIn: Boolean(session),
      email: session?.user?.email || null,
      isPro: isPro(),
      freeUsed: matchCount(),
      remaining: null, // unlimited for players
      limit: null,
      canRun: true,
      playersFree: true,
      priceLabel: cfg().PRO_PRICE_LABEL || '$4.99/month',
      proName: cfg().PRO_NAME || 'Frequency Pro',
    };
  }

  /** Core match: always allowed (free for players). */
  async function authorizeMatch() {
    return { ok: true, usage: getUsageSnapshot() };
  }

  /** After a successful collision — stats only, never blocks. */
  async function recordMatch() {
    bumpMatchCount();
    emit('usage', getUsageSnapshot());
    return { ok: true, usage: getUsageSnapshot() };
  }

  /** Pro-only features (saves, history, deep lens). */
  function requirePro() {
    if (isPro()) return { ok: true, usage: getUsageSnapshot() };
    return { ok: false, reason: 'pro_required', usage: getUsageSnapshot() };
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
    const checkoutUrl = cfg().WHOP_CHECKOUT_URL;
    if (!checkoutUrl) {
      throw new Error('WHOP_CHECKOUT_URL missing in js/config.js');
    }
    if (!session) {
      throw new Error('Sign in with the same email you’ll use on Whop, then upgrade');
    }

    try {
      localStorage.setItem(
        'fm_whop_pending',
        JSON.stringify({
          userId: session.user.id,
          email: session.user.email || '',
          at: Date.now(),
        })
      );
    } catch (_) { /* ignore */ }

    const returnUrl =
      window.location.origin +
      window.location.pathname +
      '?whop=return';
    let dest = checkoutUrl;
    try {
      const u = new URL(checkoutUrl);
      if (!u.searchParams.has('redirect')) {
        u.searchParams.set('redirect', returnUrl);
      }
      dest = u.toString();
    } catch (_) {
      dest = checkoutUrl;
    }

    window.location.href = dest;
  }

  async function openBillingPortal() {
    const manage = cfg().WHOP_MANAGE_URL || 'https://whop.com/orders';
    window.open(manage, '_blank', 'noopener,noreferrer');
  }

  async function refreshProStatus() {
    if (session) await loadProfile();
    emit('usage', getUsageSnapshot());
    emit('auth', { session, profile });
    return getUsageSnapshot();
  }

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
    remaining: () => null,
    getUsageSnapshot,
    authorizeMatch,
    recordMatch,
    requirePro,
    signInWithEmail,
    signOut,
    saveMatch,
    listMatches,
    startCheckout,
    openBillingPortal,
    refreshProStatus,
    getSession: () => session,
    getProfile: () => profile,
    isReady: () => ready,
  };
})(window);
