import { FAVORITES, cors, fetchJSON, SIRI_BASE, API_KEY, routeApiId } from "./lib.js";

function stripRoutePrefix(s) {
  return s.replace("MTABC_", "").replace("MTA NYCT_", "").replace("MTA_", "");
}

async function fetchArrivals(stopId, lineRef) {
  let url = `${SIRI_BASE}/siri/stop-monitoring.json?key=${API_KEY}&version=2&OperatorRef=MTA&MonitoringRef=${stopId}&StopMonitoringDetailLevel=calls`;
  if (lineRef) url += `&LineRef=${encodeURIComponent(routeApiId(lineRef))}`;
  return fetchJSON(url, 12000);
}

export default async function handler(req, res) {
  cors(res);
  try {
    const results = await Promise.all(FAVORITES.map(async (fav) => {
      try {
        const data = await fetchArrivals(fav.stopId, fav.route);
        const delivery = data?.Siri?.ServiceDelivery?.StopMonitoringDelivery;
        const mon = Array.isArray(delivery) ? delivery[0] : delivery;
        const visits = mon?.MonitoredStopVisit || [];
        const arrivals = visits.map((v) => {
          const mvj = v.MonitoredVehicleJourney; const call = mvj?.MonitoredCall;
          if (!call) return null;
          const route = stripRoutePrefix(mvj.LineRef || "");
          const dir = mvj.DirectionRef === "0" ? "Outbound" : "Inbound";
          const dest = Array.isArray(mvj.DestinationName) ? mvj.DestinationName[0] : mvj.DestinationName || "Unknown";
          const arrival = call.ExpectedArrivalTime || call.AimedArrivalTime;
          const mins = arrival ? Math.max(0, Math.round((new Date(arrival) - new Date()) / 60000)) : null;
          return { route, direction: dir, destination: dest, minutes: mins, stopsAway: call.NumberOfStopsAway ?? null, delay: call.Extensions?.Deviation?.Delay || 0 };
        }).filter(Boolean);
        return { ...fav, arrivals };
      } catch { return { ...fav, arrivals: [], error: "Failed to fetch" }; }
    }));
    res.json({ stops: results });
  } catch (err) { res.status(500).json({ error: err.message }); }
}
