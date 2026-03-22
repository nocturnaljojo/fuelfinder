# Data Sources

A reference table of all data sources researched for FuelFinder, including current (Phase 1) and planned (Phase 2–3).

## Current (Phase 1)

| Source | URL | Data | Cost | Update frequency |
|---|---|---|---|---|
| NSW Government Fuel API | data.nsw.gov.au | Real-time retail prices for all NSW stations, all fuel types | Free | Live (updated by stations) |

## Phase 2

| Source | URL | Data | Cost | Update frequency |
|---|---|---|---|---|
| AIP (Australian Institute of Petroleum) | aip.com.au | Weekly retail + Terminal Gate Prices (wholesale), national averages | Free | Weekly (Tuesdays) |
| ACCC Petrol Monitoring | accc.gov.au | Quarterly petrol monitoring reports, price data by city | Free | Quarterly |
| ABC News (Google News RSS) | news.google.com | Fuel price news headlines | Free (no API key) | Near real-time |
| AAA (Australian Automobile Association) | aaa.asn.au | Fuel affordability index, price advocacy data | Free | Monthly |

## Phase 3

| Source | URL | Data | Cost | Update frequency |
|---|---|---|---|---|
| aisstream.io | aisstream.io | Real-time AIS ship position WebSocket | Free tier available | Real-time |
| DCCEEW | dcceew.gov.au | Monthly national fuel stock bulletins (PDF), days of supply by fuel type | Free (PDF scrape) | Monthly |
| ABS API | api.data.abs.gov.au | Monthly petroleum import volumes and values | Free (no API key) | Monthly |

## Notes on data access

### NSW Government Fuel API

The primary data source. Provides real-time pricing for approximately 2,500+ NSW stations. Accessed via the `refresh-fuel-prices` Supabase Edge Function. No API key required for public endpoints; rate-limited by fair use.

### AIP Terminal Gate Prices

Published on the AIP website as a weekly table (HTML/PDF). Terminal Gate Price (TGP) is the wholesale price at which fuel distributors purchase from refineries — the floor below which retail prices cannot sustainably sit. Tracking TGP alongside retail prices reveals station margins.

### aisstream.io

A free WebSocket API aggregating AIS (Automatic Identification System) position broadcasts from ships. AIS is mandated for vessels over 300 gross tonnes operating internationally. Vessel type 80–89 covers tankers. The free tier supports persistent connections with rate-limited messages.

### DCCEEW fuel stock bulletins

The Department of Climate Change, Energy, the Environment and Water publishes monthly petroleum stock data. Australia's IEA obligation requires 90 days of net oil import cover; actual reserves have historically been below 30 days for refined products. Data is available as PDF — a parsing step is required.

### ABS Import Data

The Australian Bureau of Statistics publishes monthly international merchandise trade statistics including petroleum product imports. Available via a REST API at no cost with no registration. Useful as a leading indicator: import volumes precede stock levels by 4–8 weeks.
