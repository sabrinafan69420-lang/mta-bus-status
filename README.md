# MTA Bus Status

Real-time NYC bus tracking app with live map, arrivals, alerts, and a ton of commuter features. Built with React + Vite, deployed on Vercel.

## What It Does

Live bus map powered by Mapbox GL with GTFS-RT vehicle positions from the MTA. Click any stop to see real-time arrivals. Track any MTA bus route — not just the defaults.

## Features

### Live Map
- Real-time bus markers with bearing, speed color-coding, and delay rings
- GTFS-RT vehicle positions via MTA's protobuf feed
- Route polylines (handles MultiLineString segments correctly)
- Click stop markers to see live arrivals
- Bus popup shows upcoming stops, distance, and speed
- Fit-all view, route counts, and dark theme

### Arrivals & Departures
- Live arrival feed per stop with minutes, delays, and stops-away count
- Departure board across all tracked routes, sortable by route
- Stop cards with favorite/edit/remove actions
- Hide stops from arrivals with restore button
- Stop picker — choose which stops to track per route, grouped by direction

### Route Management
- Search and add any MTA bus route dynamically (not hardcoded)
- Route autocomplete on add-route input
- SBS and express route support (B44-SBS, BxM1, BM5, etc.)
- SBS uses `+` suffix for MTA API IDs, `-SBS` for display
- Express/SBS routes use `MTABC_` prefix where needed
- Color-coded routes with auto-assignment

### Service Alerts
- MTA service alert cards with effect types (delays, detours, suspended, etc.)
- Service calendar showing alert-affected days
- Delay notifications via browser notifications

### My Commute
- Save commute routes with origin/destination
- Geocoded addresses
- Fetches live commute data with arrival estimates

### Nearby Stops
- Shows stops sorted by distance from your location
- Haversine distance calculation
- Walking distance display

### Trip Planner
- Plan trips between any two points
- Uses tracked routes for suggestions

### Route Stats
- Per-route vehicle count, average delay, on-time percentage
- Bus counts and occupancy info

### Route Compare
- Side-by-side comparison of two routes
- Average delay, on-time %, speed, and vehicle count

### Crowding Info
- Occupancy badges (empty, standing available,seats available, crushed, full)
- Crowding badge component

### Subway Connections
- Shows nearby subway stations for your bus stops
- Subway station data from MTA

### Reliability Score
- Historical on-time performance per route
- Tracks departure history in localStorage

### Sound Alerts
- Toggle sound notifications for arrivals
- Browser notification permission handling

### Saved Views
- Save and load map states (zoom, center, tracked routes)
- Stored in localStorage

### Past Departures
- Departure history with timestamps
- Stored locally for review

### System Overview
- Total vehicles, active stops, alerts, delayed buses, average speed
- Full-bus count and occupancy stats

### User Reports
- Submit and view crowd-sourced reports per route
- Stored locally

### Accessibility
- Wheelchair accessibility info per stop
- Accessible stop indicators on stop cards

### Offline Support
- Service worker with network-first strategy for API and assets
- Cache fallback for offline use
- Kills old caches on update

### Mobile
- Responsive tab navigation for mobile
- Touch-friendly UI

## Tech Stack

- **Frontend:** React 19, Vite 8, Mapbox GL JS
- **Backend:** Vercel Serverless Functions (Node.js)
- **Data:** MTA BusTime API (SIRI), GTFS-RT protobuf, OneBusAway polylines/stops
- **Deploy:** Vercel

## Setup

```bash
npm install
```

Create a `.env` file:

```
VITE_MAPBOX_TOKEN=your_mapbox_token
MTA_BUSTIME_KEY=your_mta_api_key
```

```bash
npm run dev
```

## Build & Deploy

```bash
npm run build
```

Deployed automatically via Vercel. The `vercel.json` routes `/api/*` to serverless functions and everything else to the static build.

## API Routes

| Route | Description |
|---|---|
| `/api/arrivals` | Arrivals for tracked stops |
| `/api/arrivals/[stopId]` | Arrivals for a specific stop |
| `/api/vehicles` | GTFS-RT vehicle positions |
| `/api/alerts` | MTA service alerts |
| `/api/polylines/[route]` | Route polyline GeoJSON |
| `/api/stops/[route]` | Stops for a route |
| `/api/accessibility` | Wheelchair accessibility data |
| `/api/subway-stations` | Nearby subway stations |
| `/api/trip` | Trip planning |

## Environment Variables

| Variable | Description |
|---|---|
| `VITE_MAPBOX_TOKEN` | Mapbox GL access token |
| `MTA_BUSTIME_KEY` | MTA BusTime API key |

## License

MIT
