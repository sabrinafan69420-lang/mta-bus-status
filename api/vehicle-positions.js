import { DEFAULT_ROUTES, cors, fetchBuffer, protobuf } from "./lib.js";

export default async function handler(req, res) {
  cors(res);
  try {
    const routesParam = req.query.routes;
    const routes = routesParam ? routesParam.split(",").map(r => r.toUpperCase().trim()).filter(Boolean) : DEFAULT_ROUTES;

    const buffer = await fetchBuffer(`https://gtfsrt.prod.obanyc.com/vehiclePositions?key=${process.env.MTA_BUSTIME_KEY}`);
    const feed = protobuf.transit_realtime.FeedMessage.decode(buffer);
    const now = Math.floor(Date.now() / 1000);
    const vehicles = [];
    for (const entity of feed.entity) {
      if (!entity.vehicle) continue;
      const vp = entity.vehicle;
      const routeId = (vp.trip?.routeId || "").toUpperCase();
      if (!routes.includes(routeId)) continue;
      const ts = parseInt(vp.timestamp) || 0;
      if (ts && now - ts > 300) continue;
      vehicles.push({
        id: (vp.vehicle?.id || "").replace("MTABC_", "").replace("MTA NYCT_", "").replace("MTA_", ""),
        route: routeId, lat: vp.position?.latitude, lon: vp.position?.longitude,
        bearing: vp.position?.bearing || 0, speed: vp.position?.speed || null,
        timestamp: ts || null, occupancy: vp.occupancy_status || null,
      });
    }
    res.json({ vehicles, count: vehicles.length, routes });
  } catch (err) { res.status(500).json({ error: err.message }); }
}
