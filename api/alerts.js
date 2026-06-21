import { TRACKED_ROUTES, cors, fetchBuffer, protobuf } from "./lib.js";

export default async function handler(req, res) {
  cors(res);
  try {
    const buffer = await fetchBuffer(`https://gtfsrt.prod.obanyc.com/alerts?key=${process.env.MTA_BUSTIME_KEY}`);
    const feed = protobuf.transit_realtime.FeedMessage.decode(buffer);
    const now = Math.floor(Date.now() / 1000);
    const EFFECT_MAP = { 1: "NO_SERVICE", 2: "REDUCED_SERVICE", 3: "SIGNIFICANT_DETOUR", 4: "MODIFIED_SERVICE", 5: "DELAY", 6: "DETOUR", 7: "STOP_CLOSED", 8: "STOP_MOVED" };
    const CAUSE_MAP = { 1: "UNKNOWN_CAUSE", 2: "OTHER_CAUSE", 3: "TECHNICAL_PROBLEM", 4: "STRIKE", 5: "DEMONSTRATION", 6: "ACCIDENT", 7: "HOLIDAY", 8: "WEATHER", 9: "MAINTENANCE", 10: "CONSTRUCTION", 11: "POLICE_ACTIVITY", 12: "MEDICAL_EMERGENCY" };
    const alerts = [];
    for (const entity of feed.entity) {
      if (!entity.alert) continue;
      const alert = entity.alert;
      const affectedRoutes = (alert.informedEntity || [])
        .map((e) => (e.routeId || e.trip?.routeId || "").toUpperCase())
        .filter((r) => TRACKED_ROUTES.includes(r));
      if (affectedRoutes.length === 0) continue;
      const activePeriods = alert.activePeriod || [];
      const isActive = activePeriods.length === 0 || activePeriods.some((p) => {
        const s = parseInt(p.start) || 0, e = parseInt(p.end) || Infinity; return now >= s && now <= e;
      });
      if (!isActive) continue;
      alerts.push({
        id: entity.id, routes: [...new Set(affectedRoutes)],
        header: alert.headerText?.translation?.[0]?.text || "Service Alert",
        description: alert.descriptionText?.translation?.[0]?.text || "",
        cause: CAUSE_MAP[alert.cause] || "UNKNOWN_CAUSE",
        effect: EFFECT_MAP[alert.effect] || `UNKNOWN_${alert.effect}`,
        activePeriods: activePeriods.map((p) => ({ start: p.start ? parseInt(p.start) : null, end: p.end ? parseInt(p.end) : null })),
      });
    }
    res.json({ alerts, routes: TRACKED_ROUTES });
  } catch (err) { res.status(500).json({ error: err.message }); }
}
