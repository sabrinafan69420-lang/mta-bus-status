import { cors, fetchJSON, SIRI_BASE, API_KEY } from "./lib.js";

const cache = {};

export default async function handler(req, res) {
  cors(res);
  try {
    const route = req.query.route?.toUpperCase();
    if (!route) return res.status(400).json({ error: "route required" });
    if (cache[route] && Date.now() - cache[route].ts < 3600_000) return res.json(cache[route].data);

    const routeId = route.replace(/-SBS$/i, "");
    const prefix = routeId.startsWith("BM") || routeId.startsWith("BX") ? "MTABC_" : "MTA NYCT_";
    const encoded = encodeURIComponent(`${prefix}${routeId}`);
    const url = `${SIRI_BASE}/where/stops-for-route/${encoded}.json?key=${API_KEY}&includePolylines=false&version=2`;
    const data = await fetchJSON(url, 10000);
    const stops = data?.data?.references?.stops || [];
    const result = {
      route,
      wheelchairBoarding: stops.some(s => s.wheelchairBoarding === "accessible") ? "yes" : "unknown",
      stops: stops.map(s => ({
        id: (s.id || "").replace("MTA_", "").replace("MTA NYCT_", "").replace("MTABC_", ""),
        name: s.name,
        wheelchairBoarding: s.wheelchairBoarding || "unknown",
      })),
    };
    cache[route] = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
}
