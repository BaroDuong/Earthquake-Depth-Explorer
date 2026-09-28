# Earthquake Depth Explorer

An interactive earthquake explorer built from [Global Quake Monitor by Vor7reX](https://github.com/Vor7reX/Global-Quake-Monitor). The original project provides a Globe.gl / Three.js view of earthquakes on Earth's surface. This project extends that view into a tool for examining hypocenters beneath the surface.

## What this project adds

| Original Global Quake Monitor | Earthquake Depth Explorer extension |
| --- | --- |
| Interactive globe showing earthquake locations and magnitude | Keeps the globe as geographic context and links it to two analysis views |
| Surface view of events | Rotatable 3D hypocenter volume with east–west, north–south, and downward depth axes in km, a 0 km reference plane, and labeled depth exaggeration |
| Globe-focused inspection | 2D top-down projection of the same events, so surface overlap can be compared with depth separation |
| Live USGS earthquake feed | Shared date, magnitude, and depth filters; synchronized event count and selection across all three views; saved global snapshot for repeatable demos |
| Global display | Searchable country/area focus using mapped Natural Earth boundaries and nearby offshore events |

The main analytical question is whether earthquakes that appear close together on a surface map occur at similar depths. The 3D volume can reveal depth groups hidden by the 2D projection; it does not by itself prove a geological cause.

## Original work and MIT license

This repository is a **modified version** of Vor7reX's [Global Quake Monitor](https://github.com/Vor7reX/Global-Quake-Monitor), not the original repository. The original author and MIT copyright notice remain in [LICENSE.md](LICENSE.md). The table above identifies the main functionality developed for this extension; the original globe concept and assets are credited to Vor7reX.

The MIT license permits using, modifying, publishing, and redistributing the original software, including as part of this project, provided copies or substantial portions retain the original copyright and permission notice. It also supplies the software without warranty. See the [full license text](LICENSE.md). USGS earthquake data and Natural Earth boundaries have separate source and usage information below.

## Run the app

The browser needs WebGL and an internet connection to load Three.js and Globe.gl from CDNs. The latest-data mode also needs access to USGS. The saved GeoJSON snapshots work when the USGS feed is unavailable.

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`. Do not open `index.html` with `file://`, because browsers may block the local GeoJSON request.

## Data modes

| Mode | Data | Behavior |
| --- | --- | --- |
| **Latest feed** (default) | [USGS M4.5+ past-month GeoJSON feed](https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson) | Shows all reported events worldwide by default, or filters them to the selected country's mapped boundary and nearby area. Refreshes every five minutes; the header refresh icon also updates it on demand. Hover or focus on that icon to see the source and update time. |
| **Global demo** | [`data/global-4.5-month.geojson`](data/global-4.5-month.geojson) | Saved 500-event M4.5+ global feed generated 27 September 2026 at 22:53 UTC. Supports the worldwide view and every country/area. Used automatically if the first live request fails. Open the app with `?demo=1` to load this fixed dataset for a presentation. |

The latest feed is **near real time**, not a continuous sensor stream. New earthquakes appear after USGS publishes them. The browser only refreshes while the page is open. If the initial live request fails, the app loads the saved global snapshot and says so in the refresh icon's tooltip. A failed later refresh keeps the previous data visible. Clicking the icon while viewing the demo snapshot retries the live feed. All event dates and filter dates use UTC.

Events without usable magnitude, coordinates, time, or nonnegative depth are excluded.

## Countries and areas

The searchable area picker starts with **All countries / worldwide** and offers **242 countries and areas** in a scrollable list from the local [`data/countries-50m.geojson`](data/countries-50m.geojson), a compact copy of [Natural Earth 1:50m Admin 0 Countries](https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries-2/). The Natural Earth dataset is [public domain](https://www.naturalearthdata.com/about/terms-of-use/). The local copy keeps names, identifiers, simplified coordinates rounded to four decimal places, and derived focus windows.

The information icon beside **Study area** explains the current area's spatial coverage on hover or keyboard focus.

The worldwide view sends the complete filtered global dataset to the globe, 3D volume, and 2D projection. Selecting a country highlights its **actual mapped polygon boundary** on the globe. Events are included when their epicenter lies inside that polygon or within 200 km of its boundary, allowing nearby offshore earthquakes. This buffer can also include some events just across a land border. The rectangular extent only sets the 2D/3D coordinate frame and camera; it no longer determines which earthquakes belong to the area or appears as a globe outline. Some countries may have zero M4.5+ events in the current month; the empty state is expected. Switching areas reuses the global dataset already loaded in the page.

## How the views encode data

- The horizontal axes use a simple projection centered on the active focus window: north–south = latitude difference × 111.32 km; east–west = longitude difference × 111.32 × cos(center latitude) km. Longitudes are unwrapped around that center for areas crossing the date line. The worldwide view uses 0° latitude as its center. This flat worldwide projection is approximate and is intended for context; choose a country for meaningful local depth analysis. The 3D frame and camera rescale when the area changes.
- The vertical axis shows hypocenter depth in kilometers, increasing downward. The top plane is 0 km. **Displayed depth is exaggerated ×60 worldwide and ×3 for countries/areas** relative to the horizontal axes. The active factor is shown in the interface.
- **All three views use the same depth colors:** 0–<70 km, 70–300 km, and >300 km. Only the selected event turns white.
- In the **Overview globe**, columns become substantially wider and taller as magnitude rises; an approximate M4.5/M6/M8 size guide appears below the globe. Column height represents magnitude, never depth. In the **3D volume**, sphere radius grows more visibly with magnitude, with its own approximate M4.5/M6/M8 guide; vertical position represents depth. Selection changes color and size but **never moves the point away from its measured depth**.
- The globe, 3D volume, and 2D projection always receive the same filtered events.

## Demo tasks

1. **T1 — Filter:** start with all countries, then choose a country/area or change date, magnitude, or depth ranges. Try 300–700 km, then 0–70 km. The count and all three views update together.
2. **T2 — Explore:** drag and scroll the 3D volume; switch between 3D, top, and side views; reset the camera. The globe supports rotation and zoom, with automatic rotation disabled.
3. **T3 — Inspect:** select a point in any view to see magnitude, depth, UTC time, coordinates, and its USGS event link in the left sidebar. The detail card appears only while an event is selected. The same event is highlighted in every view. Selecting in the 3D volume or 2D projection turns the globe to the event while preserving its zoom. Click the selected point again or use **Clear selection** to deselect it. Selection also clears if filters remove that event.

The 2D projection makes surface clusters easy to see. The 3D volume helps assess whether nearby points on the map have similar depths and whether a cluster extends into a depth band. An empty result shows a clear message.

## Scope and attribution

The app includes all 242 entries in the bundled Natural Earth dataset. Timeline animation and VR are possible follow-up work. If a course requires a VR headset, confirm that requirement with the instructor. The visualization uses USGS reported values and does not itself establish geological structure.

Original application and Earth texture: [Vor7reX / Global-Quake-Monitor](https://github.com/Vor7reX/Global-Quake-Monitor). Earthquake data: [USGS](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php). Boundaries: [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/).
