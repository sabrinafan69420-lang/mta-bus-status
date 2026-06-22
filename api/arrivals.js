import { cors, fetchJSON, SIRI_BASE, API_KEY, routeApiId, oneBusAwayId } from "./lib.js";

function stripRoutePrefix(s, originalRoute) {
  let clean = s.replace("MTABC_", "").replace("MTA NYCT_", "").replace("MTA_", "");
  if (originalRoute && originalRoute.toUpperCase().endsWith("-SBS") && !clean.toUpperCase().endsWith("-SBS")) {
    clean += "-SBS";
  }
  return clean;
}

async function fetchArrivals(stopId, lineRef) {
  let url = `${SIRI_BASE}/siri/stop-monitoring.json?key=${API_KEY}&version=2&OperatorRef=MTA&MonitoringRef=${stopId}&StopMonitoringDetailLevel=calls`;
  if (lineRef) url += `&LineRef=${encodeURIComponent(routeApiId(lineRef))}`;
  return fetchJSON(url, 12000);
}

function parseArrivals(data) {
  const delivery = data?.Siri?.ServiceDelivery?.StopMonitoringDelivery;
  const mon = Array.isArray(delivery) ? delivery[0] : delivery;
  const visits = mon?.MonitoredStopVisit || [];
  return visits.map((v) => {
    const mvj = v.MonitoredVehicleJourney; const call = mvj?.MonitoredCall;
    if (!call) return null;
    const route = stripRoutePrefix(mvj.LineRef || "");
    const dir = mvj.DirectionRef === "0" ? "Outbound" : "Inbound";
    const dest = Array.isArray(mvj.DestinationName) ? mvj.DestinationName[0] : mvj.DestinationName || "Unknown";
    const arrival = call.ExpectedArrivalTime || call.AimedArrivalTime;
    const mins = arrival ? Math.max(0, Math.round((new Date(arrival) - new Date()) / 60000)) : null;
    return { route, direction: dir, destination: dest, minutes: mins, stopsAway: call.NumberOfStopsAway ?? null, delay: call.Extensions?.Deviation?.Delay || 0 };
  }).filter(Boolean);
}

const routeStopsCache = {};

async function getStopsForRoute(route) {
  if (routeStopsCache[route] && Date.now() - routeStopsCache[route].ts < 3600_000) return routeStopsCache[route].stops;
  try {
    const data = await fetchJSON(`${SIRI_BASE}/where/stops-for-route/${encodeURIComponent(oneBusAwayId(route))}.json?key=${API_KEY}&includePolylines=false&version=2`, 10000);
    const rawStops = data?.data?.entry?.stops || data?.data?.references?.stops || [];
    const stops = rawStops.map((s) => ({
      stopId: s.id?.replace("MTA_", "").replace("MTA NYCT_", "").replace("MTABC_", "") || s.id,
      name: s.name || "",
    }));
    routeStopsCache[route] = { stops, ts: Date.now() };
    return stops;
  } catch { return []; }
}

export default async function handler(req, res) {
  cors(res);
  try {
    const routesParam = req.query.routes || "";
    const extraRoutes = routesParam ? routesParam.split(",").map(r => r.trim().toUpperCase()).filter(Boolean) : [];
    // stops param: "ROUTE:ID,ID|ROUTE2:ID,ID" — which specific stops the user selected per route
    const stopsParam = req.query.stops || "";
    const userStops = {};
    if (stopsParam) {
      stopsParam.split("|").forEach(part => {
        const colonIdx = part.indexOf(":");
        if (colonIdx === -1) return;
        const route = part.substring(0, colonIdx).trim().toUpperCase();
        const idsStr = part.substring(colonIdx + 1).trim();
        if (route) {
          userStops[route] = idsStr ? idsStr.split(",").map(id => id.trim()).filter(Boolean) : [];
        }
      });
    }

    const favResults = [];

    const extraResults = [];
    if (extraRoutes.length > 0) {
      const stopLists = await Promise.all(extraRoutes.map(async (route) => {
        const userStopIds = userStops[route];
        if (userStopIds !== undefined) {
          if (userStopIds.length === 0) return { route, stops: [] };
          const allStops = await getStopsForRoute(route);
          const selected = userStopIds.map(id => allStops.find(s => s.stopId === id)).filter(Boolean);
          return { route, stops: selected };
        }
        const stops = await getStopsForRoute(route);
        return { route, stops: stops.slice(0, 3) };
      }));

      const allExtraStops = [];
      stopLists.forEach(({ route, stops }) => {
        stops.forEach((s) => {
          if (!favResults.some(f => f.stopId === s.stopId)) {
            allExtraStops.push({ ...s, route });
          }
        });
      });

      const extraArrivals = await Promise.all(allExtraStops.map(async (stop) => {
        try {
          const data = await fetchArrivals(stop.stopId, stop.route);
          return { stopId: stop.stopId, name: stop.name, route: stop.route, arrivals: parseArrivals(data) };
        } catch { return { stopId: stop.stopId, name: stop.name, route: stop.route, arrivals: [] }; }
      }));

      extraResults.push(...extraArrivals);
    }

    const allStops = [...favResults];
    extraResults.forEach((er) => {
      const existing = allStops.find(s => s.stopId === er.stopId);
      if (existing) {
        existing.arrivals = [...(existing.arrivals || []), ...er.arrivals];
      } else {
        allStops.push(er);
      }
    });

    res.json({ stops: allStops });
  } catch (err) { res.status(500).json({ error: err.message }); }
}
