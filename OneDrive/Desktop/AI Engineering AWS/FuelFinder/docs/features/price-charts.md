# Price Charts

The **📊 Price Charts** button in the sidebar navigation opens the ChartsModal — a full-screen overlay that visualises current price data for the selected fuel type and radius.

## Opening the modal

1. Expand the sidebar (if collapsed).
2. Click the **📊 Price Charts** button near the sidebar footer.

Alternatively, a shortcut button may appear in the support strip depending on viewport size.

## Chart 1: Price distribution histogram

A vertical bar chart (histogram) grouping stations into price bands (bins) and showing how many stations fall into each bin.

- Bars are coloured **green**, **amber**, or **red** based on which third of the price range the bin falls in — matching the map marker colours.
- The X-axis shows price in cents per litre.
- The Y-axis shows the station count.
- Hovering a bar shows the exact price range and count in a tooltip.

This chart answers: "Are prices clustered tightly, or is there a big spread across stations?"

## Chart 2: Top 10 cheapest stations (horizontal bar chart)

A horizontal bar chart listing the 10 cheapest stations for the selected fuel grade, sorted from cheapest (top) to 10th cheapest (bottom).

- Each bar's length represents the station's price relative to the area average.
- A vertical **area average reference line** is drawn across all bars so the user can instantly see which stations are below average.
- Hovering a bar shows the station name, price in cents, and distance from the selected location.
- Bar colours follow the same green/amber/red scheme as the map.

This chart answers: "Which stations are cheapest and how far do I have to drive?"

## Coming soon: Price Trends Over Time

A placeholder section labelled **"Price Trends Over Time"** is shown at the bottom of the modal. This will become a live 7-day/30-day line chart once historical price data is populated (Phase 2).

## Implementation notes

- Built with **Recharts** (React charting library).
- Data comes from the same `stations` array already loaded in `App.tsx` — no extra API call.
- The modal is lazy-rendered: the component only mounts when the user opens it, keeping initial page load fast.
