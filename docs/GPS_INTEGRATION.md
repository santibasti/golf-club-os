# Cart GPS tracking — integration guide

**Demo:** positions are *simulated* from flight progress (`lib/services/tracking.ts`). Nothing in the demo talks to hardware.
**Production:** only the *source* of positions changes; the map, alerts and UI consume the `CartTrack` shape.

## Architecture
```
[Cart tracker (GPS + 4G/LoRa)] → [Vendor platform / webhook or MQTT] → [Ingest endpoint (Route Handler / Edge Function)]
        → cart_positions (append-only, partitioned by day)  →  cart_latest_position (view / materialised)
        → Supabase Realtime  →  Course Map (`components/course-map.tsx`) + alerts (`lib/services/alerts.ts`)
```
1. **Hardware**: buy vendor-supported golf-cart/fleet GPS units (one per cart, powered from the cart battery). Do **not** build hardware. Ask vendors for: webhook/API/MQTT access to raw positions, ping interval (e.g. 5–10 s on course, slower in the barn), accuracy, outage buffering, geofence support, SIM/data plan, local support, and **per-cart cost + monthly fee**.
2. **Coverage**: tree cover and terrain affect signal. Survey the course; pilot on 4–5 carts for 2–4 weeks before a fleet rollout (consider gateways/base stations if the vendor uses LoRa).
3. **Ingest**: authenticate each device/webhook (per-club secret, tenant-scoped), validate and de-duplicate, store raw + latest. Map device → `golf_carts` through `cart_trackers`.
4. **Replace** `cartTrack(db, cart)` with a read of the latest position row; keep `pathAt()`/hole detection (point-in-polygon on hole polygons, PostGIS `ST_Contains`) to derive the *current hole*.
5. **Geofencing / alerts** (already modelled): cart on a restricted/closed hole, cart overdue past expected finish, low battery, cart out of coverage (no ping > N minutes), cart leaving the property. Optional vendor features (speed limit, auto-stop near greens/restricted areas) are a later phase and need safety review.

## Suggested schema (also in `schema.sql`)
```sql
create table cart_trackers (id uuid primary key default gen_random_uuid(), club_id uuid not null references clubs, cart_id uuid references golf_carts, device_id text not null, vendor text, installed_at timestamptz, active boolean default true, unique (club_id, device_id));
create table cart_positions (club_id uuid not null references clubs, cart_id uuid not null references golf_carts, at timestamptz not null, lat double precision not null, lng double precision not null, speed_kmh real, heading real, accuracy_m real, battery_pct real, hole int, primary key (cart_id, at)) partition by range (at);
```
## Privacy & compliance (Philippine Data Privacy Act — get legal advice)
* Location of a cart assigned to a named member/golfer is **personal data**. Track the *cart*, show positions to authorised staff only, and disclose it (signage + membership terms/consent).
* Keep raw trails for a short, defined period (e.g. 30–90 days), then aggregate; restrict export; log who views live positions.
* Do not track caddies/staff personally without a policy; avoid exposing member positions in the golfer portal.

## Rollout plan
Phase 1 pilot (fleet visibility only) → Phase 2 alerts (restricted holes, overdue, battery) → Phase 3 pace-of-play analytics → Phase 4 optional golfer features (distance-to-pin, on-course food ordering linked to the café tab) and vendor geofence enforcement.
