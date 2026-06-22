import { DEFAULT_ROUTES, cors, fetchJSON, SIRI_BASE, API_KEY, routeApiId } from "./lib.js";

function stripRoutePrefix(s, originalRoute) {
  let clean = s.replace("MTABC_", "").replace("MTA NYCT_", "").replace("MTA_", "").replace(/\+$/, "");
  if (originalRoute && originalRoute.toUpperCase().endsWith("-SBS") && !clean.toUpperCase().endsWith("-SBS")) {
    clean += "-SBS";
  }
  return clean;
}

async function fetchVehicleMonitoring(lineRef) {
  let url = `${SIRI_BASE}/siri/vehicle-monitoring.json?key=${API_KEY}&version=2&OperatorRef=MTA&VehicleMonitoringDetailLevel=calls&MaximumNumberOfCallsOnwards=5`;
  if (lineRef) url += `&LineRef=${encodeURIComponent(routeApiId(lineRef))}`;
  return fetchJSON(url, 15000);
}

export default async function handler(req, res) {
  cors(res);
  try {
    const routesParam = req.query.routes;
    const routes = routesParam ? routesParam.split(",").map(r => r.toUpperCase().trim()).filter(Boolean) : DEFAULT_ROUTES;
    const results = await Promise.all(routes.map(async (route) => {
      try {
        const data = await fetchVehicleMonitoring(route);
        const delivery = data?.Siri?.ServiceDelivery?.VehicleMonitoringDelivery;
        const mon = Array.isArray(delivery) ? delivery[0] : delivery;
        return (mon?.VehicleActivity || []).map((v) => {
          const mvj = v.MonitoredVehicleJourney;
          const rawId = typeof mvj.VehicleRef === "string" ? mvj.VehicleRef : mvj.VehicleRef?.value || "";
          const vehicleNum = stripRoutePrefix(rawId);
          const onwardCalls = (mvj.OnwardCalls?.OnwardCall || []).map((call) => {
            const d = call.Extensions?.Distances || {};
            const stopId = (call.StopPointRef || "").replace("MTA_", "").replace("MTA NYCT_", "").replace("MTABC_", "");
            const dist = d.PresentableDistance || call.ArrivalProximityText || null;
            const stopsAway = d.StopsFromCall ?? call.NumberOfStopsAway ?? null;
            return { stopId, name: Array.isArray(call.StopPointName) ? call.StopPointName[0] : (call.StopPointName || stopId), distance: dist, stopsAway, metersAway: d.DistanceFromCall ?? call.DistanceFromStop ?? null };
          });
          const mc = mvj.MonitoredCall;
          const nextStop = mc ? { stopId: (mc.StopPointRef || "").replace("MTA_", "").replace("MTA NYCT_", "").replace("MTABC_", ""), distance: mc.Extensions?.Distances?.PresentableDistance || null, stopsAway: mc.Extensions?.Distances?.StopsFromCall ?? null } : null;
          return {
            id: vehicleNum, route: stripRoutePrefix(mvj.LineRef || "", route) || route,
            direction: mvj.DirectionRef === "0" ? "Outbound" : "Inbound",
            destination: Array.isArray(mvj.DestinationName) ? mvj.DestinationName[0] : mvj.DestinationName || "",
            lat: mvj.VehicleLocation?.Latitude, lon: mvj.VehicleLocation?.Longitude,
            bearing: mvj.Bearing || 0, progressRate: mvj.ProgressRate || "unknown",
            progressStatus: mvj.ProgressStatus || null, occupancy: mvj.Occupancy || null,
            destinationRef: (mvj.DestinationRef || "").replace("MTA_", "").replace("MTA NYCT_", "").replace("MTABC_", "") || null,
            onwardCalls, nextStop, recordedAt: v.RecordedAtTime || null,
          };
        });
      } catch { return []; }
    }));
    res.json({ vehicles: results.flat() });
  } catch (err) { res.status(500).json({ error: err.message }); }
}
