# Feedback & Community

## Feedback modal

Users can submit feedback directly from the app via the **💬 Feedback** button in the support strip below the leaderboards.

### How it works

1. User clicks the glowing purple **💬 Feedback** button.
2. A modal opens with a text input and a submit button.
3. On submit, the message is saved to the Supabase `feedback` table via the Supabase JS client (unauthenticated insert, protected by Row Level Security policy that allows inserts only).
4. A success/error message is shown inline.

### Supabase `feedback` table schema

```sql
create table feedback (
  id          bigint generated always as identity primary key,
  message     text not null,
  created_at  timestamptz default now()
);
```

Row Level Security: inserts allowed for the `anon` role; selects restricted to service role only.

## Buy Me a Coffee

The **☕ Buy me a coffee** button in the support strip links to the project's donation page.

### Styling

- Font size: 16 px, weight 800.
- Padding: 13 px (vertical) × 26 px (horizontal).
- Animated border: spinning conic-gradient cycling through gold and orange tones.
- The spin animation runs on an infinite loop using a CSS `@keyframes` rotating the gradient angle.

## Support strip layout

```
[ 🇦🇺 FuelFinder is free · built for Australians ]
[ 💬 Feedback ]  [ ☕ Buy me a coffee ]
```

The strip sits directly below the leaderboard cards. The About link was moved out of this strip in March 2026 and is now accessible via the sidebar navigation (ℹ️ About FuelFinder).
