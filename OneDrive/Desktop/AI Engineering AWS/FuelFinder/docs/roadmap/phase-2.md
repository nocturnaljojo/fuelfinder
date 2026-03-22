# Phase 2 — News & Historical Prices

Phase 2 adds context to raw price data: where prices are heading over time, why they might be moving, and what the wholesale cost looks like behind retail.

## 📰 Fuel News panel

An RSS news aggregator surfacing fuel-related headlines from multiple Australian sources.

### Data sources

| Source | Feed / URL | Notes |
|---|---|---|
| AIP (Australian Institute of Petroleum) | aip.com.au | Weekly retail + terminal gate price tables, free |
| ACCC Petrol Monitoring | accc.gov.au | Quarterly monitoring reports, free RSS available |
| ABC News (via Google News RSS) | news.google.com | Free, no API key required |
| AAA (Australian Automobile Association) | aaa.asn.au | Fuel price advocacy and reports |

### Implementation plan

1. **Supabase Edge Function: `fetch-fuel-news`** — fetches RSS feeds from the four sources, parses items (title, link, published date, source name), and upserts into a `fuel_news` table.
2. **pg_cron job** — runs `fetch-fuel-news` every 2–4 hours.
3. **Frontend panel** — a collapsible "Fuel News" section below the leaderboards showing the 10 most recent headlines sorted by date, each linking to the original article.

### Database schema

```sql
create table fuel_news (
  id           bigserial primary key,
  source       text not null,        -- 'AIP', 'ACCC', 'ABC News', 'AAA'
  title        text not null,
  url          text unique not null,
  published_at timestamptz,
  fetched_at   timestamptz default now()
);
```

## 📊 Historical price trends

A live 7-day and 30-day line chart showing how the area average price has moved over time for the selected fuel type.

### Implementation plan

1. The `price_history` table already records every price update — no schema changes needed.
2. The `avg_price_history(fuel_type, days)` RPC function is already implemented and returns hourly averages.
3. The **"Price Trends Over Time"** placeholder section in the Charts modal (ChartsModal) becomes the live line chart once sufficient data has been collected (minimum ~7 days of 20-minute refresh cycles).
4. The chart will show:
   - X-axis: date/time
   - Y-axis: average price in cents
   - Reference line at today's average
   - Toggle between 7-day and 30-day views

### Data availability

Price history starts accumulating from the day the Supabase Edge Function is first deployed and the pg_cron job begins running. The 7-day chart will show meaningful data approximately one week after launch.

## AIP Terminal Gate Price (wholesale)

The AIP publishes weekly Terminal Gate Prices (TGP) — the wholesale price at which fuel distributors buy from refineries. Displaying TGP alongside retail prices reveals station profit margins.

### Implementation plan

1. Parse the AIP TGP page weekly (or scrape their public data table).
2. Store in a `terminal_gate_prices` table keyed by `(fuel_type, week_start_date)`.
3. Display as a reference line or badge in the Stats Bar and Charts modal:
   - "Retail: 229.9¢ | Wholesale: 198.4¢ | Margin: 31.5¢"
4. This gives users context for whether local stations are price-gouging or passing on wholesale savings.

### Database schema

```sql
create table terminal_gate_prices (
  id             bigserial primary key,
  fuel_type      text not null,
  week_start     date not null,
  price_cents    numeric(6,1) not null,
  source         text default 'AIP',
  fetched_at     timestamptz default now(),
  unique (fuel_type, week_start)
);
```
