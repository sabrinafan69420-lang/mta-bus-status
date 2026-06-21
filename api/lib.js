import fetch from "node-fetch";
import protobuf from "gtfs-realtime-bindings";
import polyline from "@mapbox/polyline";

export const API_KEY = process.env.MTA_BUSTIME_KEY || "";
export const SIRI_BASE = "https://bustime-classic.mta.info/api";

export const FAVORITES = [
  { stopId: "300833", name: "AVENUE D/NOSTRAND AV", route: "B8" },
  { stopId: "308313", name: "ROCKAWAY AV/HEGEMAN AV", route: "B8" },
  { stopId: "301128", name: "E 98 ST/CHURCH AV", route: "B15" },
  { stopId: "301034", name: "FOUNTAIN AV/LINDEN BLVD", route: "B15" },
  { stopId: "300590", name: "Cozine Av/Ashford St", route: "B6" },
  { stopId: "300541", name: "Glenwood RD/Nostrand Av", route: "B6" },
];

export const DEFAULT_ROUTES = ["B6", "B8", "B15"];

export function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
}

export async function fetchJSON(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchBuffer(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.buffer();
  } finally {
    clearTimeout(timer);
  }
}

export { protobuf, polyline };
