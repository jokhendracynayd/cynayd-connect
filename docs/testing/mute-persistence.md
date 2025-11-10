# Mute State Persistence Verification

This checklist exercises the new persistence layer for participant mute state across Redis and Postgres. Run through it whenever the signaling layer changes or before a release that touches call UX.

## Pre-requisites
- Backend and frontend apps running locally with the updated schema migration applied.
- Redis instance reachable at the configured `DATABASE_URL`.
- Two test accounts (e.g., `Host` and `Guest`) you can use to join the same room.

## Smoke Checks
1. **Fresh Join Defaults**
   - Join a room as Host.
   - Confirm Host appears muted for both audio/video in the participants list (backed by DB defaults).

2. **Toggle Persistence**
   - Unmute Host’s microphone and camera.
   - Verify in Redis (`connect:state:room:<code>:mute:<hostId>`) that both flags are `false`.
   - Check the `Participant` row in Postgres now has `audioMuted = false`, `videoMuted = false`.

3. **New Participant Sync**
   - Join the same room as Guest.
   - Confirm Guest sees Host as unmuted immediately without waiting for additional socket events.

4. **Reconnect Recovery**
   - Refresh Host’s browser.
   - After reconnect, ensure:
     - Host’s local controls reflect the previous mute state.
     - Guest still sees Host as unmuted as soon as Host rejoins.

5. **Server Bounce Resilience**
   - Stop the backend server (leave Redis + Postgres running), then restart it.
   - Rejoin as Guest; confirm Host’s mute state is restored from Redis or DB (no regressions).

6. **Leave Cleanup**
   - Have Host leave the room.
   - Verify the Redis key `connect:state:room:<code>:mute:<hostId>` is removed (the participants set no longer lists Host).

## Regression Watchouts
- Multiple socket connections for the same user should reconcile to the latest mute toggle.
- Admin “force mute” features (if any) should still emit events and override persisted state.
- TTL expiry in Redis should fall back to DB data seamlessly for new joins.

Document any failures and link to the issue tracker before shipping. Adjust the checklist as new edge cases appear.

