# Host Controls Hardening Checklist

## Signaling & Backend
- [ ] Load-test simultaneous host actions (mute-all, lock, remove) at 50+ participants and capture Mediator/Redis latency metrics.
- [ ] Verify Redis TTL refresh for participant control entries during hour-long sessions; alert if nearing expiry.
- [ ] Confirm `RoomHostState` persistence survives process restarts and cross-node routing (assign room to alternate instance and rejoin).
- [ ] Exercise reconnection flow while forced-mute is active; ensure forced flags are re-applied on resume before media publish.
- [ ] Validate per-participant control RPC rejects non-host socket IDs with structured errors; add audit log entry for blocked attempts.
- [ ] Add Grafana panel for host control events (counts of mute-all, releases, removals, locks) sourced from structured logs.

## Frontend & UX
- [ ] Confirm local UI disables mute/camera toggles while forced, across browsers (Chrome/Edge/Firefox) and with PWA install mode.
- [ ] Validate participant list updates (force badges, host buttons) under rapid successive host commands (double mute/unmute).
- [ ] Exercise host controls on mobile viewport; ensure buttons are accessible and toast messaging not obscured by system UI.
- [ ] Verify removal flow gracefully exits local user, including queued reconnection attempts and leave modal states.
- [ ] Add Cypress smoke flow covering host toggling mute-all + lock + removal inside same session.

## Resilience Follow-ups
- [ ] Implement rate limiting / debounce (e.g. 3 actions per second) on host control socket events to avoid accidental storms.
- [ ] Mirror host control state into analytics pipeline for post-call audits (participant forced/unforced timeline).
- [ ] Extend integration tests to cover Redis failover scenarios (mock command failures, ensure retries/logging).
- [ ] Document admin UX expectations (how to release forced states, why lock is used) in runbook for support teams.

