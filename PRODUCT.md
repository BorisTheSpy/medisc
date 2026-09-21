# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A small group of disc golf friends around Charlotte, NC. The owner (Ivan) plays regularly, most often at Blair Mill Park and Ballantyne Crash Course, and adds friends to his card as guests or account holders. They use the app on an iPhone at the course: outdoors, often in direct sun, one hand free, sometimes with poor signal, in short bursts between throws. Off the course they open it to look at their history and stats.

## Product Purpose

Medisc is a disc golf scorecard and stats app in the spirit of UDisc, built for this group rather than the public. Success is: the course you are standing on is found instantly, a round starts in two taps, every score takes one tap, and afterwards each player's history and stats are theirs and correct on any phone.

## Positioning

Free and simple, no subscription. Everything UDisc puts behind a paywall (stats, full history, hole maps) is just there. Accounts are a username and a PIN, nothing more. Course hole layouts are mapped by the players themselves while playing and shared with everyone.

## Operating Context

- Played on iPhone Safari, installed to the home screen as a web app. Dark and light both occur (evening rounds, midday sun).
- A round: pick the course from the map or list, add cardmates, score hole by hole with plus/minus, optionally log throw zones, mark tee and basket positions by standing on them, finish, review the scorecard.
- Between rounds: Rounds history grouped by month, Stats dashboard (form, score mix, best rounds, best shots, throwing, per course, head to head), Settings (account, players, units, theme, UDisc import, backup).
- Data comes from OpenStreetMap, the DiscGolfAPI US directory, Google Places, and the shared Medisc layout database; attributions are required on screens that show that data.

## Capabilities and Constraints

- Units are feet, yards and miles. Hole lengths in feet, travel distances in miles.
- US-first; course coverage outside the US is not a goal.
- Local-first: IndexedDB on the device, synced to the account through a Cloudflare Worker and D1. Must work with no signal while scoring.
- Hosted on Cloudflare Workers; React, Vite, Tailwind 4, MapLibre for maps, Recharts for charts.
- Google Places data must display "Powered by Google" where shown. OpenStreetMap and DiscGolfAPI attributions are required.
- Map data quality is uneven: many courses have default par-3 holes and no pin positions until a player maps them. The UI must make that state honest and fixable.
- Undecided: whether the app will ever be opened to the public. Design for the friends group; do not add marketing surfaces.

## Brand Commitments

- Name: Medisc. Mark: an amber disc-and-basket glyph on blue (current icon; may be redrawn).
- Voice: plain, direct, a little playful ("Chains, not spreadsheets."). No corporate tone, no hype.
- Visual history, not binding: the first version used dark green, which the owner rejected; the second used deep blue with an amber accent, which the owner has now released for a full redesign. The owner liked the in-round scorecard's structure and ease; a redesign may restyle it but should not make scoring slower.
- Not affiliated with UDisc; must not imitate UDisc's orange brand.

## Evidence on Hand

- Real course data in the connected sources and a growing shared layout database. No testimonials, press, or usage numbers; do not fabricate any.
- Real rounds exist in the owner's account (imported from UDisc and played in the app).

## Product Principles

1. Scoring speed beats everything: nothing between the player and the next tap.
2. Sunlight legibility: high contrast, large numerals, no reliance on subtle color.
3. Honest data: show what is known, what is a default, and how to fix it in place.
4. Stats that mean something to a friend group: bests, streaks, and who beats whom, not synthetic ratings.
5. Free and unbothered: no upsells, no gates, no growth mechanics.

## Accessibility & Inclusion

Touch targets of at least 44 px on the scorecard; text contrast at WCAG AA or better because of outdoor use; the app must remain usable with the map unavailable.
