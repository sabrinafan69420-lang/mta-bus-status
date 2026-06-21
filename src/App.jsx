import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import "./index.css";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || "";

const ROUTES = ["B6", "B8", "B15"];
const ROUTE_COLORS = { B6: "#3b82f6", B8: "#f59e0b", B15: "#10b981" };
const MAP_REFRESH = 15_000;
const DATA_REFRESH = 30_000;

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

// Speed-based color for bus markers
function speedColor(speed) {
  if (speed == null || speed <= 0) return null;
  if (speed < 5) return "#ef4444";
  if (speed < 15) return "#f59e0b";
  return "#22c55e";
}

// --- Bus SVG marker ---
function busSvg(color, bearing = 0) {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36"><g transform="rotate(${bearing}, 18, 18)"><circle cx="18" cy="18" r="16" fill="${color}" opacity="0.25"/><circle cx="18" cy="18" r="12" fill="${color}"/><rect x="9" y="6" width="18" height="24" rx="5" fill="${color}" stroke="white" stroke-width="2"/><rect x="12" y="9" width="12" height="9" rx="2" fill="white" opacity="0.9"/><circle cx="13" cy="24" r="2" fill="white"/><circle cx="23" cy="24" r="2" fill="white"/><polygon points="18,2 16,6 20,6" fill="white" opacity="0.8"/></g></svg>`)}`;
}

// --- Alert Card ---
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

// --- Arrival Row ---
function ArrivalRow({ arrival }) {
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
        {arrival.delay > 30 && (
          <div className="arrival-delay">+{Math.round(arrival.delay / 60)}m</div>
        )}
      </div>
    </div>
  );
}

// --- Stop Card ---
function StopCard({ stop, isFavorite, onToggleFavorite }) {
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
          <span className="stop-route-badge">{stop.route}</span>
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

// --- Bus Popup HTML ---
function busPopupHtml(v, color) {
  const progressLabel = {
    "in progress": "Moving",
    normalProgress: "Moving",
    delayed: "Delayed",
    "stopped at stop": "At Stop",
    "stopped at connection": "At Connection",
    "stopped before stop": "At Stop",
    "stopped on request": "On Request",
    "off route": "Off Route",
    noProgress: "Stopped",
    unknown: "Unknown",
  };
  const status = progressLabel[v.progressRate] || v.progressRate || "";
  const statusClass = v.progressRate === "delayed" ? "delayed"
    : v.progressRate === "noProgress" ? "stopped"
    : (v.progressRate === "in progress" || v.progressRate === "normalProgress") ? "active"
    : "";

  const progressStatusLabels = {
    layover: "Layover — waiting at terminal",
    spooking: "No GPS — following schedule",
    prevTrip: "Serving previous trip",
  };
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
          <span class="bus-popup-stop-dist">${s.distance || (s.stopsAway != null ? s.stopsAway + " stops" : "—")}</span>
        </div>
      `).join("")}
    </div>
  ` : "";

  return `<div class="bus-popup-card">
    <div class="bus-popup-header" style="background:${color}">
      <span class="bus-popup-route">${v.route}</span>
      <span class="bus-popup-vehicle">#${v.id}</span>
    </div>
    <div class="bus-popup-body">
      <div class="bus-popup-row"><span class="bus-popup-label">Direction</span><span>${v.direction}</span></div>
      <div class="bus-popup-row"><span class="bus-popup-label">Destination</span><span>${v.destination || "—"}</span></div>
      ${v.speed != null ? `<div class="bus-popup-row"><span class="bus-popup-label">Speed</span><span>${Math.round(v.speed)} mph</span></div>` : ""}
      ${status ? `<div class="bus-popup-row"><span class="bus-popup-label">Status</span><span class="${statusClass}">${status}</span></div>` : ""}
      ${pStatus ? `<div class="bus-popup-row bus-popup-note"><span>${pStatus}</span></div>` : ""}
      ${occupancy ? `<div class="bus-popup-row"><span class="bus-popup-label">Crowding</span><span>${occupancy}</span></div>` : ""}
      ${stopsHtml}
    </div>
  </div>`;
}

// --- Search Results ---
function SearchResults({ results, onSelect, onClose }) {
  if (!results || results.length === 0) return null;
  return (
    <div className="search-results">
      {results.slice(0, 8).map((r) => (
        <button
          key={`${r.route}-${r.id}`}
          className="search-result"
          onClick={() => { onSelect(r); onClose(); }}
        >
          <span className="search-result-route" style={{ background: ROUTE_COLORS[r.route] }}>{r.route}</span>
          <span className="search-result-name">{r.name}</span>
          <span className="search-result-id">{r.id}</span>
        </button>
      ))}
    </div>
  );
}

// --- Schedule Panel ---
function SchedulePanel({ route, onClose }) {
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!route) return;
    setLoading(true);
    fetch(`/api/stops/${route}`)
      .then((r) => r.json())
      .then((data) => {
        setSchedule(data.stops || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [route]);

  if (!route) return null;

  return (
    <div className="schedule-panel">
      <div className="schedule-header">
        <span className="schedule-route" style={{ background: ROUTE_COLORS[route] }}>{route}</span>
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

// --- Notification Banner ---
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
function BusMap({ vehicles, polylines, stops, alerts, visibleRoutes, onSelectStop }) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const popupRef = useRef(null);
  const mapReadyRef = useRef(false);
  const userMarkerRef = useRef(null);

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
    map.on("load", () => { mapReadyRef.current = true; });
    return () => map.remove();
  }, []);

  const removeLayerSafe = useCallback((map, layerId, sourceId) => {
    try {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    } catch {}
  }, []);

  // Update polylines with glow effect
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    ROUTES.forEach((route) => {
      const sourceId = `route-${route}`;
      const layerGlow = `route-glow-${route}`;
      const layerLine = `route-layer-${route}`;
      const visible = visibleRoutes.includes(route);
      removeLayerSafe(map, layerGlow, null);
      removeLayerSafe(map, layerLine, sourceId);
      const routeCoords = polylines[route];
      if (!routeCoords || routeCoords.length === 0) return;
      map.addSource(sourceId, {
        type: "geojson",
        data: { type: "Feature", properties: { route }, geometry: { type: "LineString", coordinates: routeCoords } },
      });
      map.addLayer({
        id: layerGlow, type: "line", source: sourceId,
        layout: { visibility: visible ? "visible" : "none" },
        paint: { "line-color": ROUTE_COLORS[route], "line-width": 10, "line-opacity": 0.15, "line-blur": 6 },
      });
      map.addLayer({
        id: layerLine, type: "line", source: sourceId,
        layout: { visibility: visible ? "visible" : "none" },
        paint: { "line-color": ROUTE_COLORS[route], "line-width": 3.5, "line-opacity": 0.85 },
      });
    });
  }, [polylines, visibleRoutes, removeLayerSafe]);

  // Update stop markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    Object.keys(markersRef.current).forEach((key) => {
      if (key.startsWith("stop-")) {
        markersRef.current[key].remove();
        delete markersRef.current[key];
      }
    });
    ROUTES.forEach((route) => {
      if (!visibleRoutes.includes(route)) return;
      const routeStops = stops[route] || [];
      routeStops.forEach((stop) => {
        if (stop.lat == null || stop.lon == null) return;
        const el = document.createElement("div");
        el.className = "stop-marker";
        el.style.cssText = `width:7px;height:7px;border-radius:50%;background:${ROUTE_COLORS[route]};border:1.5px solid rgba(255,255,255,0.8);cursor:pointer;transition:box-shadow 0.15s,opacity 0.15s;transform-origin:center center;`;
        el.addEventListener("mouseenter", () => {
          el.style.boxShadow = `0 0 0 3px ${ROUTE_COLORS[route]}80`;
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
                    return `<div class="stop-arrival-row">
                      <span class="stop-arrival-mins ${mc}">${ml}${a.minutes > 0 ? '<span class="stop-arrival-unit">min</span>' : ''}</span>
                      <span class="stop-arrival-dest">${a.destination}</span>
                      <span class="stop-arrival-dir">${a.direction}</span>
                      ${a.stopsAway != null ? `<span class="stop-arrival-stops">${a.stopsAway} stops</span>` : ''}
                      ${a.delay > 30 ? `<span class="stop-arrival-delay">+${Math.round(a.delay / 60)}m</span>` : ''}
                    </div>`;
                  }).join("");
              popup.setHTML(`<div class="stop-popup"><b>${stop.name}</b><br/><span class="stop-popup-id">${stop.id}</span> <span class="stop-popup-route">${route}</span><div class="stop-arrivals">${arrivalsHtml}</div></div>`);
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
  }, [stops, visibleRoutes]);

  // Update bus markers — speed coloring + smooth transitions
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    vehicles.forEach((v) => {
      if (v.lat == null || v.lon == null) return;
      if (!visibleRoutes.includes(v.route)) return;
      const key = `bus-${v.id}`;
      const sColor = speedColor(v.speed);
      const color = sColor || ROUTE_COLORS[v.route] || "#888";
      if (markersRef.current[key]) {
        const marker = markersRef.current[key];
        marker.setLngLat([v.lon, v.lat], { duration: 1400 });
        const el = marker.getElement();
        const newBg = `url("${busSvg(color, v.bearing)}")`;
        if (el.style.backgroundImage !== newBg) el.style.backgroundImage = newBg;
        if (popupRef.current && popupRef.current._busId === v.id) popupRef.current.setLngLat([v.lon, v.lat]);
        return;
      }
      const el = document.createElement("div");
      el.className = "bus-marker";
      el.style.cssText = "width:36px;height:36px;cursor:pointer;transition:filter 0.2s;transform-origin:center center;";
      el.style.backgroundImage = `url("${busSvg(color, v.bearing)}")`;
      el.style.backgroundSize = "contain";
      el.style.backgroundRepeat = "no-repeat";
      el.addEventListener("mouseenter", () => { el.style.filter = `brightness(1.3) drop-shadow(0 0 6px ${color})`; });
      el.addEventListener("mouseleave", () => { el.style.filter = "none"; });
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        if (popupRef.current) popupRef.current.remove();
        const popup = new mapboxgl.Popup({ offset: 16, className: "bus-popup" })
          .setLngLat([v.lon, v.lat])
          .setHTML(busPopupHtml(v, ROUTE_COLORS[v.route] || "#888"))
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
        if (!vehicles.find((v) => String(v.id) === String(id))) {
          markersRef.current[key].remove();
          delete markersRef.current[key];
        }
      }
    });
  }, [vehicles, visibleRoutes]);

  // Fit bounds
  const fitAllBuses = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const visible = vehicles.filter((v) => v.lat && v.lon && visibleRoutes.includes(v.route));
    if (visible.length === 0) return;
    const bounds = new mapboxgl.LngLatBounds();
    visible.forEach((v) => bounds.extend([v.lon, v.lat]));
    map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 800 });
  }, [vehicles, visibleRoutes]);

  // Geolocation
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

  // Zoom to stop (for search)
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
                return `<div class="stop-arrival-row">
                  <span class="stop-arrival-mins ${mc}">${ml}${a.minutes > 0 ? '<span class="stop-arrival-unit">min</span>' : ''}</span>
                  <span class="stop-arrival-dest">${a.destination}</span>
                  <span class="stop-arrival-dir">${a.direction}</span>
                  ${a.stopsAway != null ? `<span class="stop-arrival-stops">${a.stopsAway} stops</span>` : ''}
                  ${a.delay > 30 ? `<span class="stop-arrival-delay">+${Math.round(a.delay / 60)}m</span>` : ''}
                </div>`;
              }).join("");
          popup.setHTML(`<div class="stop-popup"><b>${stop.name}</b><br/><span class="stop-popup-id">${stop.id}</span> <span class="stop-popup-route">${stop.route}</span><div class="stop-arrivals">${arrivalsHtml}</div></div>`);
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
  const [alerts, setAlerts] = useState([]);
  const [stops, setStops] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [polylines, setPolylines] = useState({});
  const [routeStops, setRouteStops] = useState({});
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [activeRoute, setActiveRoute] = useState("ALL");
  const [visibleRoutes, setVisibleRoutes] = useState([...ROUTES]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [showSearch, setShowSearch] = useState(false);
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "denied"
  );
  const [favorites, setFavorites] = useState(() => {
    try { return JSON.parse(localStorage.getItem("mta-favorites") || "[]"); } catch { return []; }
  });
  const [activePanel, setActivePanel] = useState("arrivals");
  const [scheduleRoute, setScheduleRoute] = useState(null);
  const [mobileSheet, setMobileSheet] = useState("arrivals");
  const searchRef = useRef(null);
  const notifTimersRef = useRef({});

  const toggleRoute = (route) => {
    setVisibleRoutes((prev) =>
      prev.includes(route) ? prev.filter((r) => r !== route) : [...prev, route]
    );
  };

  const vehicleCounts = {};
  ROUTES.forEach((r) => { vehicleCounts[r] = 0; });
  vehicles.forEach((v) => { if (vehicleCounts[v.route] !== undefined) vehicleCounts[v.route]++; });

  const handleFitAll = () => {
    const mapEl = document.querySelector(".map-container");
    if (mapEl && mapEl._fitAllBuses) mapEl._fitAllBuses();
  };

  const handleGoToMe = () => {
    const mapEl = document.querySelector(".map-container");
    if (mapEl && mapEl._goToUserLocation) mapEl._goToUserLocation();
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

  // Sort stops: favorites first
  const sortedStops = useMemo(() => {
    const fav = stops.filter((s) => isFav(s));
    const rest = stops.filter((s) => !isFav(s));
    return [...fav, ...rest];
  }, [stops, favorites]);

  // Browser notifications
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

  // Schedule
  const handleScheduleClick = (route) => {
    setScheduleRoute(scheduleRoute === route ? null : route);
  };

  const fetchData = useCallback(async () => {
    try {
      const [alertsRes, stopsRes, vehiclesRes] = await Promise.all([
        fetch("/api/alerts"),
        fetch("/api/arrivals"),
        fetch("/api/vehicles"),
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
  }, []);

  const fetchPolylinesAndStops = useCallback(async () => {
    try {
      const results = await Promise.all(
        ROUTES.map(async (route) => {
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
      setMapLoaded(true);
    } catch (err) {
      console.error("Polylines/stops fetch failed:", err);
      setMapLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchPolylinesAndStops();
    const dataInterval = setInterval(fetchData, DATA_REFRESH);
    const mapInterval = setInterval(fetchData, MAP_REFRESH);
    return () => { clearInterval(dataInterval); clearInterval(mapInterval); };
  }, [fetchData, fetchPolylinesAndStops]);

  // Close search on outside click
  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setShowSearch(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filteredAlerts = activeRoute === "ALL" ? alerts : alerts.filter((a) => a.routes.includes(activeRoute));

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
      {/* Notification Banner */}
      <NotificationBanner permission={notifPermission} onRequest={requestNotifPermission} />

      {/* Header */}
      <div className="header">
        <div className="header-left">
          <div className="mta-badge">MTA</div>
          <h1>Bus Status <span>/ B6 · B8 · B15</span></h1>
        </div>
        <div className="refresh-info">
          {lastRefresh && <>Updated {lastRefresh.toLocaleTimeString()}</>}
        </div>
      </div>

      {/* Map */}
      <div className="map-section">
        <div className="map-header">
          <div className="section-title" style={{ margin: 0 }}>Live Map</div>
          <div className="map-controls">
            {/* Search */}
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
                <SearchResults results={searchResults} onSelect={handleSearchSelect} onClose={() => { setShowSearch(false); setSearchQuery(""); }} />
              )}
            </div>
            <button className="fit-all-btn" onClick={handleGoToMe} title="My location">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></svg>
            </button>
            <button className="fit-all-btn" onClick={handleFitAll} title="Fit all buses">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>
              Fit All
            </button>
            <div className="map-route-toggles">
              {ROUTES.map((r) => (
                <button
                  key={r}
                  className={`route-toggle ${visibleRoutes.includes(r) ? "active" : ""}`}
                  style={{ "--route-color": ROUTE_COLORS[r] }}
                  onClick={() => toggleRoute(r)}
                >
                  <span className="route-dot" style={{ background: ROUTE_COLORS[r] }} />
                  {r}
                  <span className="route-count">{vehicleCounts[r]}</span>
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
        />
        <div className="map-legend">
          <span className="legend-item"><span className="legend-dot" style={{ background: "#22c55e" }} /> Fast</span>
          <span className="legend-item"><span className="legend-dot" style={{ background: "#f59e0b" }} /> Slow</span>
          <span className="legend-item"><span className="legend-dot" style={{ background: "#ef4444" }} /> Stopped</span>
          <span className="legend-item"><span className="legend-dot" style={{ background: "#888" }} /> Stop</span>
          <span className="legend-item"><span className="legend-line" style={{ background: "#3b82f6" }} /> Route</span>
          <span className="legend-item">{vehicles.length} buses</span>
        </div>
      </div>

      {/* Mobile bottom sheet tabs */}
      <div className="mobile-tabs">
        <button className={`mobile-tab ${mobileSheet === "arrivals" ? "active" : ""}`} onClick={() => setMobileSheet("arrivals")}>Arrivals</button>
        <button className={`mobile-tab ${mobileSheet === "alerts" ? "active" : ""}`} onClick={() => setMobileSheet("alerts")}>Alerts ({filteredAlerts.length})</button>
        <button className={`mobile-tab ${mobileSheet === "schedule" ? "active" : ""}`} onClick={() => setMobileSheet("schedule")}>Schedule</button>
      </div>

      {/* Desktop route filter pills */}
      <div className="route-pills desktop-only">
        {["ALL", ...ROUTES].map((r) => (
          <button key={r} className={`route-pill ${activeRoute === r ? "active" : ""}`} onClick={() => setActiveRoute(r)}>
            {r === "ALL" ? "All Routes" : r}
          </button>
        ))}
      </div>

      {/* Content panels */}
      <div className={`content-panels ${mobileSheet}`}>
        {/* Arrivals */}
        <div className={`panel ${mobileSheet === "arrivals" ? "mobile-visible" : ""}`}>
          <div className="section-title">Live Arrivals {favorites.length > 0 && <span className="count">({favorites.length} starred)</span>}</div>
          <div className="arrivals-grid">
            {sortedStops.map((s) => (
              <StopCard key={`${s.stopId}-${s.route}`} stop={s} isFavorite={isFav(s)} onToggleFavorite={toggleFavorite} />
            ))}
          </div>
        </div>

        {/* Alerts */}
        <div className={`panel ${mobileSheet === "alerts" ? "mobile-visible" : ""}`}>
          <div className="section-title">
            Service Alerts <span className="count">({filteredAlerts.length})</span>
          </div>
          <div className="desktop-only">
            <div className="route-pills">
              {["ALL", ...ROUTES].map((r) => (
                <button key={r} className={`route-pill ${activeRoute === r ? "active" : ""}`} onClick={() => setActiveRoute(r)}>
                  {r === "ALL" ? "All Routes" : r}
                </button>
              ))}
            </div>
          </div>
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

        {/* Schedule */}
        <div className={`panel ${mobileSheet === "schedule" ? "mobile-visible" : ""}`}>
          <div className="section-title">Route Schedule</div>
          <div className="schedule-route-buttons">
            {ROUTES.map((r) => (
              <button
                key={r}
                className={`schedule-route-btn ${scheduleRoute === r ? "active" : ""}`}
                style={{ "--route-color": ROUTE_COLORS[r] }}
                onClick={() => handleScheduleClick(r)}
              >
                <span className="route-dot" style={{ background: ROUTE_COLORS[r] }} />
                {r}
                <span className="route-count">{routeStops[r]?.length || 0} stops</span>
              </button>
            ))}
          </div>
          <SchedulePanel route={scheduleRoute} onClose={() => setScheduleRoute(null)} />
        </div>
      </div>

      <div className="footer">
        Data from MTA Bus Time API · Map polls every 15s · Auto-refreshes every 30s
      </div>
    </div>
  );
}
