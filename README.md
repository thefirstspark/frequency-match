# Frequency Match — Soul Card Collider

Two souls. One collision. One score.

A public tool from [The First Spark](https://thefirstspark.shop) that turns two birth charts into Player Cards and runs them through a compatibility engine.

**Live:** https://frequency.thefirstspark.shop

## Freemium

| | Free | Frequency Pro ($4.99/mo) |
|--|------|---------------------------|
| Collisions | **3** | Unlimited |
| Core score + cards + download | ✓ | ✓ |
| Saved match library | — | ✓ |
| Relationship lens + deep dimensions | — | ✓ |

Full setup: [docs/FREEMIUM.md](docs/FREEMIUM.md)

## What it does

Input two names + birth dates. The tool calculates:

- **Numerology** — Life Path, Expression, Soul Urge, Birthday, Personality
- **Astrology** — Sun sign, Element, Modality
- **Eastern** — Chinese Zodiac (animal + element)
- **Archetype** — One of 12 mapped archetypes (incl. master numbers 11/22/33)

Then renders both as Player Cards (rarity tier, sigil, stats) and computes a weighted compatibility score with dimensional breakdowns, narrative analysis, and a downloadable verdict card.

## Tech

Static HTML/JS (GitHub Pages) plus optional freemium backend:

- Client engines in `index.html` (html2canvas CDN for PNG export)
- Supabase Auth + Postgres (`fm_profiles`, `fm_matches`) — see `supabase/schema.sql`
- Whop checkout (`plan_gX14Qd9V6UEml`) + `whop-webhook` Edge Function
- Config: `js/config.js` (public keys + Whop URL only)

Local free-limit demo works without keys (localStorage). Cloud auth, Pro billing, and cloud saves need Supabase + Stripe wired.

```powershell
cd frequency-match
npx --yes serve .
```

## License

© 2026 The First Spark. The Selector Model and Soul Map framework are proprietary IP of Kate's Paint LLC.

---

*Reality is programmable. Consciousness is the code.*
