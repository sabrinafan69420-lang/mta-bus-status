import { FAVORITES, cors, fetchJSON, SIRI_BASE, API_KEY, routeApiId, oneBusAwayId } from "./lib.js";

function stripRoutePrefix(s) {
  return s.replace("MTABC_", "").replace("MTA NYCT_", "").replace("MTA_", "");
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
    const data = await fetchJSON(`${SIRI_BASE}/where/stops-for-route/${encodeURIComponent(oneBusAwayId(route))}.json?key=${API_KEY}&version=2`, 10000);
    const stops = (data?.data?.entry?.stops || []).map((s) => ({
      stopId: s.id?.replace("MTA NYCT_", "").replace("MTA_", "") || s.id,
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

    const favResults = await Promise.all(FAVORITES.map(async (fav) => {
      try {
        const data = await fetchArrivals(fav.stopId, fav.route);
        return { ...fav, arrivals: parseArrivals(data) };
      } catch { return { ...fav, arrivals: [], error: "Failed to fetch" }; }
    }));

    const extraResults = [];
    if (extraRoutes.length > 0) {
      const stopLists = await Promise.all(extraRoutes.map(async (route) => {
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
