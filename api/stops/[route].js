import { cors, fetchJSON, SIRI_BASE, API_KEY, routeApiId } from "../lib.js";

const cache = {};

export default async function handler(req, res) {
  cors(res);
  try {
    const route = req.query.route?.toUpperCase();
    if (!route) return res.status(400).json({ error: "route required" });
    if (cache[route] && Date.now() - cache[route].ts < 3600_000) return res.json(cache[route].data);
    const url = `${SIRI_BASE}/where/stops-for-route/${encodeURIComponent(routeApiId(route))}.json?key=${API_KEY}&includePolylines=false&version=2`;
    const data = await fetchJSON(url, 10000);
    const rawStops = data?.data?.references?.stops || [];
    const stops = rawStops.map((s) => ({ id: s.id?.replace("MTA_", "") || s.code, name: s.name, lat: s.lat, lon: s.lon, direction: s.direction || null, routeIds: s.routeIds || [] }));
    const result = { route, stops };
    cache[route] = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
}
