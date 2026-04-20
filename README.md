# STRX Staking Leaderboard

Real-time STRX staking leaderboard built with React 18, TypeScript, SWR, and Vite.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_XPR_ENDPOINT` | XPR Network API base URL | `https://proton.eosusa.io` |

Create a `.env.local` file in the project root to override defaults:

```
VITE_XPR_ENDPOINT=https://your-custom-endpoint.example.com
```

## Available Scripts

In the project directory, you can run:

### `npm start` / `npm run dev`

Starts the Vite dev server on [http://localhost:3000](http://localhost:3000).
Hot Module Replacement is enabled — edits are reflected instantly without a full reload.

### `npm run build`

Builds the app for production into the `build/` folder, then generates the Workbox service worker.
The build is minified and asset filenames include content hashes.

### `npm run preview`

Serves the production build locally for final verification before deploying.

## Tech Stack

- **React 18** + **TypeScript**
- **Vite** — fast dev server and optimized production builds
- **SWR** — data fetching with caching and revalidation
- **Tailwind CSS** — utility-first styling
- **Workbox** — service worker for offline caching
