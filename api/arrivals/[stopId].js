import { cors, fetchJSON, SIRI_BASE, API_KEY, routeApiId } from "../lib.js";

export default async function handler(req, res) {
  cors(res);
  try {
    const stopId = req.query.stopId;
    const route = req.query.route;
    if (!stopId) return res.status(400).json({ error: "stopId required" });
    if (!/^\d+$/.test(stopId)) return res.status(400).json({ error: "Invalid stopId" });
    let url = `${SIRI_BASE}/siri/stop-monitoring.json?key=${API_KEY}&version=2&OperatorRef=MTA&MonitoringRef=${encodeURIComponent(stopId)}&StopMonitoringDetailLevel=calls`;
    if (route) url += `&LineRef=${encodeURIComponent(routeApiId(route))}`;
    const data = await fetchJSON(url, 12000);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
}
