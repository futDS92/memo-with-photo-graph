# study deck

A mobile-first flashcard app for exam preparation. Turn a syllabus into focused cards, study with spaced repetition, and revisit mistakes until they become strengths.

## Run

```bash
npm install --prefix ait-client
npm run dev
```

Run the local API in another terminal when needed:

```bash
npm run start:api
```

## Product flow

- Home: cards due today, mistakes, accuracy, and subject progress
- Cards: search, filter, bookmark, and inspect study cards
- Study: recall the answer, reveal it, then grade your confidence
- Mistakes: revisit cards that still need work
- Storage: IndexedDB first, localStorage fallback, API sync
- Import/export: move a deck with validated JSON

## Structure

`ait-client/` is the only product frontend. It is a React + TypeScript + Vite app and the GitHub Pages workflow builds this directory.

- `ait-client/src/App.tsx`: study experience and product flow
- `ait-client/src/lib/storage.ts`: local persistence and API sync
- `ait-client/src/data/seed.ts`: exam-style starter deck
- `server.mjs`: local state API
- `backend/`: Kotlin API foundation for a future production service

## Build

```bash
npm run build
npm run preview
```
