import { TRACKED_ROUTES, cors, fetchJSON, SIRI_BASE, API_KEY } from "./lib.js";

async function fetchVehicleMonitoring(lineRef) {
  let url = `${SIRI_BASE}/siri/vehicle-monitoring.json?key=${API_KEY}&version=2&OperatorRef=MTA&VehicleMonitoringDetailLevel=calls&MaximumNumberOfCallsOnwards=5`;
  if (lineRef) url += `&LineRef=MTA%20NYCT_${lineRef}`;
  return fetchJSON(url, 15000);
}

export default async function handler(req, res) {
  cors(res);
  try {
    const results = await Promise.all(TRACKED_ROUTES.map(async (route) => {
      try {
        const data = await fetchVehicleMonitoring(route);
        const delivery = data?.Siri?.ServiceDelivery?.VehicleMonitoringDelivery;
        const mon = Array.isArray(delivery) ? delivery[0] : delivery;
        return (mon?.VehicleActivity || []).map((v) => {
          const mvj = v.MonitoredVehicleJourney;
          const rawId = typeof mvj.VehicleRef === "string" ? mvj.VehicleRef : mvj.VehicleRef?.value || "";
          const vehicleNum = rawId.replace("MTA NYCT_", "").replace("MTA_", "");
          const onwardCalls = (mvj.OnwardCalls?.OnwardCall || []).map((call) => {
            const d = call.Extensions?.Distances || {};
            const stopId = (call.StopPointRef || "").replace("MTA_", "");
            return { stopId, name: call.StopPointName || stopId, distance: d.PresentableDistance || null, stopsAway: d.StopsFromCall ?? null, metersAway: d.DistanceFromCall ?? null };
          });
          const mc = mvj.MonitoredCall;
          const nextStop = mc ? { stopId: (mc.StopPointRef || "").replace("MTA_", ""), distance: mc.Extensions?.Distances?.PresentableDistance || null, stopsAway: mc.Extensions?.Distances?.StopsFromCall ?? null } : null;
          return {
            id: vehicleNum, route: mvj.LineRef?.replace("MTA NYCT_", "").replace("MTA_", "") || route,
            direction: mvj.DirectionRef === "0" ? "Outbound" : "Inbound",
            destination: Array.isArray(mvj.DestinationName) ? mvj.DestinationName[0] : mvj.DestinationName || "",
            lat: mvj.VehicleLocation?.Latitude, lon: mvj.VehicleLocation?.Longitude,
            bearing: mvj.Bearing || 0, progressRate: mvj.ProgressRate || "unknown",
            progressStatus: mvj.ProgressStatus || null, occupancy: mvj.Occupancy || null,
            destinationRef: mvj.DestinationRef?.replace("MTA_", "") || null,
            onwardCalls, nextStop, recordedAt: v.RecordedAtTime || null,
          };
        });
      } catch { return []; }
    }));
    res.json({ vehicles: results.flat() });
  } catch (err) { res.status(500).json({ error: err.message }); }
}
