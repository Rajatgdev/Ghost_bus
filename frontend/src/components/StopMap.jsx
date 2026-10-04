import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

// Markers sit on the SCHEDULED reference stop — never a fabricated bus position.
// An unmatched trip has no vehicle, so it has no location of its own.
const COLOR = { unmatched: "#e5594c", vehicle_observed: "#5fa877", predicted_delayed: "#d8b04a",
  watch: "#8b9098", data_unusable: "#d8b04a" };
const DUBLIN = [53.3498, -6.2603];

function FitToPins({ pts }) {
  const map = useMap();
  const key = pts.map((a) => a.instance.trip_id).join("|");
  useEffect(() => {
    if (pts.length > 1) map.fitBounds(pts.map((a) => [a.instance.ref_stop_lat, a.instance.ref_stop_lon]), { padding: [30, 30], maxZoom: 14 });
    else if (pts.length === 1) map.setView([pts[0].instance.ref_stop_lat, pts[0].instance.ref_stop_lon], 14);
  }, [key]);
  return null;
}

export default function StopMap({ rows, selected, onSelect }) {
  const pts = rows.filter((a) => a.instance.ref_stop_lat != null && a.instance.ref_stop_lon != null);
  return (
    <figure className="map">
      <MapContainer center={DUBLIN} zoom={11} scrollWheelZoom={false} className="map-inner">
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
        />
        <FitToPins pts={pts} />
        {/* draw unmatched last so it sits on top */}
        {[...pts].sort((a) => (a.assessment === "unmatched" ? 1 : -1)).map((a) => {
          const id = a.instance.trip_id;
          const bad = a.assessment === "unmatched";
          return (
            <CircleMarker key={id}
              center={[a.instance.ref_stop_lat, a.instance.ref_stop_lon]}
              radius={bad ? 10 : selected === id ? 8 : 6}
              pathOptions={{ color: COLOR[a.assessment] || "#8b9098", weight: selected === id ? 3 : 1.5,
                fillOpacity: bad ? 0.75 : 0.45 }}
              eventHandlers={{ click: () => onSelect(id) }}>
              <Tooltip direction="top">
                <b>{a.instance.route_short_name}</b> {a.instance.start_time} · {a.instance.ref_stop_name}
                <br />{bad ? "Unmatched — no vehicle on this trip" : a.assessment.replace(/_/g, " ")}
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
      <figcaption>
        Pins mark each trip's scheduled stop, not a bus position.
        {pts.length < rows.length && ` ${rows.length - pts.length} trip(s) have no stop location and appear in the list only.`}
      </figcaption>
    </figure>
  );
}
