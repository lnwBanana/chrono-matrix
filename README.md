# Chrono-Matrix

Social deduction party game — React + Vite + Firebase Realtime Database.

## Local dev
```
npm install
npm run dev
```

## Build for production
```
npm install
npm run build
```
Output goes to `dist/` — upload that folder to any static host (Vercel, Netlify, Firebase Hosting, GitHub Pages).

## Firebase
Realtime Database config lives in `src/firebase.js`. Room state is stored under `rooms/<code>` and synced live via `onValue`. Before going live, tighten the Realtime Database security rules (see the chat for a recommended ruleset) — the default "test mode" allows anyone to read/write all data.
