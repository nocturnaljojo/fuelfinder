# Phase 3 — Supply Chain Intelligence

Phase 3 elevates FuelFinder from a retail price tool to a supply chain intelligence platform, showing the upstream factors that drive price movements weeks in advance.

## 🚢 AIS tanker tracker

An overlay on the FuelFinder map showing live positions of fuel tanker ships in Australian waters, sourced from the AIS (Automatic Identification System) network.

### Why this matters

Fuel prices at the bowser lag tanker arrivals by 1–3 weeks. Seeing tanker movements near Australian ports gives early signal that supply is incoming (prices likely to drop) or constrained (prices likely to rise).

### Data source

**aisstream.io** — free tier WebSocket API providing real-time AIS ship position updates.

- Filter: vessel type = Tanker (AIS type codes 80–89).
- Bounding box: Australian coastal waters (approx. 110°E–155°E, 10°S–44°S).
- Free tier: unlimited connections, rate-limited by message volume.

### Implementation plan

1. **Supabase Edge Function: `fetch-tanker-positions`** — opens a WebSocket to aisstream.io, collects position updates for tankers near Australian ports for a fixed window (e.g. 60 seconds), stores results in a `tanker_positions` table, then closes the connection.
2. **pg_cron job** — runs `fetch-tanker-positions` every 15–30 minutes.
3. **Frontend map overlay** — a toggleable layer on the Leaflet map showing tanker markers (ship icon, coloured by vessel type). Clicking a tanker shows MMSI, vessel name, speed, heading, and last update time.

### Key Australian ports to monitor

- Port Kembla (NSW) — major fuel import terminal
- Brisbane (QLD) — Ampol, Viva Energy terminals
- Geelong (VIC) — Viva Energy refinery (Altona closed 2021)
- Fremantle/Kwinana (WA) — BP, Viva terminals
- Darwin (NT) — fuel for NT and remote areas

### Database schema

```sql
create table tanker_positions (
  id           bigserial primary key,
  mmsi         text not null,
  vessel_name  text,
  lat          double precision not null,
  lng          double precision not null,
  speed_knots  numeric(5,1),
  heading_deg  integer,
  recorded_at  timestamptz default now()
);

create index on tanker_positions (mmsi, recorded_at desc);
```

## 📦 National fuel reserve levels

Monthly national fuel stock data from the Department of Climate Change, Energy, the Environment and Water (DCCEEW), cross-referenced with IEA 90-day supply obligation tracking.

### Why this matters

Australia has historically maintained less than 30 days of fuel reserves. When reserves are low, retail prices are more vulnerable to supply shocks. Displaying reserve levels gives users macro context beyond local retail prices.

### Data source

**DCCEEW** — publishes monthly petroleum product stock bulletins as PDFs on its website. Data includes stocks of petrol, diesel, jet fuel, and LPG in days of supply.

### Implementation plan

1. **Supabase Edge Function: `fetch-fuel-reserves`** — scrapes or downloads the latest DCCEEW monthly bulletin PDF, extracts the stock figures using a PDF parsing library, and upserts into a `fuel_reserves` table.
2. **pg_cron job** — runs monthly (or weekly as a check for new releases).
3. **Frontend widget** — a small summary card in the sidebar or below the Stats Bar showing:
   - "National diesel reserves: 22 days"
   - "National petrol reserves: 18 days"
   - IEA obligation status (on track / warning / deficit)

### Supplementary source: ABS API

The **Australian Bureau of Statistics** publishes monthly import volume data (petroleum imports by value and volume) via a free API. This can supplement DCCEEW data and give earlier signals (imports appear before stock levels are reported).

- ABS API: `https://api.data.abs.gov.au/` (free, no API key required)
- Dataset: International Merchandise Trade (commodity: mineral fuels)

### Database schema

```sql
create table fuel_reserves (
  id               bigserial primary key,
  report_month     date not null,        -- first day of the reported month
  fuel_type        text not null,        -- 'Petrol', 'Diesel', 'Jet', 'LPG'
  days_of_supply   numeric(4,1),
  stock_megalitres numeric(8,1),
  source           text default 'DCCEEW',
  fetched_at       timestamptz default now(),
  unique (report_month, fuel_type)
);
```
