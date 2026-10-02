# Friends, shared live rounds, and map heading

Three features in one pass:

1. Friends: another account holder can be added to my card, and the round lands in their app.
2. Live rounds: everyone on a shared card sees score changes within a few seconds.
3. Map heading: the map shows which way I am facing, and each tee points at its basket.

## Friends

A friend is another Medisc account. Friendship is symmetric: adding someone by username makes
both of you friends.

- D1 table `friends (user_id, friend_id, created_at, PRIMARY KEY (user_id, friend_id))`. Adding
  writes both directions; removing deletes both.
- Worker routes, all behind the session token:
  - `GET /api/friends` returns `{ friends: Person[] }`.
  - `POST /api/friends { username }` adds; 404 if no such user, 400 if it is you.
  - `DELETE /api/friends/:id` removes.
  - `Person` is `{ id, username, displayName, name?, color? }`, with name and colour taken from
    the friend's own synced "me" player when they have one.
- Locally, a friend is a `Player` whose `id` is their account id and whose new `username` field is
  set. Because every account holder's own "me" player already uses the account id, a score keyed by
  a friend's id is keyed by their "me" on their phone. Nothing else has to line up.
- Friend players never go up through the player sync: `collectChanges` skips players with a
  `username` that is not mine. The server would reject them anyway, and pushing them could block the
  friend's own "me" record.
- Settings gets a Friends section under Account: add by username, list with remove. The Players
  section shows a small "account" tag on friends and hides "This is me" for them.
- New round and the scorecard's "Add someone" list friends like any other player, with the tag.

## Shared rounds

A round is shared when its `playerIds` contains an account id other than the owner's.

- D1 table `round_members (round_id, user_id, PRIMARY KEY (round_id, user_id))`. On every round
  upsert the worker reads `playerIds`, keeps the ids that are real users, and rewrites the
  membership rows. The owner is always a member.
- Pull: `/api/sync` returns rounds where the user is the owner or a member. The response also
  carries `people`, every friend plus every member of every returned round, so the client can
  create friend players it has never seen.
- Write: a member may upsert a shared round. Instead of whole-document last-write-wins the worker
  merges: round fields from whichever side has the newer `metaUpdatedAt`, scores by id keeping the
  newer `updatedAt`, then drops scores for players no longer in the merged `playerIds`. Any member
  can finish or delete the round; it is a friends group.
- The client merge mirrors that. Round fields apply when the remote `metaUpdatedAt` is at least the
  local `updatedAt`. Scores apply per id by `updatedAt`. A local score missing from the remote is
  deleted only if it is older than the remote document, so a player just added locally survives
  until the push.
- `RoundDoc` gains `metaUpdatedAt` (the round's own `updatedAt`); its `updatedAt` stays the max
  across round and scores, which is the sync cursor.

## Live updates

Polling, not sockets. The scorecard polls `/api/sync` every 4 seconds while it is open for a
shared round and the tab is visible, and the write debounce drops from 2.5 s to 0.8 s on shared
rounds. That gives two to five seconds end to end on a normal connection, survives sleep and wake,
and needs no Durable Object. If that ever feels slow, a Durable Object per round with WebSockets is
the upgrade path; the merge rules stay the same.

## Map heading

- `useCompass()` reads `deviceorientation` (`webkitCompassHeading` on iOS, `alpha` with
  `absolute` elsewhere) and falls back to the GPS heading when moving. iOS needs a tap to grant
  motion permission, so the map shows a compass button when permission has not been given; tapping
  it calls `DeviceOrientationEvent.requestPermission()`.
- The user dot becomes a dot with a translucent cone in front of it, rotated to the heading with
  `rotationAlignment: "map"`. With no heading the cone is hidden.
- Tee markers become tee pads: a rounded rectangle with a pointed end, rotated to the bearing from
  tee to basket, number counter-rotated so it stays upright. A tee with no basket stays round.

## Files

- `worker/index.ts`: friends routes, membership, merge, `people`.
- `src/domain/types.ts`: `Player.username`.
- `src/domain/sync.ts` (new): pure `mergeRoundDocs` used by the client; tests in
  `tests/sync.test.ts`. The worker carries the same logic inline since it does not import from src.
- `src/services/friends.ts` (new): API client.
- `src/services/sync.ts`: skip friend players, apply `people`, per-score merge, `metaUpdatedAt`,
  `startLivePolling(roundId)`.
- `src/services/useCompass.ts` (new).
- `src/map/CourseMap.tsx`: heading cone, tee pads, compass button.
- `src/index.css`: marker styles.
- `src/routes/Settings.tsx`, `NewRound.tsx`, `Scorecard.tsx`: friends UI, tag, polling.
