# FuelFinder Canberra

**FuelFinder** is a free, real-time fuel price comparison app built for Canberra and the surrounding ACT/NSW region. It pulls live pricing from the NSW Government fuel price API via a Supabase Edge Function and displays the data on an interactive map with leaderboards, price charts, and station detail sheets.

> FuelFinder is free · built for Australians.

## What it does

- Shows real-time fuel prices across Canberra and regional NSW/Tasmania.
- Supports seven fuel grades: U91, E10, P95, P98, Diesel, Premium Diesel, LPG.
- Filters stations by radius (5 km, 10 km, 25 km, 50 km, or all).
- Colour-codes prices green/amber/red so the cheapest options stand out at a glance.
- Displays an interactive Leaflet map with coloured markers.
- Shows leaderboards (Top 5 Cheapest, Top 5 Nearest, Top 5 Priciest, Most Expensive) with horizontal scrolling.
- Plots a price distribution histogram and a top-10 cheapest bar chart in the Price Charts modal.
- Lets users drop a feedback note that is saved to Supabase.

## Author

Jovi Draunimasi

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Map | Leaflet (vanilla JS, no react-leaflet) |
| Charts | Recharts |
| Backend | Supabase (Postgres + Edge Functions + pg_cron) |
| Hosting | Vercel |

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```
