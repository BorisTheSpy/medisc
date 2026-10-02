# Ace celebration

When a player scores an ace (one stroke on a hole), the scorecard throws a party: confetti, a
dancing figure, the words "Great Shot!!!", a "Nice shot" voice clip, then a song with fart
sounds over it.

## Trigger

An ace is a score moving to exactly one stroke. It can happen three ways:

- Tapping − on a fresh hole where par is 2 (the minus button sets par − 1).
- Tapping − from two strokes down to one.
- Logging "In the basket" as the first throw in the throw tracker.

The check runs synchronously inside the tap handler, before the database write, by predicting
the next stroke count with the same pure rule the repo uses (`nextStrokes` in
`src/domain/scoring.ts`). That keeps audio playback inside the user gesture so iOS Safari allows
it. Going from one stroke up and back down again fires again; that is fine.

## Visuals

`AceParty` is a fixed, full-screen overlay above the scorecard:

- A canvas confetti layer (own implementation, no dependency), 200 pieces in the palette's amber,
  mint, sky, and chalk, falling and tumbling for the life of the overlay.
- A dancer: original SVG art in the dark tux, bow tie, and sunglasses look, legs apart, animated
  with CSS keyframes to bob and lasso-swing one arm. No copyrighted likeness or photo.
- "Great Shot!!!" in Fraunces, amber, large. Beneath it, "<name> aced hole <n>" and a hint to tap
  to continue.
- Tap anywhere to dismiss. Auto-dismisses after 15 seconds. Dismissing stops all audio.
- Under `prefers-reduced-motion`, confetti does not run and the dancer stands still.

## Audio

Order: voice clip, then song and farts together.

| Slot  | File the owner drops in         | Fallback when missing                                   |
| ----- | ------------------------------- | ------------------------------------------------------- |
| Voice | `public/ace/nice-shot.mp3`      | Speech synthesis says "Nice shot!"                      |
| Song  | `public/ace/gangnam-style.mp3`  | Synthesized four-on-the-floor party beat with a riff    |
| Fart  | `public/ace/fart.mp3`           | Synthesized fart via Web Audio (wobbling low sawtooth)  |

Farts play at random intervals between 0.8 and 1.6 seconds while the song plays. The song and
farts stop when the overlay closes. All audio is primed by the user gesture that caused the ace.

The real recordings are copyrighted, so the repo never ships them. `public/ace/README.md`
documents the slots.

## Settings

A "Preview ace celebration" button under Display runs the party with a sample name so the owner
can hear which sounds are active without scoring an ace.

## Files

- `src/domain/scoring.ts`: `nextStrokes(strokes, par, delta)`, used by `adjustStrokes` in the repo.
- `src/celebration/confetti.ts`: canvas confetti, returns a stop function.
- `src/celebration/aceAudio.ts`: the audio sequence with fallbacks, returns a stop function.
- `src/celebration/Dancer.tsx`: the SVG dancer.
- `src/celebration/AceParty.tsx`: the overlay.
- `src/routes/Scorecard.tsx`: trigger and overlay mount.
- `src/routes/Settings.tsx`: preview button.
- `tests/scoring.test.ts`: `nextStrokes` cases.
- `vite.config.ts`: precache `mp3` so the party works offline.
