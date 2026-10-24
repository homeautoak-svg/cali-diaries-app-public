# Changelog

## 1.4.0 (24.10.2026)

Subtle motion where the app waits, saves or shows numbers. Every animation is short and is
switched off when the system setting "Reduce motion" is on.
- Photo upload: each photo shows its own progress (waiting, percent, done) with the total in
  MB below. Afterwards a bar without percentage shows that the server is still converting the
  photos. No further autosave starts during an upload, so photos are never sent twice.
- Blog publishing: instead of a spinner, the steps generate text, upload photos (with a
  counter), English version and publish to GitHub are shown. The server reports every step
  (NDJSON). A failed step is marked red and can be retried. At the end a check mark is drawn,
  with a link to the post.
- Blog posts now include country, price per night, rating and pitch size. The link after
  publishing uses "siteUrl" in data/blog.json or BLOG_SITE_URL; without it, the app links to
  GitHub.
- Toasts with an icon and a thin line for the remaining time. Errors offer a "Retry" action
  (saving a report, checking off items, publishing).
- An empty required field (campsite) shakes briefly and shows the reason right below.
- Loading: placeholders with a calm shimmer instead of pulsing, also in wishlist, lessons,
  odometer and shopping/to-dos instead of a spinner. Lists fade in with a slight stagger.
- Packing list, shopping and to-dos: checking an item pops the check mark, strikes the item
  through and moves it to the done items after a short pause. Open items can be reordered with
  the handle on the left (finger, mouse or arrow keys); the order is saved (new column
  position, new endpoint PUT /api/trips/:id/items/order).
- Statistics: small 12-month trend lines for nights, km, cost per night and fuel per km. The
  km budget shows a marker for today's target.
- Phone: pulling down at the top of a list reloads everything at once. Newly arrived trips and
  reports are briefly highlighted, with the time of the update above.

## 1.3.0 (11.10.2026)

- Laptop layout from a window width of 1000 px; phones are unchanged. Navigation moves to a
  sidebar on the left (with settings at the bottom), the bottom bar is hidden.
- Trips as list and detail side by side: the selected trip or report opens on the right and is
  highlighted in the list. Editing, new trips and reports also open on the right.
- From 1280 px trip and report details use two columns (trip: status, weather, report on the
  left, lists on the right; report: facts card on the right). Larger report photos.
- Calendar shows months in a grid; season planner, calendar and map use the full width, other
  areas are a centred column. The planning sheet becomes a centred dialog.
- Trips keeps the chosen mode (list, calendar, season) when opening a trip and going back.

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
- School holiday hints show only how busy it is ("Busy: peak holiday season in CH, DE and AT")
  instead of listing cantons and states.
- Season planner: the minimum nights of a wish list place apply to the whole free gap between
  two trips, so gaps that span the start or end of the summer holidays are no longer dropped.
- Planning calendar: quiet free days are marked green, orange only from "fairly full"; a small
  legend sits below the calendar.
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
