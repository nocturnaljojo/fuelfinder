# Leaderboards & Station List

## Leaderboards

Four leaderboard cards are displayed in a horizontally scrollable row below the map:

| Card | Contents |
|---|---|
| Top 5 Cheapest | The five stations with the lowest price, sorted ascending |
| Top 5 Nearest | The five stations closest to the user's location |
| Top 5 Priciest | The five stations with the highest price, sorted descending |
| Most Expensive | Single card highlighting the single most expensive station |

Each leaderboard row shows:

- **Rank** (#1, #2, …)
- **Brand badge** — coloured circle with the brand initial
- **Station name** and suburb/state parsed from the address
- **Price** in cents per litre, coloured green/amber/red

Clicking any row opens the Station Detail bottom sheet for that station.

### Scrollbar visibility

The leaderboard row has a **permanently visible scrollbar** (6 px height, slate `#475569` colour) so users can clearly see the row is horizontally scrollable and can reach the 4th card (Most Expensive) without guessing.

## Station list

The full station list sits below the leaderboards. It is **expandable and collapsible** via a toggle header.

### Toggle header

The header shows:

- **"N stations found"** — updates dynamically as the radius or fuel type changes.
- **"📍 Nearest first"** label — indicates the current sort order.
- A **chevron indicator** (▶ collapsed / ▼ expanded) to signal interactivity.

Clicking the header collapses or expands the list. This is useful on mobile where the list can be long.

### Sort controls

When the list is expanded, sort controls appear:

| Button | Sort order |
|---|---|
| Nearest | Ascending distance from user location |
| Cheapest | Ascending price in cents |

### Station rows

Each row shows:

- Station name (bold)
- Brand name and postcode (muted)
- Price in cents (coloured green/amber/red)
- Distance (e.g. "1.2 km" or "800 m")

Clicking a row opens the Station Detail bottom sheet.

### Empty state

If no stations are found for the selected fuel type and radius, a message reads:

> "No {fuelType} prices found. Try expanding the radius or selecting a different location."
