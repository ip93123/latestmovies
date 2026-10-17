# Watch Party Real-Time Sync & Player Compatibility Plan

## 1. Overview
The goal is to provide a seamless, synchronized Watch Party experience:
- When a Host clicks **Watch Party**, an invite link is generated with the exact **Movie/Show ID**, **Active Player Server**, and **Party Room Code**.
- When a Guest opens the invite link:
  1. The exact same Movie/Show and Player Server are automatically loaded.
  2. The Guest connects to the Host's room via PeerJS.
  3. Immediately upon connection, playback time is synchronized with the Host.
- Real-time event synchronization:
  - **Host Pause**: Player emits `pause` event -> Broadcasted to Guest -> Guest player pauses at exact timestamp.
  - **Host Play**: Player emits `play` event -> Broadcasted to Guest -> Guest player plays.
  - **Host Seek/Skip**: Player emits `seeked` / `timeupdate` event -> Broadcasted to Guest -> Guest player jumps to current time.
- **Unsupported Server Protection**:
  - If the active player server does not support bidirectional postMessage playback controls (play, pause, seek, currentTime), the Watch Party button is **disabled** (grayed out, unclickable, with tooltip).
  - When the user switches to a supported server, the button is re-enabled.

---

## 2. Technical Architecture & Analysis

### A. Invite Link Structure
When Host creates a room or copies the link:
```
https://www.hackymax.fun/?m={movieId}&server={serverIndex}&party={roomCode}
# For TV:
https://www.hackymax.fun/?s={tvId}&season={s}&episode={e}&server={serverIndex}&party={roomCode}
```
- Query Parameters:
  - `m` / `s`: Movie TMDB ID or TV Show TMDB ID.
  - `season`, `episode`: Season & Episode numbers for TV shows.
  - `server`: Server Index (0 to 8) representing the active server.
  - `party`: 6-character unique PeerJS room code (e.g. `ABC123`).

### B. Auto-Mount & Instant Sync on Guest Join
1. URL parser detects `party` + (`m` or `s`) + `server`.
2. Guest automatically launches player overlay with that exact server index.
3. Once PeerJS connects (`conn.on('open')`), Guest immediately requests state (`request-state`).
4. Host responds with current state:
   - `playing`: boolean (true/false)
   - `ct`: current playback time in seconds
   - `serverIndex`: active server
5. Guest immediately executes:
   - If Host is paused: mount with `autoplay=false` and seek to `ct`. Show "Host paused" overlay.
   - If Host is playing: mount with `autoplay=true` and seek to calculated flight-compensated time.

### C. Bidirectional Player Event Hooks (Play, Pause, Seek)
In `index.html`, the message listener (`window.addEventListener('message')`) already handles incoming events from embed players. We will ensure:
1. **Host Pause Detection**:
   - When embed player or native video emits `pause`:
   - `_broadcast({ type: 'pause', ct: currentTime, ts: Date.now() })` is dispatched immediately.
2. **Host Play Detection**:
   - When embed player or native video emits `play`:
   - `_broadcast({ type: 'play', ct: currentTime, ts: Date.now() })` is dispatched immediately.
3. **Host Seek/Skip Detection**:
   - When embed player or native video emits `seeked` or scrubs forward/backward:
   - Debounced `_broadcast({ type: 'seek', ct: currentTime, ts: Date.now() })` is dispatched immediately.

### D. Server Support Matrix & Disable Button Logic
Each server embed provider has different iframe sandboxing and postMessage capabilities:

| Server Index | Server Name | Domain | Time Emission | Play/Pause Command | Seek Command | Watch Party Supported? |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: |
| **0** | **HackyMax** | `vidy.st` | ✅ Yes (`progress.watched`) | ✅ Yes | ✅ Yes (`startAt`/`time`) | ✅ **YES** |
| **1** | **Nebula** | `vidstuck.cc` | ✅ Yes (`current_time`) | ✅ Yes | ✅ Yes (`startAt`) | ✅ **YES** |
| **2** | **Stellar** | `cinezo.live` | ❌ No postMessage | ❌ Restricted | ❌ Restricted | ❌ **DISABLED** |
| **3** | **Nova** | `vidlove.cc` | ✅ Yes (`currentTime`) | ✅ Yes | ✅ Yes | ✅ **YES** |
| **4** | **Vortex** | `videasy.ws` | ✅ Yes (`player_progress`) | ✅ Yes (`pause`/`play`) | ✅ Yes (`time`) | ✅ **YES** |
| **5** | **Infinity** | `vidlink.pro` | ❌ Sandbox restricted | ❌ Restricted | ❌ Restricted | ❌ **DISABLED** |
| **6** | **Spark** | `cdn.vidspark.to` | ✅ Yes (`timeupdate`) | ✅ Yes | ✅ Yes | ✅ **YES** |
| **7** | **Sonic** | `player.vidzee.wtf` | ✅ Yes (`current_time`) | ✅ Yes | ✅ Yes | ✅ **YES** |
| **8** | **Bolt** | `vidbolt.xyz` | ✅ Yes (`timeupdate`) | ✅ Yes | ✅ Yes | ✅ **YES** |
| **Native** | **HackyMax MP4** | `<video id="maxVideo">` | ✅ Direct HTML5 | ✅ Direct HTML5 | ✅ Direct HTML5 | ✅ **YES** |

#### Disabling Rule:
When switching servers in `switchServer(idx)` or `playStream()`:
```javascript
const WP_SUPPORTED_SERVERS = new Set([0, 1, 3, 4, 6, 7, 8]); // HackyMax, Nebula, Nova, Vortex, Spark, Sonic, Bolt

function updateWatchPartyButtonAvailability(serverIndex) {
  const isSupported = window._maxMode || WP_SUPPORTED_SERVERS.has(serverIndex);
  const wpBtns = [document.getElementById('topbarWatchPartyBtn'), document.getElementById('maxWatchPartyBtn')];
  wpBtns.forEach(btn => {
    if (!btn) return;
    if (isSupported) {
      btn.classList.remove('wp-disabled');
      btn.removeAttribute('disabled');
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
      btn.style.filter = 'none';
      btn.title = 'Watch Party (Synced with friends)';
    } else {
      btn.classList.add('wp-disabled');
      btn.setAttribute('disabled', 'true');
      btn.style.opacity = '0.35';
      btn.style.pointerEvents = 'none';
      btn.style.filter = 'grayscale(1)';
      btn.title = 'Watch Party is not supported on this server. Switch to HackyMax, Nebula, or Vortex to use Watch Party.';
    }
  });
}
```

---

## 3. Real-Time Glassmorphic Chat System

### A. Top Floating Bar Chat Trigger
- The previous pause icon on `#playerFloatingBar` has been replaced with a modern Chat Icon Button (`#wpChatToggleBtn`).
- Displays automatically whenever an active Watch Party session is underway (for both Host and Guests).
- Features an unread notification badge with soft pulsing glow when messages arrive while the chat window is closed.

### B. User Roles & Identity
- **Host**: Labeled as `👑 Host` with purple/violet gradient badges.
- **Guests**: Automatically assigned ordinal identifiers upon connection (`👤 Guest 1`, `👤 Guest 2`, etc.) with cyan/emerald badges.
- Message bubbles clearly distinguish self-messages (right-aligned, tinted glass) from other members' messages (left-aligned).

### C. Glassmorphism Chat Container (`#wpChatContainer`)
- Docked at the bottom-right (bottom sheet on mobile devices) with dark translucent glass aesthetic (`backdrop-filter: blur(24px) saturate(190%)`, `rgba(12, 16, 28, 0.78)`).
- Fullscreen compatible: dynamically anchors inside `document.fullscreenElement` so chat remains fully accessible during fullscreen playback.
- Smooth slide-up transition animation.

### D. Comprehensive Emoji Support
- **Quick-React Bar**: One-tap access to popular reaction emojis (`❤️`, `😂`, `🔥`, `😮`, `👏`, `🍿`, `🎬`, `🚀`, `💯`, `👀`, `😢`, `🎉`).
- **Expandable Emoji Tray**: 21+ expressive cinema and conversation emojis accessible via the `😊` button.

### E. Floating Message Peek Toast (`#wpChatPeekToast`)
- When the chat box is minimized and a new message arrives from any party member, an unobtrusive floating glass pill appears near the bottom-right previewing the sender and message for 4.5 seconds. Clicking the pill immediately opens the chat box.

---

## 4. Implementation Status
- [x] Host invite link embeds `m`/`s`, `server`, and `party` parameters.
- [x] Guest automatically selects and mounts the exact server on join.
- [x] Play, pause, seek, and server switch events synchronized in real time via PeerJS P2P data channels.
- [x] Unsupported server protection: Watch Party buttons automatically grayed out and disabled on Stellar (Server 2) and Infinity (Server 5).
- [x] Real-time Glassmorphic Watch Party Chat system with emojis, peek toasts, unread indicators, and full host-guest relay.
