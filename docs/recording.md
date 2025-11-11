# Server-Side Recording Runbook

This document explains how the Connect backend captures, stores, and monitors server-side recordings.

## Overview

- The host can start/stop recording via the `host-control:start-recording` / `host-control:stop-recording` socket events.
- When recording starts, `RecordingManager` provisions dedicated mediasoup plain transports, forks all audio/video producers, and launches FFmpeg to build a PiP composite (screen share dominates; speaker camera renders as overlay).
- FFmpeg writes a temporary `.mp4` into `RECORDING_TMP_DIR`. When the session stops, the file is uploaded to S3 and metadata is persisted via Prisma.
- Recording status is broadcast to clients with `recording:state` events and stored in Redis for horizontal workers.

## Environment Variables

| Variable | Description |
| --- | --- |
| `RECORDING_ENABLED` | Enable/disable server-side recording (default `false`). |
| `RECORDING_TMP_DIR` | Local scratch directory for FFmpeg outputs (default `./tmp/recordings`). |
| `RECORDING_FFMPEG_PATH` | Path to the ffmpeg binary (default `ffmpeg` in `$PATH`). |
| `RECORDING_LAYOUT` | Composite layout hint (`pip`, `grid`, etc). Currently `pip` scales the active speaker stream. |
| `RECORDING_BIND_IP` | IP address used for mediasoup plain transports (default `127.0.0.1`). |
| `RECORDING_PORT_MIN` / `RECORDING_PORT_MAX` | UDP port range allocated to plain transports. Ensure ports are open in firewalls. |
| `AWS_REGION` | AWS region for the S3 client. |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Optional explicit credentials. If omitted, the default AWS provider chain is used. |
| `RECORDING_S3_BUCKET` | Target bucket for final artifacts. Required to persist recordings. |
| `RECORDING_S3_PREFIX` | Prefix applied to all recording objects (default `recordings/`). Trailing slash enforced. |
| `RECORDING_S3_SSE` | Server-side encryption mode (`aws:kms`, `AES256`, etc). |

> **Tip:** Set `RECORDING_ENABLED=true` only in environments where FFmpeg and S3 credentials are provisioned.

## Operational Flow

1. Host invokes `host-control:start-recording`.
2. `RecordingManager` creates audio/video plain transports bound to `RECORDING_BIND_IP` and dynamic ports within the configured range.
3. Every mediasoup producer is mirrored into the recorder; FFmpeg builds an `.mp4` composite in `RECORDING_TMP_DIR`.
4. `RecordingManager` tracks the session in Prisma (`RecordingSession`, `RecordingAsset`) and Redis.
5. When recording stops:
   - Consumers/transports close.
   - FFmpeg gracefully terminates (forced shut down if needed).
   - The composite file is uploaded to S3 using multipart uploads and SSE.
   - Prisma rows are updated with the S3 key, size, and upload timestamp.
   - Session status transitions to `COMPLETED` (or `FAILED` on error).
6. `recording:state` Socket.IO events inform all participants; handlers also update Redis for cross-node visibility.

### Failure Handling

- If FFmpeg exits unexpectedly or S3 upload fails, session status is marked `FAILED` and the Redis state reflects the failure.
- Failed uploads leave the artifact on disk for manual retrieval (`RECORDING_TMP_DIR/<session>.mp4`).
- Auto-stop triggers:
  - Room becomes empty.
  - Host disconnects before delegating to a co-host.

## Metrics & Logging

The Prometheus exporter exposes the following recording metrics:

- `recordings_active{server="<instance>"}` – gauge showing the number of active recordings.
- `recordings_started_total{server="<instance>"}` – counter incremented whenever a recording starts.
- `recordings_completed_total{server="<instance>"}` – counter for successful uploads.
- `recordings_failed_total{server="<instance>"}` – counter for failures (FFmpeg errors, upload failures, etc.).

Structured logging includes:

- Session lifecycle logs (`Recording session initialised`, `FFmpeg process started`, `Uploaded recording artifact to S3`, etc.).
- Errors with contextual fields (`roomId`, `sessionId`, `producerId`, `bucket/key`).

## Verification Checklist

1. Ensure `ffmpeg` is installed on the host (`ffmpeg -version`).
2. Set the required environment variables (especially S3 bucket/credentials) and restart the backend.
3. Observe `recordings_active` gauge in `/metrics` when initiating a recording.
4. Confirm `recording:state` events reach clients and show status transitions (`STARTING -> RECORDING -> UPLOADING/COMPLETED`).
5. Verify the `.mp4` appears in `s3://<bucket>/<prefix>/<sessionId>/composite.mp4`.
6. Inspect Prisma tables (`RecordingSession`, `RecordingAsset`) for timestamps, size, and status.
7. Download the object using the generated presigned URL to validate playback.

## Recovery & Maintenance

- **Upload retries:** If an upload fails, status remains `UPLOADING`. Re-run `RecordingStorageService.uploadCompositeRecording` manually (ensure the local file still exists) or move the artifact to S3 and update Prisma rows manually.
- **Disk cleanup:** The service removes local files after successful uploads. For failures, schedule cleanup of stale files in `RECORDING_TMP_DIR`.
- **Scaling:** Because state is mirrored in Redis, any node can answer `recording:state` queries. Ensure Redis persistence is enabled in HA deployments.
- **Compliance:** Display recording consent prompts UI-side before the host starts recording. Apply S3 lifecycle policies or bucket replication according to retention requirements.


