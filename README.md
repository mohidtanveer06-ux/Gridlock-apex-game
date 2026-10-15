# MT GridLock: Apex

A browser-based, real-time team arena game. Constructors build barriers and defend the core; Glitchers hack it before time expires. Play as a guest on desktop or mobile.

## Run locally

Requirements: Node.js 20.19 or newer.

```sh
npm install
npm run dev
```

Open `http://localhost:5173`. Vite serves the client and proxies Socket.IO traffic to the game server on port 3000. Create a room, then share its five-character code or invite link. A match needs at least four players, with everyone ready.

## Production

```sh
npm run build
npm start
```

The Node server serves the built client and Socket.IO from the same origin. Set `PORT` if the hosting provider supplies a port.

To host the frontend separately from the persistent Node/WebSocket server:

- Set `VITE_SERVER_URL` to the public Socket.IO server URL when building the frontend.
- Set `CLIENT_ORIGIN` on the server to the frontend origin (comma-separated if there are multiple).
- Build the frontend with `npm run build` and run the server with `npm start`.

### Deploy the multiplayer server on Render

Vercel serves the web client, but its serverless deployment does not run this persistent Socket.IO game server. The `/socket.io/` endpoint on the Vercel site must connect to a separately hosted Node service.

1. In Render, create a **Blueprint** from this GitHub repository and apply the included `render.yaml`. Wait for the `mt-gridlock-apex-server` web service to become live. Its health check is `/health`.
2. Copy the service's public URL, such as `https://mt-gridlock-apex-server.onrender.com`.
3. In Vercel, open the `grid-lock-apex` project's **Settings → Environment Variables**. Add `VITE_SERVER_URL` with that full HTTPS service URL for **Production**.
4. Redeploy the Vercel project so Vite includes the server URL in the browser bundle.
5. Test `https://<render-service-url>/health` (it should return `{"status":"ok","rooms":0}`), then create a room at `https://grid-lock-apex.vercel.app`.

The Render blueprint permits the production Vercel origin with `CLIENT_ORIGIN`. If you use another Vercel domain, update that setting in Render to the exact browser origin. The blueprint uses Render's free plan; free web services can sleep when idle, so the first connection after inactivity may take longer. An always-on Render plan avoids the cold start.

Copy `.env.example` to `.env` for local environment values. The Node server reads its environment from the hosting platform; Vite reads `VITE_` variables during the build.

## Match controls

- **Move:** WASD or arrow keys on desktop; on-screen directional buttons on touch devices.
- **Constructor action:** Press **E** (or **ACTION**) to place a barrier near the core.
- **Glitcher action:** Press **E** (or **ACTION**) near the core to hack it, or near a barrier to remove it.
- **Constructor ability:** Press **Q** (or **CORE SHIELD**) to protect the core for 4 seconds. Recharges in 22 seconds.
- **Glitcher ability:** Press **Q** (or **PHASE DASH**) to dash toward the core. Recharges in 8 seconds.
- Use the in-game sound menu to enable/disable the original synthesized soundtrack and adjust volume. Sound starts after the first tap/click to respect browser audio policies.
- Use **FULL SCREEN** during a match for a larger play area; mobile controls adapt to portrait and landscape screens.
- Every room supports 4, 6, or 8 players with evenly split teams. Hosts choose a 90–180 second round and chaos-event intensity.

Rooms, scores, and match state are in memory and reset when the server restarts. Accounts, persistent ranks/skins, replay clips, and advanced alliance mechanics are not part of this MVP.
