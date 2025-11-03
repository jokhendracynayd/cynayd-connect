# Troubleshooting Remote Video/Audio Issues

## Problem: Remote Video/Audio Not Showing

If consumers are created and video elements show "Video playing" but you still don't see/hear remote participants, check these:

### 1. Check ICE Candidates in Backend Logs

Look for transport creation logs:
```
Transport created: <id> {"announcedIp":"auto-detect",...}
```

**If you see:**
- `"ip": "0.0.0.0"` in ICE candidates
- `announcedIp: "auto-detect"` or `undefined`

**This is the problem!** Remote clients cannot connect to `0.0.0.0`.

### 2. Fix: Set MEDIASOUP_ANNOUNCED_IP

**For Local Testing (same machine):**
```bash
# In .env file
MEDIASOUP_ANNOUNCED_IP=
```
Leave empty - works for localhost connections only.

**For Remote Connections (different machines/network):**
```bash
# In .env file - set your server's PUBLIC IP address
MEDIASOUP_ANNOUNCED_IP=203.0.113.42
```

**To find your public IP:**
```bash
# Linux/Mac
curl ifconfig.me

# Windows PowerShell
(Invoke-WebRequest -Uri https://ipinfo.io/ip).Content
```

**After setting, restart the backend server!**

### 3. Verify Fix Worked

Check backend logs after restart. You should see:
```
Transport created: <id> {"announcedIp":"203.0.113.42",...}
```

And ICE candidates should have your public IP, not `0.0.0.0`.

### 4. Check Transport Connection States

In browser console, look for:
- `✅ Recv transport connected successfully` - Good!
- `❌ Recv transport connection failed!` - Problem!

### 5. Check Track States

In browser console, look for:
- `✅ Track is LIVE` - Good!
- `❌ WARNING: Track is not live!` - Problem!

### 6. Firewall Configuration

Ensure these ports are open:
- **TCP**: Your signaling port (default: 4000)
- **UDP**: Range 2000-2420 (or your MEDIASOUP_RTC_MIN_PORT to MEDIASOUP_RTC_MAX_PORT)

### 7. Still Not Working?

1. **Check if tracks are actually receiving data:**
   - Open Chrome DevTools → Network tab
   - Filter for "webrtc"
   - Look for RTP packets

2. **Check browser WebRTC internals:**
   - Navigate to `chrome://webrtc-internals/`
   - Look for your connections
   - Check ICE connection state (should be "Connected")
   - Check if RTP packets are being received

3. **Test locally first:**
   - Both users on same machine → Works with `MEDIASOUP_ANNOUNCED_IP=`
   - Both users on same network → Use local IP (e.g., `192.168.1.100`)
   - Remote users → Use public IP

### Common Issues

**Issue:** Video shows "playing" but black screen
- **Cause:** Track is live but not receiving packets
- **Solution:** Check `MEDIASOUP_ANNOUNCED_IP` is set correctly

**Issue:** Audio not working
- **Cause:** Audio track might be muted or not enabled
- **Solution:** Check track `enabled` and `muted` states in console logs

**Issue:** Works locally but not remotely
- **Cause:** `MEDIASOUP_ANNOUNCED_IP` not set or wrong IP
- **Solution:** Set correct public IP and restart server

