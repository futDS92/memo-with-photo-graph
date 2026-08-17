# GraphFlash

A mobile-first, photo-first flashcard app for exam preparation. Build cards from your notes, connect concepts on a knowledge map, and revisit difficult ideas with spaced repetition.

## Run

```bash
npm install --prefix ait-client
npm run dev
```

Run the local API in another terminal when needed (Node 24+):

```bash
npm run start:api
```

## Product flow

- Home: cards due today, mistakes, accuracy, and subject progress
- Cards: search, filter, bookmark, and inspect study cards
- Study: recall the answer, reveal it, then grade it as Again, Hard, Good, or Easy
- Mistakes: revisit cards that still need work
- Storage: IndexedDB first, localStorage fallback, per-user SQLite API sync
- Map: search, focus, drag, zoom, and revisit connected concepts
- Settings: manage projects, subjects, account identity, and workspace data
- Import/export: move a deck with validated JSON
- Ranking: optional anonymous weekly, monthly, or all-time comparison

## Structure

`ait-client/` is the only product frontend. It is a React + TypeScript + Vite app and the GitHub Pages workflow builds this directory.

- `ait-client/src/App.tsx`: study experience and product flow
- `ait-client/src/domain/study.ts`: review rules and answer matching
- `ait-client/src/domain/graph.ts`: graph layout and node styling
- `ait-client/src/domain/workspace.ts`: project normalization and seed migration
- `ait-client/src/lib/storage.ts`: local persistence and API sync
- `ait-client/src/data/seed.ts`: exam-style starter deck
- `server.mjs`: Node 24 API with SQLite users, Google identity sessions, per-user state, rankings, and optimistic conflict checks
- `backend/`: legacy Kotlin scaffold retained for reference; the active client contract is `server.mjs`

## API deployment

The GitHub Pages client is static, so deploy `server.mjs` separately and set these Vite variables at build time:

```bash
VITE_API_STATE_URL=https://api.example.com/api/state
VITE_TOSS_AD_GROUP_ID=your-console-ad-group-id
VITE_GOOGLE_CLIENT_ID=your-google-web-client-id
```

Set `CLIENT_ORIGIN` to the Pages origin. For HTTPS cross-origin cookies also set `COOKIE_SECURE=true`.
The API stores its SQLite database in `data/study-deck.sqlite`; back up that directory in production.

For account-based data isolation, set `GOOGLE_CLIENT_ID` on the API to the same Google Web Client ID. The API verifies Google ID tokens before binding the account session. Apple Sign In requires an Apple Service ID, authorized return URL, Team ID, Key ID, and private key; the Settings screen currently shows it as unavailable until those server credentials are configured.

### Account and privacy

Google account linking is optional. Before Google is configured, the app uses an anonymous session bound to a browser device key. After Google sign-in, the verified Google account becomes the owner of the workspace, so the same account can access its cards across devices. The API never accepts a client-supplied Google user ID; it verifies the ID token first. A new Google account can adopt the current anonymous workspace, while signing into an existing Google account switches to that account's workspace.

Apple Sign In is represented in Settings but requires Apple Developer credentials and a server callback before activation. Do not commit Google client secrets, Apple private keys, or production cookie secrets to the repository.

### AIT versioning

Every AIT build generates a date-based version in `YYYY.MM.DD.build` format using Korea Standard Time. The generated version is shown in Settings and packaged in `build-version.json`.

`VITE_TOSS_AD_GROUP_ID` is the banner ad group ID issued by the Apps-in-Toss console. Toss Ads can mediate Toss inventory and AdMob inventory according to the console configuration. If the ID is missing, the runtime is unsupported, initialization fails, or there is no fill, GraphFlash shows a compact `광고 없음` state instead of leaving a broken blank slot. Use `ait-ad-test-banner-id` only for local/test builds.

## Build

```bash
npm run build
npm run preview
```

The AIT build also runs the version generator automatically. To build the client directly:

```bash
npm --prefix ait-client run build
```
