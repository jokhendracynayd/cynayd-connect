# Mediasoup Network Configuration Guide

## Problem: Remote Video/Audio Not Working

If users can join rooms but cannot see/hear remote participants, it's likely a network configuration issue.

## Root Cause

When the Mediasoup server generates ICE candidates, it needs to know its **public IP address** (not the private/localhost IP). If `announcedIp` is not set correctly:

- **Local development**: Works fine (localhost to localhost)
- **Remote clients**: ICE candidates will have private IPs (e.g., `192.168.1.100` or `127.0.0.1`) which remote clients cannot reach
- **Result**: Transport connection fails, no media streams

## Solution: Configure `MEDIASOUP_ANNOUNCED_IP`

### For Local Development (same machine)

Leave `MEDIASOUP_ANNOUNCED_IP` empty or unset:

```bash
# .env
MEDIASOUP_ANNOUNCED_IP=
```

Or set to `auto`:

```bash
MEDIASOUP_ANNOUNCED_IP=auto
```

### For Production (remote clients)

**Option 1: Public IP Address**

Set to your server's public IP:

```bash
# .env
MEDIASOUP_ANNOUNCED_IP=203.0.113.42
```

To find your public IP:
```bash
# Linux/Mac
curl ifconfig.me
# or
curl ipinfo.io/ip

# Windows (PowerShell)
(Invoke-WebRequest -Uri https://ipinfo.io/ip).Content
```

**Option 2: Domain Name**

Set to your domain name (if it resolves to your server):

```bash
# .env
MEDIASOUP_ANNOUNCED_IP=mediasoup.example.com
```

**Option 3: Docker/VM**

If running in Docker or a VM, set to the host machine's public IP:

```bash
# .env
MEDIASOUP_ANNOUNCED_IP=<host-public-ip>
```

## Port Configuration

Ensure these ports are open in your firewall:

- **TCP**: 443 (HTTPS/WebSocket), or your custom signaling port (default: 4000)
- **UDP**: Range specified by `MEDIASOUP_RTC_MIN_PORT` to `MEDIASOUP_RTC_MAX_PORT` (default: 2000-2420)

### Firewall Examples

**Linux (iptables):**
```bash
# Allow UDP ports for WebRTC
sudo iptables -A INPUT -p udp --dport 2000:2420 -j ACCEPT
```

**AWS Security Group:**
- Add inbound rule: Custom UDP, Ports 2000-2420, Source: 0.0.0.0/0

**Cloudflare/Azure/Google Cloud:**
- Open UDP port range 2000-2420 in your firewall/network security rules

## Testing Configuration

1. **Check ICE Candidates in Logs**

   After creating a transport, check backend logs:
   ```
   Transport created: <transport-id>
   ICE candidates: [ { ip: '203.0.113.42', port: 2000, type: 'host', ... } ]
   ```

   If `ip` is `127.0.0.1` or `192.168.x.x` and you're connecting remotely, that's the problem.

2. **Check Browser Console**

   Open browser console and look for:
   - `Send transport ICE state: completed` ✅
   - `Send transport connection state: connected` ✅
   
   If you see:
   - `ICE state: failed` ❌
   - `Connection state: failed` ❌
   
   Then check your `announcedIp` configuration.

3. **Use Chrome WebRTC Internals**

   Navigate to `chrome://webrtc-internals/` and check:
   - ICE candidates (should show public IP, not localhost)
   - Connection state (should be "Connected")

## Troubleshooting

### Issue: Still not working after setting announcedIp

1. **Verify the IP is correct**: Make sure `MEDIASOUP_ANNOUNCED_IP` matches your server's public IP
2. **Check firewall**: Ensure UDP ports are open
3. **Restart server**: Changes to `.env` require a server restart
4. **Check logs**: Look for ICE connection errors in backend logs

### Issue: Works locally but not remotely

This confirms it's an `announcedIp` issue. Set `MEDIASOUP_ANNOUNCED_IP` to your public IP.

### Issue: Works on some networks but not others

This might be:
- **Symmetric NAT**: Some networks require TURN servers for NAT traversal
- **Corporate firewall**: Blocking UDP traffic

For advanced NAT traversal, consider setting up a TURN server (outside scope of this guide).

## Environment Variables Summary

```bash
# Required for remote connections
MEDIASOUP_ANNOUNCED_IP=<your-public-ip-or-domain>

# Optional (ports can be customized)
MEDIASOUP_RTC_MIN_PORT=2000
MEDIASOUP_RTC_MAX_PORT=2420
```

## Additional Resources

- [Mediasoup Documentation: WebRtcTransport](https://mediasoup.org/documentation/v3/mediasoup/api/#WebRtcTransport)
- [Mediasoup Documentation: Network Configuration](https://mediasoup.org/documentation/v3/mediasoup/overview/#network-configuration)
- [WebRTC ICE Connection States](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/iceConnectionState)

