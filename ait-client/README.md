# study deck client

A focused mobile study app for exam flashcards, mistake review, bookmarks, and spaced repetition.

## Run

```bash
npm install
npm run dev
```

The development API is available at `/api/state` and defaults to `http://127.0.0.1:4180`.

## Features

- Exam-style cards organized by subject and chapter
- Question/answer recall flow with confidence grading
- Due-card scheduling and mistake review
- Search, subject filters, bookmarks, and card details
- IndexedDB-first persistence with localStorage fallback
- JSON import/export with schema validation

## Commands

```bash
npm run build
npm run preview
```
