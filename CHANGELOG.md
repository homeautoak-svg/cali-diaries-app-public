# Changelog

## 1.2.0 (10.10.2026)

- Season planner: new "Season" view under Trips with one timeline per month, all trips by
  status and a school holiday band. Pick a place from the wish list to see free gaps with at
  least its minimum nights (green: quiet, yellow: busy). Tap a gap or month, choose the arrival
  day and adjust the nights; hints show overlaps, too few nights, public and school holidays,
  the booking window and the driving distance.
- Trip status: idea, requested or confirmed. Unconfirmed trips are shown dashed and never
  become "on the road" or "no report yet". Existing trips are migrated as confirmed. Trips keep
  the booking window from the wish list, and the booking reminder on the overview covers them.
- School and public holidays from the OpenHolidays API (openholidaysapi.org), fetched by the
  server and cached per country and year for 30 days. Countries are configurable in the
  settings (default CH, DE, AT). Tap a day in the calendar to see who is on holiday.
- Wish list: new field for the minimum number of nights.
- Trips can no longer overlap: occupied days cannot be picked in the season planner, and saving
  is blocked in the planner and the trip form while the dates overlap another trip (departure
  and arrival on the same day are fine).
- School holidays are written out ("7 of 26 cantons (Switzerland)", "all of Austria").
- Service worker cache raised to v14.

## 1.1.0 (09.10.2026)

- Vehicle: new info line below odometer and mileage budget, always visible. It shows length,
  width and height in metres and kerb weight and maximum payload in kg. Tap it to edit the
  values; they are stored as settings (vehicle_length_m, vehicle_width_m, vehicle_height_m,
  vehicle_weight_kg, vehicle_payload_kg). No database or server change.
- New vehicle icon in the navigation bar and in the setup: a campervan with pop-up roof,
  drawn in the same line style as the other icons.

## 1.0.0 (06.10.2026)

First public release / Erste öffentliche Version.

- Trips with packing list, shopping list, to-dos, meal plan, weather and driving distance;
  calendar with .ics export; wish list with booking reminders.
- Trip reports with rating, costs, pitch size, tags, photos and lessons learnt.
- Vehicle: fuel, charging, odometer with mileage budget, service, repairs and upgrades.
- Finances with fixed costs and date based accrual.
- Review with statistics, lessons learnt and map.
- Setup on first start and introduction for every new device.
- German and English user interface.
