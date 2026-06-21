import express from "express";
import fetch from "node-fetch";
import protobuf from "gtfs-realtime-bindings";
import polyline from "@mapbox/polyline";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3005;

const API_KEY = process.env.MTA_BUSTIME_KEY || "";
const SIRI_BASE = "https://bustime-classic.mta.info/api";
const ALERTS_URL = `https://gtfsrt.prod.obanyc.com/alerts?key=${API_KEY}`;

const FAVORITES = [
  { stopId: "300833", name: "AVENUE D/NOSTRAND AV", route: "B8" },
  { stopId: "308313", name: "ROCKAWAY AV/HEGEMAN AV", route: "B8" },
  { stopId: "301128", name: "E 98 ST/CHURCH AV", route: "B15" },
  { stopId: "301034", name: "FOUNTAIN AV/LINDEN BLVD", route: "B15" },
  { stopId: "300590", name: "Cozine Av/Ashford St", route: "B6" },
  { stopId: "300541", name: "Glenwood RD/Nostrand Av", route: "B6" },
];

const TRACKED_ROUTES = ["B6", "B8", "B15"];

// --- CORS ---
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

// --- GTFS-RT Alerts ---
const VEHICLE_POSITIONS_URL = `https://gtfsrt.prod.obanyc.com/vehiclePositions?key=${API_KEY}`;
let cachedVehiclePositions = null;
let vehiclePositionsLastFetch = 0;
const VP_CACHE_MS = 15_000;

async function fetchVehiclePositions() {
  if (cachedVehiclePositions && Date.now() - vehiclePositionsLastFetch < VP_CACHE_MS) {
    return cachedVehiclePositions;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(VEHICLE_POSITIONS_URL, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`VehiclePositions HTTP ${res.status}`);

    const buffer = await res.buffer();
    const feed = protobuf.transit_realtime.FeedMessage.decode(buffer);
    const now = Math.floor(Date.now() / 1000);

    const vehicles = [];
    for (const entity of feed.entity) {
      if (!entity.vehicle) continue;
      const vp = entity.vehicle;
      const trip = vp.trip || {};
      const pos = vp.position || {};
      const vehicle = vp.vehicle || {};
      const routeId = (trip.routeId || "").toUpperCase();

      if (!TRACKED_ROUTES.includes(routeId)) continue;

      const timestamp = parseInt(vp.timestamp) || 0;
      if (timestamp && now - timestamp > 300) continue;

      vehicles.push({
        id: (vehicle.id || "").replace("MTA NYCT_", "").replace("MTA_", ""),
        route: routeId,
        lat: pos.latitude,
        lon: pos.longitude,
        bearing: pos.bearing || 0,
        speed: pos.speed || null,
        tripId: trip.tripId || null,
        startTime: trip.startTime || null,
        timestamp: timestamp || null,
        occupancy: vp.occupancy_status || null,
        congestionLevel: vp.congestion_level || null,
      });
    }

    cachedVehiclePositions = vehicles;
    vehiclePositionsLastFetch = Date.now();
    return vehicles;
  } catch (err) {
    console.error("Failed to fetch vehicle positions:", err.message);
    return cachedVehiclePositions || [];
  }
}

app.get("/api/vehicle-positions", async (req, res) => {
  try {
    const vehicles = await fetchVehiclePositions();
    res.json({ vehicles, count: vehicles.length, routes: TRACKED_ROUTES });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

let cachedAlerts = null;
let alertsLastFetch = 0;
const ALERTS_CACHE_MS = 60_000;

async function fetchAlerts() {
  if (cachedAlerts && Date.now() - alertsLastFetch < ALERTS_CACHE_MS) {
    return cachedAlerts;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(ALERTS_URL, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Alerts HTTP ${res.status}`);

    const buffer = await res.buffer();
    const feed = protobuf.transit_realtime.FeedMessage.decode(buffer);

    const now = Math.floor(Date.now() / 1000);
    const alerts = [];

    for (const entity of feed.entity) {
      if (!entity.alert) continue;

      const alert = entity.alert;
      const informedEntities = alert.informedEntity || [];

      // Check if this alert affects our tracked routes
      const affectedRoutes = informedEntities
        .filter((e) => {
          const route = (e.routeId || e.trip?.routeId || "").toUpperCase();
          return TRACKED_ROUTES.includes(route);
        })
        .map((e) => (e.routeId || e.trip?.routeId || "").toUpperCase());

      if (affectedRoutes.length === 0) continue;

      // Check if alert is currently active
      const activePeriods = alert.activePeriod || [];
      const isActive = activePeriods.length === 0 || activePeriods.some((p) => {
        const start = parseInt(p.start) || 0;
        const end = parseInt(p.end) || Infinity;
        return now >= start && now <= end;
      });

      if (!isActive) continue;

      const headerText = alert.headerText?.translation?.[0]?.text || "Service Alert";
      const description = alert.descriptionText?.translation?.[0]?.text || "";
      const causeNum = alert.cause || 0;
      const effectNum = alert.effect || 0;

      const EFFECT_MAP = {
        1: "NO_SERVICE", 2: "REDUCED_SERVICE", 3: "SIGNIFICANT_DETOUR",
        4: "MODIFIED_SERVICE", 5: "DELAY", 6: "DETOUR",
        7: "STOP_CLOSED", 8: "STOP_MOVED",
      };
      const effect = EFFECT_MAP[effectNum] || `UNKNOWN_${effectNum}`;
      const CAUSE_MAP = {
        1: "UNKNOWN_CAUSE", 2: "OTHER_CAUSE", 3: "TECHNICAL_PROBLEM",
        4: "STRIKE", 5: "DEMONSTRATION", 6: "ACCIDENT", 7: "HOLIDAY",
        8: "WEATHER", 9: "MAINTENANCE", 10: "CONSTRUCTION",
        11: "POLICE_ACTIVITY", 12: "MEDICAL_EMERGENCY",
      };
      const cause = CAUSE_MAP[causeNum] || `UNKNOWN_CAUSE`;

      alerts.push({
        id: entity.id,
        routes: [...new Set(affectedRoutes)],
        header: headerText,
        description,
        cause,
        effect,
        activePeriods: activePeriods.map((p) => ({
          start: p.start ? parseInt(p.start) : null,
          end: p.end ? parseInt(p.end) : null,
        })),
      });
    }

    cachedAlerts = alerts;
    alertsLastFetch = Date.now();
    return alerts;
  } catch (err) {
    console.error("Failed to fetch alerts:", err.message);
    return cachedAlerts || [];
  }
}

async function fetchJSON(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

// --- SIRI Proxy ---
async function fetchArrivals(stopId, lineRef) {
  let url = `${SIRI_BASE}/siri/stop-monitoring.json?key=${API_KEY}&version=2&OperatorRef=MTA&MonitoringRef=${stopId}&StopMonitoringDetailLevel=calls`;
  if (lineRef) url += `&LineRef=MTA%20NYCT_${lineRef}`;
  return fetchJSON(url, 12000);
}

async function fetchVehicleMonitoring(lineRef) {
  let url = `${SIRI_BASE}/siri/vehicle-monitoring.json?key=${API_KEY}&version=2&OperatorRef=MTA&VehicleMonitoringDetailLevel=calls&MaximumNumberOfCallsOnwards=5`;
  if (lineRef) url += `&LineRef=MTA%20NYCT_${lineRef}`;
  return fetchJSON(url, 15000);
}

// --- API Routes ---
app.get("/api/alerts", async (req, res) => {
  try {
    const alerts = await fetchAlerts();
    res.json({ alerts, routes: TRACKED_ROUTES });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/arrivals/:stopId", async (req, res) => {
  try {
    const { stopId } = req.params;
    const { route } = req.query;
    const data = await fetchArrivals(stopId, route);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/arrivals", async (req, res) => {
  try {
    const results = await Promise.all(
      FAVORITES.map(async (fav) => {
        try {
          const data = await fetchArrivals(fav.stopId, fav.route);
          const delivery = data?.Siri?.ServiceDelivery?.StopMonitoringDelivery;
          const mon = Array.isArray(delivery) ? delivery[0] : delivery;
          const visits = mon?.MonitoredStopVisit || [];

          const arrivals = visits.map((v) => {
            const mvj = v.MonitoredVehicleJourney;
            const call = mvj?.MonitoredCall;
            if (!call) return null;

            const route = mvj.LineRef?.replace("MTA NYCT_", "").replace("MTA_", "");
            const dir = mvj.DirectionRef === "0" ? "Outbound" : "Inbound";
            const dest = Array.isArray(mvj.DestinationName)
              ? mvj.DestinationName[0]
              : mvj.DestinationName || "Unknown";
            const arrival = call.ExpectedArrivalTime || call.AimedArrivalTime;
            const mins = arrival
              ? Math.max(0, Math.round((new Date(arrival) - new Date()) / 60000))
              : null;
            const stopsAway = call.NumberOfStopsAway ?? null;
            const delay = call.Extensions?.Deviation?.Delay || 0;

            return { route, direction: dir, destination: dest, minutes: mins, stopsAway, delay };
          }).filter(Boolean);

          return { ...fav, arrivals };
        } catch {
          return { ...fav, arrivals: [], error: "Failed to fetch" };
        }
      })
    );

    res.json({ stops: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/vehicles/:route", async (req, res) => {
  try {
    const data = await fetchVehicleMonitoring(req.params.route);
    const delivery = data?.Siri?.ServiceDelivery?.VehicleMonitoringDelivery;
    const mon = Array.isArray(delivery) ? delivery[0] : delivery;
    const vehicles = (mon?.VehicleActivity || []).map((v) => {
      const mvj = v.MonitoredVehicleJourney;
      return {
        id: mvj.VehicleRef?.value,
        route: mvj.LineRef?.replace("MTA NYCT_", "").replace("MTA_", ""),
        direction: mvj.DirectionRef === "0" ? "Outbound" : "Inbound",
        destination: Array.isArray(mvj.DestinationName)
          ? mvj.DestinationName[0]
          : mvj.DestinationName,
        lat: mvj.VehicleLocation?.Latitude,
        lon: mvj.VehicleLocation?.Longitude,
        speed: mvj.VehicleLocation?.Speed,
      };
    });
    res.json({ vehicles });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/favorites", (req, res) => {
  res.json({ favorites: FAVORITES });
});

// --- All vehicles across tracked routes ---
app.get("/api/vehicles", async (req, res) => {
  try {
    const results = await Promise.all(
      TRACKED_ROUTES.map(async (route) => {
        try {
          const data = await fetchVehicleMonitoring(route);
          const delivery = data?.Siri?.ServiceDelivery?.VehicleMonitoringDelivery;
          const mon = Array.isArray(delivery) ? delivery[0] : delivery;
          return (mon?.VehicleActivity || []).map((v) => {
            const mvj = v.MonitoredVehicleJourney;
            const rawId = typeof mvj.VehicleRef === "string" ? mvj.VehicleRef : mvj.VehicleRef?.value || "";
            const vehicleNum = rawId.replace("MTA NYCT_", "").replace("MTA_", "");

            // Parse OnwardCalls (upcoming stops)
            const onwardCalls = (mvj.OnwardCalls?.OnwardCall || []).map((call) => {
              const distances = call.Extensions?.Distances || {};
              const stopId = (call.StopPointRef || "").replace("MTA_", "");
              return {
                stopId,
                name: call.StopPointName || stopId,
                distance: distances.PresentableDistance || null,
                stopsAway: distances.StopsFromCall ?? null,
                metersAway: distances.DistanceFromCall ?? null,
                scheduledArrival: call.ExpectedArrivalTime || null,
              };
            });

            // Parse MonitoredCall (next stop)
            const monitoredCall = mvj.MonitoredCall;
            const nextStop = monitoredCall ? {
              stopId: (monitoredCall.StopPointRef || "").replace("MTA_", ""),
              distance: monitoredCall.Extensions?.Distances?.PresentableDistance || null,
              stopsAway: monitoredCall.Extensions?.Distances?.StopsFromCall ?? null,
            } : null;

            // ProgressStatus: layover, spooking, prevTrip
            const progressStatus = mvj.ProgressStatus || null;

            return {
              id: vehicleNum,
              route: mvj.LineRef?.replace("MTA NYCT_", "").replace("MTA_", "") || route,
              direction: mvj.DirectionRef === "0" ? "Outbound" : "Inbound",
              destination: Array.isArray(mvj.DestinationName)
                ? mvj.DestinationName[0]
                : mvj.DestinationName || "",
              lat: mvj.VehicleLocation?.Latitude,
              lon: mvj.VehicleLocation?.Longitude,
              bearing: mvj.Bearing || 0,
              progressRate: mvj.ProgressRate || "unknown",
              progressStatus,
              occupancy: mvj.Occupancy || null,
              destinationRef: mvj.DestinationRef?.replace("MTA_", "") || null,
              situationRef: mvj.SituationRef?.[0]?.SituationSimpleRef || null,
              nextStop,
              onwardCalls,
              recordedAt: v.RecordedAtTime || null,
            };
          });
        } catch {
          return [];
        }
      })
    );
    res.json({ vehicles: results.flat() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Route polylines (decoded) ---
const polylineCache = {};
app.get("/api/polylines/:route", async (req, res) => {
  try {
    const route = req.params.route.toUpperCase();
    const cacheKey = route;
    if (polylineCache[cacheKey] && Date.now() - polylineCache[cacheKey].ts < 3600_000) {
      return res.json(polylineCache[cacheKey].data);
    }

    const url = `${SIRI_BASE}/where/stops-for-route/MTA%20NYCT_${route}.json?key=${API_KEY}&includePolylines=true&version=2`;
    const data = await fetchJSON(url, 10000);
    const entry = data?.data?.entry;
    const rawPolylines = entry?.polylines || [];

    const decoded = rawPolylines
      .map((p) => {
        try {
          return polyline.decode(p.points);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .flat();

    const result = { route, coordinates: decoded };
    polylineCache[cacheKey] = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Stops for a route (with lat/lon) ---
const stopsCache = {};
app.get("/api/stops/:route", async (req, res) => {
  try {
    const route = req.params.route.toUpperCase();
    const cacheKey = route;
    if (stopsCache[cacheKey] && Date.now() - stopsCache[cacheKey].ts < 3600_000) {
      return res.json(stopsCache[cacheKey].data);
    }

    const url = `${SIRI_BASE}/where/stops-for-route/MTA%20NYCT_${route}.json?key=${API_KEY}&includePolylines=false&version=2`;
    const data = await fetchJSON(url, 10000);
    const refs = data?.data?.references;
    const rawStops = refs?.stops || [];

    const stops = rawStops.map((s) => ({
      id: s.id?.replace("MTA_", "") || s.code,
      name: s.name,
      lat: s.lat,
      lon: s.lon,
      direction: s.direction || null,
      routeIds: s.routeIds || [],
    }));

    const result = { route, stops };
    stopsCache[cacheKey] = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Serve static build ---
app.use(express.static(join(__dirname, "dist")));
app.get("/{*splat}", (req, res) => {
  res.sendFile(join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Bus status server running on http://localhost:${PORT}`);
});
