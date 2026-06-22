import { cors, fetchJSON, SIRI_BASE, API_KEY, DEFAULT_ROUTES } from "./lib.js";

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchStopsForRoute(route) {
  try {
    const url = `${SIRI_BASE}/where/stops-for-route/${encodeURIComponent(route)}.json?key=${API_KEY}&includePolylines=false&version=2`;
    const data = await fetchJSON(url, 10000);
    return (data?.data?.references?.stops || []).map(s => ({
      id: (s.id || "").replace("MTA_", ""),
      name: s.name,
      lat: s.lat,
      lon: s.lon,
    }));
  } catch { return []; }
}

export default async function handler(req, res) {
  cors(res);
  try {
    const { originLat, originLng, destLat, destLng } = req.query;
    const oLat = parseFloat(originLat), oLng = parseFloat(originLng);
    const dLat = parseFloat(destLat), dLng = parseFloat(destLng);
    if ([oLat, oLng, dLat, dLng].some(isNaN)) {
      return res.status(400).json({ error: "originLat, originLng, destLat, destLng required" });
    }

    const routesParam = req.query.routes;
    const routes = routesParam
      ? routesParam.split(",").map(r => r.toUpperCase().trim()).filter(Boolean)
      : DEFAULT_ROUTES;

    const allStops = await Promise.all(routes.map(async (route) => {
      const stops = await fetchStopsForRoute(route);
      return stops.map(s => ({ ...s, route }));
    }));
    const flat = allStops.flat();

    const originStops = flat
      .map(s => ({ ...s, distFromOrigin: haversineMeters(oLat, oLng, s.lat, s.lon) }))
      .sort((a, b) => a.distFromOrigin - b.distFromOrigin)
      .slice(0, 5);

    const destStops = flat
      .map(s => ({ ...s, distFromDest: haversineMeters(dLat, dLng, s.lat, s.lon) }))
      .sort((a, b) => a.distFromDest - b.distFromDest)
      .slice(0, 5);

    const suggestions = [];
    for (const oStop of originStops) {
      for (const dStop of destStops) {
        if (oStop.route === dStop.route) {
          const walkOrigin = Math.round(oStop.distFromOrigin / 80);
          const walkDest = Math.round(dStop.distFromDest / 80);
          suggestions.push({
            route: oStop.route,
            originStop: { id: oStop.id, name: oStop.name, lat: oStop.lat, lon: oStop.lon, walkMin: walkOrigin },
            destStop: { id: dStop.id, name: dStop.name, lat: dStop.lat, lon: dStop.lon, walkMin: walkDest },
            totalWalkMin: walkOrigin + walkDest,
            transferRequired: false,
          });
        }
      }
    }

    if (suggestions.length === 0) {
      for (const oStop of originStops.slice(0, 3)) {
        for (const dStop of destStops.slice(0, 3)) {
          const walkOrigin = Math.round(oStop.distFromOrigin / 80);
          const walkDest = Math.round(dStop.distFromDest / 80);
          suggestions.push({
            route: oStop.route,
            originStop: { id: oStop.id, name: oStop.name, lat: oStop.lat, lon: oStop.lon, walkMin: walkOrigin },
            destStop: { id: dStop.id, name: dStop.name, lat: dStop.lat, lon: dStop.lon, walkMin: walkDest },
            totalWalkMin: walkOrigin + walkDest,
            transferRequired: true,
            transferNote: "Transfer may be needed",
          });
        }
      }
    }

    suggestions.sort((a, b) => a.totalWalkMin - b.totalWalkMin);
    res.json({ suggestions: suggestions.slice(0, 8), originStops: originStops.map(s => ({ id: s.id, name: s.name, route: s.route, lat: s.lat, lon: s.lon, dist: Math.round(s.distFromOrigin) })), destStops: destStops.map(s => ({ id: s.id, name: s.name, route: s.route, lat: s.lat, lon: s.lon, dist: Math.round(s.distFromDest) })) });
  } catch (err) { res.status(500).json({ error: err.message }); }
}
