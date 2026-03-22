# UI & Navigation

## Header

The sticky header contains:

- **FuelFinder Canberra** logo/wordmark (left).
- **Location picker** — tap the pin button to switch between GPS and preset locations (ACT suburbs, Regional NSW towns, Tasmania). When GPS is unavailable the app defaults to Civic/City, Canberra.
- **Refresh button** — manually re-fetches prices. Disabled while a fetch is in-flight.
- **Last updated** timestamp (HH:MM).

## Fuel type filter bar

A row of pill buttons lets users switch between seven grades:

| Pill | Fuel grade |
|---|---|
| U91 | Unleaded 91 |
| E10 | Ethanol 10% blend |
| P95 | Premium 95 |
| P98 | Premium 98 |
| Diesel | Standard diesel |
| Premium Diesel | Premium diesel |
| LPG | Liquefied petroleum gas |

## Radius filter bar

Filters stations to within a chosen radius of the selected location: **5 km, 10 km, 25 km, 50 km, or All**. Selecting a Regional NSW or Tasmania preset automatically expands the radius to 50 km.

## Stats bar

Four summary statistics computed from the currently visible stations:

- **Cheapest** — minimum price in cents (green).
- **Average** — mean price.
- **Dearest** — maximum price (red).
- **Spread** — dearest minus cheapest.

## Sidebar

A collapsible left panel (desktop) / bottom drawer (mobile) containing:

- Fuel type selector.
- Sort controls.
- Station list.

### Sidebar navigation buttons

Two navigation buttons sit above the sidebar footer:

| Button | Action |
|---|---|
| ℹ️ About FuelFinder | Opens the About modal |
| 📊 Price Charts | Opens the Charts modal |

These buttons are hidden when the sidebar is collapsed (they reappear when the sidebar is expanded).

## Modals

### About modal

Describes FuelFinder's purpose, data source, and author.

### Charts modal

See [Price Charts](price-charts.md) for full details.

## Support strip

A strip below the leaderboards contains community support elements:

- **Tagline:** "🇦🇺 FuelFinder is free · built for Australians"
- **💬 Feedback button** — glowing purple. Opens the Feedback modal where users can submit a comment that is saved to the Supabase `feedback` table.
- **☕ Buy me a coffee button** — enlarged (16 px, 800 weight, 13 px × 26 px padding). Animated spinning gold/orange conic-gradient border effect. Links to the project's Ko-fi/Buy Me a Coffee page.

> Note: the About button was removed from the support strip in the March 2026 redesign and moved to the sidebar navigation.
