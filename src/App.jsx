import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import "./index.css";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || "";

const DEFAULT_ROUTES = ["B6", "B8", "B15"];
const DEFAULT_COLORS = { B6: "#3b82f6", B8: "#f59e0b", B15: "#10b981" };
const EXTRA_COLORS = ["#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#06b6d4", "#84cc16", "#e11d48", "#6366f1", "#a855f7", "#0ea5e9", "#d946ef", "#22d3ee", "#facc15"];
const MAP_REFRESH = 15_000;
const DATA_REFRESH = 30_000;

const MTA_ROUTES = [
  "B1","B2","B3","B4","B6","B7","B8","B9","B10","B11","B12","B13","B14","B15","B16","B17","B24","B25","B26","B31","B32","B35","B36","B37","B38","B39","B41","B42","B43","B44","B44-SBS","B45","B46","B46-SBS","B47","B48","B49","B52","B54","B57","B60","B61","B62","B63","B64","B65","B66","B67","B68","B69","B70","B74","B77","B79","B81","B82","B82-SBS","B83","B84","B100","BM1","BM2","BM3","BM4","BM5","BMX1","BMX2","BMX3","BMX4","BMX5","BMX6","BMX7","BMX8","BMX9","BMX10",
  "Q1","Q2","Q3","Q4","Q5","Q6","Q7","Q8","Q9","Q10","Q11","Q12","Q13","Q14","Q15","Q15A","Q16","Q17","Q18","Q19","Q20A","Q20B","Q21","Q22","Q23","Q24","Q25","Q26","Q27","Q28","Q29","Q30","Q31","Q32","Q33","Q34","Q35","Q36","Q37","Q38","Q39","Q40","Q41","Q42","Q43","Q44","Q45","Q46","Q47","Q48","Q49","Q50","Q52-SBS","Q53-SBS","Q54","Q55","Q56","Q57","Q58","Q59","Q60","Q61","Q64","Q65","Q66","Q67","Q68","Q69","Q70-SBS","Q71","Q72","Q76","Q77","Q78","Q80","Q82","Q83","Q84","Q85","Q86","Q88","Q89","Q90","Q100","Q101","Q102","Q103","Q104","Q109","Q110","Q111","Q112","Q113","Q114","Q115","Q116","Q143","Q231","Q252",
  "M1","M2","M3","M4","M5","M7","M8","M9","M10","M11","M12","M13","M14","M15","M15-SBS","M16","M18","M20","M21","M22","M23-SBS","M24","M30","M31","M32","M34-SBS","M35","M40","M42","M43","M50","M51","M55","M57","M60-SBS","M66","M70","M72","M79-SBS","M80","M81","M86-SBS","M96","M98","M100","M101","M102","M103","M104","M106","M116","M125","M128","M142","M143","M148","M149","M150","M151","M212","M213","M214","M215","M216","M217","M218","M219","M220","M222",
  "S1","S2","S3","S4","S5","S6","S7","S8","S9","S10","S12","S15","S16","S17","S18","S19","S20","S21","S22","S26","S27","S28","S29","S31","S32","S33","S34","S40","S41","S42","S43","S44","S45","S46","S47","S48","S49","S51","S52","S53","S54","S55","S56","S57","S59","S60","S61","S62","S66","S68","S69","S74","S76","S78","S79","S81","S84","S86","S89","S90","S91","S92","S93","S94","S96","S98","S99",
  "X1","X2","X3","X4","X5","X6","X7","X8","X9","X10","X10A","X11","X12","X14","X15","X17","X18","X19","X20","X21","X22","X22A","X22B","X27","X28","X30","X31","X32","X36","X37","X38","X39","X40","X42","X43","X44","X45","X46","X48","X49","X51","X52","X54","X55","X57","X60","X63","X64","X68","X80",
  "Bx1","Bx2","Bx3","Bx4","Bx4A","Bx5","Bx6","Bx6A","Bx7","Bx8","Bx9","Bx10","Bx11","Bx12","Bx12-SBS","Bx14","Bx15","Bx15-SBS","Bx16","Bx17","Bx18","Bx19","Bx20","Bx21","Bx22","Bx23","Bx24","Bx25","Bx26","Bx27","Bx28","Bx29","Bx30","Bx31","Bx32","Bx33","Bx34","Bx35","Bx36","Bx38","Bx39","Bx40","Bx41","Bx42","Bx43","Bx46","Bx48","Bx55","BxM1","BxM2","BxM3","BxM4","BxM6","BxM7","BxM8","BxM9","BxM10","BxM11","BxM12","BxM14","BxM15","BxM16","BxM17","BxM18","BxM20","BxM21","BxM22","BxM23","BxM24","BxM25","BxM26","BxM27","BxM28","BxM34","BxM35","BxM36","BxM38","BxM40","BxM41","BxM42","BxM43","BxM44","BxM46","BxM48","BxM49"
];

function getRouteColor(route, index) {
  if (DEFAULT_COLORS[route]) return DEFAULT_COLORS[route];
  return EXTRA_COLORS[(index || 0) % EXTRA_COLORS.length];
}

function formatEffect(effect) {
  const map = {
    NO_SERVICE: "Suspended", REDUCED_SERVICE: "Reduced Service",
    SIGNIFICANT_DETOUR: "Detour", MODIFIED_SERVICE: "Modified",
    DELAY: "Delays", DETOUR: "Detour", STOP_CLOSED: "Stop Closed",
  };
  return map[effect] || effect?.replace(/_/g, " ") || "Unknown";
}

function effectClass(effect) {
  if (!effect) return "default";
  if (effect.includes("DELAY")) return "delays";
  if (effect.includes("DETOUR")) return "detour";
  if (effect.includes("NO_SERVICE") || effect.includes("SUSPENDED")) return "suspended";
  if (effect.includes("REDUCED")) return "reduced";
  if (effect.includes("MODIFIED")) return "modified";
  if (effect === "NONE") return "none";
  return "default";
}

function minsClass(mins) {
  if (mins <= 1) return "arriving";
  if (mins <= 5) return "soon";
  return "";
}

function delayColor(delay) {
  if (delay == null || delay <= 0) return null;
  if (delay > 120) return "#ef4444";
  if (delay > 60) return "#f97316";
  if (delay > 30) return "#eab308";
  return null;
}

function busSpeedColor(speed, isDelayed) {
  if (isDelayed) return "#ef4444";
  if (speed == null || speed <= 0) return null;
  if (speed < 5) return "#ef4444";
  if (speed < 15) return "#f59e0b";
  return "#22c55e";
}

function busSvg(color, bearing = 0, showDelayRing = false) {
  const ring = showDelayRing
    ? `<circle cx="19" cy="19" r="17" fill="none" stroke="#ef4444" stroke-width="2" stroke-dasharray="4 2" opacity="0.8"/>`
    : "";
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="38" height="38" viewBox="0 0 38 38"><g transform="rotate(${bearing}, 19, 19)">${ring}<circle cx="19" cy="19" r="16" fill="${color}" opacity="0.25"/><circle cx="19" cy="19" r="12" fill="${color}"/><rect x="10" y="7" width="18" height="24" rx="5" fill="${color}" stroke="white" stroke-width="2"/><rect x="13" y="10" width="12" height="9" rx="2" fill="white" opacity="0.9"/><circle cx="14" cy="25" r="2" fill="white"/><circle cx="24" cy="25" r="2" fill="white"/><polygon points="19,3 17,7 21,7" fill="white" opacity="0.8"/></g></svg>`)}`;
}

function AlertCard({ alert }) {
  return (
    <div className="alert-card">
      <div className="alert-header">
        <div className="alert-routes">
          {alert.routes.map((r) => (
            <span key={r} className="alert-route-badge">{r}</span>
          ))}
          <span className={`alert-effect ${effectClass(alert.effect)}`}>
            {formatEffect(alert.effect)}
          </span>
        </div>
      </div>
      <div className="alert-text">{alert.header}</div>
      {alert.description && (
        <div className="alert-desc">{alert.description}</div>
      )}
    </div>
  );
}

function ArrivalRow({ arrival }) {
  const dc = delayColor(arrival.delay);
  return (
    <div className="arrival-row">
      <span className="arrival-route">{arrival.route}</span>
      <div className="arrival-info">
        <div className="arrival-dest">{arrival.destination}</div>
        <div className="arrival-direction">{arrival.direction}</div>
      </div>
      <div className="arrival-time">
        {arrival.minutes != null ? (
          <>
            <div className={`arrival-mins ${minsClass(arrival.minutes)}`}>
              {arrival.minutes === 0 ? "Now" : arrival.minutes}
            </div>
            <div className="arrival-mins-label">
              {arrival.minutes === 0 ? "" : "min"}
            </div>
          </>
        ) : (
          <div className="arrival-mins" style={{ fontSize: 14 }}>--</div>
        )}
      </div>
      <div>
        {arrival.stopsAway != null && (
          <div className="arrival-stops-away">{arrival.stopsAway} stops</div>
        )}
        {dc && (
          <div className="arrival-delay" style={{ color: dc }}>
            +{Math.round((arrival.delay || 0) / 60)}m
          </div>
        )}
      </div>
    </div>
  );
}

function StopCard({ stop, isFavorite, onToggleFavorite, routeColors }) {
  return (
    <div className="stop-card">
      <div className="stop-card-header">
        <div>
          <div className="stop-name">{stop.name}</div>
          <div className="stop-id">{stop.stopId}</div>
        </div>
        <div className="stop-card-actions">
          <button
            className={`fav-btn ${isFavorite ? "active" : ""}`}
            onClick={() => onToggleFavorite(stop)}
            title={isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            {isFavorite ? "★" : "☆"}
          </button>
          <span className="stop-route-badge" style={{ background: routeColors[stop.route] || "var(--accent)" }}>{stop.route}</span>
        </div>
      </div>
      <div className="arrivals-list">
        {stop.error ? (
          <div className="no-arrivals">{stop.error}</div>
        ) : stop.arrivals.length === 0 ? (
          <div className="no-arrivals">No upcoming arrivals</div>
        ) : (
          stop.arrivals.map((a, i) => <ArrivalRow key={i} arrival={a} />)
        )}
      </div>
    </div>
  );
}

function DepartureBoard({ stops, routeColors, trackedRoutes, activeRoute }) {
  const allArrivals = useMemo(() => {
    const list = [];
    stops.forEach((stop) => {
      (stop.arrivals || []).forEach((a) => {
        list.push({ ...a, stopName: stop.name, stopId: stop.stopId });
      });
    });
    if (activeRoute !== "ALL") {
      return list.filter((a) => a.route === activeRoute).sort((a, b) => (a.minutes ?? 999) - (b.minutes ?? 999));
    }
    return list.sort((a, b) => (a.minutes ?? 999) - (b.minutes ?? 999));
  }, [stops, activeRoute]);

  if (allArrivals.length === 0) {
    return (
      <div className="departure-board-empty">
        <div className="no-alerts-icon">🚌</div>
        <h3>No Arrivals</h3>
        <p>No upcoming arrivals across tracked routes</p>
      </div>
    );
  }

  return (
    <div className="departure-board">
      <div className="departure-header-row">
        <span className="dep-col-route">Route</span>
        <span className="dep-col-stop">Stop</span>
        <span className="dep-col-dest">Destination</span>
        <span className="dep-col-time">Time</span>
        <span className="dep-col-delay">Delay</span>
      </div>
      {allArrivals.map((a, i) => {
        const dc = delayColor(a.delay);
        return (
          <div key={`${a.route}-${a.stopId}-${a.destination}-${i}`} className="departure-row">
            <span className="dep-col-route">
              <span className="dep-route-badge" style={{ background: routeColors[a.route] || "#888" }}>{a.route}</span>
            </span>
            <span className="dep-col-stop">{a.stopName}</span>
            <span className="dep-col-dest">{a.destination}</span>
            <span className={`dep-col-time ${minsClass(a.minutes)}`}>
              {a.minutes != null ? (a.minutes === 0 ? "Now" : `${a.minutes}m`) : "--"}
            </span>
            <span className="dep-col-delay" style={dc ? { color: dc } : undefined}>
              {dc ? `+${Math.round((a.delay || 0) / 60)}m` : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ServiceCalendar({ alerts }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const alertDays = useMemo(() => {
    const days = new Set();
    alerts.forEach((alert) => {
      (alert.activePeriods || []).forEach((p) => {
        if (!p.start) return;
        const start = new Date(p.start * 1000);
        const end = p.end ? new Date(p.end * 1000) : new Date(p.start * 1000 + 86400000);
        const d = new Date(start);
        while (d <= end) {
          days.add(d.toISOString().slice(0, 10));
          d.setDate(d.getDate() + 1);
        }
      });
    });
    return days;
  }, [alerts]);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date().toISOString().slice(0, 10);
  const monthName = currentMonth.toLocaleString("default", { month: "long", year: "numeric" });

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="service-calendar">
      <div className="calendar-nav">
        <button className="calendar-nav-btn" onClick={prevMonth}>◀</button>
        <span className="calendar-month">{monthName}</span>
        <button className="calendar-nav-btn" onClick={nextMonth}>▶</button>
      </div>
      <div className="calendar-weekdays">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <span key={d} className="calendar-weekday">{d}</span>
        ))}
      </div>
      <div className="calendar-grid">
        {cells.map((day, i) => {
          if (day === null) return <span key={`empty-${i}`} className="calendar-day empty" />;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const hasAlert = alertDays.has(dateStr);
          const isToday = dateStr === today;
          return (
            <span
              key={dateStr}
              className={`calendar-day ${hasAlert ? "has-alert" : ""} ${isToday ? "today" : ""}`}
              title={hasAlert ? "Active alerts on this day" : ""}
            >
              {day}
            </span>
          );
        })}
      </div>
      {alerts.length > 0 && (
        <div className="calendar-alerts-list">
          {alerts.slice(0, 5).map((a) => (
            <div key={a.id} className="calendar-alert-item">
              <span className={`alert-effect ${effectClass(a.effect)}`} style={{ fontSize: 10, padding: "2px 6px" }}>
                {formatEffect(a.effect)}
              </span>
              <span className="calendar-alert-routes">{a.routes.join(", ")}</span>
              <span className="calendar-alert-header">{a.header}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function busPopupHtml(v, color, routeColors) {
  const progressLabel = {
    "in progress": "Moving", normalProgress: "Moving", delayed: "Delayed",
    "stopped at stop": "At Stop", "stopped at connection": "At Connection",
    "stopped before stop": "At Stop", "stopped on request": "On Request",
    "off route": "Off Route", noProgress: "Stopped", unknown: "Unknown",
  };
  const status = progressLabel[v.progressRate] || v.progressRate || "";
  const isDelayed = v.progressRate === "delayed";
  const statusClass = isDelayed ? "delayed"
    : v.progressRate === "noProgress" ? "stopped"
    : (v.progressRate === "in progress" || v.progressRate === "normalProgress") ? "active" : "";
  const progressStatusLabels = { layover: "Layover — waiting at terminal", spooking: "No GPS — following schedule", prevTrip: "Serving previous trip" };
  const pStatus = v.progressStatus ? progressStatusLabels[v.progressStatus] || v.progressStatus : null;
  const occLabels = { seatsAvailable: "Seats Available", standingAvailable: "Standing OK", full: "Full" };
  const occupancy = v.occupancy ? occLabels[v.occupancy] || v.occupancy : null;
  const stops = v.onwardCalls || [];
  const stopsHtml = stops.length > 0 ? `
    <div class="bus-popup-stops">
      <div class="bus-popup-stops-title">Upcoming Stops</div>
      ${stops.map((s, i) => `
        <div class="bus-popup-stop ${i === 0 ? "next" : ""}">
          <span class="bus-popup-stop-num">${i + 1}</span>
          <span class="bus-popup-stop-name">${s.name}</span>
          <span class="bus-popup-stop-dist">${s.distance || (s.stopsAway != null ? s.stopsAway + " stops" : "\u2014")}</span>
        </div>
      `).join("")}
    </div>` : "";
  const delayBadge = isDelayed ? `<span class="bus-popup-delay-badge">DELAYED</span>` : "";

  return `<div class="bus-popup-card">
    <div class="bus-popup-header" style="background:${color}">
      <span class="bus-popup-route">${v.route}</span>
      <span class="bus-popup-vehicle">#${v.id}</span>
      ${delayBadge}
    </div>
    <div class="bus-popup-body">
      <div class="bus-popup-row"><span class="bus-popup-label">Direction</span><span>${v.direction}</span></div>
      <div class="bus-popup-row"><span class="bus-popup-label">Destination</span><span>${v.destination || "\u2014"}</span></div>
      ${v.speed != null ? `<div class="bus-popup-row"><span class="bus-popup-label">Speed</span><span>${Math.round(v.speed)} mph</span></div>` : ""}
      ${status ? `<div class="bus-popup-row"><span class="bus-popup-label">Status</span><span class="${statusClass}">${status}</span></div>` : ""}
      ${pStatus ? `<div class="bus-popup-row bus-popup-note"><span>${pStatus}</span></div>` : ""}
      ${occupancy ? `<div class="bus-popup-row"><span class="bus-popup-label">Crowding</span><span>${occupancy}</span></div>` : ""}
      ${stopsHtml}
    </div>
  </div>`;
}

function SearchResults({ results, onSelect, onClose, routeColors }) {
  if (!results || results.length === 0) return null;
  return (
    <div className="search-results">
      {results.slice(0, 8).map((r) => (
        <button
          key={`${r.route}-${r.id}`}
          className="search-result"
          onClick={() => { onSelect(r); onClose(); }}
        >
          <span className="search-result-route" style={{ background: routeColors[r.route] || "#888" }}>{r.route}</span>
          <span className="search-result-name">{r.name}</span>
          <span className="search-result-id">{r.id}</span>
        </button>
      ))}
    </div>
  );
}

function SchedulePanel({ route, onClose, routeColors }) {
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!route) return;
    setLoading(true);
    fetch(`/api/stops/${route}`)
      .then((r) => r.json())
      .then((data) => { setSchedule(data.stops || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [route]);

  if (!route) return null;
  return (
    <div className="schedule-panel">
      <div className="schedule-header">
        <span className="schedule-route" style={{ background: routeColors[route] || "#888" }}>{route}</span>
        <span className="schedule-title">Route Stops</span>
        <button className="schedule-close" onClick={onClose}>✕</button>
      </div>
      <div className="schedule-body">
        {loading ? (
          <div className="schedule-loading"><div className="spinner-sm" /> Loading...</div>
        ) : schedule.length === 0 ? (
          <div className="schedule-empty">No stops found</div>
        ) : (
          <div className="schedule-stops">
            {schedule.map((s, i) => (
              <div key={s.id} className="schedule-stop">
                <span className="schedule-stop-num">{i + 1}</span>
                <span className="schedule-stop-name">{s.name}</span>
                <span className="schedule-stop-id">{s.id}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NotificationBanner({ permission, onRequest }) {
  if (permission === "granted" || permission === "denied") return null;
  return (
    <div className="notif-banner">
      <span>Enable notifications to get alerts when your bus is arriving</span>
      <button className="notif-btn" onClick={onRequest}>Enable</button>
    </div>
  );
}

// --- Map Component ---
function BusMap({ vehicles, polylines, stops, alerts, visibleRoutes, trackedRoutes, routeColors, heatmapEnabled, onMapMove }) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const popupRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const userMarkerRef = useRef(null);
  const walkingSourceRef = useRef(null);

  useEffect(() => {
    if (mapRef.current) return;
    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-73.94, 40.65],
      zoom: 12.5,
      pitch: 0,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-left");
    mapRef.current = map;
    map.on("load", () => setMapReady(true));
    let moveTimer = null;
    map.on("moveend", () => {
      if (moveTimer) clearTimeout(moveTimer);
      moveTimer = setTimeout(() => {
        const c = map.getCenter();
        onMapMove?.({ lat: c.lat, lng: c.lng, zoom: map.getZoom() });
      }, 300);
    });
    return () => { if (moveTimer) clearTimeout(moveTimer); map.remove(); };
  }, []);

  const removeLayerSafe = useCallback((map, layerId, sourceId) => {
    try {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (sourceId && map.getSource(sourceId)) map.removeSource(sourceId);
    } catch {}
  }, []);

  // Update polylines
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    trackedRoutes.forEach((route) => {
      const sourceId = `route-${route}`;
      const layerGlow = `route-glow-${route}`;
      const layerLine = `route-layer-${route}`;
      removeLayerSafe(map, layerGlow, null);
      removeLayerSafe(map, layerLine, sourceId);
      if (!visibleRoutes.includes(route)) return;
      const routeCoords = polylines[route];
      if (!routeCoords || routeCoords.length === 0) return;
      map.addSource(sourceId, {
        type: "geojson",
        data: { type: "Feature", properties: { route }, geometry: { type: "LineString", coordinates: routeCoords } },
      });
      map.addLayer({
        id: layerGlow, type: "line", source: sourceId,
        paint: { "line-color": routeColors[route], "line-width": 10, "line-opacity": 0.15, "line-blur": 6 },
      });
      map.addLayer({
        id: layerLine, type: "line", source: sourceId,
        paint: { "line-color": routeColors[route], "line-width": 3.5, "line-opacity": 0.85 },
      });
    });
  }, [polylines, visibleRoutes, trackedRoutes, routeColors, removeLayerSafe, mapReady]);

  // Heatmap
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    removeLayerSafe(map, "bus-heatmap", "bus-heatmap-source");
    if (!heatmapEnabled) return;
    const visible = vehicles.filter((v) => v.lat && v.lon && visibleRoutes.includes(v.route));
    if (visible.length === 0) return;
    map.addSource("bus-heatmap-source", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: visible.map((v) => ({
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: [v.lon, v.lat] },
        })),
      },
    });
    map.addLayer({
      id: "bus-heatmap",
      type: "heatmap",
      source: "bus-heatmap-source",
      paint: {
        "heatmap-weight": 1,
        "heatmap-intensity": 0.7,
        "heatmap-radius": 30,
        "heatmap-color": [
          "interpolate", ["linear"], ["heatmap-density"],
          0, "rgba(0,0,0,0)",
          0.2, "rgba(99,102,241,0.3)",
          0.4, "rgba(99,102,241,0.5)",
          0.6, "rgba(236,72,153,0.5)",
          0.8, "rgba(239,68,68,0.6)",
          1, "rgba(239,68,68,0.8)",
        ],
      },
    });
  }, [heatmapEnabled, vehicles, visibleRoutes, removeLayerSafe, mapReady]);

  // Update stop markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    Object.keys(markersRef.current).forEach((key) => {
      if (key.startsWith("stop-")) {
        markersRef.current[key].remove();
        delete markersRef.current[key];
      }
    });
    trackedRoutes.forEach((route) => {
      if (!visibleRoutes.includes(route)) return;
      const routeStops = stops[route] || [];
      const color = routeColors[route] || "#888";
      routeStops.forEach((stop) => {
        if (stop.lat == null || stop.lon == null) return;
        const el = document.createElement("div");
        el.className = "stop-marker";
        el.style.cssText = `width:7px;height:7px;border-radius:50%;background:${color};border:1.5px solid rgba(255,255,255,0.8);cursor:pointer;transition:box-shadow 0.15s,opacity 0.15s;transform-origin:center center;`;
        el.addEventListener("mouseenter", () => {
          el.style.boxShadow = `0 0 0 3px ${color}80`;
          el.style.opacity = "1";
        });
        el.addEventListener("mouseleave", () => {
          el.style.boxShadow = "none";
          el.style.opacity = "0.7";
        });
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          if (popupRef.current) popupRef.current.remove();
          const popup = new mapboxgl.Popup({ offset: 10, maxWidth: "280px", className: "stop-click-popup" })
            .setLngLat([stop.lon, stop.lat])
            .setHTML(`<div class="stop-popup"><b>${stop.name}</b><br/><span class="stop-popup-id">${stop.id}</span> <span class="stop-popup-route">${route}</span><div class="stop-arrivals-loading"><div class="spinner-sm"></div>Loading arrivals...</div></div>`)
            .addTo(map);
          popupRef.current = popup;
          fetch(`/api/arrivals/${stop.id}?route=${route}`)
            .then((r) => r.json())
            .then((data) => {
              const delivery = data?.Siri?.ServiceDelivery?.StopMonitoringDelivery;
              const mon = Array.isArray(delivery) ? delivery[0] : delivery;
              const visits = mon?.MonitoredStopVisit || [];
              const arrivals = visits.map((v) => {
                const mvj = v.MonitoredVehicleJourney;
                const call = mvj?.MonitoredCall;
                if (!call) return null;
                const arrRoute = mvj.LineRef?.replace("MTA NYCT_", "").replace("MTA_", "");
                const dir = mvj.DirectionRef === "0" ? "Outbound" : "Inbound";
                const dest = Array.isArray(mvj.DestinationName) ? mvj.DestinationName[0] : mvj.DestinationName || "?";
                const arrival = call.ExpectedArrivalTime || call.AimedArrivalTime;
                const mins = arrival ? Math.max(0, Math.round((new Date(arrival) - new Date()) / 60000)) : null;
                return { route: arrRoute, direction: dir, destination: dest, minutes: mins, stopsAway: call.NumberOfStopsAway ?? null, delay: call.Extensions?.Deviation?.Delay || 0 };
              }).filter(Boolean);
              if (!popup.isOpen()) return;
              const arrivalsHtml = arrivals.length === 0
                ? `<div class="stop-no-arrivals">No upcoming arrivals</div>`
                : arrivals.map((a) => {
                    const mc = a.minutes <= 1 ? "arriving" : a.minutes <= 5 ? "soon" : "";
                    const ml = a.minutes === 0 ? "Now" : a.minutes;
                    const dc = delayColor(a.delay);
                    return `<div class="stop-arrival-row">
                      <span class="stop-arrival-mins ${mc}">${ml}${a.minutes > 0 ? '<span class="stop-arrival-unit">min</span>' : ''}</span>
                      <span class="stop-arrival-dest">${a.destination}</span>
                      <span class="stop-arrival-dir">${a.direction}</span>
                      ${a.stopsAway != null ? `<span class="stop-arrival-stops">${a.stopsAway} stops</span>` : ''}
                      ${dc ? `<span class="stop-arrival-delay" style="color:${dc}">+${Math.round((a.delay||0) / 60)}m</span>` : ''}
                    </div>`;
                  }).join("");
              popup.setHTML(`<div class="stop-popup"><b>${stop.name}</b><br/><span class="stop-popup-id">${stop.id}</span> <span class="stop-popup-route">${route}</span><div class="stop-arrivals">${arrivalsHtml}</div><button class="stop-directions-btn" onclick="window.__walkToStop&&window.__walkToStop(${stop.lat},${stop.lon},'${stop.name.replace(/'/g, "\\'")}')">Directions</button></div>`);
            })
            .catch(() => {
              if (!popup.isOpen()) return;
              popup.setHTML(`<div class="stop-popup"><b>${stop.name}</b><br/><span class="stop-popup-id">${stop.id}</span> <span class="stop-popup-route">${route}</span><div class="stop-arrivals"><div class="stop-no-arrivals">Failed to load arrivals</div></div></div>`);
            });
        });
        const marker = new mapboxgl.Marker(el).setLngLat([stop.lon, stop.lat]).addTo(map);
        markersRef.current[`stop-${route}-${stop.id}`] = marker;
      });
    });
  }, [stops, visibleRoutes, trackedRoutes, routeColors, mapReady]);

  // Update bus markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    vehicles.forEach((v) => {
      if (v.lat == null || v.lon == null) return;
      if (!visibleRoutes.includes(v.route)) return;
      const key = `bus-${v.id}`;
      const isDelayed = v.progressRate === "delayed";
      const color = busSpeedColor(v.speed, isDelayed) || routeColors[v.route] || "#888";
      if (markersRef.current[key]) {
        const marker = markersRef.current[key];
        marker.setLngLat([v.lon, v.lat], { duration: 1400 });
        const el = marker.getElement();
        const newBg = `url("${busSvg(color, v.bearing, isDelayed)}")`;
        if (el.style.backgroundImage !== newBg) el.style.backgroundImage = newBg;
        if (popupRef.current && popupRef.current._busId === v.id) popupRef.current.setLngLat([v.lon, v.lat]);
        return;
      }
      const el = document.createElement("div");
      el.className = "bus-marker";
      el.style.cssText = "width:38px;height:38px;cursor:pointer;transition:filter 0.2s;transform-origin:center center;";
      el.style.backgroundImage = `url("${busSvg(color, v.bearing, isDelayed)}")`;
      el.style.backgroundSize = "contain";
      el.style.backgroundRepeat = "no-repeat";
      el.addEventListener("mouseenter", () => { el.style.filter = `brightness(1.3) drop-shadow(0 0 6px ${color})`; });
      el.addEventListener("mouseleave", () => { el.style.filter = "none"; });
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        if (popupRef.current) popupRef.current.remove();
        const popup = new mapboxgl.Popup({ offset: 16, className: "bus-popup" })
          .setLngLat([v.lon, v.lat])
          .setHTML(busPopupHtml(v, routeColors[v.route] || "#888", routeColors))
          .addTo(map);
        popup._busId = v.id;
        popupRef.current = popup;
      });
      const marker = new mapboxgl.Marker(el).setLngLat([v.lon, v.lat]).addTo(map);
      markersRef.current[key] = marker;
    });
    Object.keys(markersRef.current).forEach((key) => {
      if (key.startsWith("bus-")) {
        const id = key.replace("bus-", "");
        const v = vehicles.find((v) => String(v.id) === String(id));
        if (!v || !visibleRoutes.includes(v.route)) {
          markersRef.current[key].remove();
          delete markersRef.current[key];
        }
      }
    });
  }, [vehicles, visibleRoutes, routeColors, mapReady]);

  // Walking directions
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    window.__walkToStop = (lat, lon, name) => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const start = [pos.coords.longitude, pos.coords.latitude];
          const end = [lon, lat];
          const token = mapboxgl.accessToken;
          fetch(`https://api.mapbox.com/directions/v5/mapbox/walking/${start[0]},${start[1]};${end[0]},${end[1]}?geometries=geojson&access_token=${token}`)
            .then((r) => r.json())
            .then((data) => {
              const route = data.routes?.[0];
              if (!route) return;
              const map = mapRef.current;
              if (!map) return;
              if (walkingSourceRef.current) {
                try { if (map.getLayer("walking-glow")) map.removeLayer("walking-glow"); if (map.getLayer("walking-route")) map.removeLayer("walking-route"); if (map.getSource("walking-route")) map.removeSource("walking-route"); } catch {}
              }
              map.addSource("walking-route", { type: "geojson", data: { type: "Feature", geometry: route.geometry } });
              map.addLayer({ id: "walking-glow", type: "line", source: "walking-route", paint: { "line-color": "#4285f4", "line-width": 8, "line-opacity": 0.2, "line-blur": 4 } });
              map.addLayer({ id: "walking-route", type: "line", source: "walking-route", paint: { "line-color": "#4285f4", "line-width": 3, "line-opacity": 0.9, "line-dasharray": [2, 1] } });
              walkingSourceRef.current = "walking-route";
              const dist = (route.distance / 1609.34).toFixed(1);
              const mins = Math.round(route.duration / 60);
              const bounds = new mapboxgl.LngLatBounds();
              route.geometry.coordinates.forEach((c) => bounds.extend(c));
              map.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 800 });
              if (popupRef.current) popupRef.current.remove();
              const popup = new mapboxgl.Popup({ offset: 10, maxWidth: "260px" })
                .setLngLat(end)
                .setHTML(`<div class="walking-popup"><div class="walking-popup-title">Walking to ${name}</div><div class="walking-popup-info"><span>${dist} mi</span><span>~${mins} min</span></div><button class="walking-clear-btn" onclick="window.__clearWalking&&window.__clearWalking()">Clear</button></div>`)
                .addTo(map);
              popupRef.current = popup;
            });
        },
        () => {},
        { enableHighAccuracy: true, timeout: 10000 }
      );
    };
    window.__clearWalking = () => {
      const map = mapRef.current;
      if (!map) return;
      try {
        if (map.getLayer("walking-glow")) map.removeLayer("walking-glow");
        if (map.getLayer("walking-route")) map.removeLayer("walking-route");
        if (map.getSource("walking-route")) map.removeSource("walking-route");
      } catch {}
      walkingSourceRef.current = null;
      if (popupRef.current) popupRef.current.remove();
    };
    return () => { delete window.__walkToStop; delete window.__clearWalking; };
  }, []);

  const fitAllBuses = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const visible = vehicles.filter((v) => v.lat && v.lon && visibleRoutes.includes(v.route));
    if (visible.length === 0) return;
    const bounds = new mapboxgl.LngLatBounds();
    visible.forEach((v) => bounds.extend([v.lon, v.lat]));
    map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 800 });
  }, [vehicles, visibleRoutes]);

  const goToUserLocation = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { longitude: lng, latitude: lat } = pos.coords;
        map.flyTo({ center: [lng, lat], zoom: 14, duration: 1200 });
        if (userMarkerRef.current) userMarkerRef.current.remove();
        const el = document.createElement("div");
        el.className = "user-marker";
        el.style.cssText = "width:16px;height:16px;border-radius:50%;background:#4285f4;border:3px solid white;box-shadow:0 0 0 2px #4285f4,0 2px 8px rgba(0,0,0,0.3);transform-origin:center center;";
        userMarkerRef.current = new mapboxgl.Marker(el).setLngLat([lng, lat]).addTo(map);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const zoomToStop = useCallback((stop) => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({ center: [stop.lon, stop.lat], zoom: 16, duration: 1000 });
    setTimeout(() => {
      if (popupRef.current) popupRef.current.remove();
      const popup = new mapboxgl.Popup({ offset: 10, maxWidth: "280px", className: "stop-click-popup" })
        .setLngLat([stop.lon, stop.lat])
        .setHTML(`<div class="stop-popup"><b>${stop.name}</b><br/><span class="stop-popup-id">${stop.id}</span> <span class="stop-popup-route">${stop.route}</span><div class="stop-arrivals-loading"><div class="spinner-sm"></div>Loading arrivals...</div></div>`)
        .addTo(map);
      popupRef.current = popup;
      fetch(`/api/arrivals/${stop.id}?route=${stop.route}`)
        .then((r) => r.json())
        .then((data) => {
          const delivery = data?.Siri?.ServiceDelivery?.StopMonitoringDelivery;
          const mon = Array.isArray(delivery) ? delivery[0] : delivery;
          const visits = mon?.MonitoredStopVisit || [];
          const arrivals = visits.map((v) => {
            const mvj = v.MonitoredVehicleJourney;
            const call = mvj?.MonitoredCall;
            if (!call) return null;
            const arrRoute = mvj.LineRef?.replace("MTA NYCT_", "").replace("MTA_", "");
            const dir = mvj.DirectionRef === "0" ? "Outbound" : "Inbound";
            const dest = Array.isArray(mvj.DestinationName) ? mvj.DestinationName[0] : mvj.DestinationName || "?";
            const arrival = call.ExpectedArrivalTime || call.AimedArrivalTime;
            const mins = arrival ? Math.max(0, Math.round((new Date(arrival) - new Date()) / 60000)) : null;
            return { route: arrRoute, direction: dir, destination: dest, minutes: mins, stopsAway: call.NumberOfStopsAway ?? null, delay: call.Extensions?.Deviation?.Delay || 0 };
          }).filter(Boolean);
          if (!popup.isOpen()) return;
          const arrivalsHtml = arrivals.length === 0
            ? `<div class="stop-no-arrivals">No upcoming arrivals</div>`
            : arrivals.map((a) => {
                const mc = a.minutes <= 1 ? "arriving" : a.minutes <= 5 ? "soon" : "";
                const ml = a.minutes === 0 ? "Now" : a.minutes;
                const dc = delayColor(a.delay);
                return `<div class="stop-arrival-row">
                  <span class="stop-arrival-mins ${mc}">${ml}${a.minutes > 0 ? '<span class="stop-arrival-unit">min</span>' : ''}</span>
                  <span class="stop-arrival-dest">${a.destination}</span>
                  <span class="stop-arrival-dir">${a.direction}</span>
                  ${a.stopsAway != null ? `<span class="stop-arrival-stops">${a.stopsAway} stops</span>` : ''}
                  ${dc ? `<span class="stop-arrival-delay" style="color:${dc}">+${Math.round((a.delay||0) / 60)}m</span>` : ''}
                </div>`;
              }).join("");
          popup.setHTML(`<div class="stop-popup"><b>${stop.name}</b><br/><span class="stop-popup-id">${stop.id}</span> <span class="stop-popup-route">${stop.route}</span><div class="stop-arrivals">${arrivalsHtml}</div><button class="stop-directions-btn" onclick="window.__walkToStop&&window.__walkToStop(${stop.lat},${stop.lon},'${stop.name.replace(/'/g, "\\'")}')">Directions</button></div>`);
        })
        .catch(() => {
          if (!popup.isOpen()) return;
          popup.setHTML(`<div class="stop-popup"><b>${stop.name}</b><br/><span class="stop-popup-id">${stop.id}</span> <span class="stop-popup-route">${stop.route}</span><div class="stop-arrivals"><div class="stop-no-arrivals">Failed to load arrivals</div></div></div>`);
        });
    }, 1200);
  }, []);

  useEffect(() => {
    if (mapContainer.current) {
      mapContainer.current._fitAllBuses = fitAllBuses;
      mapContainer.current._goToUserLocation = goToUserLocation;
      mapContainer.current._zoomToStop = zoomToStop;
    }
  }, [fitAllBuses, goToUserLocation, zoomToStop]);

  return <div ref={mapContainer} className="map-container" />;
}

// --- Main App ---
export default function App() {
  const [trackedRoutes, setTrackedRoutes] = useState(() => {
    try { return JSON.parse(localStorage.getItem("mta-routes")) || [...DEFAULT_ROUTES]; } catch { return [...DEFAULT_ROUTES]; }
  });
  const [routeStops, setRouteStops] = useState({});
  const [polylines, setPolylines] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [stops, setStops] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [activeRoute, setActiveRoute] = useState("ALL");
  const [visibleRoutes, setVisibleRoutes] = useState([...trackedRoutes]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [showSearch, setShowSearch] = useState(false);
  const [routeInput, setRouteInput] = useState("");
  const [routeError, setRouteError] = useState("");
  const [addingRoute, setAddingRoute] = useState(false);
  const [showRouteSuggestions, setShowRouteSuggestions] = useState(false);
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "denied"
  );
  const [favorites, setFavorites] = useState(() => {
    try { return JSON.parse(localStorage.getItem("mta-favorites") || "[]"); } catch { return []; }
  });
  const [scheduleRoute, setScheduleRoute] = useState(null);
  const [mobileSheet, setMobileSheet] = useState("arrivals");
  const [theme, setTheme] = useState(() => localStorage.getItem("mta-theme") || "dark");
  const [heatmapEnabled, setHeatmapEnabled] = useState(false);
  const [favoriteRoutes, setFavoriteRoutes] = useState(() => {
    try { return JSON.parse(localStorage.getItem("mta-favorite-routes") || "[]"); } catch { return []; }
  });
  const [activePanel, setActivePanel] = useState("arrivals");
  const [mapState, setMapState] = useState({ lat: 40.65, lng: -73.94, zoom: 12.5 });
  const [copied, setCopied] = useState(false);
  const searchRef = useRef(null);
  const routeInputRef = useRef(null);
  const notifTimersRef = useRef({});

  // Theme
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("mta-theme", theme);
  }, [theme]);

  // URL state - read on mount
  useEffect(() => {
    try {
      const hash = window.location.hash.slice(1);
      if (!hash) return;
      const params = new URLSearchParams(hash);
      const urlRoutes = params.get("routes")?.split(",").filter(Boolean);
      const urlLat = parseFloat(params.get("lat"));
      const urlLng = parseFloat(params.get("lng"));
      const urlZoom = parseFloat(params.get("zoom"));
      if (urlRoutes && urlRoutes.length > 0) setTrackedRoutes(urlRoutes);
      if (!isNaN(urlLat) && !isNaN(urlLng)) setMapState((s) => ({ ...s, lat: urlLat, lng: urlLng }));
      if (!isNaN(urlZoom)) setMapState((s) => ({ ...s, zoom: urlZoom }));
    } catch {}
  }, []);

  // URL state - write on changes
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("routes", trackedRoutes.join(","));
    params.set("lat", mapState.lat.toFixed(4));
    params.set("lng", mapState.lng.toFixed(4));
    params.set("zoom", mapState.zoom.toFixed(1));
    window.location.hash = params.toString();
  }, [trackedRoutes, mapState]);

  // Build color map
  const routeColors = useMemo(() => {
    const colors = { ...DEFAULT_COLORS };
    trackedRoutes.forEach((r, i) => {
      if (!colors[r]) colors[r] = getRouteColor(r, i);
    });
    return colors;
  }, [trackedRoutes]);

  // Persist tracked routes
  useEffect(() => {
    localStorage.setItem("mta-routes", JSON.stringify(trackedRoutes));
  }, [trackedRoutes]);

  // Persist favorite routes
  useEffect(() => {
    localStorage.setItem("mta-favorite-routes", JSON.stringify(favoriteRoutes));
  }, [favoriteRoutes]);

  const toggleRoute = (route) => {
    setVisibleRoutes((prev) =>
      prev.includes(route) ? prev.filter((r) => r !== route) : [...prev, route]
    );
  };

  const toggleFavoriteRoute = (route) => {
    setFavoriteRoutes((prev) =>
      prev.includes(route) ? prev.filter((r) => r !== route) : [...prev, route]
    );
  };

  const vehicleCounts = {};
  trackedRoutes.forEach((r) => { vehicleCounts[r] = 0; });
  vehicles.forEach((v) => { if (vehicleCounts[v.route] !== undefined) vehicleCounts[v.route]++; });

  const handleFitAll = () => {
    const mapEl = document.querySelector(".map-container");
    if (mapEl && mapEl._fitAllBuses) mapEl._fitAllBuses();
  };

  const handleGoToMe = () => {
    const mapEl = document.querySelector(".map-container");
    if (mapEl && mapEl._goToUserLocation) mapEl._goToUserLocation();
  };

  const handleShare = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Search
  const allStops = useMemo(() => {
    const result = [];
    Object.entries(routeStops).forEach(([route, s]) => {
      s.forEach((stop) => result.push({ ...stop, route }));
    });
    return result;
  }, [routeStops]);

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const q = searchQuery.toLowerCase();
    const matches = allStops.filter((s) =>
      s.name.toLowerCase().includes(q) || s.id.includes(q)
    );
    setSearchResults(matches);
  }, [searchQuery, allStops]);

  const handleSearchSelect = (stop) => {
    setVisibleRoutes((prev) => prev.includes(stop.route) ? prev : [...prev, stop.route]);
    const mapEl = document.querySelector(".map-container");
    if (mapEl && mapEl._zoomToStop) mapEl._zoomToStop(stop);
  };

  // Favorites
  const toggleFavorite = (stop) => {
    setFavorites((prev) => {
      const exists = prev.find((f) => f.stopId === stop.stopId && f.route === stop.route);
      const next = exists ? prev.filter((f) => !(f.stopId === stop.stopId && f.route === stop.route)) : [...prev, { stopId: stop.stopId, name: stop.name, route: stop.route }];
      localStorage.setItem("mta-favorites", JSON.stringify(next));
      return next;
    });
  };

  const isFav = (stop) => favorites.some((f) => f.stopId === stop.stopId && f.route === stop.route);

  const sortedStops = useMemo(() => {
    const fav = stops.filter((s) => isFav(s));
    const rest = stops.filter((s) => !isFav(s));
    return [...fav, ...rest];
  }, [stops, favorites]);

  // Notifications
  const requestNotifPermission = () => {
    if (typeof Notification !== "undefined") {
      Notification.requestPermission().then((p) => setNotifPermission(p));
    }
  };

  useEffect(() => {
    if (notifPermission !== "granted") return;
    stops.forEach((stop) => {
      stop.arrivals?.forEach((a) => {
        if (a.minutes === 2) {
          const key = `${stop.stopId}-${a.route}-${a.destination}`;
          if (!notifTimersRef.current[key]) {
            notifTimersRef.current[key] = true;
            new Notification(`${a.route} arriving in 2 min`, {
              body: `${stop.name} → ${a.destination}`,
              icon: "/favicon.svg",
            });
          }
        }
      });
    });
  }, [stops, notifPermission]);

  const handleScheduleClick = (route) => {
    setScheduleRoute(scheduleRoute === route ? null : route);
  };

  const routeSuggestions = useMemo(() => {
    if (!routeInput.trim()) return [];
    const q = routeInput.toUpperCase().trim();
    return MTA_ROUTES.filter((r) => r.startsWith(q) && !trackedRoutes.includes(r)).slice(0, 10);
  }, [routeInput, trackedRoutes]);

  // Add a new route
  const handleAddRoute = async () => {
    const input = routeInput.trim().toUpperCase();
    if (!input) return;
    await addRoute(input);
    setRouteInput("");
    setShowRouteSuggestions(false);
  };

  const handleAddRouteDirect = async (route) => {
    setRouteInput(route);
    setShowRouteSuggestions(false);
    await addRoute(route);
    setRouteInput("");
  };

  const addRoute = async (input) => {
    if (trackedRoutes.includes(input)) {
      setRouteError("Already tracking this route");
      setTimeout(() => setRouteError(""), 2000);
      return;
    }
    setAddingRoute(true);
    setRouteError("");
    try {
      const [polRes, stopRes] = await Promise.all([
        fetch(`/api/polylines/${input}`),
        fetch(`/api/stops/${input}`),
      ]);
      const polData = await polRes.json();
      const stopData = await stopRes.json();
      if (!polData.coordinates || polData.coordinates.length === 0) {
        setRouteError(`Route "${input}" not found`);
        setTimeout(() => setRouteError(""), 2000);
        setAddingRoute(false);
        return;
      }
      setPolylines((prev) => ({ ...prev, [input]: polData.coordinates }));
      setRouteStops((prev) => ({ ...prev, [input]: stopData.stops || [] }));
      setTrackedRoutes((prev) => [...prev, input]);
      setVisibleRoutes((prev) => [...prev, input]);
      setRouteInput("");
    } catch {
      setRouteError("Failed to add route");
      setTimeout(() => setRouteError(""), 2000);
    }
    setAddingRoute(false);
  };

  const handleRemoveRoute = (route) => {
    if (DEFAULT_ROUTES.includes(route)) return;
    setTrackedRoutes((prev) => prev.filter((r) => r !== route));
    setVisibleRoutes((prev) => prev.filter((r) => r !== route));
    setPolylines((prev) => { const n = { ...prev }; delete n[route]; return n; });
    setRouteStops((prev) => { const n = { ...prev }; delete n[route]; return n; });
  };

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      const routesQuery = trackedRoutes.join(",");
      const [alertsRes, stopsRes, vehiclesRes] = await Promise.all([
        fetch("/api/alerts"),
        fetch("/api/arrivals"),
        fetch(`/api/vehicles?routes=${encodeURIComponent(routesQuery)}`),
      ]);
      const alertsData = await alertsRes.json();
      const stopsData = await stopsRes.json();
      const vehiclesData = await vehiclesRes.json();
      setAlerts(alertsData.alerts || []);
      setStops(stopsData.stops || []);
      setVehicles(vehiclesData.vehicles || []);
      setLastRefresh(new Date());
    } catch (err) {
      console.error("Fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, [trackedRoutes]);

  const fetchPolylinesAndStops = useCallback(async () => {
    try {
      const results = await Promise.all(
        trackedRoutes.map(async (route) => {
          const [polRes, stopRes] = await Promise.all([
            fetch(`/api/polylines/${route}`),
            fetch(`/api/stops/${route}`),
          ]);
          const polData = await polRes.json();
          const stopData = await stopRes.json();
          return { route, polylines: polData.coordinates || [], stops: stopData.stops || [] };
        })
      );
      const pol = {};
      const stp = {};
      results.forEach((r) => { pol[r.route] = r.polylines; stp[r.route] = r.stops; });
      setPolylines(pol);
      setRouteStops(stp);
    } catch (err) {
      console.error("Polylines/stops fetch failed:", err);
    }
  }, [trackedRoutes]);

  useEffect(() => {
    setLoading(true);
    fetchData();
    fetchPolylinesAndStops();
    const dataInterval = setInterval(fetchData, DATA_REFRESH);
    const mapInterval = setInterval(fetchPolylinesAndStops, MAP_REFRESH);
    return () => { clearInterval(dataInterval); clearInterval(mapInterval); };
  }, [fetchData, fetchPolylinesAndStops]);

  // Close search on outside click
  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setShowSearch(false);
      if (routeInputRef.current && !routeInputRef.current.contains(e.target)) { setShowRouteSuggestions(false); setRouteError(""); }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filteredAlerts = activeRoute === "ALL" ? alerts : alerts.filter((a) => a.routes.includes(activeRoute));

  // Sort tracked routes: favorites first
  const sortedTrackedRoutes = useMemo(() => {
    const favs = trackedRoutes.filter((r) => favoriteRoutes.includes(r));
    const nonFavs = trackedRoutes.filter((r) => !favoriteRoutes.includes(r));
    return [...favs, ...nonFavs];
  }, [trackedRoutes, favoriteRoutes]);

  if (loading) {
    return (
      <div className="app">
        <div className="loading">
          <div className="spinner" />
          Loading bus status...
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <NotificationBanner permission={notifPermission} onRequest={requestNotifPermission} />

      <div className="header">
        <div className="header-left">
          <div className="mta-badge">MTA</div>
          <h1>Bus Status <span>/ {trackedRoutes.join(" · ")}</span></h1>
        </div>
        <div className="header-right">
          <div className="refresh-info">
            {lastRefresh && <>Updated {lastRefresh.toLocaleTimeString()}</>}
          </div>
          <button className="header-action-btn" onClick={handleShare} title="Share link">
            {copied ? "✓ Copied" : "🔗 Share"}
          </button>
          <button className="header-action-btn theme-toggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title="Toggle theme">
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>
      </div>

      {/* Map */}
      <div className="map-section">
        <div className="map-header">
          <div className="section-title" style={{ margin: 0 }}>Live Map</div>
          <div className="map-controls">
            <div className="search-container" ref={searchRef}>
              <input
                className="search-input"
                type="text"
                placeholder="Search stops..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setShowSearch(true); }}
                onFocus={() => setShowSearch(true)}
              />
              {showSearch && searchResults.length > 0 && (
                <SearchResults results={searchResults} onSelect={handleSearchSelect} onClose={() => { setShowSearch(false); setSearchQuery(""); }} routeColors={routeColors} />
              )}
            </div>
            <button className="fit-all-btn" onClick={handleGoToMe} title="My location">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></svg>
            </button>
            <button className="fit-all-btn" onClick={handleFitAll} title="Fit all buses">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>
              Fit All
            </button>
            <button className={`fit-all-btn ${heatmapEnabled ? "active" : ""}`} onClick={() => setHeatmapEnabled(!heatmapEnabled)} title="Toggle heatmap">
              🔥 Heat
            </button>
            <div className="map-route-toggles">
              {sortedTrackedRoutes.map((r) => (
                <button
                  key={r}
                  className={`route-toggle ${visibleRoutes.includes(r) ? "active" : ""}`}
                  style={{ "--route-color": routeColors[r] }}
                  onClick={() => toggleRoute(r)}
                >
                  <span className="route-dot" style={{ background: routeColors[r] }} />
                  <span className="route-fav-star" onClick={(e) => { e.stopPropagation(); toggleFavoriteRoute(r); }}>
                    {favoriteRoutes.includes(r) ? "★" : ""}
                  </span>
                  {r}
                  <span className="route-count">{vehicleCounts[r]}</span>
                  {!DEFAULT_ROUTES.includes(r) && (
                    <span className="route-remove" onClick={(e) => { e.stopPropagation(); handleRemoveRoute(r); }}>✕</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
        <BusMap
          vehicles={vehicles}
          polylines={polylines}
          stops={routeStops}
          alerts={alerts}
          visibleRoutes={visibleRoutes}
          trackedRoutes={trackedRoutes}
          routeColors={routeColors}
          heatmapEnabled={heatmapEnabled}
          onMapMove={setMapState}
        />
        <div className="map-legend">
          <span className="legend-item"><span className="legend-dot" style={{ background: "#22c55e" }} /> Fast</span>
          <span className="legend-item"><span className="legend-dot" style={{ background: "#f59e0b" }} /> Slow</span>
          <span className="legend-item"><span className="legend-dot" style={{ background: "#ef4444" }} /> Delayed</span>
          <span className="legend-item"><span className="legend-dot" style={{ background: "#888" }} /> Stop</span>
          <span className="legend-item"><span className="legend-line" style={{ background: "#3b82f6" }} /> Route</span>
          <span className="legend-item">{vehicles.length} buses</span>
        </div>
      </div>

      {/* Mobile tabs */}
      <div className="mobile-tabs">
        <button className={`mobile-tab ${mobileSheet === "arrivals" ? "active" : ""}`} onClick={() => setMobileSheet("arrivals")}>Arrivals</button>
        <button className={`mobile-tab ${mobileSheet === "departure" ? "active" : ""}`} onClick={() => setMobileSheet("departure")}>Board</button>
        <button className={`mobile-tab ${mobileSheet === "alerts" ? "active" : ""}`} onClick={() => setMobileSheet("alerts")}>Alerts ({filteredAlerts.length})</button>
        <button className={`mobile-tab ${mobileSheet === "calendar" ? "active" : ""}`} onClick={() => setMobileSheet("calendar")}>Calendar</button>
        <button className={`mobile-tab ${mobileSheet === "schedule" ? "active" : ""}`} onClick={() => setMobileSheet("schedule")}>Schedule</button>
      </div>

      {/* Add Route */}
      <div className="add-route-section">
        <div className="add-route-row" ref={routeInputRef}>
          <div className="add-route-input-wrap">
            <input
              className="add-route-input"
              type="text"
              placeholder="Add route (e.g. B44-SBS, BxM1, Q58)..."
              value={routeInput}
              onChange={(e) => { setRouteInput(e.target.value.toUpperCase()); setShowRouteSuggestions(true); }}
              onFocus={() => setShowRouteSuggestions(true)}
              onKeyDown={(e) => { if (e.key === "Enter") { if (routeSuggestions.length > 0) { handleAddRouteDirect(routeSuggestions[0]); } else { handleAddRoute(); } } if (e.key === "Escape") setShowRouteSuggestions(false); }}
              disabled={addingRoute}
            />
            {showRouteSuggestions && routeInput.trim() && routeSuggestions.length > 0 && (
              <div className="route-suggestions">
                {routeSuggestions.map((r) => (
                  <button key={r} className="route-suggestion" onClick={() => handleAddRouteDirect(r)}>
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="add-route-btn" onClick={handleAddRoute} disabled={addingRoute || !routeInput.trim()}>
            {addingRoute ? "..." : "+"}
          </button>
          {routeError && <div className="add-route-error">{routeError}</div>}
        </div>
        <div className="add-route-hint">SBS: B44-SBS · Express: BxM1, BM2 · Local: Q58, M15</div>
      </div>

      {/* Desktop route filter pills */}
      <div className="route-pills desktop-only">
        {["ALL", ...trackedRoutes].map((r) => (
          <button key={r} className={`route-pill ${activeRoute === r ? "active" : ""}`} onClick={() => setActiveRoute(r)}>
            {r === "ALL" ? "All Routes" : r}
          </button>
        ))}
      </div>

      {/* Content panels */}
      <div className={`content-panels ${mobileSheet}`}>
        <div className={`panel ${mobileSheet === "arrivals" ? "mobile-visible" : ""}`}>
          <div className="section-title">Live Arrivals {favorites.length > 0 && <span className="count">({favorites.length} starred)</span>}</div>
          <div className="arrivals-grid">
            {sortedStops.map((s) => (
              <StopCard key={`${s.stopId}-${s.route}`} stop={s} isFavorite={isFav(s)} onToggleFavorite={toggleFavorite} routeColors={routeColors} />
            ))}
          </div>
        </div>

        <div className={`panel ${mobileSheet === "departure" ? "mobile-visible" : ""}`}>
          <div className="section-title">Departure Board</div>
          <DepartureBoard stops={stops} routeColors={routeColors} trackedRoutes={trackedRoutes} activeRoute={activeRoute} />
        </div>

        <div className={`panel ${mobileSheet === "alerts" ? "mobile-visible" : ""}`}>
          <div className="section-title">Service Alerts <span className="count">({filteredAlerts.length})</span></div>
          {filteredAlerts.length === 0 ? (
            <div className="no-alerts">
              <div className="no-alerts-icon">&#10003;</div>
              <h3>No Active Alerts</h3>
              <p>All tracked routes are running normally</p>
            </div>
          ) : (
            <div className="alerts-grid">
              {filteredAlerts.map((a) => (
                <AlertCard key={a.id} alert={a} />
              ))}
            </div>
          )}
        </div>

        <div className={`panel ${mobileSheet === "calendar" ? "mobile-visible" : ""}`}>
          <div className="section-title">Service Calendar</div>
          <ServiceCalendar alerts={filteredAlerts} />
        </div>

        <div className={`panel ${mobileSheet === "schedule" ? "mobile-visible" : ""}`}>
          <div className="section-title">Route Schedule</div>
          <div className="schedule-route-buttons">
            {trackedRoutes.map((r) => (
              <button
                key={r}
                className={`schedule-route-btn ${scheduleRoute === r ? "active" : ""}`}
                style={{ "--route-color": routeColors[r] }}
                onClick={() => handleScheduleClick(r)}
              >
                <span className="route-dot" style={{ background: routeColors[r] }} />
                {r}
                <span className="route-count">{routeStops[r]?.length || 0} stops</span>
              </button>
            ))}
          </div>
          <SchedulePanel route={scheduleRoute} onClose={() => setScheduleRoute(null)} routeColors={routeColors} />
        </div>
      </div>

      <div className="footer">
        Data from MTA Bus Time API · Map polls every 15s · Auto-refreshes every 30s
      </div>
    </div>
  );
}
