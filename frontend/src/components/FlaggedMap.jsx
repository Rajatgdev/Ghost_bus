import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

// Only the flagged trips, pinned at the scheduled stop they were due at.
// An unmatched trip has no vehicle, so a pin is never a bus position.
const DUBLIN = [53.3498, -6.2603];

function Fit({ pts }) {
  const map = useMap();
  const key = pts.map((p) => p.id).join("|");
  useEffect(() => {
    if (pts.length > 1) map.fitBounds(pts.map((p) => [p.lat, p.lon]), { padding: [36, 36], maxZoom: 14 });
    else if (pts.length === 1) map.setView([pts[0].lat, pts[0].lon], 14);
  }, [key]);
  return null;
}

export default function FlaggedMap({ assessments, onPick }) {
  const pts = assessments
    .filter((a) => a.assessment === "unmatched" && a.instance.ref_stop_lat != null && a.instance.ref_stop_lon != null)
    .map((a) => ({ id: a.instance.trip_id, route: a.instance.route_short_name, time: a.instance.start_time?.slice(0, 5),
      stop: a.instance.ref_stop_name, lat: a.instance.ref_stop_lat, lon: a.instance.ref_stop_lon }));
  if (!pts.length) return null;

  return (
    <section className="mapcard" aria-label="Where flagged trips were due">
      <div className="mapcard-head">
        <h2>Where they were due</h2>
        <span>Each pin is the scheduled stop, not a bus location.</span>
      </div>
      <MapContainer center={DUBLIN} zoom={11} scrollWheelZoom={false} className="mapcard-map">
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={19}
        />
        <Fit pts={pts} />
        {pts.map((p) => (
          <CircleMarker key={p.id} center={[p.lat, p.lon]} radius={8}
            pathOptions={{ color: "#ffffff", weight: 2, fillColor: "#b42318", fillOpacity: 0.95 }}
            eventHandlers={{ click: () => onPick?.(p.route) }}>
            <Tooltip direction="top" offset={[0, -6]}>
              <b>{p.route}</b> · {p.time} · {p.stop}
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </section>
  );
}
