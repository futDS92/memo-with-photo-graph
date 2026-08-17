# study deck

A mobile-first flashcard app for exam preparation. Turn a syllabus into focused cards, study with spaced repetition, and revisit mistakes until they become strengths.

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
- Study: recall the answer, reveal it, then grade your confidence
- Mistakes: revisit cards that still need work
- Storage: IndexedDB first, localStorage fallback, per-user SQLite API sync
- Settings: manage subjects and keep the workspace local-first
- Import/export: move a deck with validated JSON

## Structure

`ait-client/` is the only product frontend. It is a React + TypeScript + Vite app and the GitHub Pages workflow builds this directory.

- `ait-client/src/App.tsx`: study experience and product flow
- `ait-client/src/lib/storage.ts`: local persistence and API sync
- `ait-client/src/data/seed.ts`: exam-style starter deck
- `server.mjs`: Node 24 API with SQLite users, sessions, per-user state, and optimistic conflict checks
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

`VITE_TOSS_AD_GROUP_ID` is the banner ad group ID issued by the Apps-in-Toss console. Toss Ads can mediate Toss inventory and AdMob inventory according to the console configuration. If the ID is missing, the runtime is unsupported, initialization fails, or there is no fill, GraphFlash shows a compact `광고 없음` state instead of leaving a broken blank slot. Use `ait-ad-test-banner-id` only for local/test builds.

## Build

```bash
npm run build
npm run preview
```
