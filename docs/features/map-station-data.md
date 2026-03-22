# Map & Station Data

## Leaflet map

FuelFinder uses the vanilla Leaflet library (not react-leaflet, which conflicts with React 18) rendered inside a managed `div` ref. The map is initialised once in a `useEffect` and updated imperatively when station data changes.

### Markers

Each station is plotted as a custom circle marker coloured by price band relative to the current visible min/max:

| Band | Colour |
|---|---|
| Cheapest third | Green (`#22c55e`) |
| Middle third | Amber (`#f59e0b`) |
| Dearest third | Red (`#ef4444`) |

Clicking a marker opens the Station Detail sheet.

A blue circle marker shows the user's current location (GPS or selected preset).

## Station Detail sheet (bottom sheet)

Tapping any station — from the map, a leaderboard row, or the station list — slides up a bottom sheet showing:

- Station name, brand badge (coloured circle with brand initial), address, and distance.
- A price table for all seven fuel grades available at that station.
- Direct links to Google Maps navigation.

### Brand badge colours

| Brand | Background | Text |
|---|---|---|
| BP | Green (`#00A651`) | White |
| Ampol / Caltex / EG Ampol | Red (`#E8002D`) | White |
| Shell | Yellow (`#FFD500`) | Dark red |
| 7-Eleven | Orange (`#F7702A`) | White |
| Coles Express | Red (`#E2001A`) | White |
| United | Navy (`#003087`) | White |
| Liberty | Blue (`#0057A8`) | White |
| Metro | Purple (`#6B21A8`) | White |
| Puma | Black (`#1D1D1B`) | Gold |
| Mobil | Blue (`#0033A0`) | White |
| Costco | Blue (`#005DAA`) | White |
| FTR | Slate (`#374151`) | White |
| Unknown | Slate (`#374151`) | White |

## Location presets

Built-in preset locations allow users without GPS (or on desktop) to explore prices in different areas:

| Region | Locations |
|---|---|
| ACT | Civic, Belconnen, Woden, Tuggeranong, Gungahlin, Fyshwick, Bruce, Queanbeyan |
| Regional NSW | Batemans Bay, Goulburn, Cooma, Yass, Bombala |
| Tasmania | Hobart, Launceston, Devonport |

## Data freshness

Prices are fetched from Supabase on page load and on manual refresh. A `pg_cron` job runs every 30 minutes server-side to pull fresh data from the NSW Government fuel price API via the `refresh-fuel-prices` Edge Function.
