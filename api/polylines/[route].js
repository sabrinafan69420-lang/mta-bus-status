import { cors, fetchJSON, SIRI_BASE, API_KEY, polyline, oneBusAwayId } from "../lib.js";

const cache = {};

export default async function handler(req, res) {
  cors(res);
  try {
    const route = req.query.route?.toUpperCase();
    if (!route) return res.status(400).json({ error: "route required" });
    if (cache[route] && Date.now() - cache[route].ts < 3600_000) return res.json(cache[route].data);
    const url = `${SIRI_BASE}/where/stops-for-route/${encodeURIComponent(oneBusAwayId(route))}.json?key=${API_KEY}&includePolylines=true&version=2`;
    const data = await fetchJSON(url, 10000);
    const rawPolylines = data?.data?.entry?.polylines || [];
    const decoded = rawPolylines.map((p) => { try { return polyline.decode(p.points); } catch { return null; } }).filter(Boolean).flat();
    const result = { route, coordinates: decoded };
    cache[route] = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
}
