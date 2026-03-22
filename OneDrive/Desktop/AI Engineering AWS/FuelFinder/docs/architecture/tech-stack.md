# Tech Stack

## Frontend

| Technology | Version | Role |
|---|---|---|
| React | 18.x | UI framework |
| TypeScript | 5.x | Type safety |
| Vite | 5.x | Build tool and dev server |
| Leaflet | 1.9.x | Interactive map (vanilla JS, no react-leaflet) |
| Recharts | latest | Price distribution histogram and bar charts |

> **Why vanilla Leaflet?** `react-leaflet` has peer dependency conflicts with React 18's concurrent rendering model. FuelFinder manages the Leaflet map imperatively inside a `useRef`/`useEffect` pattern to avoid these issues.

## Backend

| Technology | Role |
|---|---|
| Supabase Postgres | Primary database (stations, prices, feedback) |
| Supabase Edge Functions (Deno) | `refresh-fuel-prices` — fetches from NSW API and upserts |
| Supabase pg_cron | Runs `refresh-fuel-prices` every 30 minutes |
| Supabase Realtime | Not yet used — reserved for Phase 2 live price push |

## Hosting & CI

| Service | Role |
|---|---|
| Vercel | Static frontend hosting, production branch `claude/pedantic-neumann` |
| GitHub | Source control (`nocturnaljojo/fuelfinder`) |

### Vercel deployment note

The git repository root is the entire `C:\Users\jtdra` user profile, so FuelFinder files sit inside `OneDrive/Desktop/AI Engineering AWS/FuelFinder/`. Vercel needs files at repo root. Deployment uses `git subtree split` to extract the FuelFinder subtree onto the `claude/pedantic-neumann` branch with `package.json` at root.

```bash
cd "C:\Users\jtdra"
git subtree split --prefix="OneDrive/Desktop/AI Engineering AWS/FuelFinder" -b vercel-deploy
git push origin vercel-deploy:claude/pedantic-neumann --force
git branch -D vercel-deploy
```

## Environment variables

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous (public) key |

Both are Vite public variables (prefixed `VITE_`) and are safe to expose in the browser because Row Level Security on Supabase restricts what the anon key can read/write.
