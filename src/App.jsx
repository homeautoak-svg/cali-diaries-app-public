import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import L from 'leaflet';
import EN_TEXT from './i18n-en.js';
import {
  Tent, MapPin, Calendar, Cloud, Wallet, Camera, Plus, X, Flame,
  ArrowLeft, Loader2, Trash2, Pencil, Search, CheckCircle2, Circle, Lightbulb,
  ChevronRight, ChevronLeft, Compass, BarChart3, ShoppingCart, Backpack,
  ListTodo, UtensilsCrossed, Settings, Settings2, Ruler, ClipboardList, Sparkles, Gauge, TrendingUp,
  Wrench, Tag, Star, Download, AlertTriangle, Droplet, Eye, Check, Zap, Sun,
  House, CalendarDays, ChevronDown, RefreshCw, TriangleAlert, ExternalLink, SlidersHorizontal
} from 'lucide-react';

const PRESET_TAGS = [
  'kinderfreundlich', 'ruhig', 'See', 'Fluss', 'Meer', 'Spielplatz',
  'Restaurant', 'Supermarkt', 'Bäcker', 'gute Sanitäranlagen', 'Schatten', 'gute Anfahrt'
];

const STELLPLATZ_OPTIONEN = ['zu klein', 'akzeptabel', 'geräumig', 'sehr viel Platz'];

// Wochentage und Monate in der eingestellten Sprache (siehe lang()).
function weekdaysShort() {
  return lang() === 'en' ? ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] : ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
}
function monthNames() {
  return lang() === 'en'
    ? ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    : ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
}

const WEATHER_CODES = {
  0: 'Klarer Himmel', 1: 'Überwiegend klar', 2: 'Teilweise bewölkt', 3: 'Bedeckt',
  45: 'Nebel', 48: 'Nebel mit Reifbildung',
  51: 'Leichter Nieselregen', 53: 'Nieselregen', 55: 'Starker Nieselregen',
  61: 'Leichter Regen', 63: 'Regen', 65: 'Starker Regen',
  71: 'Leichter Schneefall', 73: 'Schneefall', 75: 'Starker Schneefall',
  80: 'Regenschauer', 81: 'Kräftige Regenschauer', 82: 'Heftige Regenschauer',
  95: 'Gewitter', 96: 'Gewitter mit Hagel', 99: 'Schweres Gewitter mit Hagel'
};

// Lokales Datum (Zeitzone des Geraets), nicht UTC: sonst springt "heute" zwischen 00:00 und
// 02:00 Uhr noch auf den Vortag.
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDaysISO(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return lang() === 'en' ? `${d}/${m}/${y}` : `${d}.${m}.${y}`;
}

// Zahlenformat je Sprache und Land des Startorts: Deutsch in der Schweiz 15'000.00, sonst
// deutsches bzw. britisches Format.
function numLocale() {
  if (lang() === 'en') return 'en-GB';
  return ['ch', 'li'].includes(APP_CONFIG.homeCountry) || !APP_CONFIG.homeCountry ? 'de-CH' : 'de-DE';
}

// Einheitliches Betragsformat fuer die ganze App: immer zwei Nachkommastellen und
// Tausendertrennzeichen, z.B. 15'000.00 statt mal "15'000", mal "666.6".
function fmtAmount(n) {
  return Number(n || 0).toLocaleString(numLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Einstellungen dieser Installation (Waehrung, Fahrzeugname, Startort, eingerichtete Module).
// Sie werden beim Start einmal vom Server geladen (loadAppConfig im Hauptbaustein) und beim
// Rendern gelesen, damit nicht jede Komponente sie einzeln durchreichen muss.
const APP_CONFIG = {
  currency: '', foreignCurrency: '', vehicleName: '', homeOrt: '', homeCountry: '', language: '', holidayCountries: null,
  features: { blog: false, tls: false }
};
const CURRENCY_CHOICES = ['CHF', 'EUR', 'USD', 'GBP', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'CAD', 'AUD', 'NZD'];
function cur() { return APP_CONFIG.currency || 'EUR'; }
function foreignCur() {
  const f = APP_CONFIG.foreignCurrency;
  return f && f !== cur() ? f : '';
}
function vehicleLabel() { return APP_CONFIG.vehicleName || tr('Fahrzeug'); }
function applySettingsToConfig(s) {
  APP_CONFIG.currency = s.currency || '';
  APP_CONFIG.foreignCurrency = s.currency_foreign || '';
  APP_CONFIG.vehicleName = s.vehicle_name || '';
  APP_CONFIG.homeOrt = s.home_ort || '';
  APP_CONFIG.homeCountry = s.home_country_code || '';
  APP_CONFIG.language = s.language || '';
  APP_CONFIG.holidayCountries = s.holiday_countries ?? null;
}
function setupIncomplete() {
  return !APP_CONFIG.currency || !APP_CONFIG.homeOrt;
}

// --- Sprache ---
// Woerterbuch fuer die zweisprachige Oberflaeche. Einrichtung und Einfuehrung haben eigene
// Schluessel (unten), alle uebrigen Texte stehen im Code auf Deutsch und werden ueber EN_TEXT
// (src/i18n-en.js) ins Englische uebersetzt.
const I18N = {
  de: {
    'common.next': 'Weiter',
    'common.back': 'Zurück',
    'common.skip': 'Überspringen',
    'common.done': 'Fertig',
    'setup.welcome': 'Willkommen bei Camping Diary',
    'setup.languageQuestion': 'Welche Sprache möchtest du verwenden?',
    'setup.homeTitle': 'Wo starten deine Reisen?',
    'setup.homeText': 'Meist dein Wohnort. Daraus berechnet die App die Fahrdistanz zu deinen Trips, und Orte werden zuerst in diesem Land gesucht.',
    'setup.homePlaceholder': 'z.B. Winterthur',
    'setup.search': 'Suchen',
    'setup.found': 'Gefunden: {place}',
    'setup.homeNotFound': 'Ort nicht gefunden. Versuch es mit Ort und Land, z.B. "Winterthur, Schweiz".',
    'setup.homeError': 'Die Ortssuche hat nicht geklappt. Bitte später nochmals versuchen.',
    'setup.offline': 'Server nicht erreichbar.',
    'setup.later': 'Später',
    'setup.currencyTitle': 'In welcher Währung rechnest du?',
    'setup.currencyText': 'Alle Beträge werden in der Hauptwährung gespeichert. Beträge in der zweiten Währung rechnet die App zum Tageskurs um, praktisch für Reisen ins Ausland.',
    'setup.mainCurrency': 'Hauptwährung',
    'setup.foreignCurrency': 'Umrechnen aus',
    'setup.none': 'Keine',
    'setup.vehicleTitle': 'Wie heisst dein Fahrzeug?',
    'setup.vehicleText': 'Der Name erscheint in Finanzen und beim Kilometerstand. Du kannst das Feld auch leer lassen.',
    'setup.vehiclePlaceholder': 'z.B. Camper',
    'setup.saveError': 'Speichern hat nicht geklappt. Bitte nochmals versuchen.',
    'cards.welcome.title': 'Dein Camping-Tagebuch',
    'cards.welcome.text': 'Plane Trips, halte unterwegs fest, was passiert, und blicke danach zurück. Alles an einem Ort und für alle, die mitreisen.',
    'cards.trips.title': 'Trips planen',
    'cards.trips.text': 'Unter Trips planst du kommende Reisen mit Packliste, Einkauf, To-dos, Essensplan, Wetter und Fahrdistanz. Die Wunschliste merkt sich Plätze, die du noch buchen willst, und erinnert dich, wenn das Buchungsfenster öffnet.',
    'cards.reports.title': 'Nach dem Trip',
    'cards.reports.text': 'Abgeschlossene Trips hältst du in einem Erfahrungsbericht fest: Bewertung, Kosten, Stellplatz, Fotos, Tags und Lessons Learnt. So weisst du beim nächsten Mal, was sich bewährt hat.',
    'cards.vehicle.title': 'Fahrzeug und Kosten',
    'cards.vehicle.text': 'Tanken, Laden und Kilometerstand erfasst du mit wenigen Tipps. Unter Fahrzeug stehen Service und anstehende Arbeiten, unter Finanzen Fixkosten und alle Ausgaben. Der Rückblick zeigt Statistiken, Lessons Learnt und eine Karte aller Orte.',
    'cards.startTour': 'Kurze Tour starten',
    'tour.quick.title': 'Schnell erfassen',
    'tour.quick.text': 'Tanken, Laden, Kilometerstand oder eine Ausgabe in Sekunden erfassen, auch unterwegs.',
    'tour.nav.title': 'Navigation',
    'tour.nav.text': 'Hier wechselst du zwischen Übersicht, Trips, Fahrzeug, Finanzen und Rückblick.',
    'tour.settings.title': 'Einstellungen',
    'tour.settings.text': 'Startort, Währung, Fahrzeug und Sprache änderst du hier. Auch diese Einführung kannst du hier jederzeit nochmals ansehen.',
    'tour.finish': 'Los geht’s',
    'specs.title': 'Masse und Gewicht',
    'specs.add': 'Masse und Gewicht erfassen',
    'specs.length': 'Länge (m)',
    'specs.width': 'Breite (m)',
    'specs.height': 'Höhe (m)',
    'specs.weight': 'Leergewicht (kg)',
    'specs.payload': 'Max. Zuladung (kg)',
    'specs.l': 'L',
    'specs.w': 'B',
    'specs.h': 'H',
    'specs.weightShort': 'Leergewicht',
    'specs.payloadShort': 'Zuladung',
    'specs.invalid': 'Bitte nur Zahlen eingeben.'
  },
  en: {
    'common.next': 'Next',
    'common.back': 'Back',
    'common.skip': 'Skip',
    'common.done': 'Done',
    'setup.welcome': 'Welcome to Camping Diary',
    'setup.languageQuestion': 'Which language would you like to use?',
    'setup.homeTitle': 'Where do your trips start?',
    'setup.homeText': 'Usually your home town. The app uses it to work out driving distances to your trips, and searches for places in this country first.',
    'setup.homePlaceholder': 'e.g. Munich',
    'setup.search': 'Search',
    'setup.found': 'Found: {place}',
    'setup.homeNotFound': 'Place not found. Try place and country, e.g. "Munich, Germany".',
    'setup.homeError': 'The place search did not work. Please try again later.',
    'setup.offline': 'Server not reachable.',
    'setup.later': 'Later',
    'setup.currencyTitle': 'Which currency do you use?',
    'setup.currencyText': 'All amounts are stored in the main currency. Amounts in the second currency are converted at the daily rate, handy for trips abroad.',
    'setup.mainCurrency': 'Main currency',
    'setup.foreignCurrency': 'Convert from',
    'setup.none': 'None',
    'setup.vehicleTitle': 'What do you call your vehicle?',
    'setup.vehicleText': 'The name is shown in finances and next to the odometer. You can also leave it empty.',
    'setup.vehiclePlaceholder': 'e.g. Camper',
    'setup.saveError': 'Saving did not work. Please try again.',
    'cards.welcome.title': 'Your camping diary',
    'cards.welcome.text': 'Plan trips, capture what happens on the road and look back afterwards. All in one place, shared with everyone who travels with you.',
    'cards.trips.title': 'Plan your trips',
    'cards.trips.text': 'Under Trips you plan upcoming journeys with packing list, shopping, to-dos, meal plan, weather and driving distance. The wish list keeps campsites you still want to book and reminds you when booking opens.',
    'cards.reports.title': 'After the trip',
    'cards.reports.text': 'Record finished trips in a trip report: rating, costs, pitch, photos, tags and lessons learnt. Next time you will know what worked.',
    'cards.vehicle.title': 'Vehicle and costs',
    'cards.vehicle.text': 'Log fuel, charging and mileage with a few taps. Vehicle lists service and upcoming jobs, Finances shows fixed costs and every expense. The review shows statistics, lessons learnt and a map of all places.',
    'cards.startTour': 'Start a short tour',
    'tour.quick.title': 'Quick entry',
    'tour.quick.text': 'Log fuel, charging, mileage or an expense in seconds, even on the road.',
    'tour.nav.title': 'Navigation',
    'tour.nav.text': 'Switch between the five main areas here: overview, trips, vehicle, finances and review.',
    'tour.settings.title': 'Settings',
    'tour.settings.text': 'Change home location, currency, vehicle and language here. You can also watch this introduction again at any time.',
    'tour.finish': 'Let’s go',
    'specs.title': 'Dimensions and weight',
    'specs.add': 'Add dimensions and weight',
    'specs.length': 'Length (m)',
    'specs.width': 'Width (m)',
    'specs.height': 'Height (m)',
    'specs.weight': 'Kerb weight (kg)',
    'specs.payload': 'Max. payload (kg)',
    'specs.l': 'L',
    'specs.w': 'W',
    'specs.h': 'H',
    'specs.weightShort': 'Kerb weight',
    'specs.payloadShort': 'Payload',
    'specs.invalid': 'Please enter numbers only.'
  }
};
function lang() {
  if (APP_CONFIG.language === 'de' || APP_CONFIG.language === 'en') return APP_CONFIG.language;
  const nav = (typeof navigator !== 'undefined' && navigator.language) || 'de';
  return nav.toLowerCase().startsWith('de') ? 'de' : 'en';
}
function tr(key, vars) {
  const l = lang();
  const text = I18N[l][key] ?? (l === 'en' ? EN_TEXT[key] : undefined) ?? I18N.de[key] ?? key;
  return vars ? text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m)) : text;
}

function fmtMoney(n) {
  return `${cur()} ${fmtAmount(n)}`;
}

// Ganze Tage zwischen zwei ISO-Daten (b - a), unabhaengig von Sommerzeit.
function daysBetween(a, b) {
  if (!a || !b) return 0;
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
}

// Kurzer Zeitraum ohne doppelte Angaben: "25.-27.09." im selben Monat, sonst "30.09.-02.10.".
function shortRange(von, bis) {
  if (!von) return '';
  const [, mv, dv] = von.split('-');
  const en = lang() === 'en';
  if (!bis || bis === von) return en ? `${dv}/${mv}` : `${dv}.${mv}.`;
  const [, mb, db] = bis.split('-');
  if (en) return mv === mb ? `${dv}–${db}/${mb}` : `${dv}/${mv}–${db}/${mb}`;
  return mv === mb ? `${dv}.–${db}.${mb}.` : `${dv}.${mv}.–${db}.${mb}.`;
}

function nightsLabel(von, bis) {
  const n = daysBetween(von, bis);
  if (n <= 0) return '';
  return n === 1 ? tr('1 Nacht') : tr('{n} Nächte', { n });
}

// Planungsstatus eines Trips (seit v4.12): Idee, angefragt oder bestaetigt. Trips ohne Status
// stammen aus aelteren Versionen und gelten als bestaetigt.
const TRIP_STATUSES = ['idee', 'angefragt', 'bestaetigt'];
function tripStatusLabel(status) {
  if (status === 'idee') return tr('Idee');
  if (status === 'angefragt') return tr('Angefragt');
  return tr('Bestätigt');
}
function isConfirmed(trip) {
  return !trip.status || trip.status === 'bestaetigt';
}

// Status eines geplanten Trips relativ zu heute: geplant, unterwegs oder vorbei. Nicht
// bestaetigte Trips werden nie "unterwegs" oder "abgeschlossen", sie bleiben bei den geplanten.
function tripPhase(trip, today = todayISO()) {
  const end = trip.datum_bis || trip.datum_von;
  if (!trip.datum_von) return { phase: 'geplant', label: tr('Ohne Datum') };
  if (!isConfirmed(trip) && trip.datum_von <= today) return { phase: 'geplant', unconfirmed: true, label: tr('Nicht bestätigt') };
  if (trip.datum_von > today) {
    const d = daysBetween(today, trip.datum_von);
    return { phase: 'geplant', inDays: d, label: d === 1 ? tr('Morgen') : tr('In {d} Tagen', { d: d }) };
  }
  if (end >= today) {
    const day = daysBetween(trip.datum_von, today) + 1;
    const total = daysBetween(trip.datum_von, end) + 1;
    return { phase: 'unterwegs', day, total, label: tr('Unterwegs · Tag {day} von {total}', { day: day, total: total }) };
  }
  return { phase: 'vorbei', label: tr('Abgeschlossen') };
}

function monthsShort() {
  return monthNames().map(m => m.slice(0, 3).toUpperCase());
}

// Domain eines Links fuer die kompakte Anzeige ("galaxus.ch" statt der ganzen URL).
function linkHost(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}
const URL_RE = /https?:\/\/[^\s]+/g;

// ISO-3166-alpha-2-Laendercode ("ch", "de", ...) in ein Flaggen-Emoji umwandeln, ueber die
// Unicode-Regional-Indicator-Symbole (jeder Buchstabe + 127397 ergibt das jeweilige Symbol).
function flagEmoji(countryCode) {
  if (!countryCode || countryCode.length !== 2) return '';
  const codePoints = [...countryCode.toUpperCase()].map(c => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

// Modulweiter Cache Ort -> Laendercode, damit derselbe Ort (z.B. in mehreren Listen gleichzeitig
// sichtbar) nur einmal pro Sitzung angefragt wird, statt einmal pro <CountryFlag>-Instanz.
const ortCountryCache = new Map();
const ortCountryPending = new Map();

function fetchOrtCountry(ort) {
  if (ortCountryCache.has(ort)) return Promise.resolve(ortCountryCache.get(ort));
  if (ortCountryPending.has(ort)) return ortCountryPending.get(ort);
  const promise = fetch(`/api/ort-country?ort=${encodeURIComponent(ort)}`)
    .then(r => r.ok ? r.json() : { country_code: null })
    .then(d => {
      ortCountryCache.set(ort, d.country_code || null);
      ortCountryPending.delete(ort);
      return d.country_code || null;
    })
    .catch(() => {
      ortCountryPending.delete(ort);
      return null;
    });
  ortCountryPending.set(ort, promise);
  return promise;
}

// Kleine Landesflagge neben einem Ortsnamen. Zeigt nichts, solange der Ländercode noch nicht
// bekannt oder nicht ermittelbar ist (z.B. sehr ungenaue Ortsangaben).
function CountryFlag({ ort }) {
  const [code, setCode] = useState(() => (ort ? ortCountryCache.get(ort) : null) || null);

  useEffect(() => {
    if (!ort) { setCode(null); return; }
    if (ortCountryCache.has(ort)) { setCode(ortCountryCache.get(ort)); return; }
    let cancelled = false;
    fetchOrtCountry(ort).then(c => { if (!cancelled) setCode(c); });
    return () => { cancelled = true; };
  }, [ort]);

  const flag = flagEmoji(code);
  if (!flag) return null;
  return <span aria-hidden="true" style={{ marginRight: 2 }}>{flag}</span>;
}

function yearOf(iso) {
  if (!iso) return tr('Ohne Datum');
  return iso.slice(0, 4);
}

function toISO(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function buildMonthGrid(year, month) {
  const firstDay = new Date(year, month, 1);
  const startWeekday = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// --- Schul- und Feiertage (seit v4.12) ---
// Der Server liefert pro Jahr die Ferien der eingestellten Laender (OpenHolidays API). Daraus
// wird pro Tag eine Stufe 0 bis 3 berechnet: Anteil der Kantone bzw. Bundeslaender mit Ferien,
// gewichtet nach Einwohnern des Landes (Mio.), damit ein Ferienbeginn in Deutschland staerker
// zaehlt als in Liechtenstein; das Land des Startorts zaehlt mindestens ein Drittel. Das ergibt
// eine grobe Schaetzung, wie voll Campingplaetze sind.
const HOLIDAY_COUNTRY_CHOICES = ['CH', 'DE', 'AT', 'FR', 'IT', 'NL', 'BE', 'LU', 'LI', 'CZ', 'PL', 'ES', 'PT', 'SI', 'HR'];
const COUNTRY_POPULATION_M = { CH: 9, DE: 84, AT: 9, FR: 68, IT: 59, NL: 18, BE: 12, LU: 0.7, LI: 0.04, CZ: 11, PL: 37, ES: 48, PT: 10, SI: 2, HR: 4 };
const HOLIDAY_LEVEL_COLORS = ['transparent', '#F3E2A6', '#E8C35B', '#C98A2B'];
const holidayCache = new Map();
let holidayCacheVersion = 0;

function invalidateHolidayCache() {
  holidayCache.clear();
  holidayCacheVersion += 1;
}

function fetchHolidayYear(year) {
  const key = `${holidayCacheVersion}-${year}`;
  if (!holidayCache.has(key)) {
    holidayCache.set(key, fetch(`/api/holidays?year=${year}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => (data ? buildHolidayIndex(data) : null))
      .catch(() => null));
  }
  return holidayCache.get(key);
}

// Ferien der angegebenen Jahre laden; Ergebnis: Map iso-Datum -> Tagesinfo (nur Tage mit Ferien
// oder Feiertag). null, solange noch nichts geladen ist.
function useHolidays(years) {
  const yearsKey = Array.from(new Set(years)).sort().join(',');
  const [index, setIndex] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const list = yearsKey ? yearsKey.split(',').map(Number) : [];
    Promise.all(list.map(fetchHolidayYear)).then(results => {
      if (cancelled) return;
      const merged = new Map();
      results.forEach(r => { if (r) r.forEach((v, k) => merged.set(k, v)); });
      setIndex(merged);
    });
    return () => { cancelled = true; };
  }, [yearsKey]);
  return index;
}

function eachDayISO(start, end, fn) {
  if (!start) return;
  let d = start;
  const last = end || start;
  let guard = 0;
  while (d <= last && guard < 400) { fn(d); d = addDaysISO(d, 1); guard++; }
}

function buildHolidayIndex(data) {
  const index = new Map();
  const get = (iso) => {
    if (!index.has(iso)) index.set(iso, { level: 0, score: 0, school: {}, publicHolidays: [] });
    return index.get(iso);
  };
  for (const h of data.school || []) {
    eachDayISO(h.start, h.end, (iso) => {
      const info = get(iso);
      const set = info.school[h.country] || (info.school[h.country] = new Set());
      if (h.nationwide || !h.regions?.length) set.add('*');
      else h.regions.forEach(r => set.add(r));
    });
  }
  for (const h of data.public || []) {
    eachDayISO(h.start, h.end, (iso) => {
      const info = get(iso);
      const existing = info.publicHolidays.find(p => p.name === h.name);
      if (existing) { if (!existing.countries.includes(h.country)) existing.countries.push(h.country); }
      else info.publicHolidays.push({ name: h.name, countries: [h.country], nationwide: h.nationwide });
    });
  }
  // Gewicht pro Land nach Einwohnern; das Land des Startorts zaehlt mindestens ein Drittel, weil
  // dessen Ferien die Plaetze in der Naehe am staerksten fuellen.
  const countries = data.countries || [];
  const home = (APP_CONFIG.homeCountry || '').toUpperCase();
  const popOf = (c) => COUNTRY_POPULATION_M[c] || 5;
  const othersSum = countries.filter(c => c !== home).reduce((s, c) => s + popOf(c), 0);
  const weightOf = (c) => (c === home && countries.length > 1 ? Math.max(popOf(c), othersSum / 2) : popOf(c));
  const weightSum = countries.reduce((s, c) => s + weightOf(c), 0) || 1;
  index.forEach(info => {
    let score = 0;
    for (const c of Object.keys(info.school)) {
      const set = info.school[c];
      const total = data.regionTotals?.[c] || 1;
      const share = set.has('*') ? 1 : Math.min(1, set.size / total);
      score += share * weightOf(c);
      info.school[c] = { all: set.has('*') || set.size >= total, regions: Array.from(set).filter(r => r !== '*'), total };
    }
    info.score = score / weightSum;
    info.level = info.score === 0 ? 0 : info.score < 0.15 ? 1 : info.score < 0.45 ? 2 : 3;
  });
  return index;
}

function holidayLevel(index, iso) {
  return index?.get(iso)?.level || 0;
}

// Kurztext, wer an einem Tag Ferien hat, z.B. "DE: BY, BW · CH: 12/26".
function countryName(code) {
  try {
    const name = new Intl.DisplayNames([lang()], { type: 'region' }).of(code);
    if (name) return name;
  } catch { /* aeltere Browser */ }
  return code;
}

// Bezeichnung der Regionen eines Landes in der Mehrzahl (Kantone, Bundeslaender, sonst Regionen).
function regionWord(code) {
  if (code === 'CH') return tr('Kantonen');
  if (code === 'DE' || code === 'AT') return tr('Bundesländern');
  return tr('Regionen');
}

// Lesbarer Text, wer an einem Tag Schulferien hat, z.B. "7 von 26 Kantonen (Schweiz) ·
// BY, BW (Deutschland)". Bis drei Regionen werden mit Kuerzel genannt, sonst gezaehlt.
function schoolHolidaySummary(info) {
  if (!info) return '';
  return Object.entries(info.school).map(([c, v]) => {
    const land = countryName(c);
    if (v.all) return tr('ganz {land}', { land });
    if (v.regions.length <= 3) return `${v.regions.map(r => r.split('-')[1] || r).join(', ')} (${land})`;
    return tr('{n} von {total} {regionen} ({land})', { n: v.regions.length, total: v.total, regionen: regionWord(c), land });
  }).join(' · ');
}

// Trips, deren Naechte sich mit dem Zeitraum von (Anreise) bis bis (Abreise) ueberschneiden.
// Abreise- und Anreisetag duerfen zusammenfallen.
function overlappingTrips(trips, von, bis, excludeId) {
  if (!von) return [];
  const end = bis && bis > von ? bis : addDaysISO(von, 1);
  return (trips || []).filter(t => {
    if (!t.datum_von || t.id === excludeId) return false;
    const tEnd = t.datum_bis && t.datum_bis > t.datum_von ? t.datum_bis : addDaysISO(t.datum_von, 1);
    return von < tEnd && t.datum_von < end;
  });
}

function publicHolidaySummary(info) {
  if (!info?.publicHolidays?.length) return '';
  return info.publicHolidays.map(p => `${p.name} (${p.countries.join(', ')})`).join(' · ');
}

// --- Eigene Toast- und Bestaetigungs-Dialoge statt Browser-alert()/confirm() ---

let toastListeners = [];
function showToast(message, type = 'info') {
  const id = Date.now() + Math.random();
  toastListeners.forEach(fn => fn({ id, message, type }));
}

// Damit Aenderungen mehrerer Personen gegenseitig sichtbar werden, ohne eine komplett neue
// Echtzeit-Infrastruktur (WebSockets) aufzubauen: alle 20 Sekunden im Hintergrund neu laden,
// dazu sofort beim Zurueckkehren zur App/zum Tab. loadFn muss ein optionales "silent"-Flag
// unterstuetzen, damit dabei kein Ladespinner aufblitzt.
function useAutoRefresh(loadFn, intervalMs = 20000) {
  useEffect(() => {
    const interval = setInterval(() => { loadFn(true); }, intervalMs);
    function onVisible() {
      if (document.visibilityState === 'visible') loadFn(true);
    }
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadFn]);
}

// Dezentes Speichern-Feedback als Alternative zu Toasts: ein Hook, der ein kurzzeitiges
// "justSaved"-Flag liefert, das automatisch nach 1.6s wieder verschwindet.
function useSavedIndicator() {
  const [justSaved, setJustSaved] = useState(false);
  const timerRef = useRef(null);
  const trigger = useCallback(() => {
    setJustSaved(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setJustSaved(false), 1600);
  }, []);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  return [justSaved, trigger];
}

function SavedCheckmark({ show }) {
  if (!show) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, color: 'var(--forest)',
      animation: 'fadeIn 0.15s ease-out'
    }}>
      <Check size={13} />{' '}{tr('Gespeichert')}
    </span>
  );
}

function OfflineBanner() {
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  useEffect(() => {
    function goOnline() { setOnline(true); }
    function goOffline() { setOnline(false); }
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (online) return null;
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 250, background: '#B3402A', color: '#FFFFFF',
      padding: '8px 18px', fontSize: 13, textAlign: 'center', fontFamily: 'var(--font-body)'
    }}>
      {tr('Kein Netz gerade · Änderungen können erst gespeichert werden, sobald wieder Verbindung besteht.')}
    </div>
  );
}

function ToastHost() {
  const [toasts, setToasts] = useState([]);
  useEffect(() => {
    const listener = (toast) => {
      setToasts(prev => [...prev, toast]);
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== toast.id)), 2800);
    };
    toastListeners.push(listener);
    return () => { toastListeners = toastListeners.filter(l => l !== listener); };
  }, []);

  if (toasts.length === 0) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 'calc(96px + env(safe-area-inset-bottom, 0px))', left: 0, right: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', gap: 8, zIndex: 300, pointerEvents: 'none', padding: '0 18px'
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: t.type === 'error' ? '#B3402A' : 'var(--forest)', color: '#FFFFFF',
          padding: '11px 18px', borderRadius: 10, fontSize: 14, boxShadow: '0 8px 20px rgba(0,0,0,0.25)',
          maxWidth: 360, textAlign: 'center', animation: 'toastIn 0.25s ease-out'
        }}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

let confirmResolver = null;
let confirmListeners = [];
function confirmDialog(message, options) {
  return new Promise((resolve) => {
    confirmResolver = resolve;
    confirmListeners.forEach(fn => fn({ message, ...options }));
  });
}

function ConfirmHost() {
  const [state, setState] = useState(null);
  useEffect(() => {
    const listener = (payload) => setState(payload);
    confirmListeners.push(listener);
    return () => { confirmListeners = confirmListeners.filter(l => l !== listener); };
  }, []);

  function respond(result) {
    setState(null);
    if (confirmResolver) { confirmResolver(result); confirmResolver = null; }
  }

  if (!state) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(30,43,31,0.45)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 400, padding: 24, animation: 'fadeIn 0.15s ease-out'
    }}>
      <div style={{
        background: '#FFFFFF', borderRadius: 16, padding: 20, maxWidth: 340, width: '100%',
        boxShadow: '0 20px 50px rgba(0,0,0,0.3)'
      }}>
        <p style={{ fontSize: 15, color: 'var(--text)', margin: '0 0 18px', lineHeight: 1.4 }}>{state.message}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => respond(false)} style={{
            flex: 1, background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 10,
            padding: '11px 0', fontSize: 14, cursor: 'pointer', color: 'var(--text)', fontFamily: 'var(--font-body)'
          }}>{tr('Abbrechen')}</button>
          <button onClick={() => respond(true)} style={{
            flex: 1, background: '#B3402A', border: 'none', borderRadius: 10,
            padding: '11px 0', fontSize: 14, cursor: 'pointer', color: '#FFFFFF', fontWeight: 600, fontFamily: 'var(--font-body)'
          }}>{state.confirmLabel || tr('Löschen')}</button>
        </div>
      </div>
    </div>
  );
}

const theme = {
  '--bg': '#FFFFFF', '--card': '#FFFFFF', '--card-alt': '#F4F8F1', '--input-bg': '#F2F6EF',
  '--text': '#1E2B1F', '--muted': '#5E6B5B', '--border': '#DFE6DA',
  '--forest': '#2F5233', '--forest-dark': '#1F3A24',
  '--yellow': '#E8B923', '--yellow-dark': '#B98F16',
  '--font-display': "'Fraunces', Georgia, serif",
  '--font-body': "'Inter', system-ui, sans-serif",
  '--font-mono': "'IBM Plex Mono', monospace"
};

// Eigenes Fahrzeug-Symbol: generischer Camper von der Seite mit Aufstelldach (keine
// Markengrafik), gezeichnet im Stil der Lucide-Symbole (24er-Raster, Linie 2, runde Enden),
// damit es in der Navigationsleiste zu den uebrigen Symbolen passt.
function CampervanIcon({ size = 24, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M13 8v4a1 1 0 0 0 1 1h6.1a1 1 0 0 1 .7.3l.9.9a1 1 0 0 1 .3.7V18a1 1 0 0 1-1 1h-3" />
      <path d="M5 19H3a1 1 0 0 1-1-1V10a2 2 0 0 1 2-2h12c1.1 0 2.1.8 2.4 1.8l.9 3.2" />
      <path d="M3.5 8 13 4.5V8" />
      <path d="M9 19h5" />
      <circle cx="16" cy="19" r="2" />
      <circle cx="7" cy="19" r="2" />
    </svg>
  );
}

const inputStyle = {
  background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 10,
  padding: '12px 13px', color: 'var(--text)', fontSize: 16, fontFamily: 'var(--font-body)',
  outline: 'none', minWidth: 0
};

const primaryButtonStyle = {
  background: 'var(--forest)', color: '#FFFFFF', border: 'none', borderRadius: 10,
  padding: '14px 16px', fontSize: 16, fontWeight: 600, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  fontFamily: 'var(--font-body)'
};

// Tagesaktueller Kurs Fremdwaehrung -> Hauptwaehrung (beide in den Einstellungen), einmal pro
// Tag und Waehrungspaar zwischengespeichert, damit nicht bei jedem Tastendruck neu geladen wird.
// Zwei unabhaengige, kostenlose Quellen nacheinander versucht, falls die erste nicht erreichbar ist.
const fxRateCache = new Map();
async function fetchFromFrankfurter(from, to) {
  const res = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=${to}`);
  const data = await res.json();
  return data?.rates?.[to] || null;
}
async function fetchFromOpenErApi(from, to) {
  const res = await fetch(`https://open.er-api.com/v6/latest/${from}`);
  const data = await res.json();
  return data?.rates?.[to] || null;
}
async function getFxRate(from = foreignCur(), to = cur()) {
  if (!from || !to) return null;
  if (from === to) return 1;
  const key = `${from}-${to}`;
  const today = todayISO();
  let c = fxRateCache.get(key);
  if (!c) { c = { rate: null, date: null, promise: null }; fxRateCache.set(key, c); }
  if (c.rate && c.date === today) return c.rate;
  if (c.promise) return c.promise;
  c.promise = (async () => {
    let rate = null;
    try { rate = await fetchFromFrankfurter(from, to); } catch { /* naechste Quelle versuchen */ }
    if (!rate) { try { rate = await fetchFromOpenErApi(from, to); } catch { /* beide Quellen nicht erreichbar */ } }
    if (rate) { c.rate = rate; c.date = today; }
    c.promise = null;
    return rate;
  })();
  return c.promise;
}

// Betragsfeld mit optionalem Umschalter zur Fremdwaehrung. Gespeichert wird immer nur der Betrag
// in der Hauptwaehrung (umgerechnet zum tagesaktuellen Kurs beim Eintippen), die
// Herkunftswaehrung wird nicht separat vorgehalten.
function CurrencyAmountInput({ value, onChange, placeholder }) {
  const base = cur();
  const foreign = foreignCur();
  const [currency, setCurrency] = useState(base);
  const [displayValue, setDisplayValue] = useState(value ?? '');
  const [rate, setRate] = useState(null);
  const [rateLoading, setRateLoading] = useState(false);
  const [manualRate, setManualRate] = useState('');
  const isForeign = Boolean(foreign) && currency === foreign;

  useEffect(() => {
    if (!isForeign) setDisplayValue(value ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  async function toggleCurrency(next) {
    if (next === currency) return;
    setCurrency(next);
    if (next === foreign) {
      setRateLoading(true);
      const r = await getFxRate(foreign, base);
      setRate(r);
      setRateLoading(false);
      setDisplayValue('');
      onChange('');
    } else {
      setDisplayValue(value ?? '');
    }
  }

  function convert(raw, useRate) {
    setDisplayValue(raw);
    const num = parseFloat(raw.replace(',', '.'));
    if (!isNaN(num) && useRate) onChange(String(Math.round(num * useRate * 100) / 100));
    else if (raw === '') onChange('');
  }

  function handleInput(raw) {
    if (isForeign) convert(raw, rate);
    else { setDisplayValue(raw); onChange(raw); }
  }

  function handleManualRate(raw) {
    setManualRate(raw);
    const r = parseFloat(raw.replace(',', '.'));
    if (!isNaN(r) && r > 0) {
      setRate(r);
      convert(displayValue, r);
    }
  }

  const choices = foreign ? [base, foreign] : [base];

  return (
    <div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="number" step="0.05" value={displayValue} onChange={e => handleInput(e.target.value)}
          placeholder={placeholder} style={{ ...inputStyle, flex: 1 }} />
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}>
          {choices.map(c => (
            <button key={c} type="button" onClick={() => toggleCurrency(c)} disabled={choices.length < 2} style={{
              padding: '0 12px', border: 'none', fontSize: 13, fontFamily: 'var(--font-body)',
              cursor: choices.length < 2 ? 'default' : 'pointer',
              background: currency === c ? 'var(--forest)' : 'var(--input-bg)',
              color: currency === c ? '#FFFFFF' : 'var(--muted)'
            }}>{c}</button>
          ))}
        </div>
      </div>
      {isForeign && (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
          {rateLoading ? tr('Kurs wird geladen...') : rate
            ? tr('≈ {base} {v} bei Kurs 1 {foreign} = {rate} {base2}', { base: base, v: value || '0.00', foreign: foreign, rate: rate.toFixed(4), base2: base })
            : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span>{tr('Kurs nicht automatisch abrufbar, 1 {foreign} =', { foreign: foreign })}</span>
                <input type="number" step="0.0001" value={manualRate} onChange={e => handleManualRate(e.target.value)}
                  placeholder={tr('z.B. {n}', { n: '0.95' })} style={{ ...inputStyle, width: 80, padding: '4px 6px', fontSize: 12 }} />
                <span>{tr('{base} (manuell)', { base: base })}</span>
              </div>
            )}
        </div>
      )}
    </div>
  );
}

// Kleiner Rechner (Notizzettel mit beliebig vielen Betraegen), der die Summe direkt in ein
// Kostenfeld uebernimmt - praktisch, um mehrere Belege (Restaurant, Aktivitaeten) zusammenzuzaehlen.
function CalculatorButton({ onApply, currentValue }) {
  const base = cur();
  const foreign = foreignCur();
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState([{ value: '', currency: base }, { value: '', currency: base }]);
  const [rate, setRate] = useState(null);
  const [rateLoading, setRateLoading] = useState(false);

  const existingAmount = (() => {
    const n = parseFloat(String(currentValue ?? '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
  })();

  async function ensureRate() {
    if (rate || rateLoading) return;
    setRateLoading(true);
    const r = await getFxRate(foreign, base);
    setRate(r);
    setRateLoading(false);
  }

  function updateLine(i, val) {
    setLines(prev => prev.map((l, idx) => (idx === i ? { ...l, value: val } : l)));
  }
  function setLineCurrency(i, currency) {
    setLines(prev => prev.map((l, idx) => (idx === i ? { ...l, currency } : l)));
    if (currency !== base) ensureRate();
  }
  function addLine() {
    setLines(prev => [...prev, { value: '', currency: base }]);
  }
  function removeLine(i) {
    setLines(prev => prev.filter((_, idx) => idx !== i));
  }

  function lineChf(l) {
    const n = parseFloat((l.value || '').replace(',', '.'));
    if (isNaN(n)) return 0;
    if (l.currency !== base) return rate ? n * rate : 0;
    return n;
  }
  const total = lines.reduce((sum, l) => sum + lineChf(l), 0);
  const grandTotal = existingAmount + total;
  const hasUnresolvedEur = lines.some(l => l.currency !== base && l.value !== '' && !rate);

  function apply() {
    onApply(Math.round(grandTotal * 100) / 100);
    setOpen(false);
    setLines([{ value: '', currency: base }, { value: '', currency: base }]);
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title={tr('Beträge addieren')} style={{
        background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 10, width: 42, height: 42,
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--forest)', flexShrink: 0
      }}>
        <Plus size={18} />
      </button>
      {open && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(30,43,31,0.45)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 24
        }}>
          <div style={{
            background: '#FFFFFF', borderRadius: 16, padding: 20, maxWidth: 360, width: '100%',
            boxShadow: '0 20px 50px rgba(0,0,0,0.3)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>{tr('Beträge addieren')}</span>
              <button type="button" onClick={() => setOpen(false)} style={{ ...iconButtonStyle, width: 30, height: 30 }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 6 }}>
              {lines.map((l, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="number" inputMode="decimal" step="0.05" value={l.value} placeholder="0.00"
                    onChange={e => updateLine(i, e.target.value)}
                    style={{ ...inputStyle, flex: 1 }} />
                  {foreign && <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
                    {[base, foreign].map(c => (
                      <button key={c} type="button" onClick={() => setLineCurrency(i, c)} style={{
                        padding: '0 9px', height: 42, border: 'none', fontSize: 12, fontFamily: 'var(--font-body)', cursor: 'pointer',
                        background: l.currency === c ? 'var(--forest)' : 'var(--input-bg)',
                        color: l.currency === c ? '#FFFFFF' : 'var(--muted)'
                      }}>{c}</button>
                    ))}
                  </div>}
                  <button type="button" onClick={() => removeLine(i)} disabled={lines.length <= 1}
                    style={{ ...iconButtonStyle, width: 38, height: 38, opacity: lines.length <= 1 ? 0.3 : 1 }}>
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={addLine} style={{
              display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
              color: 'var(--forest)', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: '6px 0', marginBottom: 12
            }}>
              <Plus size={14} />{' '}{tr('Weiterer Betrag')}
            </button>
            {rateLoading && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>{tr('Wechselkurs wird geladen...')}</div>
            )}
            {rate && lines.some(l => l.currency !== base) && (
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>{tr('Kurs: 1 {foreign} = {rate} {base}', { foreign: foreign, rate: rate.toFixed(4), base: base })}</div>
            )}
            {existingAmount > 0 && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{tr('Bereits im Feld: {base} {existingAmount}', { base: base, existingAmount: existingAmount.toFixed(2) })}</div>
            )}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14,
              paddingTop: 10, borderTop: '1px solid var(--border)'
            }}>
              <span style={{ fontSize: 14, color: 'var(--muted)' }}>
                {existingAmount > 0 ? tr('Neue Summe ({base})', { base: base }) : tr('Summe ({base})', { base: base })}
              </span>
              <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 18, fontWeight: 700 }}>
                {base} {grandTotal.toFixed(2)}
              </span>
            </div>
            <button type="button" onClick={apply} disabled={hasUnresolvedEur} style={{
              ...primaryButtonStyle, opacity: hasUnresolvedEur ? 0.5 : 1
            }}>
              {tr('Übernehmen')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

const headerBarStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  paddingTop: 'calc(16px + env(safe-area-inset-top, 0px))',
  paddingBottom: 16, paddingLeft: 18, paddingRight: 18,
  position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 5,
  borderBottom: '1px solid var(--border)'
};

// Dezenter, gedaempfter "gemalter Natur"-Hintergrund fuer die Kopfzeile beim Anlegen eines
// Trips oder Erfahrungsberichts. Weiche, verschwommene Formen in Waldgruen-Toenen, bewusst
// blass gehalten, damit sich Titeltext und Bildfarben nicht beissen.
const NATURE_HEADER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="140" viewBox="0 0 400 140">
  <defs>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="16" />
    </filter>
    <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#F5F8F3"/>
      <stop offset="100%" stop-color="#FFFFFF"/>
    </linearGradient>
  </defs>
  <rect width="400" height="140" fill="url(#skyGrad)"/>
  <g filter="url(#soft)" opacity="0.5">
    <ellipse cx="70" cy="130" rx="110" ry="55" fill="#A9C2A5"/>
    <ellipse cx="210" cy="145" rx="150" ry="60" fill="#7C9A78"/>
    <ellipse cx="360" cy="125" rx="120" ry="50" fill="#8FAE8E"/>
    <circle cx="300" cy="30" r="34" fill="#C7D9C3"/>
    <circle cx="80" cy="25" r="22" fill="#DCE7D8"/>
  </g>
</svg>
`.trim();
const NATURE_HEADER_BG = `url("data:image/svg+xml,${encodeURIComponent(NATURE_HEADER_SVG)}")`;
const natureHeaderBarStyle = {
  ...headerBarStyle,
  backgroundImage: NATURE_HEADER_BG,
  backgroundSize: 'cover',
  backgroundPosition: 'center'
};

const iconButtonStyle = {
  width: 44, height: 44, borderRadius: 10, background: 'none', border: 'none',
  color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  flexShrink: 0
};

const sectionLabelStyle = {
  fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--forest)', marginBottom: 8, fontWeight: 700
};

function Field({ label, icon: Icon, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{
        fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--muted)',
        display: 'flex', alignItems: 'center', gap: 6
      }}>
        {Icon && <Icon size={13} />}
        {label}
      </span>
      {children}
    </label>
  );
}

function TagChip({ label, active, onClick, small }) {
  return (
    <button type="button" onClick={onClick} style={{
      border: `1px solid ${active ? 'var(--forest)' : 'var(--border)'}`,
      background: active ? 'rgba(47,82,51,0.08)' : 'var(--input-bg)',
      color: active ? 'var(--forest)' : 'var(--muted)',
      borderRadius: 999, padding: small ? '6px 11px' : '8px 14px',
      fontSize: small ? 13 : 14, cursor: 'pointer', whiteSpace: 'nowrap',
      fontFamily: 'var(--font-body)'
    }}>
      {typeof label === 'string' ? tr(label) : label}
    </button>
  );
}

// Bandfarbe je nach Bewertung: rot (schwach) bis waldgruen (top), gelb dazwischen.
function ratingRibbonColor(bewertung) {
  if (bewertung >= 4.5) return { bg: 'var(--forest)', text: '#FFFFFF' };
  if (bewertung >= 3.5) return { bg: 'var(--yellow)', text: '#2A2205' };
  if (bewertung >= 2.5) return { bg: '#D98A2B', text: '#2A1B05' };
  return { bg: '#B3402A', text: '#FFFFFF' };
}

function CalendarRangePicker({ datumVon, setDatumVon, datumBis, setDatumBis, label }) {
  const [open, setOpen] = useState(false);
  const initial = datumVon ? new Date(datumVon + 'T00:00:00') : new Date();
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  const cells = buildMonthGrid(viewYear, viewMonth);

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1);
  }

  function clickDay(d) {
    if (!d) return;
    const iso = toISO(viewYear, viewMonth, d);
    if (!datumVon || (datumVon && datumBis)) {
      setDatumVon(iso);
      setDatumBis('');
    } else if (iso < datumVon) {
      setDatumVon(iso);
      setDatumBis('');
    } else {
      setDatumBis(iso);
      setOpen(false);
    }
  }

  function isInRange(iso) {
    if (!datumVon || !datumBis) return false;
    return iso > datumVon && iso < datumBis;
  }

  return (
    <div style={{ position: 'relative' }}>
      <Field label={label || tr('Zeitraum')} icon={Calendar}>
        <button type="button" onClick={() => setOpen(o => !o)} style={{
          ...inputStyle, textAlign: 'left', cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between', width: '100%', boxSizing: 'border-box'
        }}>
          <span>
            {datumVon ? formatDate(datumVon) : tr('Ankunft')} {'→'} {datumBis ? formatDate(datumBis) : tr('Abreise')}
          </span>
          <Calendar size={17} color="var(--muted)" />
        </button>
      </Field>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 6, background: 'var(--card)',
          border: '1px solid var(--border)', borderRadius: 14, padding: 12, width: 264,
          boxShadow: '0 14px 32px rgba(30,43,31,0.18)', zIndex: 30
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <button type="button" onClick={prevMonth} style={{ ...iconButtonStyle, width: 28, height: 28 }}><ChevronLeft size={16} /></button>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 14 }}>{monthNames()[viewMonth]} {viewYear}</span>
            <button type="button" onClick={nextMonth} style={{ ...iconButtonStyle, width: 28, height: 28 }}><ChevronRight size={16} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 1, marginBottom: 2 }}>
            {weekdaysShort().map(w => (
              <div key={w} style={{ textAlign: 'center', fontSize: 10, color: 'var(--muted)', padding: '2px 0' }}>{w}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 1 }}>
            {cells.map((d, i) => {
              if (!d) return <div key={i} style={{ width: 30, height: 30 }} />;
              const iso = toISO(viewYear, viewMonth, d);
              const isStart = iso === datumVon;
              const isEnd = iso === datumBis;
              const inRange = isInRange(iso);
              return (
                <button type="button" key={i} onClick={() => clickDay(d)} style={{
                  width: 30, height: 30, border: 'none', borderRadius: 7,
                  background: isStart || isEnd ? 'var(--forest)' : inRange ? 'rgba(47,82,51,0.14)' : 'transparent',
                  color: isStart || isEnd ? '#FFFFFF' : 'var(--text)', cursor: 'pointer',
                  fontSize: 12, fontFamily: 'var(--font-body)'
                }}>
                  {d}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', color: 'var(--forest)', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
              {tr('Fertig')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Schnellerfassung Tanken/Laden von der Startseite aus: Typ, Titel und Datum sind schon
// gesetzt, der letzte bekannte Kilometerstand wird automatisch vorgeschlagen. Nur noch
// Kosten (und optional km-Stand anpassen) eintragen und speichern.
function QuickVehicleEventModal({ typ, onClose, onSaved }) {
  const label = VEHICLE_TYPES.find(t => t.key === typ)?.label || typ;
  const [datum, setDatum] = useState(todayISO());
  const [kosten, setKosten] = useState('');
  const [kmStand, setKmStand] = useState('');
  const [kmLoading, setKmLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/odometer')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d?.latestKm != null) setKmStand(String(d.latestKm)); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setKmLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/vehicle-events', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datum, typ, titel: label,
          kosten: kosten || null, km_stand: kmStand || null
        })
      });
      if (!res.ok) throw new Error(tr('Konnte nicht gespeichert werden.'));
      showToast(tr('Gespeichert'));
      onSaved();
    } catch (err) {
      showToast(err.message === 'Failed to fetch' ? tr('Server nicht erreichbar.') : err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(30,43,31,0.45)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 24
    }}>
      <form onSubmit={submit} style={{
        background: '#FFFFFF', borderRadius: 16, padding: 20, maxWidth: 340, width: '100%',
        boxShadow: '0 20px 50px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: 12
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>{tr('{label} erfassen', { label: label })}</span>
          <button type="button" onClick={onClose} style={{ ...iconButtonStyle, width: 30, height: 30 }}>
            <X size={16} />
          </button>
        </div>

        <Field label={tr('Datum')} icon={Calendar}>
          <input type="date" value={datum} onChange={e => setDatum(e.target.value)} style={inputStyle} />
        </Field>

        <Field label={tr('Kosten')} icon={Wallet}>
          <CurrencyAmountInput value={kosten} onChange={setKosten} placeholder="0.00" />
        </Field>

        <Field label={tr('Kilometerstand')} icon={Gauge}>
          <input type="number" value={kmStand} onChange={e => setKmStand(e.target.value)}
            placeholder={kmLoading ? tr('wird geladen...') : ''} style={inputStyle} />
        </Field>

        <button type="submit" disabled={saving} style={{ ...primaryButtonStyle, marginTop: 4 }}>
          {saving ? <Loader2 size={17} className="spin" /> : tr('Speichern')}
        </button>
      </form>
    </div>
  );
}

// --- Gemeinsame Bausteine der neuen Navigation (v4.0) ---

// Gesamtkosten und laufende Fixkosten aus der Finanz-Zusammenfassung. Wird von Startseite
// und Finanzen gleich berechnet, damit beide Stellen dieselben Zahlen zeigen.
function financeTotals(summary) {
  if (!summary) return null;
  const items = summary.financeItems || [];
  const sum = (arr) => arr.reduce((s, i) => s + (i.accrued ?? 0), 0);
  const fahrzeugItems = items.filter(i => i.kategorie === 'fahrzeug');
  const campingItems = items.filter(i => i.kategorie === 'camping');
  const sonstigeItems = items.filter(i => i.kategorie !== 'fahrzeug' && i.kategorie !== 'camping');
  const fahrzeugAuto = (summary.fahrzeugTreibstoffKosten ?? 0) + (summary.fahrzeugServiceKosten ?? 0) + (summary.fahrzeugNachruestungKosten ?? 0);
  const campingAuto = (summary.ausgabenUebernachtung ?? 0) + (summary.ausgabenRestaurant ?? 0) + (summary.ausgabenAktivitaeten ?? 0);
  const california = sum(fahrzeugItems) + fahrzeugAuto;
  const camping = sum(campingItems) + campingAuto;
  const sonstiges = sum(sonstigeItems);
  const today = todayISO();
  let monthlyFixed = 0;
  for (const i of items) {
    if (i.typ !== 'monatlich' && i.typ !== 'jaehrlich') continue;
    if (i.faellig_datum && i.faellig_datum > today) continue;
    const perioden = i.betrag ? Math.round((i.accrued ?? 0) / i.betrag) : 0;
    if (i.max_perioden && perioden >= i.max_perioden && i.typ === 'monatlich') continue;
    monthlyFixed += i.typ === 'monatlich' ? (i.betrag || 0) : (i.betrag || 0) / 12;
  }
  const allDates = items.map(i => i.faellig_datum).filter(Boolean).sort();
  return {
    california, camping, sonstiges, total: california + camping + sonstiges, monthlyFixed,
    since: allDates[0] || null, fahrzeugItems, campingItems, sonstigeItems
  };
}

function ModalShell({ title, onClose, children, onSubmit }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(30,43,31,0.45)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 24, animation: 'fadeIn 0.15s ease-out'
    }}>
      <form onSubmit={onSubmit} onClick={e => e.stopPropagation()} style={{
        background: '#FFFFFF', borderRadius: 16, padding: 20, maxWidth: 360, width: '100%',
        boxShadow: '0 20px 50px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: 12
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>{title}</span>
          <button type="button" onClick={onClose} aria-label={tr('Schliessen')} style={iconButtonStyle}>
            <X size={18} />
          </button>
        </div>
        {children}
      </form>
    </div>
  );
}

// Schnellerfassung KM-Stand von der Startseite: Datum heute, letzter Stand vorgeschlagen.
function QuickOdometerModal({ onClose, onSaved }) {
  const [datum, setDatum] = useState(todayISO());
  const [km, setKm] = useState('');
  const [lastKm, setLastKm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/odometer').then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.latestKm != null) setLastKm(d.latestKm); }).catch(() => {});
  }, []);

  async function submit(e) {
    e.preventDefault();
    if (!km) return;
    setSaving(true);
    try {
      const res = await fetch('/api/odometer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datum, km: Number(km), note: null })
      });
      if (!res.ok) throw new Error(tr('Konnte nicht gespeichert werden.'));
      showToast(tr('Gespeichert'));
      onSaved();
    } catch (err) {
      showToast(err.message === 'Failed to fetch' ? tr('Server nicht erreichbar.') : err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={tr('KM-Stand erfassen')} onClose={onClose} onSubmit={submit}>
      <Field label={tr('Datum')} icon={Calendar}>
        <input type="date" value={datum} onChange={e => setDatum(e.target.value)} style={inputStyle} />
      </Field>
      <Field label={tr('Kilometerstand')} icon={Gauge}>
        <input type="number" inputMode="numeric" value={km} onChange={e => setKm(e.target.value)} autoFocus
          placeholder={lastKm != null ? tr('zuletzt {lastKm}', { lastKm: lastKm.toLocaleString(numLocale()) }) : ''} style={inputStyle} />
      </Field>
      <button type="submit" disabled={saving || !km} style={{ ...primaryButtonStyle, marginTop: 4, opacity: km ? 1 : 0.6 }}>
        {saving ? <Loader2 size={17} className="spin" /> : tr('Speichern')}
      </button>
    </ModalShell>
  );
}

// Schnellerfassung einer einmaligen Ausgabe (landet unter Finanzen als einmaliger Posten).
function QuickExpenseModal({ onClose, onSaved }) {
  const [bezeichnung, setBezeichnung] = useState('');
  const [betrag, setBetrag] = useState('');
  const [kategorie, setKategorie] = useState('fahrzeug');
  const [datum, setDatum] = useState(todayISO());
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!bezeichnung.trim() || betrag === '') return;
    setSaving(true);
    try {
      const res = await fetch('/api/finance-items', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bezeichnung: bezeichnung.trim(), betrag: Number(betrag), typ: 'einmalig', kategorie,
          faellig_datum: datum || null, max_perioden: null
        })
      });
      if (!res.ok) throw new Error(tr('Konnte nicht gespeichert werden.'));
      showToast(tr('Gespeichert'));
      onSaved();
    } catch (err) {
      showToast(err.message === 'Failed to fetch' ? tr('Server nicht erreichbar.') : err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={tr('Ausgabe erfassen')} onClose={onClose} onSubmit={submit}>
      <div style={{ display: 'flex', gap: 8 }}>
        {financeKategorien().filter(k => k.key !== 'sonstiges').map(k => (
          <TagChip key={k.key} label={k.label} active={kategorie === k.key} onClick={() => setKategorie(k.key)} />
        ))}
      </div>
      <Field label={tr('Wofür')}>
        <input value={bezeichnung} onChange={e => setBezeichnung(e.target.value)} placeholder={tr('z.B. Gasflasche')} style={inputStyle} autoFocus />
      </Field>
      <Field label={tr('Betrag')} icon={Wallet}>
        <CurrencyAmountInput value={betrag} onChange={setBetrag} placeholder="0.00" />
      </Field>
      <Field label={tr('Datum')} icon={Calendar}>
        <input type="date" value={datum} onChange={e => setDatum(e.target.value)} style={inputStyle} />
      </Field>
      <button type="submit" disabled={saving} style={{ ...primaryButtonStyle, marginTop: 4 }}>
        {saving ? <Loader2 size={17} className="spin" /> : tr('Speichern')}
      </button>
    </ModalShell>
  );
}

// Pulsierender Platzhalter fuer den Ladezustand (Skeleton statt Spinner).
function SkeletonBlock({ w = '100%', h = 12, r = 6, bg = '#E8EEE5', style }) {
  return <div className="skeleton" style={{ width: w, height: h, borderRadius: r, background: bg, ...style }} />;
}

// Erscheint, wenn der Server nach einigen Sekunden noch nicht geantwortet hat.
function SlowLoadHint({ onRetry }) {
  return (
    <div role="status" style={{
      margin: '0 0 4px', padding: '12px 14px', borderRadius: 14, background: '#FBF4DC',
      border: '1px solid #EAD48A', color: '#4A3E10', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14, lineHeight: 1.4
    }}>
      <span>{tr('Der Server antwortet gerade langsam. Ist die Verbindung (z.B. VPN oder Tailscale) auf diesem Gerät aktiv?')}</span>
      <button onClick={onRetry} style={{
        alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
        padding: 0, color: 'var(--forest)', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)'
      }}>
        <RefreshCw size={15} />{' '}{tr('Erneut versuchen')}
      </button>
    </div>
  );
}

const quickButtonStyle = {
  height: 72, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--card-alt)',
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
  fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500, color: 'var(--text)', cursor: 'pointer', padding: 0
};

const homeH2Style = { margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--muted)' };

const heroButtonStyle = {
  flex: 1, height: 44, borderRadius: 12, fontWeight: 600, fontSize: 15, display: 'flex',
  alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', fontFamily: 'var(--font-body)'
};

function HomeScreen({ trips, entries, wishlist, loading, slow, onRetry, certWarning, setupHint, navigate }) {
  const [quickAdd, setQuickAdd] = useState(null); // 'tanken' | 'laden' | 'km' | 'ausgabe'
  const [odo, setOdo] = useState(null);
  const [fin, setFin] = useState(null);
  const [lists, setLists] = useState(null);

  const loadExtras = useCallback(async () => {
    const get = (u) => fetch(u).then(r => r.ok ? r.json() : null).catch(() => null);
    const [o, f, ek, td] = await Promise.all([
      get('/api/odometer'), get('/api/finance-summary'), get('/api/trip-items/einkauf'), get('/api/trip-items/todo')
    ]);
    if (o) setOdo(o);
    if (f) setFin(financeTotals(f));
    if (ek || td) setLists({
      einkauf: (ek || []).filter(i => !i.checked).length,
      todo: (td || []).filter(i => !i.checked).length
    });
  }, []);
  useEffect(() => { loadExtras(); }, [loadExtras]);
  useAutoRefresh(loadExtras);

  const today = todayISO();
  const activeTrip = trips.find(t => tripPhase(t, today).phase === 'unterwegs');
  const upcoming = trips.filter(t => t.datum_von && t.datum_von > today)
    .sort((a, b) => a.datum_von.localeCompare(b.datum_von));
  const nextTrip = upcoming.find(isConfirmed) || upcoming[0];
  const heroTrip = activeTrip || nextTrip;
  const lastEntry = [...entries].filter(e => e.datum_bis || e.datum_von)
    .sort((a, b) => (b.datum_bis || b.datum_von).localeCompare(a.datum_bis || a.datum_von))[0];
  // Oeffnende Buchungsfenster: aus der Wunschliste und von eingeplanten, noch nicht bestaetigten Trips.
  const inWindow = (d) => d && d >= today && d <= addDaysISO(today, 14);
  const dueSoon = [
    ...(wishlist || []).filter(w => inWindow(w.buchungsfenster_datum)).map(w => ({ key: `w${w.id}`, name: w.name, datum: w.buchungsfenster_datum, go: { name: 'wishlist' } })),
    ...trips.filter(t => !isConfirmed(t) && inWindow(t.buchungsfenster_datum)).map(t => ({ key: `t${t.id}`, name: t.titel, datum: t.buchungsfenster_datum, go: { name: 'tripDetail', tripId: t.id } }))
  ].sort((a, b) => a.datum.localeCompare(b.datum));

  const showSkeleton = loading && trips.length === 0 && entries.length === 0;

  function afterQuickSave() {
    setQuickAdd(null);
    loadExtras();
  }

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)', color: 'var(--text)' }}>
      <div style={{ ...headerBarStyle, borderBottom: 'none' }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 26 }}>{tr('Camping Diary')}</h1>
        <button data-tour="settings" onClick={() => navigate({ name: 'settings' })} aria-label={tr('Einstellungen')}
          style={{ ...iconButtonStyle, border: '1px solid var(--border)', borderRadius: 12 }}>
          <Settings size={20} />
        </button>
      </div>

      <div aria-busy={showSkeleton} style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '4px 18px 28px' }}>
        {slow && loading && <SlowLoadHint onRetry={onRetry} />}

        {setupHint && (
          <button onClick={() => navigate({ name: 'settings' })} style={{
            padding: '12px 14px', background: '#FBF4DC', border: '1px solid #EAD48A', borderRadius: 12,
            display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#4A3E10', textAlign: 'left',
            cursor: 'pointer', fontFamily: 'var(--font-body)', lineHeight: 1.4
          }}>
            <Settings size={18} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{tr('Lege in den Einstellungen Startort und Währung fest. Sie werden für Fahrdistanzen und Beträge gebraucht.')}</span>
            <ChevronRight size={18} style={{ flexShrink: 0 }} />
          </button>
        )}

        {certWarning && (
          <div style={{
            padding: '10px 14px', background: '#FBE9E4', border: '1px solid #E3AE9E',
            borderRadius: 12, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#93341C'
          }}>
            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
            {certWarning}
          </div>
        )}

        {showSkeleton ? (
          <div style={{ background: 'var(--forest)', borderRadius: 20, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <SkeletonBlock w="90px" h={10} bg="#4A7050" />
            <SkeletonBlock w="200px" h={22} bg="#4A7050" />
            <SkeletonBlock w="240px" h={12} bg="#4A7050" />
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <SkeletonBlock h={44} r={12} bg="#4A7050" />
              <SkeletonBlock h={44} r={12} bg="#3B6640" />
            </div>
          </div>
        ) : (
          <div style={{ background: 'var(--forest)', borderRadius: 20, padding: 18, color: '#FFFFFF', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase', color: '#CFE0CC' }}>
                {activeTrip ? tr('Gerade unterwegs') : tr('Nächster Trip')}
              </span>
              {heroTrip ? (
                <>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500 }}>{heroTrip.titel}</span>
                  <span style={{ fontSize: 14, color: '#E3EDE0', lineHeight: 1.4 }}>
                    {[heroTrip.ort, shortRange(heroTrip.datum_von, heroTrip.datum_bis), nightsLabel(heroTrip.datum_von, heroTrip.datum_bis)].filter(Boolean).join(' · ')}
                  </span>
                  <span style={{
                    alignSelf: 'flex-start', marginTop: 4, fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 999,
                    background: activeTrip ? 'var(--yellow)' : '#3B6640', color: activeTrip ? '#2A2205' : '#FFFFFF'
                  }}>{tripPhase(heroTrip, today).label}{!isConfirmed(heroTrip) ? ` · ${tripStatusLabel(heroTrip.status)}` : ''}</span>
                </>
              ) : (
                <>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500 }}>{tr('Noch nichts geplant')}</span>
                  {lastEntry && (
                    <span style={{ fontSize: 14, color: '#E3EDE0', lineHeight: 1.4 }}>
                      {(() => {
                        const d = daysBetween(lastEntry.datum_bis || lastEntry.datum_von, today);
                        const wann = d <= 0 ? tr('gerade eben') : d === 1 ? tr('gestern') : tr('vor {d} Tagen', { d });
                        return tr('Zuletzt wart ihr {wann} in {ort}.', { wann, ort: lastEntry.ort || lastEntry.campingplatz });
                      })()}
                    </span>
                  )}
                </>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {heroTrip ? (
                <button onClick={() => navigate({ name: 'tripDetail', tripId: heroTrip.id })}
                  style={{ ...heroButtonStyle, background: '#FFFFFF', color: 'var(--forest)', border: 'none' }}>
                  {tr('Trip öffnen')}{' '}<ChevronRight size={18} />
                </button>
              ) : (
                <>
                  <button onClick={() => navigate({ name: 'addTrip' })}
                    style={{ ...heroButtonStyle, background: '#FFFFFF', color: 'var(--forest)', border: 'none' }}>
                    <Plus size={18} />{' '}{tr('Trip planen')}
                  </button>
                  {wishlist.length > 0 && (
                    <button onClick={() => navigate({ name: 'wishlist' })}
                      style={{ ...heroButtonStyle, background: 'transparent', color: '#FFFFFF', border: '1px solid #7FA083', fontWeight: 500 }}>
                      {tr('Aus Wunschliste')}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {dueSoon.map(w => {
          const d = daysBetween(today, w.datum);
          return (
            <button key={w.key} onClick={() => navigate(w.go)} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14,
              background: '#FBF4DC', border: '1px solid #EAD48A', color: 'var(--text)', cursor: 'pointer',
              textAlign: 'left', fontFamily: 'var(--font-body)', width: '100%'
            }}>
              <span style={{
                width: 36, height: 36, borderRadius: 10, background: 'var(--yellow)', color: '#2A2205',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}><CalendarDays size={18} /></span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>
                  {d === 0 ? tr('Buchung öffnet heute') : d === 1 ? tr('Buchung öffnet morgen') : tr('Buchung öffnet in {d} Tagen', { d: d })}
                </span>
                <span style={{ fontSize: 13, color: '#5A4C14', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {w.name} · {formatDate(w.datum)}
                </span>
              </span>
              <ChevronRight size={18} color="#5A4C14" />
            </button>
          );
        })}

        <section data-tour="quick" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 style={homeH2Style}>{tr('Schnell erfassen')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
            <button onClick={() => setQuickAdd('tanken')} style={quickButtonStyle}><Droplet size={22} color="var(--forest)" />{tr('Tanken')}</button>
            <button onClick={() => setQuickAdd('laden')} style={quickButtonStyle}><Zap size={22} color="var(--forest)" />{tr('Laden')}</button>
            <button onClick={() => setQuickAdd('km')} style={quickButtonStyle}><Gauge size={22} color="var(--forest)" />{tr('KM-Stand')}</button>
            <button onClick={() => setQuickAdd('ausgabe')} style={quickButtonStyle}><Wallet size={22} color="var(--forest)" />{tr('Ausgabe')}</button>
          </div>
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 style={homeH2Style}>{tr('Listen')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            {[
              { key: 'einkaufsliste', label: tr('Einkaufsliste'), icon: ShoppingCart, count: lists?.einkauf },
              { key: 'todosQuick', label: tr('To-dos'), icon: ListTodo, count: lists?.todo }
            ].map(l => {
              const Icon = l.icon;
              return (
                <button key={l.key} onClick={() => navigate({ name: l.key })} style={{
                  display: 'flex', alignItems: 'center', gap: 10, minHeight: 60, padding: '8px 12px', borderRadius: 14,
                  border: '1px solid var(--border)', background: '#FFFFFF', cursor: 'pointer', fontFamily: 'var(--font-body)',
                  color: 'var(--text)', textAlign: 'left', minWidth: 0
                }}>
                  <Icon size={20} color="var(--forest)" style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{l.label}</span>
                    <span style={{ fontSize: 12, color: l.count ? 'var(--forest)' : 'var(--muted)' }}>
                      {l.count == null ? '\u00a0' : l.count ? tr('{count} offen', { count: l.count }) : tr('alles erledigt')}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 style={homeH2Style}>{tr('Auf einen Blick')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            <button onClick={() => navigate({ name: 'vehicle', tab: 'km' })} style={glanceCardStyle}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>{tr('KM-Budget')}</span>
              {odo ? (
                <>
                  <span style={glanceValueStyle}>{tr('{kmThisYear} km', { kmThisYear: odo.kmThisYear.toLocaleString(numLocale()) })}</span>
                  <div style={{ height: 6, borderRadius: 3, background: '#E6EDE2', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, (odo.kmThisYear / odo.budget) * 100)}%`, height: 6, background: odo.onTrack ? 'var(--forest)' : '#B3402A' }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 500, color: odo.onTrack ? '#3E6B44' : '#93341C' }}>
                    {odo.onTrack ? tr('Im Plan') : tr('Über Plan')} · {Math.round((odo.kmThisYear / odo.budget) * 100)}{tr('% von')}{' '}{odo.budget.toLocaleString(numLocale())}
                  </span>
                </>
              ) : (
                <><SkeletonBlock w="80%" h={20} /><SkeletonBlock h={6} r={3} /><SkeletonBlock w="70%" h={10} /></>
              )}
            </button>
            <button onClick={() => navigate({ name: 'finanzen' })} style={glanceCardStyle}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>{tr('Finanzen')}</span>
              {fin ? (
                <>
                  <span style={glanceValueStyle}>{cur()} {Math.round(fin.total).toLocaleString(numLocale())}</span>
                  <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: '#E6EDE2' }}>
                    <div style={{ width: `${fin.total ? (fin.california / fin.total) * 100 : 0}%`, background: 'var(--forest)' }} />
                    <div style={{ width: `${fin.total ? (fin.camping / fin.total) * 100 : 0}%`, background: 'var(--yellow)' }} />
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{tr('Fix {v} {v2} pro Monat', { v: cur(), v2: Math.round(fin.monthlyFixed).toLocaleString(numLocale()) })}</span>
                </>
              ) : (
                <><SkeletonBlock w="80%" h={20} /><SkeletonBlock h={6} r={3} /><SkeletonBlock w="70%" h={10} /></>
              )}
            </button>
          </div>
        </section>
      </div>

      {(quickAdd === 'tanken' || quickAdd === 'laden') && (
        <QuickVehicleEventModal typ={quickAdd} onClose={() => setQuickAdd(null)} onSaved={afterQuickSave} />
      )}
      {quickAdd === 'km' && <QuickOdometerModal onClose={() => setQuickAdd(null)} onSaved={afterQuickSave} />}
      {quickAdd === 'ausgabe' && <QuickExpenseModal onClose={() => setQuickAdd(null)} onSaved={afterQuickSave} />}
    </div>
  );
}

const glanceCardStyle = {
  borderRadius: 16, border: '1px solid var(--border)', padding: 14, display: 'flex', flexDirection: 'column',
  gap: 8, background: '#FFFFFF', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-body)', color: 'var(--text)',
  minWidth: 0
};
const glanceValueStyle = { fontSize: 21, fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };

// Untere Navigationsleiste mit den fuenf Hauptbereichen.
const TABS = [
  { key: 'home', get label() { return tr('Übersicht'); }, icon: House },
  { key: 'trips', get label() { return tr('Trips'); }, icon: Compass },
  { key: 'vehicle', get label() { return tr('Fahrzeug'); }, icon: CampervanIcon },
  { key: 'finanzen', get label() { return tr('Finanzen'); }, icon: Wallet },
  { key: 'rueckblick', get label() { return tr('Rückblick'); }, icon: BarChart3 }
];

function TabBar({ active, onSelect }) {
  return (
    <nav data-tour="nav" aria-label={tr('Hauptnavigation')} style={{
      flexShrink: 0, display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', background: '#FFFFFF',
      borderTop: '1px solid var(--border)', padding: '6px 4px calc(6px + env(safe-area-inset-bottom, 0px))'
    }}>
      {TABS.map(t => {
        const Icon = t.icon;
        const isActive = active === t.key;
        return (
          <button key={t.key} onClick={() => onSelect(t.key)} aria-current={isActive ? 'page' : undefined} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
            height: 52, margin: '0 2px', borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)',
            background: isActive ? 'var(--forest)' : 'none', transition: 'background 0.15s',
            color: isActive ? '#FFFFFF' : 'var(--muted)', fontSize: 11, fontWeight: isActive ? 600 : 500
          }}>
            <Icon size={22} color="currentColor" />
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}

// Seitenkopf der Hauptbereiche (ohne Zurueck-Pfeil).
function TabHeader({ title, children }) {
  return (
    <div style={{ ...headerBarStyle, borderBottom: 'none' }}>
      <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 26 }}>{title}</h1>
      <div style={{ display: 'flex', gap: 8, minHeight: 44 }}>{children}</div>
    </div>
  );
}

// Segment-Umschalter (z.B. Anstehend / Verlauf / KM-Stand).
function Segmented({ options, value, onChange }) {
  return (
    <div role="tablist" style={{
      display: 'grid', gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`, gap: 4, padding: 4,
      borderRadius: 12, background: 'var(--input-bg)'
    }}>
      {options.map(o => {
        const active = value === o.key;
        return (
          <button key={o.key} role="tab" aria-selected={active} onClick={() => onChange(o.key)} style={{
            height: 36, border: 'none', borderRadius: 9, cursor: 'pointer', fontFamily: 'var(--font-body)',
            background: active ? '#FFFFFF' : 'transparent', boxShadow: active ? '0 1px 3px rgba(30,43,31,0.12)' : 'none',
            fontSize: options.length > 4 ? 13 : 14, fontWeight: active ? 600 : 400, color: active ? 'var(--text)' : 'var(--muted)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: options.length > 4 ? '0 2px' : '0 4px'
          }}>{o.label}</button>
        );
      })}
    </div>
  );
}

const headerActionStyle = { ...iconButtonStyle, border: '1px solid var(--border)', borderRadius: 12 };
const headerPrimaryStyle = { ...iconButtonStyle, background: 'var(--forest)', color: '#FFFFFF', borderRadius: 12 };

function TemplateManager({ category, hint }) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/templates/${category}`);
      if (res.ok) setTemplates(await res.json());
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => { if (open) load(); }, [open, load]);

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      add();
    }
  }

  async function add(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!text.trim()) return;
    const res = await fetch(`/api/templates/${category}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.trim() })
    });
    if (res.ok) { setText(''); load(); }
  }

  async function remove(id) {
    await fetch(`/api/templates/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
        color: 'var(--forest)', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: open ? 10 : 0
      }}>
        <Settings2 size={14} />{' '}{tr('Standard-Punkte verwalten')}
      </button>
      {open && (
        <div style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 10px' }}>{hint}</p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input value={text} onChange={e => setText(e.target.value)} onKeyDown={handleKeyDown} placeholder={tr('Neuer Standard-Punkt')}
              style={{ ...inputStyle, flex: 1, fontSize: 14, padding: '9px 11px' }} />
            <button type="button" onClick={add} style={{ ...primaryButtonStyle, padding: '0 14px' }}><Plus size={17} /></button>
          </div>
          {loading && <Loader2 size={18} className="spin" />}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {templates.map(t => (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', gap: 6, background: 'var(--card-alt)',
                border: '1px solid var(--border)', borderRadius: 999, padding: '5px 6px 5px 12px', fontSize: 13
              }}>
                {t.text}
                <button type="button" onClick={() => remove(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                  <X size={13} color="var(--muted)" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Bewertung mit halben Flammen: Klick auf die linke Haelfte eines Icons setzt n-0.5,
// rechte Haelfte setzt n. Anzeige interpoliert denselben Wert als halb/ganz gefuellt.
function FlameRating({ value, onChange, size = 28, readOnly = false }) {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      {[1, 2, 3, 4, 5].map(n => {
        const filled = value >= n;
        const half = !filled && value >= n - 0.5;
        const content = (
          <div style={{ position: 'relative', width: size, height: size }}>
            <Flame size={size} strokeWidth={2} fill="none" color="var(--yellow-dark)"
              style={{ position: 'absolute', top: 0, left: 0 }} />
            {(filled || half) && (
              <div style={{
                position: 'absolute', top: 0, left: 0, height: '100%',
                width: half ? '50%' : '100%', overflow: 'hidden'
              }}>
                <Flame size={size} strokeWidth={2} fill="var(--yellow)" color="var(--yellow-dark)" />
              </div>
            )}
          </div>
        );
        if (readOnly) return <div key={n}>{content}</div>;
        return (
          <button type="button" key={n} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              onChange(clickX < rect.width / 2 ? n - 0.5 : n);
            }}>
            {content}
          </button>
        );
      })}
    </div>
  );
}

function EntryForm({ existing, prefill, onSaved, onCancel, onEntryUpdated, readOnly = false }) {
  const base = existing || prefill || {};
  const [campingplatz, setCampingplatz] = useState(base.campingplatz || '');
  const [ort, setOrt] = useState(base.ort || '');
  const [datumVon, setDatumVon] = useState(base.datum_von || todayISO());
  const [datumBis, setDatumBis] = useState(base.datum_bis || addDaysISO(base.datum_von || todayISO(), 1));
  const [bewertung, setBewertung] = useState(existing?.bewertung || 4);
  const [wetter, setWetter] = useState(existing?.wetter || '');
  const [kosten, setKosten] = useState(existing?.kosten_pro_nacht ?? '');
  const [kostenRestaurant, setKostenRestaurant] = useState(existing?.kosten_restaurant ?? '');
  const [kostenAktivitaeten, setKostenAktivitaeten] = useState(existing?.kosten_aktivitaeten ?? '');
  const [kilometerstand, setKilometerstand] = useState(existing?.kilometerstand ?? '');
  const [stellplatzgroesse, setStellplatzgroesse] = useState(existing?.stellplatzgroesse || '');
  const [tags, setTags] = useState(existing?.tags || []);
  const [customTag, setCustomTag] = useState('');
  const [existingLessons, setExistingLessons] = useState(existing?.lessons || []);
  const [newLessons, setNewLessons] = useState(['']);
  const [existingTodos, setExistingTodos] = useState(existing?.todos || []);
  const [newTodos, setNewTodos] = useState(['']);
  const [notizen, setNotizen] = useState(existing?.notizen || '');
  const [files, setFiles] = useState([]);
  const [existingPhotos, setExistingPhotos] = useState(existing?.photos || []);
  const [deletingPhotoId, setDeletingPhotoId] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function deleteExistingPhoto(photoId) {
    if (!(await confirmDialog(tr('Dieses Foto wirklich löschen?')))) return;
    setDeletingPhotoId(photoId);
    try {
      const res = await fetch(`/api/photos/${photoId}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) throw new Error(tr('Löschen fehlgeschlagen.'));
      setExistingPhotos(prev => prev.filter(p => p.id !== photoId));
    } catch (e) {
      showToast(e.message === 'Failed to fetch' ? tr('Server nicht erreichbar.') : e.message, 'error');
    } finally {
      setDeletingPhotoId(null);
    }
  }

  // Beim Anlegen eines neuen Eintrags die Standard-To-dos vorausfuellen, editierbar.
  useEffect(() => {
    if (existing) return;
    fetch('/api/templates/entry_todo')
      .then(r => r.ok ? r.json() : [])
      .then(list => {
        if (list.length > 0) setNewTodos(list.map(t => t.text));
      })
      .catch(() => {});
  }, [existing]);

  function toggleTag(tag) {
    setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  }
  function addCustomTag() {
    const t = customTag.trim();
    if (t && !tags.includes(t)) setTags(prev => [...prev, t]);
    setCustomTag('');
  }
  function updateLessonText(idx, value) {
    setNewLessons(prev => prev.map((l, i) => (i === idx ? value : l)));
  }
  function addLessonField() { setNewLessons(prev => [...prev, '']); }
  function removeLessonField(idx) { setNewLessons(prev => prev.filter((_, i) => i !== idx)); }
  function handleLessonKeyDown(e, idx) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (idx === newLessons.length - 1) addLessonField();
    }
  }

  function updateTodoText(idx, value) {
    setNewTodos(prev => prev.map((t, i) => (i === idx ? value : t)));
  }
  function addTodoField() { setNewTodos(prev => [...prev, '']); }
  function removeTodoField(idx) { setNewTodos(prev => prev.filter((_, i) => i !== idx)); }
  function handleTodoKeyDown(e, idx) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (idx === newTodos.length - 1) addTodoField();
    }
  }

  async function fetchWeather() {
    setWeatherLoading(true);
    setError('');
    try {
      const pos = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 })
      );
      const { latitude, longitude } = pos.coords;
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`
      );
      const data = await res.json();
      const cw = data.current_weather;
      const desc = tr(WEATHER_CODES[cw.weathercode] || 'Unbekannt');
      setWetter(tr('{desc}, {temp} Grad', { desc, temp: Math.round(cw.temperature) }));
    } catch (e) {
      setError(tr('Standort/Wetter konnte nicht ermittelt werden. Bitte manuell eintragen.'));
    } finally {
      setWeatherLoading(false);
    }
  }

  async function doSave() {
    if (!campingplatz.trim()) { setError(tr('Campingplatz ist ein Pflichtfeld.')); return null; }
    setError('');
    const form = new FormData();
    form.append('campingplatz', campingplatz);
    form.append('ort', ort);
    form.append('datum_von', datumVon);
    form.append('datum_bis', datumBis);
    form.append('bewertung', String(bewertung));
    form.append('wetter', wetter);
    form.append('kosten_pro_nacht', kosten === '' ? '' : String(kosten));
    form.append('kosten_restaurant', kostenRestaurant === '' ? '' : String(kostenRestaurant));
    form.append('kosten_aktivitaeten', kostenAktivitaeten === '' ? '' : String(kostenAktivitaeten));
    form.append('kilometerstand', kilometerstand === '' ? '' : String(kilometerstand));
    form.append('stellplatzgroesse', stellplatzgroesse);
    form.append('notizen', notizen);
    form.append('tags', JSON.stringify(tags));
    const tripId = existing?.trip_id ?? prefill?.trip_id;
    if (tripId) form.append('trip_id', String(tripId));
    files.forEach(f => form.append('photos', f));

    const cleanNewLessons = newLessons.map(l => l.trim()).filter(Boolean);
    const cleanNewTodos = newTodos.map(t => t.trim()).filter(Boolean);

    let url, method;
    if (existing) {
      url = `/api/entries/${existing.id}`;
      method = 'PUT';
      form.append('newLessons', JSON.stringify(cleanNewLessons));
      form.append('newTodos', JSON.stringify(cleanNewTodos));
    } else {
      url = '/api/entries';
      method = 'POST';
      form.append('lessons', JSON.stringify(cleanNewLessons));
      form.append('todos', JSON.stringify(cleanNewTodos));
    }

    const res = await fetch(url, { method, body: form });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || tr('Speichern fehlgeschlagen.'));
    }
    return res.json();
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const saved = await doSave();
      if (saved) onSaved(saved);
    } catch (err) {
      setError(err.message === 'Failed to fetch' ? tr('Server nicht erreichbar.') : err.message);
    } finally {
      setSaving(false);
    }
  }

  // Automatisches Speichern bestehender Eintraege 800ms nach der letzten Aenderung,
  // ohne die Ansicht zu verlassen (neue Lessons/Todos werden nach dem Speichern in die
  // "bestehend"-Liste verschoben, neu ausgewaehlte Fotos werden nach dem Speichern
  // geleert, damit sie nicht bei jedem weiteren Autosave erneut mitgeschickt werden).
  const autosaveMounted = useRef(false);
  const [justSaved, triggerSaved] = useSavedIndicator();
  useEffect(() => {
    if (!existing || readOnly) return;
    if (!autosaveMounted.current) { autosaveMounted.current = true; return; }
    const timer = setTimeout(async () => {
      try {
        const cleanLessons = newLessons.map(l => l.trim()).filter(Boolean);
        const cleanTodos = newTodos.map(t => t.trim()).filter(Boolean);
        const saved = await doSave();
        triggerSaved();
        if (saved && onEntryUpdated) onEntryUpdated(saved);
        if (files.length > 0) setFiles([]);
        // Frisch gespeicherte Lessons/Todos in die "bestehend"-Liste verschieben,
        // sonst wuerde der naechste Autosave sie erneut als neu mitschicken.
        if (cleanLessons.length > 0) {
          setExistingLessons(prev => [...prev, ...cleanLessons.map((text, i) => ({
            id: `tmp-${Date.now()}-${i}`, text, status: 'offen'
          }))]);
          setNewLessons(['']);
        }
        if (cleanTodos.length > 0) {
          setExistingTodos(prev => [...prev, ...cleanTodos.map((text, i) => ({
            id: `tmp-${Date.now()}-${i}`, text, checked: false
          }))]);
          setNewTodos(['']);
        }
      } catch (err) {
        showToast(err.message === 'Failed to fetch' ? tr('Server nicht erreichbar.') : err.message, 'error');
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [campingplatz, ort, datumVon, datumBis, bewertung, wetter, kosten, kostenRestaurant,
    kostenAktivitaeten, kilometerstand, stellplatzgroesse, tags, notizen, newLessons, newTodos, files]);

  // Falls der Nutzer direkt nach einer Aenderung zurueck navigiert, bevor der 800ms-Autosave
  // gefeuert hat, wuerde die Aenderung sonst stillschweigend verloren gehen (der Timer wird
  // beim Verlassen der Komponente abgebrochen). Deshalb hier beim Verlassen sofort speichern.
  async function handleDone() {
    if (existing && !readOnly) {
      try {
        const saved = await doSave();
        if (saved && onEntryUpdated) onEntryUpdated(saved);
      } catch (err) {
        showToast(err.message === 'Failed to fetch' ? tr('Server nicht erreichbar.') : err.message, 'error');
        return;
      }
    }
    onCancel();
  }

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)', color: 'var(--text)', paddingBottom: 40 }}>
      <div style={natureHeaderBarStyle}>
        <button onClick={handleDone} style={iconButtonStyle}><ArrowLeft size={21} /></button>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 19 }}>
          {readOnly ? tr('Erfahrungsbericht ansehen') : existing ? tr('Bericht bearbeiten') : prefill?.trip_id ? tr('Trip bewerten') : tr('Neuer Bericht')}
        </span>
        <div style={{ minWidth: 38, display: 'flex', justifyContent: 'flex-end' }}>
          <SavedCheckmark show={justSaved} />
        </div>
      </div>

      {prefill && !existing && (
        <div style={{
          margin: '14px 18px 0', padding: '10px 14px', background: 'var(--card-alt)', borderRadius: 10,
          display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--forest)'
        }}>
          <Sparkles size={15} />{' '}{tr('Vorausgefüllt aus deiner Trip-Planung')}
        </div>
      )}

      <form onSubmit={submit}
        style={{
          padding: '18px 18px 0', display: 'flex', flexDirection: 'column', gap: 18,
          ...(readOnly ? { pointerEvents: 'none' } : {})
        }}>
        <Field label={tr('Campingplatz *')} icon={Tent}>
          <input value={campingplatz} onChange={e => setCampingplatz(e.target.value)} style={inputStyle} required />
        </Field>
        <Field label={tr('Ort')} icon={MapPin}>
          <input value={ort} onChange={e => setOrt(e.target.value)} style={inputStyle} placeholder={tr('z.B. Sempach, LU')} />
        </Field>

        <CalendarRangePicker datumVon={datumVon} setDatumVon={setDatumVon} datumBis={datumBis} setDatumBis={setDatumBis} />

        <Field label={tr('Bewertung')} icon={Flame}>
          <FlameRating value={bewertung} onChange={setBewertung} />
        </Field>

        <Field label={tr('Stellplatzgrösse')} icon={Ruler}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {STELLPLATZ_OPTIONEN.map(opt => (
              <TagChip key={opt} label={tr(opt)} active={stellplatzgroesse === opt}
                onClick={() => setStellplatzgroesse(stellplatzgroesse === opt ? '' : opt)} />
            ))}
          </div>
        </Field>

        <Field label={tr('Wetter')} icon={Cloud}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={wetter} onChange={e => setWetter(e.target.value)} style={{ ...inputStyle, flex: 1 }}
              placeholder={tr('z.B. Sonnig, 24 Grad')} />
            <button type="button" onClick={fetchWeather} disabled={weatherLoading}
              style={{ ...iconButtonStyle, background: 'var(--input-bg)', border: '1px solid var(--border)' }}>
              {weatherLoading ? <Loader2 size={19} className="spin" /> : <Cloud size={19} />}
            </button>
          </div>
        </Field>

        <Field label={tr('Kosten pro Nacht')} icon={Wallet}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}><CurrencyAmountInput value={kosten} onChange={setKosten} /></div>
            <CalculatorButton currentValue={kosten} onApply={(sum) => setKosten(String(sum))} />
          </div>
        </Field>

        <Field label={tr('Kosten Restaurant')} icon={Wallet}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}><CurrencyAmountInput value={kostenRestaurant} onChange={setKostenRestaurant} /></div>
            <CalculatorButton currentValue={kostenRestaurant} onApply={(sum) => setKostenRestaurant(String(sum))} />
          </div>
        </Field>

        <Field label={tr('Kosten Aktivitäten')} icon={Wallet}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}><CurrencyAmountInput value={kostenAktivitaeten} onChange={setKostenAktivitaeten} /></div>
            <CalculatorButton currentValue={kostenAktivitaeten} onApply={(sum) => setKostenAktivitaeten(String(sum))} />
          </div>
        </Field>

        <Field label={tr('Kilometerstand ({v})', { v: vehicleLabel() })} icon={Gauge}>
          <input type="number" value={kilometerstand} onChange={e => setKilometerstand(e.target.value)} style={inputStyle}
            placeholder={tr('z.B. {n}', { n: '46200' })} />
        </Field>

        <Field label={tr('Tags')}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {PRESET_TAGS.map(t => (
              <TagChip key={t} label={t} active={tags.includes(t)} onClick={() => toggleTag(t)} />
            ))}
            {tags.filter(t => !PRESET_TAGS.includes(t)).map(t => (
              <TagChip key={t} label={t} active onClick={() => toggleTag(t)} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input value={customTag} onChange={e => setCustomTag(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag(); } }}
              placeholder={tr('Eigenes Tag hinzufügen')} style={{ ...inputStyle, flex: 1 }} />
            <button type="button" onClick={addCustomTag}
              style={{ ...iconButtonStyle, background: 'var(--input-bg)', border: '1px solid var(--border)' }}>
              <Plus size={19} />
            </button>
          </div>
        </Field>

        <Field label={tr('Fotos')} icon={Camera}>
          {existingPhotos.length > 0 && (
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 8 }}>
              {existingPhotos.map(p => (
                <div key={p.id} style={{ position: 'relative', flexShrink: 0 }}>
                  <img src={p.url} alt="" style={{
                    width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)'
                  }} />
                  <button type="button" onClick={() => deleteExistingPhoto(p.id)}
                    disabled={deletingPhotoId === p.id}
                    style={{
                      position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: '50%',
                      background: 'var(--danger, #B3402A)', color: '#fff', border: '2px solid var(--bg)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0
                    }}>
                    {deletingPhotoId === p.id ? <Loader2 size={11} className="spin" /> : <X size={12} />}
                  </button>
                </div>
              ))}
            </div>
          )}
          <label style={{
            ...inputStyle, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: 'var(--muted)'
          }}>
            <Camera size={19} />
            {files.length > 0 ? tr('{length} Foto(s) ausgewählt', { length: files.length }) : tr('Fotos hinzufügen')}
            <input type="file" accept="image/*" multiple
              onChange={e => setFiles(Array.from(e.target.files || []))} style={{ display: 'none' }} />
          </label>
        </Field>

        <Field label={tr('Lessons Learnt')} icon={Lightbulb}>
          {existingLessons.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
              {existingLessons.map(l => (
                <div key={l.id} style={{
                  fontSize: 14, color: 'var(--muted)', padding: '9px 11px',
                  background: 'var(--input-bg)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8
                }}>
                  {l.status === 'umgesetzt' ? <CheckCircle2 size={15} color="var(--forest)" /> : <Circle size={15} />}
                  {l.text}
                </div>
              ))}
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                {tr('Status lässt sich im Bereich "Lessons Learnt" ändern.')}
              </div>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {newLessons.map((l, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8 }}>
                <input value={l} onChange={e => updateLessonText(idx, e.target.value)}
                  onKeyDown={e => handleLessonKeyDown(e, idx)}
                  placeholder={tr('z.B. Frühe Ankunft lohnt sich für Seeplätze, Enter für weitere')}
                  style={{ ...inputStyle, flex: 1 }} />
                {newLessons.length > 1 && (
                  <button type="button" onClick={() => removeLessonField(idx)} style={iconButtonStyle}>
                    <X size={17} />
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={addLessonField} style={{
              ...iconButtonStyle, width: 'auto', justifyContent: 'flex-start', gap: 6,
              color: 'var(--forest)', fontSize: 14
            }}>
              <Plus size={17} />{' '}{tr('Weitere Lesson')}
            </button>
          </div>
        </Field>

        <Field label={tr('To-dos')} icon={ListTodo}>
          {existingTodos.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
              {existingTodos.map(t => (
                <div key={t.id} style={{
                  fontSize: 14, color: 'var(--muted)', padding: '9px 11px',
                  background: 'var(--input-bg)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8
                }}>
                  {t.checked ? <CheckCircle2 size={15} color="var(--forest)" /> : <Circle size={15} />}
                  {t.text}
                </div>
              ))}
            </div>
          )}
          <TemplateManager category="entry_todo" hint={tr('Diese Punkte werden hier automatisch vorausgefüllt, sobald du einen neuen Eintrag anlegst.')} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {newTodos.map((t, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8 }}>
                <input value={t} onChange={e => updateTodoText(idx, e.target.value)}
                  onKeyDown={e => handleTodoKeyDown(e, idx)}
                  placeholder={tr('z.B. Fotos sichern, Enter für weitere')}
                  style={{ ...inputStyle, flex: 1 }} />
                {newTodos.length > 1 && (
                  <button type="button" onClick={() => removeTodoField(idx)} style={iconButtonStyle}>
                    <X size={17} />
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={addTodoField} style={{
              ...iconButtonStyle, width: 'auto', justifyContent: 'flex-start', gap: 6,
              color: 'var(--forest)', fontSize: 14
            }}>
              <Plus size={17} />{' '}{tr('Weiteres To-do')}
            </button>
          </div>
        </Field>

        <Field label={tr('Notizen')}>
          <textarea value={notizen} onChange={e => setNotizen(e.target.value)} rows={7}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'var(--font-body)' }} />
        </Field>

        {!readOnly && error && <div style={{ color: '#B3402A', fontSize: 14 }}>{error}</div>}

        {readOnly ? null : existing ? (
          <button type="button" onClick={handleDone} style={{ ...primaryButtonStyle, marginTop: 4, marginBottom: 24 }}>
            {tr('Fertig')}
          </button>
        ) : (
          <button type="submit" disabled={saving} style={{ ...primaryButtonStyle, marginTop: 4, marginBottom: 24 }}>
            {saving ? <Loader2 size={17} className="spin" /> : tr('Speichern')}
          </button>
        )}
      </form>
      {readOnly && (
        <div style={{ padding: '0 18px 24px' }}>
          <button type="button" onClick={onCancel} style={{ ...primaryButtonStyle, marginTop: 4 }}>
            {tr('Zurück')}
          </button>
        </div>
      )}
    </div>
  );
}

function InfoRow({ icon, label, value }) {
  const Icon = icon;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15 }}>
      <Icon size={17} color="var(--forest)" />
      <span style={{ color: 'var(--muted)', minWidth: 140 }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function EntryTodosSection({ entry, onRefresh }) {
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);
  const todos = entry.todos || [];

  async function addTodo(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/entries/${entry.id}/todos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() })
      });
      if (res.ok) { setText(''); onRefresh(); }
    } finally {
      setAdding(false);
    }
  }

  async function toggle(todo) {
    await fetch(`/api/entry-todos/${todo.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checked: !todo.checked })
    });
    onRefresh();
  }

  async function remove(todo) {
    await fetch(`/api/entry-todos/${todo.id}`, { method: 'DELETE' });
    onRefresh();
  }

  if (todos.length === 0) return null;

  return (
    <div>
      <div style={sectionLabelStyle}>{tr('To-dos')}</div>
      <form onSubmit={addTodo} style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input value={text} onChange={e => setText(e.target.value)} placeholder={tr('To-do hinzufügen...')}
          style={{ ...inputStyle, flex: 1 }} />
        <button type="submit" disabled={adding} style={{ ...primaryButtonStyle, padding: '0 16px' }}>
          {adding ? <Loader2 size={16} className="spin" /> : <Plus size={18} />}
        </button>
      </form>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {todos.map(todo => (
          <div key={todo.id} style={{
            display: 'flex', alignItems: 'center', gap: 10, background: 'var(--card-alt)',
            border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px'
          }}>
            <button onClick={() => toggle(todo)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              {todo.checked ? <CheckCircle2 size={19} color="var(--forest)" /> : <Circle size={19} color="var(--muted)" />}
            </button>
            <span style={{
              flex: 1, fontSize: 14, textDecoration: todo.checked ? 'line-through' : 'none',
              color: todo.checked ? 'var(--muted)' : 'var(--text)'
            }}>{todo.text}</span>
            <button onClick={() => remove(todo)} style={{ ...iconButtonStyle, width: 26, height: 26 }}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function EntryDetail({ entry, onBack, onEdit, onView, onDeleted, onLessonChanged, onRefreshEntry }) {
  const [deleting, setDeleting] = useState(false);
  const [blogLoading, setBlogLoading] = useState(false);
  const [blogOpen, setBlogOpen] = useState(false);
  const [blogJsonText, setBlogJsonText] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [heroPhotoId, setHeroPhotoId] = useState(null);
  const [fotoIds, setFotoIds] = useState([]);
  const [lightboxUrl, setLightboxUrl] = useState(null);

  async function generateBlogPost() {
    setBlogOpen(true);
    setBlogLoading(true);
    setBlogJsonText('');
    // Vorauswahl: erstes Foto als Titelbild, restliche fuer den Fotostreifen.
    const photos = entry.photos || [];
    setHeroPhotoId(photos[0]?.id ?? null);
    setFotoIds(photos.slice(1).map(p => p.id));
    try {
      const res = await fetch(`/api/entries/${entry.id}/blogpost`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || tr('Blogbeitrag konnte nicht erstellt werden.'));
      setBlogJsonText(JSON.stringify(data.post || {}, null, 2));
    } catch (e) {
      setBlogOpen(false);
      showToast(e.message === 'Failed to fetch' ? tr('Server nicht erreichbar.') : e.message, 'error');
    } finally {
      setBlogLoading(false);
    }
  }

  function toggleFotoId(id) {
    setFotoIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  }

  async function copyBlogText() {
    try {
      await navigator.clipboard.writeText(blogJsonText);
      showToast(tr('In die Zwischenablage kopiert'));
    } catch {
      showToast(tr('Kopieren fehlgeschlagen.'), 'error');
    }
  }

  async function publishBlogPost() {
    let parsed;
    try {
      parsed = JSON.parse(blogJsonText);
    } catch {
      showToast(tr('JSON ist ungültig, bitte prüfen.'), 'error');
      return;
    }
    setPublishing(true);
    try {
      const res = await fetch(`/api/entries/${entry.id}/blogpost/publish`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post: parsed, heroPhotoId, fotoIds })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || tr('Upload fehlgeschlagen.'));
      // Rueckmeldung zur englischen Fassung (seit v4.1)
      const en = data.english && data.english.status;
      const enText = en === 'published' ? tr('Deutsch und Englisch in GitHub hochgeladen')
        : en === 'unchanged' ? tr('In GitHub hochgeladen, englische Fassung war schon aktuell')
        : en === 'manual' ? tr('In GitHub hochgeladen, englische Fassung von Hand bearbeitet und nicht überschrieben')
        : tr('In GitHub hochgeladen, englische Fassung folgt automatisch');
      showToast(enText);
      setBlogOpen(false);
    } catch (e) {
      showToast(e.message === 'Failed to fetch' ? tr('Server nicht erreichbar.') : e.message, 'error');
    } finally {
      setPublishing(false);
    }
  }

  async function remove() {
    if (!(await confirmDialog(tr('Diesen Eintrag wirklich löschen?')))) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/entries/${entry.id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) throw new Error(tr('Löschen fehlgeschlagen.'));
      onDeleted(entry.id);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setDeleting(false);
    }
  }

  async function toggleLesson(lesson) {
    const newStatus = lesson.status === 'umgesetzt' ? 'offen' : 'umgesetzt';
    try {
      const res = await fetch(`/api/lessons/${lesson.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) throw new Error(tr('Status konnte nicht geändert werden.'));
      onLessonChanged(entry.id, lesson.id, newStatus);
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)', color: 'var(--text)', paddingBottom: 40 }}>
      <div style={natureHeaderBarStyle}>
        <button onClick={onBack} style={iconButtonStyle}><ArrowLeft size={21} /></button>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.campingplatz}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => onView(entry)} style={iconButtonStyle}><Eye size={19} /></button>
          <button onClick={() => onEdit(entry)} style={iconButtonStyle}><Pencil size={19} /></button>
          <button onClick={remove} disabled={deleting} style={iconButtonStyle}>
            {deleting ? <Loader2 size={17} className="spin" /> : <Trash2 size={19} />}
          </button>
        </div>
      </div>

      {entry.photos?.length > 0 && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '14px 14px 0' }}>
          {entry.photos.map(p => (
            <img key={p.id} src={p.url} alt="" onClick={() => setLightboxUrl(p.url)}
              style={{ width: 150, height: 150, objectFit: 'cover', borderRadius: 12, flexShrink: 0, cursor: 'zoom-in' }} />
          ))}
        </div>
      )}

      {lightboxUrl && (
        <div onClick={() => setLightboxUrl(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(20,28,20,0.9)', zIndex: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, cursor: 'zoom-out'
        }}>
          <img src={lightboxUrl} alt="" onClick={e => e.stopPropagation()}
            style={{ maxWidth: '92vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8 }} />
          <button onClick={() => setLightboxUrl(null)} style={{
            position: 'absolute', top: 16, right: 16, width: 38, height: 38, borderRadius: '50%',
            background: 'rgba(255,255,255,0.15)', border: 'none', color: '#FFFFFF',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
          }}>
            <X size={20} />
          </button>
        </div>
      )}

      <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, margin: '0 0 6px' }}>{entry.campingplatz}</h1>
          {entry.ort && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)', fontSize: 15 }}>
              <MapPin size={15} /> <CountryFlag ort={entry.ort} />{entry.ort}
            </div>
          )}
        </div>

        {entry.tags?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {entry.tags.map(t => <TagChip key={t} label={t} active small />)}
          </div>
        )}

        <FlameRating value={entry.bewertung || 0} size={20} readOnly />

        <InfoRow icon={Calendar} label={tr('Zeitraum')}
          value={`${formatDate(entry.datum_von)}${entry.datum_bis ? ' ' + tr('bis') + ' ' + formatDate(entry.datum_bis) : ''}`} />
        {entry.stellplatzgroesse && <InfoRow icon={Ruler} label={tr('Stellplatzgrösse')} value={tr(entry.stellplatzgroesse)} />}
        {entry.wetter && <InfoRow icon={Cloud} label={tr('Wetter')} value={entry.wetter} />}
        {entry.kosten_pro_nacht != null && entry.kosten_pro_nacht !== '' && (
          <InfoRow icon={Wallet} label={tr('Kosten pro Nacht')} value={`${cur()} ${Number(entry.kosten_pro_nacht).toFixed(2)}`} />
        )}
        {entry.kosten_restaurant != null && entry.kosten_restaurant !== '' && (
          <InfoRow icon={Wallet} label={tr('Kosten Restaurant')} value={`${cur()} ${Number(entry.kosten_restaurant).toFixed(2)}`} />
        )}
        {entry.kosten_aktivitaeten != null && entry.kosten_aktivitaeten !== '' && (
          <InfoRow icon={Wallet} label={tr('Kosten Aktivitäten')} value={`${cur()} ${Number(entry.kosten_aktivitaeten).toFixed(2)}`} />
        )}
        {entry.kilometerstand != null && <InfoRow icon={Gauge} label={tr('Kilometerstand')} value={`${entry.kilometerstand.toLocaleString(numLocale())} km`} />}

        {entry.lessons?.length > 0 && (
          <div>
            <div style={sectionLabelStyle}>{tr('Lessons Learnt')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {entry.lessons.map(l => (
                <button key={l.id} onClick={() => toggleLesson(l)} style={{
                  display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
                  background: 'var(--card-alt)', border: 'none', borderRadius: 8, padding: '11px 13px',
                  color: 'var(--text)', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 15
                }}>
                  {l.status === 'umgesetzt'
                    ? <CheckCircle2 size={17} color="var(--forest)" style={{ flexShrink: 0 }} />
                    : <Circle size={17} color="var(--muted)" style={{ flexShrink: 0 }} />}
                  <span style={{ textDecoration: l.status === 'umgesetzt' ? 'line-through' : 'none', color: l.status === 'umgesetzt' ? 'var(--muted)' : 'var(--text)' }}>
                    {l.text}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <EntryTodosSection entry={entry} onRefresh={onRefreshEntry} />

        {entry.notizen && (
          <div>
            <div style={sectionLabelStyle}>{tr('Notizen')}</div>
            <p style={{ margin: 0, lineHeight: 1.5, fontSize: 15, color: 'var(--muted)' }}>{entry.notizen}</p>
          </div>
        )}

        {APP_CONFIG.features.blog && <button onClick={generateBlogPost} disabled={blogLoading} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          background: 'var(--card-alt)', border: '1px solid var(--border)', borderRadius: 10,
          padding: '12px 14px', color: 'var(--forest)', cursor: 'pointer', fontSize: 14,
          fontFamily: 'var(--font-body)', fontWeight: 600
        }}>
          {blogLoading ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
          {tr('Blogbeitrag erstellen')}
        </button>}
      </div>

      {blogOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(30,43,31,0.45)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 400, padding: 24, animation: 'fadeIn 0.15s ease-out'
        }}>
          <div style={{
            background: '#FFFFFF', borderRadius: 16, padding: 20, maxWidth: 460, width: '100%',
            maxHeight: '85vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 50px rgba(0,0,0,0.3)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--text)' }}>{tr('Blogbeitrag')}</span>
              <button onClick={() => setBlogOpen(false)} style={{ ...iconButtonStyle, width: 30, height: 30 }}>
                <X size={17} />
              </button>
            </div>
            {blogLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 40, color: 'var(--muted)' }}>
                <Loader2 size={22} className="spin" />
              </div>
            ) : blogJsonText ? (
              <>
                {entry.photos?.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={sectionLabelStyle}>{tr('Fotos für den Beitrag')}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                      {tr('Titelbild auswählen und Fotos für den Fotostreifen ankreuzen. Wird beim Hochladen direkt vom Server ins Blog-Repo übertragen, ohne über Claude zu laufen.')}
                    </div>
                    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                      {entry.photos.map(p => (
                        <div key={p.id} style={{ flexShrink: 0, width: 84, textAlign: 'center' }}>
                          <div style={{ position: 'relative' }}>
                            <img src={p.url} alt="" style={{
                              width: 84, height: 84, objectFit: 'cover', borderRadius: 8,
                              border: heroPhotoId === p.id ? '2px solid var(--forest)' : '1px solid var(--border)'
                            }} />
                          </div>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, marginTop: 4, cursor: 'pointer' }}>
                            <input type="radio" name="heroPhoto" checked={heroPhotoId === p.id}
                              onChange={() => setHeroPhotoId(p.id)} />
                            {tr('Titelbild')}
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer' }}>
                            <input type="checkbox" checked={fotoIds.includes(p.id)}
                              onChange={() => toggleFotoId(p.id)} />
                            {tr('Streifen')}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                  {tr('Vor dem Hochladen bei Bedarf anpassen. Wird als Markdown-Datei mit Frontmatter gespeichert.')}
                </div>
                <textarea value={blogJsonText} onChange={e => setBlogJsonText(e.target.value)}
                  style={{
                    flex: 1, minHeight: 220, resize: 'vertical', marginBottom: 14,
                    background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 10,
                    padding: 12, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', fontSize: 12.5,
                    lineHeight: 1.5, outline: 'none'
                  }} />
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={copyBlogText} style={{
                    flex: 1, background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 10,
                    padding: '14px 0', fontSize: 15, fontWeight: 600, cursor: 'pointer', color: 'var(--text)',
                    fontFamily: 'var(--font-body)'
                  }}>
                    {tr('Kopieren')}
                  </button>
                  <button onClick={publishBlogPost} disabled={publishing} style={{ ...primaryButtonStyle, flex: 1 }}>
                    {publishing ? <Loader2 size={17} className="spin" /> : tr('In GitHub hochladen')}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

const doneToggleStyle = {
  display: 'flex', alignItems: 'center', gap: 6, height: 40, padding: 0, marginBottom: 6, background: 'none', border: 'none',
  color: 'var(--muted)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-body)'
};

function LessonsView({ lessons, loading, error, onToggle, onDelete, onAddStandalone, onBack }) {
  const [newText, setNewText] = useState('');
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const offen = lessons.filter(l => l.status !== 'umgesetzt');
  const umgesetzt = lessons.filter(l => l.status === 'umgesetzt');

  async function submitNew(e) {
    e.preventDefault();
    if (!newText.trim()) return;
    setAdding(true);
    try {
      await onAddStandalone(newText.trim());
      setNewText('');
    } finally {
      setAdding(false);
    }
  }

  function Row({ lesson }) {
    return (
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, background: 'var(--card-alt)',
        border: '1px solid var(--border)', borderRadius: 12, padding: '13px 14px'
      }}>
        <button onClick={() => onToggle(lesson)} aria-label={lesson.status === 'umgesetzt' ? tr('Als offen markieren') : tr('Als umgesetzt markieren')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 1 }}>
          {lesson.status === 'umgesetzt'
            ? <CheckCircle2 size={21} color="var(--forest)" />
            : <Circle size={21} color="var(--muted)" />}
        </button>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 15, lineHeight: 1.4,
            textDecoration: lesson.status === 'umgesetzt' ? 'line-through' : 'none',
            color: lesson.status === 'umgesetzt' ? 'var(--muted)' : 'var(--text)'
          }}>
            {lesson.text}
          </div>
          {lesson.campingplatz && (
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
              {lesson.campingplatz}{lesson.datum_von ? ` · ${formatDate(lesson.datum_von)}` : ''}
            </div>
          )}
          {lesson.status === 'umgesetzt' && lesson.erledigt_am && (
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{tr('erledigt am {erledigt_am}', { erledigt_am: formatDate(lesson.erledigt_am) })}</div>
          )}
        </div>
        <button onClick={() => onDelete(lesson)} style={{ ...iconButtonStyle, width: 30, height: 30 }}>
          <Trash2 size={15} />
        </button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)', color: 'var(--text)', paddingBottom: 60 }}>
      <div style={headerBarStyle}>
        <button onClick={onBack} style={iconButtonStyle}><ArrowLeft size={21} /></button>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 19 }}>{tr('Lessons Learnt')}</span>
        <div style={{ width: 44 }} />
      </div>

      <div style={{ padding: '14px 18px 0' }}>
        <form onSubmit={submitNew} style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          <input value={newText} onChange={e => setNewText(e.target.value)}
            placeholder={tr('Neue Lesson hinzufügen...')} style={{ ...inputStyle, flex: 1 }} />
          <button type="submit" disabled={adding} style={{ ...primaryButtonStyle, padding: '0 16px' }}>
            {adding ? <Loader2 size={17} className="spin" /> : <Plus size={19} />}
          </button>
        </form>

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40, color: 'var(--muted)' }}>
            <Loader2 size={22} className="spin" />
          </div>
        )}
        {error && <div style={{ color: '#B3402A', fontSize: 14 }}>{error}</div>}

        {!loading && !error && lessons.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
            <Lightbulb size={34} style={{ marginBottom: 10, opacity: 0.5 }} />
            <p style={{ fontSize: 15 }}>{tr('Noch keine Lessons Learnt gesammelt.')}</p>
          </div>
        )}

        {offen.length > 0 && (
          <>
            <div style={sectionLabelStyle}>{tr('Offen · {length}', { length: offen.length })}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
              {offen.map(l => <Row key={l.id} lesson={l} />)}
            </div>
          </>
        )}

        {!loading && !error && lessons.length > 0 && offen.length === 0 && (
          <div style={{ textAlign: 'center', padding: '16px 10px 22px', color: 'var(--muted)', fontSize: 14 }}>
            {tr('Alles umgesetzt. Neue Erkenntnisse oben eintragen oder direkt im Trip notieren.')}
          </div>
        )}

        {umgesetzt.length > 0 && (
          <>
            <button onClick={() => setShowDone(v => !v)} style={doneToggleStyle}>
              <ChevronDown size={16} style={{ transform: showDone ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
              {showDone ? tr('Umgesetzte ausblenden') : tr('{length} umgesetzte anzeigen', { length: umgesetzt.length })}
            </button>
            {showDone && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {umgesetzt.map(l => <Row key={l.id} lesson={l} />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// --- Trip-Planung ---

// Wunschliste: Campingplaetze, die man sich fuer die Zukunft vormerkt.
function WishlistForm({ existing, onSaved, onCancel }) {
  const [name, setName] = useState(existing?.name || '');
  const [ort, setOrt] = useState(existing?.ort || '');
  const [keinFenster, setKeinFenster] = useState(existing ? !existing.buchungsfenster_datum : false);
  const [datum, setDatum] = useState(existing?.buchungsfenster_datum || '');
  const [minNaechte, setMinNaechte] = useState(existing?.min_naechte ? String(existing.min_naechte) : '');
  const [link, setLink] = useState(existing?.link || '');
  const [notizen, setNotizen] = useState(existing?.notizen || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) { setError(tr('Name ist ein Pflichtfeld.')); return; }
    setError('');
    setSaving(true);
    try {
      const url = existing ? `/api/wishlist/${existing.id}` : '/api/wishlist';
      const method = existing ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, ort, link,
          buchungsfenster_datum: keinFenster ? null : (datum || null),
          min_naechte: minNaechte ? Number(minNaechte) : null,
          notizen
        })
      });
      if (!res.ok) throw new Error(tr('Speichern fehlgeschlagen.'));
      onSaved(await res.json());
    } catch (err) {
      setError(err.message === 'Failed to fetch' ? tr('Server nicht erreichbar.') : err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)', color: 'var(--text)', paddingBottom: 40 }}>
      <div style={natureHeaderBarStyle}>
        <button onClick={onCancel} style={iconButtonStyle}><ArrowLeft size={21} /></button>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 19 }}>
          {existing ? tr('Wunsch bearbeiten') : tr('Neuer Wunsch')}
        </span>
        <div style={{ width: 44 }} />
      </div>

      <form onSubmit={submit} style={{ padding: '18px 18px 0', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Field label={tr('Name')} icon={Tent}>
          <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder={tr('z.B. Camping Seeblick')} />
        </Field>

        <Field label={tr('Ort')} icon={MapPin}>
          <input value={ort} onChange={e => setOrt(e.target.value)} style={inputStyle} placeholder={tr('z.B. Erlach, BE')} />
        </Field>

        <Field label={tr('Buchungsfenster')} icon={Calendar}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--muted)', marginBottom: 10 }}>
            <input type="checkbox" checked={keinFenster} onChange={e => setKeinFenster(e.target.checked)} />
            {tr('Kein Buchungsfenster nötig')}
          </label>
          {!keinFenster && (
            <input type="date" value={datum} onChange={e => setDatum(e.target.value)} style={inputStyle} />
          )}
        </Field>

        <Field label={tr('Mindestanzahl Nächte (optional)')} icon={CalendarDays}>
          <input type="number" inputMode="numeric" min="1" max="60" value={minNaechte}
            onChange={e => setMinNaechte(e.target.value.replace(/[^0-9]/g, ''))} style={inputStyle} placeholder={tr('z.B. 3')} />
        </Field>

        <Field label={tr('Link (optional)')} icon={Tag}>
          <input value={link} onChange={e => setLink(e.target.value)} style={inputStyle} placeholder="https://..." />
        </Field>

        <Field label={tr('Notizen')}>
          <textarea value={notizen} onChange={e => setNotizen(e.target.value)} rows={4}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'var(--font-body)' }} />
        </Field>

        {error && <div style={{ color: '#B3402A', fontSize: 14 }}>{error}</div>}

        <button type="submit" disabled={saving} style={{ ...primaryButtonStyle, marginTop: 4, marginBottom: 24 }}>
          {saving ? <Loader2 size={17} className="spin" /> : tr('Speichern')}
        </button>
      </form>
    </div>
  );
}

// Liste der vorgemerkten Campingplaetze, sortiert nach naechstem Buchungsfenster.
function WishlistView({ wishlist, loading, error, onBack, onEdit, onAdd, onDelete, onConvertToTrip }) {
  const withDate = wishlist.filter(w => w.buchungsfenster_datum).sort((a, b) => a.buchungsfenster_datum.localeCompare(b.buchungsfenster_datum));
  const withoutDate = wishlist.filter(w => !w.buchungsfenster_datum);

  function renderItem(w) {
    return (
      <div key={w.id} style={{
        background: 'var(--card-alt)', border: '1px solid var(--border)', borderRadius: 14, padding: 14, marginBottom: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>{w.name}</div>
            {w.ort && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}><CountryFlag ort={w.ort} />{w.ort}</div>}
          </div>
          <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
            <button onClick={() => onEdit(w)} style={{ ...iconButtonStyle, width: 30, height: 30 }}><Pencil size={14} /></button>
            <button onClick={() => onDelete(w.id)} style={{ ...iconButtonStyle, width: 30, height: 30 }}><Trash2 size={14} /></button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--forest)', marginTop: 8 }}>
          <Calendar size={13} />
          {w.buchungsfenster_datum
            ? tr('Buchungsfenster öffnet {buchungsfenster_datum}', { buchungsfenster_datum: formatDate(w.buchungsfenster_datum) })
            : tr('Kein Buchungsfenster nötig')}
        </div>
        {w.min_naechte ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            <CalendarDays size={13} />{tr('mind. {n} Nächte', { n: w.min_naechte })}
          </div>
        ) : null}

        {w.link && (
          <a href={w.link} target="_blank" rel="noopener noreferrer" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 13,
            color: 'var(--forest)', textDecoration: 'none', fontWeight: 600
          }}>
            <Tag size={13} />{' '}{tr('Webseite öffnen')}
          </a>
        )}

        {w.notizen && <p style={{ fontSize: 14, color: 'var(--muted)', margin: '8px 0 0' }}>{w.notizen}</p>}

        <button onClick={() => onConvertToTrip(w)} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', marginTop: 12,
          background: 'var(--forest)', color: '#FFFFFF', border: 'none', borderRadius: 10, padding: '9px 0',
          fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)'
        }}>
          <Tent size={14} />{' '}{tr('In Trip umwandeln')}
        </button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)', color: 'var(--text)', paddingBottom: 100 }}>
      <div style={natureHeaderBarStyle}>
        <button onClick={onBack} style={iconButtonStyle}><ArrowLeft size={21} /></button>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 19 }}>{tr('Wunschliste')}</span>
        <button onClick={onAdd} style={iconButtonStyle}><Plus size={21} /></button>
      </div>

      <div style={{ padding: '14px 18px 90px' }}>
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40, color: 'var(--muted)' }}>
            <Loader2 size={22} className="spin" />
          </div>
        )}
        {error && <div style={{ color: '#B3402A', fontSize: 14 }}>{error}</div>}
        {!loading && !error && wishlist.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
            <Compass size={34} style={{ marginBottom: 10, opacity: 0.5 }} />
            <p style={{ fontSize: 15 }}>{tr('Noch keine Plätze vorgemerkt.')}</p>
          </div>
        )}
        {withDate.length > 0 && (
          <>
            <div style={sectionLabelStyle}>{tr('Mit Buchungsfenster')}</div>
            {withDate.map(renderItem)}
          </>
        )}
        {withoutDate.length > 0 && (
          <>
            <div style={{ ...sectionLabelStyle, marginTop: withDate.length > 0 ? 16 : 0 }}>{tr('Ohne Einschränkung')}</div>
            {withoutDate.map(renderItem)}
          </>
        )}
      </div>
    </div>
  );
}

function TripStatusChips({ value, onChange }) {
  return (
    <div role="radiogroup" aria-label={tr('Status')} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {TRIP_STATUSES.map(k => {
        const active = (value || 'bestaetigt') === k;
        return (
          <button key={k} type="button" role="radio" aria-checked={active} onClick={() => onChange(k)} style={{
            borderRadius: 999, padding: '8px 14px', fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font-body)',
            border: `1px ${k === 'bestaetigt' ? 'solid' : 'dashed'} ${active ? 'var(--forest)' : '#9AAE9C'}`,
            background: active ? 'var(--forest)' : '#FFFFFF', color: active ? '#FFFFFF' : 'var(--muted)', fontWeight: active ? 600 : 400
          }}>{tripStatusLabel(k)}</button>
        );
      })}
    </div>
  );
}

function TripForm({ existing, prefill, trips, onSaved, onCancel }) {
  const [titel, setTitel] = useState(existing?.titel || prefill?.titel || '');
  const [ort, setOrt] = useState(existing?.ort || prefill?.ort || '');
  const [datumVon, setDatumVon] = useState(existing?.datum_von || prefill?.datum_von || todayISO());
  const [datumBis, setDatumBis] = useState(existing?.datum_bis || prefill?.datum_bis || addDaysISO(existing?.datum_von || prefill?.datum_von || todayISO(), 3));
  const [notizen, setNotizen] = useState(existing?.notizen || prefill?.notizen || '');
  const [status, setStatus] = useState(existing?.status || prefill?.status || 'bestaetigt');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const overlaps = overlappingTrips(trips, datumVon, datumBis, existing?.id);

  async function doSave() {
    if (!titel.trim()) { setError(tr('Titel ist ein Pflichtfeld.')); return null; }
    if (overlaps.length) return null;
    setError('');
    const url = existing ? `/api/trips/${existing.id}` : '/api/trips';
    const method = existing ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        titel, ort, datum_von: datumVon, datum_bis: datumBis, notizen, status,
        ...(!existing && prefill?.buchungsfenster_datum ? { buchungsfenster_datum: prefill.buchungsfenster_datum } : {})
      })
    });
    if (!res.ok) throw new Error(tr('Speichern fehlgeschlagen.'));
    return res.json();
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const saved = await doSave();
      if (saved) onSaved(saved);
    } catch (err) {
      setError(err.message === 'Failed to fetch' ? tr('Server nicht erreichbar.') : err.message);
    } finally {
      setSaving(false);
    }
  }

  const autosaveMounted = useRef(false);
  const [justSaved, triggerSaved] = useSavedIndicator();
  useEffect(() => {
    if (!existing) return;
    if (!autosaveMounted.current) { autosaveMounted.current = true; return; }
    const timer = setTimeout(async () => {
      try {
        const saved = await doSave();
        if (saved) triggerSaved();
      } catch (err) {
        showToast(err.message === 'Failed to fetch' ? tr('Server nicht erreichbar.') : err.message, 'error');
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [titel, ort, datumVon, datumBis, notizen, status]);

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)', color: 'var(--text)', paddingBottom: 40 }}>
      <div style={natureHeaderBarStyle}>
        <button onClick={onCancel} style={iconButtonStyle}><ArrowLeft size={21} /></button>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 19 }}>{existing ? tr('Trip bearbeiten') : tr('Neuer Trip')}</span>
        <div style={{ minWidth: 38, display: 'flex', justifyContent: 'flex-end' }}>
          <SavedCheckmark show={justSaved} />
        </div>
      </div>
      {!existing && (
        <div style={{
          margin: '14px 18px 0', padding: '10px 14px', background: 'var(--card-alt)', borderRadius: 10,
          display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--forest)'
        }}>
          <Backpack size={15} />{' '}{tr('Standard-Packliste und -To-dos werden automatisch übernommen')}
        </div>
      )}
      <form onSubmit={submit} style={{ padding: '18px 18px 0', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Field label={tr('Campingplatz *')} icon={Tent}>
          <input value={titel} onChange={e => setTitel(e.target.value)} style={inputStyle}
            placeholder={tr('z.B. TCS Camping Sempach')} required />
        </Field>
        <Field label={tr('Ort')} icon={MapPin}>
          <input value={ort} onChange={e => setOrt(e.target.value)} style={inputStyle} placeholder={tr('z.B. Sempach, LU')} />
        </Field>
        <CalendarRangePicker datumVon={datumVon} setDatumVon={setDatumVon} datumBis={datumBis} setDatumBis={setDatumBis} />
        {overlaps.length > 0 && (
          <div role="alert" style={{ fontSize: 14, lineHeight: 1.4, borderRadius: 10, padding: '10px 12px', background: '#FBE9E4', border: '1px solid #E3AE9E', color: '#6E2A16' }}>
            {tr('In diesem Zeitraum ist schon {titel} eingeplant. Bitte andere Daten wählen.', { titel: overlaps.map(t => t.titel).join(', ') })}
          </div>
        )}
        <Field label={tr('Status')}>
          <TripStatusChips value={status} onChange={setStatus} />
        </Field>
        <Field label={tr('Notizen')}>
          <textarea value={notizen} onChange={e => setNotizen(e.target.value)} rows={3}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'var(--font-body)' }} />
        </Field>
        {error && <div style={{ color: '#B3402A', fontSize: 14 }}>{error}</div>}
        {existing ? (
          <button type="button" onClick={onCancel} style={{ ...primaryButtonStyle, marginTop: 4, marginBottom: 24 }}>
            {tr('Fertig')}
          </button>
        ) : (
          <button type="submit" disabled={saving || overlaps.length > 0} style={{ ...primaryButtonStyle, marginTop: 4, marginBottom: 24, opacity: overlaps.length ? 0.6 : 1 }}>
            {saving ? <Loader2 size={17} className="spin" /> : tr('Speichern')}
          </button>
        )}
      </form>
    </div>
  );
}

// --- Trip-Kalender: wischbare Monatskarten ---


function tripForDate(trips, dateStr) {
  return trips.find(t => t.datum_von && dateStr >= t.datum_von && dateStr <= (t.datum_bis || t.datum_von));
}

function MonthCard({ year, month, trips, onSelect, holidays }) {
  const [infoDay, setInfoDay] = useState(null);
  const firstDay = new Date(year, month, 1);
  const startWeekday = (firstDay.getDay() + 6) % 7; // Montag = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const monthName = firstDay.toLocaleDateString(numLocale(), { month: 'long', year: 'numeric' });

  const tripsThisMonth = trips.filter(t => {
    if (!t.datum_von) return false;
    const von = t.datum_von, bis = t.datum_bis || t.datum_von;
    const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
    return von <= monthEnd && bis >= monthStart;
  });
  const info = infoDay ? holidays?.get(infoDay) : null;

  return (
    <div style={{
      minWidth: '100%', scrollSnapAlign: 'center', flexShrink: 0, boxSizing: 'border-box',
      padding: '0 4px'
    }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--forest)', textAlign: 'center', marginBottom: 12, textTransform: 'capitalize' }}>
        {monthName}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
        {weekdaysShort().map(w => (
          <div key={w} style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{w}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: info ? 8 : 16 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const trip = tripForDate(trips, dateStr);
          const confirmed = trip && isConfirmed(trip);
          const dayInfo = holidays?.get(dateStr);
          const level = dayInfo?.level || 0;
          const hasPublic = dayInfo?.publicHolidays?.length > 0;
          const clickable = trip || dayInfo;
          return (
            <button key={i} onClick={() => { if (trip) onSelect(trip); else if (dayInfo) setInfoDay(infoDay === dateStr ? null : dateStr); }}
              disabled={!clickable} aria-label={dateStr} style={{
                aspectRatio: '1', borderRadius: 8, fontSize: 12, cursor: clickable ? 'pointer' : 'default', position: 'relative',
                background: confirmed ? '#6B9071' : trip ? '#F3F7F1' : 'transparent',
                border: trip && !confirmed ? `1.5px dashed ${trip.status === 'idee' ? '#9AAE9C' : 'var(--forest)'}` : infoDay === dateStr ? '1.5px solid var(--forest)' : '1.5px solid transparent',
                color: confirmed ? '#FFFFFF' : trip ? 'var(--forest)' : 'var(--text)', fontWeight: hasPublic ? 700 : 400,
                fontFamily: 'var(--font-body)', padding: 0, overflow: 'hidden'
              }}>
              {d}
              {level > 0 && <span aria-hidden="true" style={{ position: 'absolute', left: 3, right: 3, bottom: 2, height: 4, borderRadius: 2, background: HOLIDAY_LEVEL_COLORS[level] }} />}
            </button>
          );
        })}
      </div>
      {info && (
        <div style={{ fontSize: 13, color: 'var(--text)', background: 'var(--card-alt)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px', marginBottom: 12, lineHeight: 1.45 }}>
          <b>{formatDate(infoDay)}</b>
          {publicHolidaySummary(info) && <div>{tr('Feiertag: {name}', { name: publicHolidaySummary(info) })}</div>}
          {schoolHolidaySummary(info) && <div>{tr('Schulferien: {regions}', { regions: schoolHolidaySummary(info) })}</div>}
        </div>
      )}
      {tripsThisMonth.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tripsThisMonth.map(trip => (
            <button key={trip.id} onClick={() => onSelect(trip)} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%', textAlign: 'left',
              background: 'var(--card-alt)', borderRadius: 12, padding: 12, cursor: 'pointer',
              border: isConfirmed(trip) ? '1px solid var(--border)' : '1.5px dashed #9DBB9F'
            }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--forest)' }}>{trip.titel}</span>
              <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                {formatDate(trip.datum_von)}{trip.datum_bis ? ` - ${formatDate(trip.datum_bis)}` : ''}
                {trip.ort?.trim() ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 4 }}><CountryFlag ort={trip.ort} />{trip.ort}</span> : null}
                {!isConfirmed(trip) && <span style={{ marginLeft: 6, fontWeight: 600, color: 'var(--forest)' }}>{tripStatusLabel(trip.status)}</span>}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, padding: '10px 0' }}>
          {tr('Kein Trip in diesem Monat.')}
        </div>
      )}
    </div>
  );
}

function HolidayLegend() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--muted)', flexWrap: 'wrap' }}>
      <span>{tr('Schulferien')}</span>
      {[1, 2, 3].map(l => (
        <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 16, height: 5, borderRadius: 3, background: HOLIDAY_LEVEL_COLORS[l] }} />
          {l === 1 ? tr('wenige') : l === 2 ? tr('mittel') : tr('viele')}
        </span>
      ))}
    </div>
  );
}

function TripCalendarView({ trips, onSelect }) {
  const months = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    let end = new Date(now.getFullYear(), now.getMonth() + 2, 1);
    for (const t of trips) {
      if (!t.datum_bis && !t.datum_von) continue;
      const d = new Date((t.datum_bis || t.datum_von) + 'T00:00:00');
      const tripMonth = new Date(d.getFullYear(), d.getMonth(), 1);
      if (tripMonth > end) end = tripMonth;
    }
    const list = [];
    let cursor = new Date(start);
    while (cursor <= end) {
      list.push({ year: cursor.getFullYear(), month: cursor.getMonth() });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
    return list;
  }, [trips]);
  const holidays = useHolidays(months.map(m => m.year));

  return (
    <div>
      <div style={{
        display: 'flex', overflowX: 'auto', scrollSnapType: 'x mandatory', gap: 0,
        padding: '4px 18px 12px'
      }}>
        {months.map(m => (
          <MonthCard key={`${m.year}-${m.month}`} year={m.year} month={m.month} trips={trips} onSelect={onSelect} holidays={holidays} />
        ))}
      </div>
      {holidays && holidays.size > 0 && <div style={{ padding: '0 18px 14px' }}><HolidayLegend /></div>}
    </div>
  );
}

// --- Trips: geplante und abgeschlossene Trips in einer Liste (v4.0) ---

function RatingBadge({ bewertung }) {
  if (!bewertung) return null;
  const { bg, text } = ratingRibbonColor(bewertung);
  return (
    <span aria-label={tr('Bewertung {bewertung} von 5', { bewertung: bewertung })} style={{
      fontSize: 13, fontWeight: 600, padding: '4px 8px', borderRadius: 8, background: bg, color: text,
      fontVariantNumeric: 'tabular-nums', flexShrink: 0
    }}>{lang() === 'en' ? Number(bewertung).toFixed(1) : Number(bewertung).toFixed(1).replace('.', ',')}</span>
  );
}

// Karte fuer einen geplanten oder laufenden Trip mit Datumsblock links.
function PlannedTripCard({ trip, onClick }) {
  const phase = tripPhase(trip);
  const active = phase.phase === 'unterwegs';
  const [, m, d] = (trip.datum_von || '--').split('-');
  const meta = [trip.ort, shortRange(trip.datum_von, trip.datum_bis), nightsLabel(trip.datum_von, trip.datum_bis)].filter(Boolean).join(' · ');
  const confirmed = isConfirmed(trip);
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, width: '100%',
      background: active ? '#E3EEDF' : confirmed ? 'var(--card-alt)' : '#FFFFFF',
      border: confirmed ? `1px solid ${active ? '#9DBB9F' : '#C9DBC6'}` : `1.5px dashed ${trip.status === 'idee' ? '#9AAE9C' : 'var(--forest)'}`,
      cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-body)', color: 'var(--text)'
    }}>
      <span style={{
        width: 56, height: 60, borderRadius: 12, background: confirmed ? 'var(--forest)' : '#9DBB9F', color: '#FFFFFF', flexShrink: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.6, color: '#CFE0CC' }}>{m && m !== '' ? monthsShort()[Number(m) - 1] : ''}</span>
        <span style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.1 }}>{d || '?'}</span>
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 500 }}>{trip.titel}</span>
        {meta && <span style={{ fontSize: 13, color: 'var(--muted)' }}>{meta}</span>}
        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
            background: active ? 'var(--forest)' : '#E3EEDF', color: active ? '#FFFFFF' : 'var(--forest)'
          }}>{phase.label}</span>
          {!confirmed && (
            <span style={{ fontSize: 12, fontWeight: 600, padding: '1px 8px', borderRadius: 999, border: '1px dashed var(--forest)', color: 'var(--forest)' }}>
              {tripStatusLabel(trip.status)}
            </span>
          )}
        </span>
      </span>
      <ChevronRight size={18} color="var(--muted)" />
    </button>
  );
}

// Kompakte Zeile fuer einen abgeschlossenen Trip (Erfahrungsbericht).
function EntryRow({ entry, onClick, last }) {
  const titel = entry.campingplatz || entry.ort || tr('Ohne Titel');
  const ortDoppelt = entry.ort && titel.toLowerCase().includes(entry.ort.toLowerCase());
  const meta = [ortDoppelt ? null : entry.ort, shortRange(entry.datum_von, entry.datum_bis)].filter(Boolean).join(' · ');
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', width: '100%', background: 'none', border: 'none',
      borderBottom: last ? 'none' : '1px solid #EEF2EB', cursor: 'pointer', textAlign: 'left',
      fontFamily: 'var(--font-body)', color: 'var(--text)'
    }}>
      {entry.photos?.[0] ? (
        <img src={entry.photos[0].url} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 12, flexShrink: 0, background: '#C9DBC6' }} />
      ) : (
        <span style={{ width: 56, height: 56, borderRadius: 12, background: 'var(--card-alt)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Tent size={22} color="#9DBB9F" />
        </span>
      )}
      <span style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titel}</span>
        <span style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
          {entry.ort && <CountryFlag ort={entry.ort} />}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta}</span>
        </span>
        {entry.tags?.length > 0 && (
          <span style={{ fontSize: 12, color: '#3E6B44', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {entry.tags.slice(0, 3).map(t => tr(t)).join(' · ')}
          </span>
        )}
      </span>
      <RatingBadge bewertung={entry.bewertung} />
    </button>
  );
}

// --- Saisonplanung (seit v4.12) ---
// Brett fuer eine ganze Saison: pro Monat eine Zeitleiste mit Trips nach Status und dem
// Ferienband. Ein Platz aus der Wunschliste wird angetippt, dann zeigt das Brett passende Luecken
// (mindestens so viele freie Naechte wie der Platz verlangt). Ein Monat oder eine Luecke oeffnet
// das Einplanen mit Tagesansicht.

function daysInMonthOf(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function weekdayShortOf(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return weekdaysShort()[(new Date(y, m - 1, d).getDay() + 6) % 7];
}

// Naechte, die durch Trips belegt sind (Nacht = Anreisetag bis Tag vor der Abreise).
function occupiedNightsMap(trips) {
  const map = new Map();
  for (const t of trips) {
    if (!t.datum_von) continue;
    const lastNight = t.datum_bis && t.datum_bis > t.datum_von ? addDaysISO(t.datum_bis, -1) : t.datum_von;
    eachDayISO(t.datum_von, lastNight, (iso) => { if (!map.has(iso)) map.set(iso, t); });
  }
  return map;
}

// Freie Abschnitte im Jahr, getrennt nach "ruhig" (Stufe 0 bis 1) und "viel los" (ab Stufe 2),
// jeweils mit mindestens minNights Naechten. Vergangene Tage zaehlen nicht.
function freeRuns(year, occupied, holidays, minNights) {
  const runs = [];
  const today = todayISO();
  let iso = `${year}-01-01` < today ? today : `${year}-01-01`;
  const end = `${year}-12-31`;
  let cur = null;
  const close = () => { if (cur && cur.nights >= minNights) runs.push(cur); cur = null; };
  while (iso <= end) {
    if (occupied.has(iso)) close();
    else {
      const busy = holidayLevel(holidays, iso) >= 2;
      if (cur && cur.busy === busy) { cur.nights += 1; cur.last = iso; }
      else { close(); cur = { start: iso, last: iso, nights: 1, busy }; }
    }
    iso = addDaysISO(iso, 1);
  }
  close();
  return runs;
}

function monthInfoText(year, month, holidays) {
  if (!holidays) return '';
  const dim = daysInMonthOf(year, month);
  const home = (APP_CONFIG.homeCountry || '').toUpperCase();
  const names = [];
  let maxLevel = 0;
  const countries = new Set();
  for (let d = 1; d <= dim; d++) {
    const info = holidays.get(toISO(year, month, d));
    if (!info) continue;
    maxLevel = Math.max(maxLevel, info.level);
    Object.keys(info.school).forEach(c => countries.add(c));
    for (const p of info.publicHolidays) {
      const relevant = home ? p.countries.includes(home) : p.nationwide;
      if (relevant && !names.includes(p.name)) names.push(p.name);
    }
  }
  if (names.length) return names.slice(0, 3).join(', ');
  if (maxLevel >= 2) return tr('Schulferien {countries}', { countries: Array.from(countries).join(', ') });
  return '';
}

const statusBarStyle = (status) => {
  if (!status || status === 'bestaetigt') return { background: 'var(--forest)', color: '#FFFFFF', border: '1.5px solid var(--forest)' };
  if (status === 'angefragt') return { background: '#E3EEDF', color: 'var(--forest)', border: '1.5px dashed var(--forest)' };
  return { background: '#FFFFFF', color: '#5C6B5E', border: '1.5px dashed #9AAE9C' };
};

function SeasonMonth({ year, month, trips, holidays, runs, selectedWish, onOpenMonth, onOpenTrip }) {
  const dim = daysInMonthOf(year, month);
  const monthStart = toISO(year, month, 1);
  const monthEnd = toISO(year, month, dim);
  const dayIndex = (iso) => Number(iso.slice(8, 10));

  // Trip-Abschnitte in diesem Monat, auf Zeilen verteilt, damit sich nichts ueberlappt.
  const segments = trips.filter(t => t.datum_von && t.datum_von <= monthEnd && (t.datum_bis || t.datum_von) >= monthStart)
    .map(t => {
      const s = t.datum_von < monthStart ? monthStart : t.datum_von;
      const e = (t.datum_bis || t.datum_von) > monthEnd ? monthEnd : (t.datum_bis || t.datum_von);
      return { trip: t, from: dayIndex(s), to: dayIndex(e) };
    })
    .sort((a, b) => a.from - b.from);
  const laneEnds = [];
  for (const seg of segments) {
    let lane = laneEnds.findIndex(end => end < seg.from);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(seg.to); } else laneEnds[lane] = seg.to;
    seg.lane = lane;
  }
  const monthRuns = (runs || []).filter(r => r.start <= monthEnd && r.last >= monthStart).map(r => ({
    ...r,
    from: dayIndex(r.start < monthStart ? monthStart : r.start),
    to: dayIndex(r.last > monthEnd ? monthEnd : r.last)
  }));
  const lanes = Math.max(1, laneEnds.length) + (selectedWish && monthRuns.length ? 1 : 0);
  const laneH = 24;
  const pct = (from, to) => ({ left: `${((from - 1) / dim) * 100}%`, width: `${((to - from + 1) / dim) * 100}%` });
  const info = monthInfoText(year, month, holidays);
  const monthName = new Date(year, month, 1).toLocaleDateString(numLocale(), { month: 'long' });
  const runLane = laneEnds.length;

  return (
    <div role="button" tabIndex={0} onClick={() => onOpenMonth(month, null)}
      style={{ background: '#FFFFFF', border: '1px solid var(--border)', borderRadius: 14, padding: '10px 12px', cursor: 'pointer' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 600, textTransform: 'capitalize' }}>{monthName}</span>
        {info && <span style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info}</span>}
      </div>
      <div style={{ position: 'relative', height: lanes * laneH + 8 }}>
        {segments.map(seg => (
          <button key={seg.trip.id} onClick={(e) => { e.stopPropagation(); onOpenTrip(seg.trip); }} style={{
            position: 'absolute', top: seg.lane * laneH, height: laneH - 4, ...pct(seg.from, seg.to), minWidth: 18,
            ...statusBarStyle(seg.trip.status), borderRadius: 6, fontSize: 11, fontWeight: 600, padding: '0 5px',
            textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer',
            fontFamily: 'var(--font-body)', boxSizing: 'border-box'
          }}>{seg.trip.titel}</button>
        ))}
        {selectedWish && monthRuns.map(r => (
          <button key={r.start} onClick={(e) => { e.stopPropagation(); onOpenMonth(month, r.start < monthStart ? monthStart : r.start); }} style={{
            position: 'absolute', top: runLane * laneH, height: laneH - 4, ...pct(r.from, r.to), minWidth: 22,
            background: r.busy ? '#FBEFD0' : '#DCEBD8', border: `1.5px solid ${r.busy ? '#C9A227' : '#3E6B44'}`,
            color: r.busy ? '#6B5310' : '#24452A', borderRadius: 6, fontSize: 11, fontWeight: 600, padding: '0 5px',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer', fontFamily: 'var(--font-body)',
            boxSizing: 'border-box'
          }}>{r.busy ? (r.nights <= 21 ? tr('viel los · {n} N', { n: r.nights }) : tr('viel los')) : (r.nights <= 21 ? tr('{n} N frei', { n: r.nights }) : tr('frei'))}</button>
        ))}
        <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 6, display: 'flex', borderRadius: 3, overflow: 'hidden', background: '#EEF2EB' }}>
          {Array.from({ length: dim }, (_, i) => (
            <span key={i} style={{ flex: 1, background: HOLIDAY_LEVEL_COLORS[holidayLevel(holidays, toISO(year, month, i + 1))] }} />
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#8A978B', marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
        <span>1</span><span>8</span><span>15</span><span>22</span><span>{dim}</span>
      </div>
    </div>
  );
}

function SeasonBoard({ trips, wishlist, navigate, onPlanned }) {
  const now = new Date();
  const [year, setYear] = useState(now.getMonth() >= 8 ? now.getFullYear() + 1 : now.getFullYear());
  const [selectedId, setSelectedId] = useState(null);
  const [plan, setPlan] = useState(null); // { month, start }
  const holidays = useHolidays([year]);
  const selectedWish = wishlist.find(w => w.id === selectedId) || null;

  const yearTrips = trips.filter(t => t.datum_von && (t.datum_von.startsWith(String(year)) || (t.datum_bis || '').startsWith(String(year))));
  const nights = yearTrips.reduce((s, t) => s + Math.max(0, daysBetween(t.datum_von, t.datum_bis)), 0);
  const open = yearTrips.filter(t => !isConfirmed(t)).length;
  const occupied = useMemo(() => occupiedNightsMap(trips), [trips]);
  const runs = useMemo(() => selectedWish ? freeRuns(year, occupied, holidays, selectedWish.min_naechte || 1) : [],
    [selectedWish, year, occupied, holidays]);
  const lastMonth = 11;
  const firstMonth = year === now.getFullYear() ? now.getMonth() : 0;

  const stat = (value, label) => (
    <div style={{ flex: 1, background: '#FFFFFF', border: '1px solid var(--border)', borderRadius: 12, padding: '8px 10px', minWidth: 0 }}>
      <div style={{ fontSize: 18, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>{tr('Saison {year}', { year })}</span>
        <span style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => setYear(y => y - 1)} disabled={year <= now.getFullYear()} aria-label={tr('Vorheriges Jahr')}
            style={{ ...iconButtonStyle, opacity: year <= now.getFullYear() ? 0.35 : 1 }}><ChevronLeft size={20} /></button>
          <button onClick={() => setYear(y => y + 1)} aria-label={tr('Nächstes Jahr')} style={iconButtonStyle}><ChevronRight size={20} /></button>
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {stat(yearTrips.length, yearTrips.length === 1 ? tr('Trip') : tr('Trips'))}
        {stat(nights, tr('Nächte'))}
        {stat(open, tr('nicht bestätigt'))}
      </div>

      {wishlist.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600 }}>
            <span>{tr('Wunschliste')}</span>
            {selectedWish && (
              <button onClick={() => setSelectedId(null)} style={{ background: 'none', border: 'none', color: 'var(--forest)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, fontFamily: 'var(--font-body)' }}>
                {tr('Auswahl aufheben')}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '0 -18px', padding: '0 18px 4px' }}>
            {wishlist.map(w => {
              const sel = w.id === selectedId;
              return (
                <button key={w.id} onClick={() => setSelectedId(sel ? null : w.id)} aria-pressed={sel} style={{
                  minWidth: 150, maxWidth: 190, flexShrink: 0, textAlign: 'left', borderRadius: 12, padding: '9px 10px', cursor: 'pointer',
                  background: sel ? '#E3EEDF' : 'var(--card-alt)', border: sel ? '2px solid var(--forest)' : '1px solid var(--border)',
                  fontFamily: 'var(--font-body)', color: 'var(--text)', display: 'flex', flexDirection: 'column', gap: 2
                }}>
                  <span style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</span>
                  {w.min_naechte ? <span style={{ fontSize: 12, color: 'var(--muted)' }}>{tr('mind. {n} Nächte', { n: w.min_naechte })}</span> : null}
                  {w.buchungsfenster_datum && <span style={{ fontSize: 12, color: 'var(--forest)' }}>{tr('Buchung ab {datum}', { datum: formatDate(w.buchungsfenster_datum) })}</span>}
                </button>
              );
            })}
          </div>
          {selectedWish && (
            <div style={{ fontSize: 13, color: 'var(--forest)', fontWeight: 600 }}>
              {runs.length ? tr('Lücke oder Monat antippen zum Einplanen.') : tr('Keine passende Lücke in dieser Saison.')}
            </div>
          )}
        </div>
      )}

      {Array.from({ length: lastMonth - firstMonth + 1 }, (_, i) => firstMonth + i).map(m => (
        <SeasonMonth key={`${year}-${m}`} year={year} month={m} trips={trips} holidays={holidays}
          runs={runs} selectedWish={selectedWish}
          onOpenMonth={(month, start) => setPlan({ month, start })}
          onOpenTrip={(t) => navigate({ name: 'tripDetail', tripId: t.id })} />
      ))}

      {holidays && holidays.size > 0 && <HolidayLegend />}

      {plan && (
        <PlanModal year={year} month={plan.month} startHint={plan.start} wish={selectedWish} trips={trips} holidays={holidays}
          onClose={() => setPlan(null)}
          onSaved={(trip, wishId) => { setPlan(null); setSelectedId(null); onPlanned(trip, wishId); }} />
      )}
    </div>
  );
}

function PlanModal({ year, month, startHint, wish, trips, holidays: initialHolidays, onClose, onSaved }) {
  const today = todayISO();
  const [view, setView] = useState({ year, month });
  const [arrival, setArrival] = useState(startHint && startHint >= today ? startHint : null);
  const [nights, setNights] = useState(wish?.min_naechte || 2);
  const [titel, setTitel] = useState(wish?.name || '');
  const [ort, setOrt] = useState(wish?.ort || '');
  const [ortForDistance, setOrtForDistance] = useState(wish?.ort || '');
  const [status, setStatus] = useState('idee');
  const [saving, setSaving] = useState(false);
  const otherYear = useHolidays(view.year !== year ? [view.year] : []);
  const holidays = view.year === year ? initialHolidays : otherYear;
  const occupied = useMemo(() => occupiedNightsMap(trips), [trips]);

  useEffect(() => {
    const t = setTimeout(() => setOrtForDistance(ort.trim()), 800);
    return () => clearTimeout(t);
  }, [ort]);

  const departure = arrival ? addDaysISO(arrival, nights) : null;
  const lastNight = arrival ? addDaysISO(arrival, nights - 1) : null;
  const overlaps = arrival ? overlappingTrips(trips, arrival, departure) : [];
  const cells = buildMonthGrid(view.year, view.month);
  const monthTitle = new Date(view.year, view.month, 1).toLocaleDateString(numLocale(), { month: 'long', year: 'numeric' });
  const minN = wish?.min_naechte || 0;

  function shiftMonth(delta) {
    setView(v => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  // Hinweise zum gewaehlten Zeitraum.
  const hints = [];
  if (arrival) {
    overlaps.forEach(t => hints.push({ block: true, text: tr('In diesem Zeitraum ist schon {titel} eingeplant. Bitte andere Daten wählen.', { titel: t.titel }) }));
    if (minN && nights < minN) hints.push({ warn: true, text: tr('Weniger als die Mindestanzahl von {n} Nächten.', { n: minN }) });
    const pub = [];
    eachDayISO(arrival, departure, (iso) => {
      const info = holidays?.get(iso);
      (info?.publicHolidays || []).forEach(p => { const label = `${p.name} (${p.countries.join(', ')})`; if (!pub.includes(label)) pub.push(label); });
    });
    if (pub.length) hints.push({ warn: true, text: tr('Feiertag: {name}', { name: pub.join(' · ') }) });
    let peak = null;
    eachDayISO(arrival, lastNight, (iso) => { const info = holidays?.get(iso); if (info && (!peak || info.score > peak.score)) peak = info; });
    if (peak && peak.level >= 2) hints.push({ warn: true, text: tr('Schulferien: {regions}. Früh buchen.', { regions: schoolHolidaySummary(peak) }) });
    else if (peak && peak.level === 1) hints.push({ warn: false, text: tr('Schulferien: {regions}', { regions: schoolHolidaySummary(peak) }) });
    if (wish?.buchungsfenster_datum) hints.push({ warn: false, text: tr('Buchungsfenster öffnet {buchungsfenster_datum}', { buchungsfenster_datum: formatDate(wish.buchungsfenster_datum) }) });
  }

  async function save() {
    if (!arrival || !titel.trim() || overlaps.length) return;
    setSaving(true);
    try {
      const notizen = wish ? (wish.link ? [wish.notizen, tr('Mehr Infos: {link}', { link: wish.link })].filter(Boolean).join('\n\n') : (wish.notizen || '')) : '';
      const res = await fetch('/api/trips', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titel: titel.trim(), ort: ort.trim(), datum_von: arrival, datum_bis: departure, notizen, status,
          buchungsfenster_datum: wish?.buchungsfenster_datum || null
        })
      });
      if (!res.ok) throw new Error(tr('Konnte nicht gespeichert werden.'));
      const trip = await res.json();
      if (wish) await fetch(`/api/wishlist/${wish.id}`, { method: 'DELETE' }).catch(() => {});
      onSaved(trip, wish?.id || null);
    } catch (err) {
      showToast(err.message === 'Failed to fetch' ? tr('Server nicht erreichbar.') : err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const stepBtn = { ...iconButtonStyle, width: 40, height: 40, border: '1px solid var(--border)', borderRadius: 10, fontSize: 20 };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(30,43,31,0.45)', zIndex: 500, display: 'flex',
      alignItems: 'flex-end', justifyContent: 'center', animation: 'fadeIn 0.15s ease-out'
    }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label={tr('Einplanen')} style={{
        background: '#FFFFFF', width: '100%', maxWidth: 420, maxHeight: '92%', overflowY: 'auto', borderRadius: '20px 20px 0 0',
        padding: '16px 18px calc(18px + env(safe-area-inset-bottom))', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 19 }}>{wish ? tr('{name} einplanen', { name: wish.name }) : tr('Trip einplanen')}</span>
          <button onClick={onClose} aria-label={tr('Schliessen')} style={iconButtonStyle}><X size={18} /></button>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <button onClick={() => shiftMonth(-1)} aria-label={tr('Vorheriger Monat')} style={iconButtonStyle}><ChevronLeft size={20} /></button>
            <span style={{ fontSize: 15, fontWeight: 600, textTransform: 'capitalize' }}>{monthTitle}</span>
            <button onClick={() => shiftMonth(1)} aria-label={tr('Nächster Monat')} style={iconButtonStyle}><ChevronRight size={20} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
            {weekdaysShort().map(w => <div key={w} style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)' }}>{w}</div>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const iso = toISO(view.year, view.month, d);
              const past = iso < today;
              const trip = occupied.get(iso);
              const inRange = arrival && iso >= arrival && iso <= lastNight;
              const isDeparture = departure && iso === departure;
              const info = holidays?.get(iso);
              const level = info?.level || 0;
              const tripStyle = !trip ? null
                : isConfirmed(trip) ? { background: '#E6EDE2', color: '#7A877C', border: '1.5px solid #E6EDE2' }
                : { background: '#FFFFFF', color: '#7A877C', border: `1.5px dashed ${trip.status === 'idee' ? '#B5C4B6' : '#7E9A82'}` };
              return (
                <button key={i} disabled={past || Boolean(trip)} onClick={() => setArrival(iso)} aria-label={iso} style={{
                  aspectRatio: '1', borderRadius: 8, position: 'relative', padding: 0, fontSize: 13, fontFamily: 'var(--font-body)',
                  cursor: past || trip ? 'default' : 'pointer', opacity: past ? 0.35 : 1, overflow: 'hidden',
                  fontWeight: info?.publicHolidays?.length ? 700 : 400,
                  background: inRange ? 'var(--forest)' : isDeparture ? '#C9DBC6' : trip ? tripStyle.background : 'transparent',
                  color: inRange ? '#FFFFFF' : trip ? tripStyle.color : 'var(--text)',
                  border: inRange ? '1.5px solid var(--forest)' : trip ? tripStyle.border : '1.5px solid transparent'
                }}>
                  {d}
                  {level > 0 && <span aria-hidden="true" style={{ position: 'absolute', left: 3, right: 3, bottom: 2, height: 4, borderRadius: 2, background: HOLIDAY_LEVEL_COLORS[level] }} />}
                </button>
              );
            })}
          </div>
          {!arrival && <p style={{ fontSize: 13, color: 'var(--muted)', margin: '10px 0 0' }}>{tr('Anreisetag antippen.')}</p>}
        </div>

        {arrival && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>
                  {tr('{von} bis {bis}', { von: `${weekdayShortOf(arrival)} ${formatDate(arrival)}`, bis: `${weekdayShortOf(departure)} ${formatDate(departure)}` })}
                </span>
                <span style={{ fontSize: 13, color: minN && nights < minN ? '#93341C' : 'var(--muted)' }}>
                  {nights === 1 ? tr('1 Nacht') : tr('{n} Nächte', { n: nights })}{minN ? tr(' · Minimum {n}', { n: minN }) : ''}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={() => setNights(n => Math.max(1, n - 1))} aria-label={tr('Eine Nacht weniger')} style={stepBtn}>−</button>
                <button onClick={() => setNights(n => Math.min(60, n + 1))} aria-label={tr('Eine Nacht mehr')} style={stepBtn}>+</button>
              </div>
            </div>

            {hints.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {hints.map((h, i) => (
                  <div key={i} role={h.block ? 'alert' : undefined} style={{
                    fontSize: 13, lineHeight: 1.4, borderRadius: 10, padding: '8px 10px',
                    background: h.block ? '#FBE9E4' : h.warn ? '#FBEFD0' : 'var(--card-alt)',
                    color: h.block ? '#6E2A16' : h.warn ? '#6B5310' : 'var(--forest)',
                    border: h.block ? '1px solid #E3AE9E' : 'none'
                  }}>{h.text}</div>
                ))}
              </div>
            )}

            <Field label={tr('Campingplatz *')} icon={Tent}>
              <input value={titel} onChange={e => setTitel(e.target.value)} style={inputStyle} placeholder={tr('z.B. TCS Camping Sempach')} />
            </Field>
            <Field label={tr('Ort')} icon={MapPin}>
              <input value={ort} onChange={e => setOrt(e.target.value)} style={inputStyle} placeholder={tr('z.B. Sempach, LU')} />
            </Field>
            {ortForDistance && <TripDistance trip={{ id: 'plan', ort: ortForDistance, datum_von: arrival }} trips={trips} />}
            <Field label={tr('Status')}>
              <TripStatusChips value={status} onChange={setStatus} />
            </Field>
            <button onClick={save} disabled={saving || !titel.trim() || overlaps.length > 0} style={{ ...primaryButtonStyle, opacity: titel.trim() && !overlaps.length ? 1 : 0.6 }}>
              {saving ? <Loader2 size={17} className="spin" /> : tr('Einplanen')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const tripsH2Style = { margin: 0, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 };

const filterLabelStyle = { fontSize: 12, fontWeight: 600, color: 'var(--muted)' };

function TripsHub({ trips, entries, wishlist, loading, error, navigate, onPlanned }) {
  const [mode, setMode] = useState('liste');
  const [filterOpen, setFilterOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [minRating, setMinRating] = useState(0);
  const [selTags, setSelTags] = useState([]);
  const [year, setYear] = useState('alle');
  const today = todayISO();
  const q = search.trim().toLowerCase();

  // Filter: Name/Ort (Freitext), Mindestbewertung, Tags (alle gewaehlten muessen passen), Jahr.
  // Bewertung und Tags gibt es nur bei abgeschlossenen Trips; sind sie gesetzt, werden geplante
  // Trips ausgeblendet.
  // Tags gross/klein-unabhaengig zusammenfassen ("WIFI" und "WiFi" sind ein Filter); angezeigt
  // wird die haeufigste Schreibweise.
  const allTags = useMemo(() => {
    const groups = new Map();
    entries.forEach(e => (e.tags || []).forEach(t => {
      const k = t.trim().toLowerCase();
      if (!groups.has(k)) groups.set(k, { total: 0, spell: new Map() });
      const g = groups.get(k); g.total++; g.spell.set(t, (g.spell.get(t) || 0) + 1);
    }));
    return Array.from(groups.entries())
      .map(([k, g]) => ({ key: k, label: [...g.spell.entries()].sort((a, b) => b[1] - a[1])[0][0], total: g.total }))
      .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
  }, [entries]);
  const years = useMemo(() => {
    const set = new Set();
    [...entries, ...trips].forEach(x => { if (x.datum_von) set.add(x.datum_von.slice(0, 4)); });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [entries, trips]);
  const entryOnlyFilter = minRating > 0 || selTags.length > 0;
  const activeFilterCount = (q ? 1 : 0) + (minRating > 0 ? 1 : 0) + selTags.length + (year !== 'alle' ? 1 : 0);
  function resetFilters() { setSearch(''); setMinRating(0); setSelTags([]); setYear('alle'); }
  const yearMatches = (x) => year === 'alle' || (x.datum_von || '').startsWith(year);

  const tripMatches = (t) => !entryOnlyFilter && yearMatches(t)
    && (!q || [t.titel, t.ort, t.notizen].filter(Boolean).some(v => v.toLowerCase().includes(q)));
  const entryMatches = (e) => yearMatches(e)
    && (!minRating || (e.bewertung || 0) >= minRating)
    && selTags.every(k => (e.tags || []).some(t => t.trim().toLowerCase() === k))
    && (!q || [e.campingplatz, e.ort, e.notizen, ...(e.tags || []), ...(e.lessons || []).map(l => l.text)]
      .filter(Boolean).some(v => v.toLowerCase().includes(q)));

  const withPhase = trips.map(t => ({ trip: t, phase: tripPhase(t, today) }));
  const unterwegs = withPhase.filter(x => x.phase.phase === 'unterwegs' && tripMatches(x.trip)).map(x => x.trip);
  const geplant = withPhase.filter(x => x.phase.phase === 'geplant' && tripMatches(x.trip)).map(x => x.trip)
    .sort((a, b) => (a.datum_von || '9').localeCompare(b.datum_von || '9'));
  const ohneBericht = withPhase.filter(x => x.phase.phase === 'vorbei' && !entries.some(e => e.trip_id === x.trip.id) && tripMatches(x.trip))
    .map(x => x.trip).sort((a, b) => (b.datum_von || '').localeCompare(a.datum_von || ''));

  const grouped = useMemo(() => {
    const map = new Map();
    for (const e of entries) {
      if (!entryMatches(e)) continue;
      const y = yearOf(e.datum_von);
      if (!map.has(y)) map.set(y, []);
      map.get(y).push(e);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
      .map(([y, list]) => [y, list.sort((a, b) => (b.datum_von || '').localeCompare(a.datum_von || ''))]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, q, minRating, selTags, year]);

  const nothing = !loading && !error && trips.length === 0 && entries.length === 0;

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)', color: 'var(--text)' }}>
      <TabHeader title={tr('Trips')}>
        <button onClick={() => setFilterOpen(o => !o)} aria-label={tr('Suchen und filtern')} aria-expanded={filterOpen}
          style={{ ...headerActionStyle, position: 'relative', background: filterOpen ? 'var(--card-alt)' : 'none' }}>
          <SlidersHorizontal size={20} />
          {activeFilterCount > 0 && (
            <span style={{
              position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18, borderRadius: 9, padding: '0 5px',
              background: 'var(--forest)', color: '#FFFFFF', fontSize: 11, fontWeight: 600, display: 'flex',
              alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box'
            }}>{activeFilterCount}</span>
          )}
        </button>
        <button onClick={() => navigate({ name: 'addTrip' })} aria-label={tr('Neuer Trip')} style={headerPrimaryStyle}>
          <Plus size={20} />
        </button>
      </TabHeader>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 18px 32px' }}>
        {filterOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 14, borderRadius: 16, border: '1px solid var(--border)', background: 'var(--card-alt)' }}>
            <div style={{ position: 'relative' }}>
              <Search size={17} color="var(--muted)" style={{ position: 'absolute', left: 12, top: 15 }} />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder={tr('Name, Ort, Notizen...')}
                style={{ ...inputStyle, background: '#FFFFFF', width: '100%', paddingLeft: 38, boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={filterLabelStyle}>{tr('Bewertung')}</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {[{ v: 0, l: tr('Alle') }, { v: 3, l: tr('ab 3') }, { v: 4, l: tr('ab 4') }, { v: 4.5, l: tr('ab 4,5') }, { v: 5, l: tr('nur 5') }].map(o => (
                  <TagChip key={o.v} small label={o.l} active={minRating === o.v} onClick={() => setMinRating(o.v)} />
                ))}
              </div>
            </div>
            {years.length > 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={filterLabelStyle}>{tr('Jahr')}</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <TagChip small label={tr('Alle')} active={year === 'alle'} onClick={() => setYear('alle')} />
                  {years.map(y => <TagChip key={y} small label={y} active={year === y} onClick={() => setYear(y)} />)}
                </div>
              </div>
            )}
            {allTags.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={filterLabelStyle}>{tr('Tags')}</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {allTags.map(t => (
                    <TagChip key={t.key} small label={t.label} active={selTags.includes(t.key)}
                      onClick={() => setSelTags(prev => prev.includes(t.key) ? prev.filter(x => x !== t.key) : [...prev, t.key])} />
                  ))}
                </div>
              </div>
            )}
            {activeFilterCount > 0 && (
              <button onClick={resetFilters} style={{ ...doneToggleStyle, color: 'var(--forest)', fontWeight: 600, marginBottom: 0, alignSelf: 'flex-start' }}>
                <X size={15} />{' '}{tr('Filter zurücksetzen')}
              </button>
            )}
          </div>
        )}

        <Segmented value={mode} onChange={(k) => {
          if (k === 'wunsch') navigate({ name: 'wishlist' });
          else if (k === 'karte') navigate({ name: 'map', from: 'trips' });
          else setMode(k);
        }} options={[
          { key: 'liste', label: tr('Liste') },
          { key: 'kalender', label: tr('Kalender') },
          { key: 'saison', label: tr('Saison') },
          { key: 'wunsch', label: wishlist.length ? tr('Wunsch {length}', { length: wishlist.length }) : tr('Wunsch') },
          { key: 'karte', label: tr('Karte') }
        ]} />

        {error && <div style={{ color: '#B3402A', fontSize: 14 }}>{error}</div>}

        {mode === 'kalender' && (
          <div style={{ margin: '0 -18px' }}>
            <TripCalendarView trips={trips} onSelect={(t) => navigate({ name: 'tripDetail', tripId: t.id })} />
            <div style={{ padding: '0 18px' }}>
              <a href="/api/trips.ics" download style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--forest)', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
                <Download size={16} />{' '}{tr('Als Kalenderdatei (.ics) exportieren')}
              </a>
            </div>
          </div>
        )}

        {mode === 'saison' && (
          <SeasonBoard trips={trips} wishlist={wishlist} navigate={navigate} onPlanned={onPlanned} />
        )}

        {mode === 'liste' && loading && trips.length === 0 && entries.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <SkeletonBlock h={86} r={16} />
            {[0, 1, 2, 3].map(i => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <SkeletonBlock w="56px" h={56} r={12} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <SkeletonBlock w="60%" h={14} /><SkeletonBlock w="80%" h={10} />
                </div>
              </div>
            ))}
          </div>
        )}

        {mode === 'liste' && nothing && (
          <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--muted)' }}>
            <Compass size={34} style={{ marginBottom: 10, opacity: 0.5 }} />
            <p style={{ fontSize: 15, lineHeight: 1.5 }}>{tr('Noch keine Trips. Plant den ersten oder haltet einen vergangenen Trip als Bericht fest.')}</p>
            <button onClick={() => navigate({ name: 'addTrip' })} style={{ ...primaryButtonStyle, display: 'inline-flex', marginTop: 8 }}>
              <Plus size={18} />{' '}{tr('Trip planen')}
            </button>
          </div>
        )}

        {mode === 'liste' && !nothing && !(loading && trips.length === 0 && entries.length === 0) && (
          <>
            {unterwegs.length > 0 && (
              <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h2 style={{ ...tripsH2Style, color: 'var(--forest)' }}><Compass size={15} />{tr('Unterwegs')}</h2>
                {unterwegs.map(t => <PlannedTripCard key={t.id} trip={t} onClick={() => navigate({ name: 'tripDetail', tripId: t.id })} />)}
              </section>
            )}

            {(geplant.length > 0 || activeFilterCount === 0) && <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h2 style={{ ...tripsH2Style, color: 'var(--forest)' }}><CalendarDays size={15} />{tr('Geplant')}{geplant.length ? ` · ${geplant.length}` : ''}</h2>
              {geplant.map(t => <PlannedTripCard key={t.id} trip={t} onClick={() => navigate({ name: 'tripDetail', tripId: t.id })} />)}
              {geplant.length === 0 && activeFilterCount === 0 && (
                <div style={{ border: '1.5px dashed #BFD0BC', borderRadius: 16, padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{tr('Kein Trip geplant')}</span>
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                      {wishlist.length ? tr('{length} {v} auf der Wunschliste', { length: wishlist.length, v: wishlist.length === 1 ? tr('Platz wartet') : tr('Plätze warten') }) : tr('Wohin geht es als Nächstes?')}
                    </span>
                  </span>
                  <button onClick={() => navigate({ name: 'addTrip' })} style={{
                    height: 40, padding: '0 14px', borderRadius: 10, background: '#FFFFFF', border: '1px solid var(--border)',
                    fontSize: 14, fontWeight: 600, color: 'var(--forest)', cursor: 'pointer', fontFamily: 'var(--font-body)'
                  }}>{tr('Planen')}</button>
                </div>
              )}
            </section>}

            {ohneBericht.length > 0 && (
              <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h2 style={{ ...tripsH2Style, color: '#7A5A12' }}><ClipboardList size={15} />{tr('Noch ohne Bericht')}</h2>
                {ohneBericht.map(t => (
                  <button key={t.id} onClick={() => navigate({ name: 'tripDetail', tripId: t.id })} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, background: '#FBF4DC',
                    border: '1px solid #EAD48A', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-body)', color: 'var(--text)', width: '100%'
                  }}>
                    <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                      <span style={{ fontSize: 15, fontWeight: 600 }}>{t.titel}</span>
                      <span style={{ fontSize: 13, color: '#5A4C14' }}>{[t.ort, shortRange(t.datum_von, t.datum_bis)].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#7A5A12', whiteSpace: 'nowrap' }}>{tr('Bewerten')}</span>
                    <ChevronRight size={16} color="#7A5A12" />
                  </button>
                ))}
              </section>
            )}

            {grouped.map(([year, list]) => {
              const naechte = list.reduce((s, e) => s + Math.max(0, daysBetween(e.datum_von, e.datum_bis)), 0);
              return (
                <section key={year} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <h2 style={{ ...tripsH2Style, color: 'var(--muted)', marginBottom: 2 }}>
                    <CheckCircle2 size={15} />{tr('Abgeschlossen')}{' '}{year} · {list.length} {list.length === 1 ? tr('Trip') : tr('Trips')}{naechte ? tr(' · {naechte} Nächte', { naechte: naechte }) : ''}
                  </h2>
                  {list.map((e, i) => (
                    <EntryRow key={e.id} entry={e} last={i === list.length - 1} onClick={() => navigate({ name: 'detail', entry: e })} />
                  ))}
                </section>
              );
            })}

            {activeFilterCount > 0 && unterwegs.length === 0 && geplant.length === 0 && ohneBericht.length === 0 && grouped.length === 0 && (
              <div style={{ textAlign: 'center', padding: '30px 20px', color: 'var(--muted)', fontSize: 14 }}>{tr('Keine Trips gefunden.')}</div>
            )}

            <button onClick={() => navigate({ name: 'add' })} style={{
              alignSelf: 'center', display: 'flex', alignItems: 'center', gap: 6, height: 44, padding: '0 8px', background: 'none',
              border: 'none', color: 'var(--forest)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)'
            }}>
              <Plus size={16} />{' '}{tr('Vergangenen Trip ohne Planung erfassen')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}


function ChecklistSection({ trip, type, onRefresh }) {
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const itemsRaw = (trip.items || []).filter(i => i.type === type);
  const items = [...itemsRaw].sort((a, b) => (a.checked === b.checked) ? 0 : (a.checked ? 1 : -1));
  const allDone = items.length > 0 && items.every(i => i.checked);

  async function addItem(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/trips/${trip.id}/items`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, text: text.trim() })
      });
      if (res.ok) { setText(''); onRefresh(); }
    } finally {
      setAdding(false);
    }
  }

  async function toggle(item) {
    await fetch(`/api/trip-items/${item.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checked: !item.checked })
    });
    onRefresh();
  }

  async function remove(item) {
    await fetch(`/api/trip-items/${item.id}`, { method: 'DELETE' });
    onRefresh();
  }

  async function clearAll() {
    if (!(await confirmDialog(tr('Alle Punkte in dieser Liste wirklich löschen?')))) return;
    await Promise.all(items.map(item => fetch(`/api/trip-items/${item.id}`, { method: 'DELETE' })));
    onRefresh();
  }

  const templateCategory = type === 'packliste' ? 'packliste' : type === 'todo' ? 'trip_todo' : null;
  const templateHint = type === 'packliste'
    ? tr('Diese Artikel werden automatisch zu jeder neuen Packliste hinzugefügt.')
    : tr('Diese Punkte werden automatisch zu jeder neuen Trip-To-do-Liste hinzugefügt.');

  return (
    <div>
      {templateCategory && <TemplateManager category={templateCategory} hint={templateHint} />}
      <form onSubmit={addItem} style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input value={text} onChange={e => setText(e.target.value)} placeholder={tr('Hinzufügen...')}
          style={{ ...inputStyle, flex: 1 }} />
        <button type="submit" disabled={adding} style={{ ...primaryButtonStyle, padding: '0 16px' }}>
          {adding ? <Loader2 size={17} className="spin" /> : <Plus size={19} />}
        </button>
      </form>
      {items.length === 0 && (
        <div style={{ textAlign: 'center', padding: '24px 10px', color: 'var(--muted)', fontSize: 14 }}>
          {tr('Noch keine Einträge. Den ersten oben hinzufügen.')}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.filter(i => showDone || !i.checked).map(item => (
          <ChecklistRow key={item.id} item={item} onToggle={() => toggle(item)} onRemove={() => remove(item)} />
        ))}
      </div>
      {items.some(i => i.checked) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
          <button onClick={() => setShowDone(v => !v)} style={doneToggleStyle}>
            <ChevronDown size={16} style={{ transform: showDone ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            {showDone ? tr('Erledigte ausblenden')
              : allDone ? tr('Alles erledigt · {length} anzeigen', { length: items.length }) : tr('{length} erledigte anzeigen', { length: items.filter(i => i.checked).length })}
          </button>
          {allDone && (
            <button onClick={clearAll} style={{ ...doneToggleStyle, color: '#B3402A' }}>{tr('Liste löschen')}</button>
          )}
        </div>
      )}
    </div>
  );
}

function MealsSection({ trip, onRefresh }) {
  const [datum, setDatum] = useState(trip.datum_von || todayISO());
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);
  const meals = trip.meals || [];

  async function addMeal(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/trips/${trip.id}/meals`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datum, text: text.trim() })
      });
      if (res.ok) { setText(''); setDatum(d => addDaysISO(d, 1)); onRefresh(); }
    } finally {
      setAdding(false);
    }
  }

  async function remove(meal) {
    await fetch(`/api/trip-meals/${meal.id}`, { method: 'DELETE' });
    onRefresh();
  }

  return (
    <div>
      <form onSubmit={addMeal} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        <input type="date" value={datum} onChange={e => setDatum(e.target.value)} style={inputStyle} />
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={text} onChange={e => setText(e.target.value)} placeholder={tr('Was gibt\'s zu essen?')}
            style={{ ...inputStyle, flex: 1 }} />
          <button type="submit" disabled={adding} style={{ ...primaryButtonStyle, padding: '0 16px' }}>
            {adding ? <Loader2 size={17} className="spin" /> : <Plus size={19} />}
          </button>
        </div>
      </form>
      {meals.length === 0 && (
        <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--muted)', fontSize: 15 }}>
          {tr('Noch keine Mahlzeiten geplant.')}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {meals.map(meal => (
          <div key={meal.id} style={{
            display: 'flex', alignItems: 'center', gap: 10, background: 'var(--card-alt)',
            border: '1px solid var(--border)', borderRadius: 10, padding: '11px 13px'
          }}>
            <UtensilsCrossed size={18} color="var(--forest)" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              {meal.datum && <div style={{ fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{formatDate(meal.datum)}</div>}
              <div style={{ fontSize: 15 }}>{meal.text}</div>
            </div>
            <button onClick={() => remove(meal)} style={{ ...iconButtonStyle, width: 28, height: 28 }}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Kilometerstand ---

function OdometerView({ onBack, embedded, onChanged }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [datum, setDatum] = useState(todayISO());
  const [km, setKm] = useState('');
  const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const [anchorInput, setAnchorInput] = useState('');
  const [startbestandInput, setStartbestandInput] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(''); }
    try {
      const res = await fetch('/api/odometer');
      if (!res.ok) throw new Error(tr('Konnte nicht geladen werden.'));
      const d = await res.json();
      setData(d);
      if (!silent) {
        setBudgetInput(String(d.budget));
        setAnchorInput(d.periodEnd);
        setStartbestandInput(String(d.kmStartbestand ?? 0));
      }
    } catch (e) {
      if (!silent) setError(e.message === 'Failed to fetch' ? tr('Server nicht erreichbar.') : e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load);

  async function addReading(e) {
    e.preventDefault();
    if (!km) return;
    setAdding(true);
    try {
      const res = await fetch('/api/odometer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datum, km: Number(km), note: note.trim() || null })
      });
      if (res.ok) { setKm(''); setNote(''); load(); onChanged?.(); showToast(tr('Gespeichert')); }
    } finally {
      setAdding(false);
    }
  }

  async function remove(id) {
    if (!(await confirmDialog(tr('Diese Ablesung wirklich löschen?')))) return;
    await fetch(`/api/odometer/${id}`, { method: 'DELETE' });
    load();
    onChanged?.();
  }

  async function saveBudget(e) {
    e.preventDefault();
    await fetch('/api/settings/km_budget_jahr', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: Number(budgetInput) })
    });
    if (anchorInput) {
      await fetch('/api/settings/km_anchor_datum', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: anchorInput })
      });
    }
    if (startbestandInput !== '') {
      await fetch('/api/settings/km_startbestand', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: Number(startbestandInput) })
      });
    }
    setEditingBudget(false);
    load();
  }

  return (
    <div style={embedded ? {} : { minHeight: '100%', background: 'var(--bg)', color: 'var(--text)', paddingBottom: 60 }}>
      {!embedded && (
        <div style={headerBarStyle}>
          <button onClick={onBack} style={iconButtonStyle}><ArrowLeft size={21} /></button>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 19 }}>{tr('KM-Stand')}</span>
          <div style={{ width: 44 }} />
        </div>
      )}

      <div style={embedded ? {} : { padding: '14px 18px 0' }}>
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40, color: 'var(--muted)' }}>
            <Loader2 size={22} className="spin" />
          </div>
        )}
        {error && <div style={{ color: '#B3402A', fontSize: 14 }}>{error}</div>}

        {data && (
          <>
            {!embedded && <div style={{
              background: 'var(--forest)', color: '#FFFFFF', borderRadius: 16, padding: 20, marginBottom: 18
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 28 }}>{tr('{kmThisYear} km', { kmThisYear: data.kmThisYear.toLocaleString(numLocale()) })}</span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, opacity: 0.85 }}>
                  {Math.round((data.kmThisYear / data.budget) * 100)}%
                </span>
              </div>
              <div style={{ fontSize: 13, opacity: 0.85, marginTop: 2 }}>{tr('von {budget} km, Zeitraum bis {periodEnd}', { budget: data.budget.toLocaleString(numLocale()), periodEnd: formatDate(data.periodEnd) })}</div>
              <div style={{ background: 'rgba(255,255,255,0.25)', borderRadius: 999, height: 8, marginTop: 14, overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(100, (data.kmThisYear / data.budget) * 100)}%`, height: '100%',
                  background: data.onTrack ? 'var(--yellow)' : '#E08A6B', borderRadius: 999
                }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 13 }}>
                <TrendingUp size={14} />
                {data.onTrack
                  ? tr('Im Plan, {remaining} km bis zum Stichtag verfügbar', { remaining: data.remaining.toLocaleString(numLocale()) })
                  : tr('Über dem erwarteten Tempo (Richtwert bis heute: {expectedByNow} km)', { expectedByNow: data.expectedByNow.toLocaleString(numLocale()) })}
              </div>
            </div>}

            {embedded && (
              <div style={{ fontSize: 13, color: data.onTrack ? '#3E6B44' : '#93341C', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <TrendingUp size={14} />
                {data.onTrack
                  ? tr('{kmThisYear} von {budget} km, noch {remaining} km bis {periodEnd}', { kmThisYear: data.kmThisYear.toLocaleString(numLocale()), budget: data.budget.toLocaleString(numLocale()), remaining: data.remaining.toLocaleString(numLocale()), periodEnd: formatDate(data.periodEnd) })
                  : tr('Über dem erwarteten Tempo (Richtwert bis heute: {expectedByNow} km)', { expectedByNow: data.expectedByNow.toLocaleString(numLocale()) })}
              </div>
            )}

            {!editingBudget ? (
              <button onClick={() => setEditingBudget(true)} style={{
                display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
                color: 'var(--forest)', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 18
              }}>
                <Settings2 size={14} />{' '}{tr('Budget und Stichtag anpassen')}
              </button>
            ) : (
              <form onSubmit={saveBudget} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
                <Field label={tr('Budget (km)')}>
                  <input type="number" value={budgetInput} onChange={e => setBudgetInput(e.target.value)} style={inputStyle} />
                </Field>
                <Field label={tr('Nächster Stichtag')}>
                  <input type="date" value={anchorInput} onChange={e => setAnchorInput(e.target.value)} style={inputStyle} />
                </Field>
                <Field label={tr('km-Stand bei Fahrzeugerhalt')}>
                  <input type="number" value={startbestandInput} onChange={e => setStartbestandInput(e.target.value)} style={inputStyle} />
                </Field>
                <button type="submit" style={primaryButtonStyle}>{tr('Speichern')}</button>
              </form>
            )}

            <div style={sectionLabelStyle}>{tr('Neue Ablesung')}</div>
            <form onSubmit={addReading} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                <input type="date" value={datum} onChange={e => setDatum(e.target.value)} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
                <input type="number" inputMode="numeric" value={km} onChange={e => setKm(e.target.value)} placeholder={tr('km-Stand')}
                  style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={note} onChange={e => setNote(e.target.value)} placeholder={tr('Notiz (optional)')}
                  style={{ ...inputStyle, flex: 1 }} />
                <button type="submit" disabled={adding} style={{ ...primaryButtonStyle, padding: '0 16px' }}>
                  {adding ? <Loader2 size={17} className="spin" /> : <Plus size={19} />}
                </button>
              </div>
            </form>

            <div style={sectionLabelStyle}>{tr('Verlauf')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[...data.readings].reverse().map(r => (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, background: 'var(--card-alt)',
                  border: '1px solid var(--border)', borderRadius: 10, padding: '11px 13px'
                }}>
                  <Gauge size={17} color="var(--forest)" style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>{tr('{km} km', { km: r.km.toLocaleString(numLocale()) })}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                      {formatDate(r.datum)}{r.campingplatz ? ` · ${r.campingplatz}` : r.note ? ` · ${r.note}` : ''}
                    </div>
                  </div>
                  {!r.entry_id && (
                    <button onClick={() => remove(r.id)} style={{ ...iconButtonStyle, width: 28, height: 28 }}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
              {data.readings.length === 0 && (
                <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--muted)', fontSize: 15 }}>
                  {tr('Noch keine Ablesungen erfasst.')}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// --- Fahrzeug-Verwaltung ---

const VEHICLE_TYPES = [
  { key: 'tanken', get label() { return tr('Tanken'); } },
  { key: 'laden', get label() { return tr('Laden'); } },
  { key: 'service', get label() { return tr('Service'); } },
  { key: 'reparatur', get label() { return tr('Reparatur'); } },
  { key: 'nachruestung', get label() { return tr('Nachrüstung'); } },
  { key: 'erledigt', get label() { return tr('Erledigte Aufgabe'); } },
  { key: 'sonstiges', get label() { return tr('Sonstiges'); } }
];

function VehicleEventForm({ existing, onAdded, onCancelEdit, onDelete }) {
  const [datum, setDatum] = useState(existing?.datum || todayISO());
  const [typ, setTyp] = useState(existing?.typ || 'service');
  const [titel, setTitel] = useState(existing?.titel || '');
  const [beschreibung, setBeschreibung] = useState(existing?.beschreibung || '');
  const [kosten, setKosten] = useState(existing?.kosten ?? '');
  const [kmStand, setKmStand] = useState(existing?.km_stand ?? '');
  const [saving, setSaving] = useState(false);

  async function doSave() {
    if (!titel.trim()) return false;
    const res = await fetch(`/api/vehicle-events/${existing.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        datum, typ, titel: titel.trim(), beschreibung: beschreibung.trim() || null,
        kosten: kosten || null, km_stand: kmStand || null
      })
    });
    return res.ok;
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (await doSave()) onAdded();
    } finally {
      setSaving(false);
    }
  }

  const autosaveMounted = useRef(false);
  const [justSaved, triggerSaved] = useSavedIndicator();
  useEffect(() => {
    if (!autosaveMounted.current) { autosaveMounted.current = true; return; }
    const timer = setTimeout(async () => {
      const ok = await doSave();
      if (ok) triggerSaved();
      else showToast(tr('Konnte nicht gespeichert werden.'), 'error');
    }, 800);
    return () => clearTimeout(timer);
  }, [datum, typ, titel, beschreibung, kosten, kmStand]);

  function selectTyp(key) {
    setTyp(key);
    const label = VEHICLE_TYPES.find(t => t.key === key)?.label;
    if (label) setTitel(label);
  }

  return (
    <form onSubmit={submit} style={{
      display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--card-alt)',
      border: '1px solid var(--border)', borderRadius: 14, padding: 14, marginBottom: 18
    }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {VEHICLE_TYPES.map(t => (
          <TagChip key={t.key} label={t.label} active={typ === t.key} onClick={() => selectTyp(t.key)} />
        ))}
      </div>
      <input value={titel} onChange={e => setTitel(e.target.value)} placeholder={tr('Titel, z.B. Ölwechsel')} style={inputStyle} required />
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="date" value={datum} onChange={e => setDatum(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
        <input type="number" value={kmStand} onChange={e => setKmStand(e.target.value)} placeholder={tr('km-Stand')} style={{ ...inputStyle, flex: 1 }} />
      </div>
      <Field label={tr('Kosten')} icon={Wallet}>
        <CurrencyAmountInput value={kosten} onChange={setKosten} placeholder={tr('z.B. {n}', { n: '320' })} />
      </Field>
      <textarea value={beschreibung} onChange={e => setBeschreibung(e.target.value)} placeholder={tr('Notizen (optional)')} rows={2}
        style={{ ...inputStyle, resize: 'vertical' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button type="button" onClick={onCancelEdit} style={{
          ...iconButtonStyle, width: 'auto', flex: 1, background: 'var(--input-bg)', border: '1px solid var(--border)'
        }}>{tr('Abbrechen')}</button>
        <SavedCheckmark show={justSaved} />
        {onDelete && (
          <button type="button" onClick={onDelete} aria-label={tr('Eintrag löschen')} style={{ ...iconButtonStyle, color: '#B3402A' }}>
            <Trash2 size={18} />
          </button>
        )}
        <button type="submit" disabled={saving} style={{ ...primaryButtonStyle, flex: 2 }}>
          {saving ? <Loader2 size={17} className="spin" /> : tr('Fertig')}
        </button>
      </div>
    </form>
  );
}

function VehicleTodoForm({ existing, onAdded, onCancel, onDelete }) {
  const [typ, setTyp] = useState(existing?.typ || 'service');
  const [text, setText] = useState(existing?.text || '');
  const [beschreibung, setBeschreibung] = useState(existing?.beschreibung || '');
  const [kosten, setKosten] = useState(existing?.kosten ?? '');
  const [kmStand, setKmStand] = useState(existing?.km_stand ?? '');
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(!!existing);

  function selectTyp(key) {
    setTyp(key);
    const label = VEHICLE_TYPES.find(t => t.key === key)?.label;
    if (label && !existing) setText(label);
  }

  async function submit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    try {
      const url = existing ? `/api/vehicle-todos/${existing.id}` : '/api/vehicle-todos';
      const method = existing ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(), typ, beschreibung: beschreibung.trim() || null,
          kosten: kosten || null, km_stand: kmStand || null
        })
      });
      if (res.ok) {
        if (existing) {
          onAdded();
        } else {
          setText(''); setBeschreibung(''); setKosten(''); setKmStand(''); setOpen(false);
          onAdded();
        }
      }
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ ...primaryButtonStyle, marginBottom: 14, width: '100%' }}>
        <Plus size={18} />{' '}{tr('Neuer Punkt')}
      </button>
    );
  }

  return (
    <form onSubmit={submit} style={{
      display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--card-alt)',
      border: '1px solid var(--border)', borderRadius: 14, padding: 14, marginBottom: 14
    }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {VEHICLE_TYPES.filter(t => t.key !== 'erledigt').map(t => (
          <TagChip key={t.key} label={t.label} active={typ === t.key} onClick={() => selectTyp(t.key)} />
        ))}
      </div>
      <input value={text} onChange={e => setText(e.target.value)} placeholder={tr('Titel, z.B. Winterreifen montieren')} style={inputStyle} required />
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="number" value={kmStand} onChange={e => setKmStand(e.target.value)} placeholder={tr('km-Stand (optional)')} style={{ ...inputStyle, flex: 1 }} />
      </div>
      <Field label={tr('Kosten (geschätzt)')} icon={Wallet}>
        <CurrencyAmountInput value={kosten} onChange={setKosten} placeholder={tr('z.B. {n}', { n: '250' })} />
      </Field>
      <textarea value={beschreibung} onChange={e => setBeschreibung(e.target.value)} placeholder={tr('Notizen (optional)')} rows={2}
        style={{ ...inputStyle, resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => existing ? onCancel() : setOpen(false)} style={{
          ...iconButtonStyle, width: 'auto', flex: 1, background: 'var(--input-bg)', border: '1px solid var(--border)'
        }}>{tr('Abbrechen')}</button>
        {existing && onDelete && (
          <button type="button" onClick={onDelete} aria-label={tr('Punkt löschen')} style={{ ...iconButtonStyle, color: '#B3402A' }}>
            <Trash2 size={18} />
          </button>
        )}
        <button type="submit" disabled={saving} style={{ ...primaryButtonStyle, flex: 2 }}>
          {saving ? <Loader2 size={17} className="spin" /> : tr('Speichern')}
        </button>
      </div>
    </form>
  );
}

// Anzeigetitel eines anstehenden Fahrzeug-Punkts: Wenn nur die Kategorie als Titel
// erfasst wurde ("Nachrüstung"), wird die erste Zeile der Notiz zum Titel.
function vehicleTodoDisplay(todo, typeLabel) {
  const desc = todo.beschreibung || '';
  const links = desc.match(URL_RE) || [];
  const descText = desc.replace(URL_RE, '').replace(/\s+/g, ' ').trim();
  // Gespeicherte Standardtitel ("Nachrüstung") zaehlen in jeder Sprache als Kategorie.
  const titleIsCategory = !todo.text || tr(todo.text.trim()) === typeLabel;
  return {
    title: titleIsCategory ? (descText || typeLabel) : todo.text,
    note: titleIsCategory ? '' : descText,
    links
  };
}

// Fahrzeugdaten (Masse in m, Gewichte in kg), gespeichert als Einstellungen dieser Installation.
const VEHICLE_SPEC_FIELDS = [
  { key: 'vehicle_length_m', label: 'specs.length', short: 'specs.l', unit: 'm' },
  { key: 'vehicle_width_m', label: 'specs.width', short: 'specs.w', unit: 'm' },
  { key: 'vehicle_height_m', label: 'specs.height', short: 'specs.h', unit: 'm' },
  { key: 'vehicle_weight_kg', label: 'specs.weight', short: 'specs.weightShort', unit: 'kg' },
  { key: 'vehicle_payload_kg', label: 'specs.payload', short: 'specs.payloadShort', unit: 'kg' }
];

// Masse: Komma oder Punkt als Dezimaltrennzeichen. Gewichte sind ganze kg, Trennzeichen wie
// ' . , oder Leerzeichen werden ignoriert (2'950, 2.950 und 2950 ergeben alle 2950 kg).
function parseSpecNumber(field, raw) {
  let cleaned = String(raw ?? '').trim().replace(/['\s\u2019]/g, '');
  if (cleaned === '') return '';
  cleaned = field.unit === 'kg' ? cleaned.replace(/[.,]/g, '') : cleaned.replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function fmtSpec(field, value) {
  const n = Number(value);
  return field.unit === 'm'
    ? n.toLocaleString(numLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : Math.round(n).toLocaleString(numLocale());
}

// Infozeile unter den Kopfkarten im Fahrzeug-Bereich, immer sichtbar. Antippen oeffnet das Formular.
function VehicleSpecsBar({ specs, onEdit }) {
  const has = (f) => specs[f.key] != null && specs[f.key] !== '';
  const dims = VEHICLE_SPEC_FIELDS.filter(f => f.unit === 'm' && has(f));
  const weights = VEHICLE_SPEC_FIELDS.filter(f => f.unit === 'kg' && has(f));
  const empty = dims.length === 0 && weights.length === 0;
  return (
    <button type="button" onClick={onEdit} aria-label={tr('specs.title')} style={{
      display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 14px', borderRadius: 12,
      border: '1px solid var(--border)', background: 'var(--card-alt)', cursor: 'pointer', textAlign: 'left',
      fontFamily: 'var(--font-body)', color: 'var(--text)', minHeight: 44
    }}>
      <Ruler size={17} color="var(--forest)" style={{ flexShrink: 0 }} />
      {empty ? (
        <span style={{ flex: 1, fontSize: 14, color: 'var(--forest)', fontWeight: 600 }}>{tr('specs.add')}</span>
      ) : (
        <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13, fontVariantNumeric: 'tabular-nums', minWidth: 0 }}>
          {dims.length > 0 && (
            <span>{dims.map(f => `${tr(f.short)} ${fmtSpec(f, specs[f.key])}`).join(' · ')} m</span>
          )}
          {weights.length > 0 && (
            <span style={{ color: 'var(--muted)' }}>
              {weights.map(f => `${tr(f.short)} ${fmtSpec(f, specs[f.key])} kg`).join(' · ')}
            </span>
          )}
        </span>
      )}
      {empty
        ? <Plus size={16} color="var(--forest)" style={{ flexShrink: 0 }} />
        : <Pencil size={14} color="var(--muted)" style={{ flexShrink: 0 }} />}
    </button>
  );
}

function VehicleSpecsModal({ specs, onClose, onSaved }) {
  const [values, setValues] = useState(() => Object.fromEntries(
    VEHICLE_SPEC_FIELDS.map(f => [f.key, specs[f.key] != null && specs[f.key] !== '' ? String(specs[f.key]) : ''])
  ));
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const parsed = {};
    for (const f of VEHICLE_SPEC_FIELDS) {
      const v = parseSpecNumber(f, values[f.key]);
      if (v === null) { showToast(tr('specs.invalid'), 'error'); return; }
      parsed[f.key] = v;
    }
    setSaving(true);
    try {
      const results = await Promise.all(VEHICLE_SPEC_FIELDS.map(f => fetch(`/api/settings/${f.key}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: parsed[f.key] === '' ? '' : String(parsed[f.key]) })
      })));
      if (results.some(r => !r.ok)) throw new Error(tr('Konnte nicht gespeichert werden.'));
      showToast(tr('Gespeichert'));
      onSaved();
    } catch (err) {
      showToast(err.message === 'Failed to fetch' ? tr('Server nicht erreichbar.') : err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const input = (f) => (
    <Field key={f.key} label={tr(f.label)}>
      <input type="text" inputMode="decimal" value={values[f.key]}
        onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
    </Field>
  );

  return (
    <ModalShell title={tr('specs.title')} onClose={onClose} onSubmit={submit}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {VEHICLE_SPEC_FIELDS.filter(f => f.unit === 'm').map(input)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        {VEHICLE_SPEC_FIELDS.filter(f => f.unit === 'kg').map(input)}
      </div>
      <button type="submit" disabled={saving} style={{ ...primaryButtonStyle, marginTop: 4 }}>
        {saving ? <Loader2 size={17} className="spin" /> : tr('Speichern')}
      </button>
    </ModalShell>
  );
}

function VehicleView({ initialTab }) {
  const [events, setEvents] = useState([]);
  const [todos, setTodos] = useState([]);
  const [odo, setOdo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingEvent, setEditingEvent] = useState(null);
  const [editingTodo, setEditingTodo] = useState(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState(initialTab || 'anstehend');
  const [specs, setSpecs] = useState(null);
  const [editingSpecs, setEditingSpecs] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(''); }
    try {
      const [eRes, tRes, oRes, sRes] = await Promise.all([
        fetch('/api/vehicle-events'), fetch('/api/vehicle-todos'), fetch('/api/odometer').catch(() => null),
        fetch('/api/settings').catch(() => null)
      ]);
      if (!eRes.ok || !tRes.ok) throw new Error(tr('Konnte nicht geladen werden.'));
      setEvents(await eRes.json());
      setTodos(await tRes.json());
      if (oRes && oRes.ok) setOdo(await oRes.json());
      if (sRes && sRes.ok) setSpecs(await sRes.json());
    } catch (e) {
      if (!silent) setError(e.message === 'Failed to fetch' ? tr('Server nicht erreichbar.') : e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load);

  async function toggleTodo(todo) {
    await fetch(`/api/vehicle-todos/${todo.id}/complete`, { method: 'POST' });
    showToast(tr('Erledigt und in den Verlauf übernommen'));
    load();
  }

  async function removeTodo(id) {
    if (!(await confirmDialog(tr('Diesen Punkt wirklich löschen?')))) return;
    await fetch(`/api/vehicle-todos/${id}`, { method: 'DELETE' });
    setEditingTodo(null);
    load();
  }

  async function removeEvent(id) {
    if (!(await confirmDialog(tr('Diesen Eintrag wirklich löschen?')))) return;
    await fetch(`/api/vehicle-events/${id}`, { method: 'DELETE' });
    setEditingEvent(null);
    load();
  }

  const typeLabel = (key) => VEHICLE_TYPES.find(t => t.key === key)?.label || key;

  const filteredEvents = events.filter(ev => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [ev.titel, ev.beschreibung, typeLabel(ev.typ)].filter(Boolean).some(v => v.toLowerCase().includes(q));
  });
  const plannedCost = todos.reduce((s, t) => s + (t.kosten != null ? Number(t.kosten) : 0), 0);
  const lastReading = odo?.readings?.length ? odo.readings[odo.readings.length - 1] : null;

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)', color: 'var(--text)' }}>
      <TabHeader title={tr('Fahrzeug')} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 18px 32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          <div style={{ borderRadius: 16, background: 'var(--forest)', color: '#FFFFFF', padding: 14, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <span style={{ fontSize: 13, color: '#CFE0CC' }}>{tr('Kilometerstand')}</span>
            {odo ? (
              <>
                <span style={{ fontSize: 21, fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {odo.latestKm != null ? tr('{latestKm} km', { latestKm: odo.latestKm.toLocaleString(numLocale()) }) : '–'}
                </span>
                <span style={{ fontSize: 12, color: '#CFE0CC' }}>{lastReading ? tr('abgelesen {datum}', { datum: formatDate(lastReading.datum) }) : tr('noch keine Ablesung')}</span>
              </>
            ) : <><SkeletonBlock w="80%" h={20} bg="#4A7050" /><SkeletonBlock w="60%" h={10} bg="#4A7050" /></>}
          </div>
          <button onClick={() => setTab('km')} style={{ ...glanceCardStyle, gap: 6 }}>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>{tr('KM-Budget')}</span>
            {odo ? (
              <>
                <span style={{ fontSize: 21, fontWeight: 600 }}>{Math.round((odo.kmThisYear / odo.budget) * 100)}%</span>
                <div style={{ height: 6, borderRadius: 3, background: '#E6EDE2', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, (odo.kmThisYear / odo.budget) * 100)}%`, height: 6, background: odo.onTrack ? 'var(--forest)' : '#B3402A' }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 500, color: odo.onTrack ? '#3E6B44' : '#93341C' }}>
                  {odo.onTrack ? tr('Im Plan') : tr('Über Plan')}{' '}{tr('bis')}{' '}{formatDate(odo.periodEnd)}
                </span>
              </>
            ) : <><SkeletonBlock w="50%" h={20} /><SkeletonBlock h={6} r={3} /></>}
          </button>
        </div>

        {specs && <VehicleSpecsBar specs={specs} onEdit={() => setEditingSpecs(true)} />}
        {editingSpecs && specs && (
          <VehicleSpecsModal specs={specs} onClose={() => setEditingSpecs(false)}
            onSaved={() => { setEditingSpecs(false); load(true); }} />
        )}

        <Segmented value={tab} onChange={setTab} options={[
          { key: 'anstehend', label: todos.length ? tr('Anstehend {length}', { length: todos.length }) : tr('Anstehend') },
          { key: 'verlauf', label: tr('Verlauf') },
          { key: 'km', label: tr('KM-Stand') }
        ]} />

        {loading && tab !== 'km' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SkeletonBlock h={52} r={12} /><SkeletonBlock h={52} r={12} /><SkeletonBlock h={52} r={12} />
          </div>
        )}
        {error && tab !== 'km' && <div style={{ color: '#B3402A', fontSize: 14 }}>{error}</div>}

        {!loading && !error && tab === 'anstehend' && (
          <div>
            {editingTodo ? (
              <VehicleTodoForm key={`edit-${editingTodo.id}`} existing={editingTodo}
                onAdded={() => { setEditingTodo(null); load(); }}
                onCancel={() => setEditingTodo(null)}
                onDelete={() => removeTodo(editingTodo.id)} />
            ) : (
              <VehicleTodoForm key="new" onAdded={load} />
            )}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {todos.map((todo, idx) => {
                const d = vehicleTodoDisplay(todo, typeLabel(todo.typ));
                return (
                  <div key={todo.id} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0',
                    borderBottom: idx === todos.length - 1 ? 'none' : '1px solid #EEF2EB'
                  }}>
                    <button onClick={() => toggleTodo(todo)} aria-label={tr('Als erledigt markieren')} style={{ ...iconButtonStyle, marginLeft: -10 }}>
                      <Circle size={22} color="var(--muted)" />
                    </button>
                    <div onClick={() => setEditingTodo(todo)} style={{ flex: 1, minWidth: 0, cursor: 'pointer', padding: '6px 0' }}>
                      <div style={{ fontSize: 15, fontWeight: 500 }}>{d.title}</div>
                      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3, display: 'flex', flexWrap: 'wrap', gap: '2px 6px', alignItems: 'center' }}>
                        <span>{typeLabel(todo.typ)}</span>
                        {todo.km_stand ? <span>{tr('· {km_stand} km', { km_stand: todo.km_stand.toLocaleString(numLocale()) })}</span> : null}
                        {d.links.map(l => (
                          <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            ·
                            <a href={l} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                              style={{ color: 'var(--forest)', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 3, textDecoration: 'none' }}>
                              {linkHost(l)} <ExternalLink size={12} />
                            </a>
                          </span>
                        ))}
                      </div>
                      {d.note && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>{d.note}</div>}
                    </div>
                    <span onClick={() => setEditingTodo(todo)} style={{
                      fontSize: 14, fontWeight: 500, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', cursor: 'pointer',
                      color: todo.kosten != null ? 'var(--text)' : '#8A9687'
                    }}>
                      {todo.kosten != null ? fmtMoney(todo.kosten) : tr('offen')}
                    </span>
                  </div>
                );
              })}
              {todos.length === 0 && (
                <div style={{ textAlign: 'center', padding: '24px 10px', color: 'var(--muted)', fontSize: 14 }}>
                  {tr('Nichts Anstehendes. Neue Punkte, etwa geplante Nachrüstungen oder den nächsten Service, oben erfassen.')}
                </div>
              )}
            </div>
            {plannedCost > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, padding: '12px 14px', borderRadius: 14, background: 'var(--card-alt)', fontSize: 14 }}>
                <span style={{ color: 'var(--muted)' }}>{tr('Geplante Kosten')}</span>
                <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(plannedCost)}</span>
              </div>
            )}
          </div>
        )}

        {!loading && !error && tab === 'verlauf' && (
          <div>
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <Search size={16} color="var(--muted)" style={{ position: 'absolute', left: 12, top: 15 }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder={tr('Verlauf durchsuchen...')}
                style={{ ...inputStyle, width: '100%', paddingLeft: 38, boxSizing: 'border-box' }} />
            </div>
            {editingEvent && (
              <VehicleEventForm key={`edit-event-${editingEvent.id}`} existing={editingEvent}
                onAdded={() => { setEditingEvent(null); load(); }}
                onCancelEdit={() => setEditingEvent(null)}
                onDelete={() => removeEvent(editingEvent.id)} />
            )}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {filteredEvents.map((ev, idx) => (
                <button key={ev.id} onClick={() => setEditingEvent(ev)} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', background: 'none', border: 'none',
                  borderBottom: idx === filteredEvents.length - 1 ? 'none' : '1px solid #EEF2EB', cursor: 'pointer',
                  textAlign: 'left', fontFamily: 'var(--font-body)', color: 'var(--text)', width: '100%'
                }}>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontSize: 15, fontWeight: 500 }}>{tr(ev.titel)}</span>
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                      {formatDate(ev.datum)}{tr(ev.titel) !== typeLabel(ev.typ) ? ` · ${typeLabel(ev.typ)}` : ''}{ev.km_stand ? tr(' · {km_stand} km', { km_stand: ev.km_stand.toLocaleString(numLocale()) }) : ''}
                    </span>
                    {ev.beschreibung && (
                      <span style={{ fontSize: 13, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ev.beschreibung.replace(URL_RE, (u) => linkHost(u))}
                      </span>
                    )}
                  </span>
                  {ev.kosten != null && (
                    <span style={{ fontSize: 14, fontWeight: 500, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtMoney(ev.kosten)}</span>
                  )}
                </button>
              ))}
              {filteredEvents.length === 0 && events.length > 0 && (
                <div style={{ textAlign: 'center', padding: '20px 10px', color: 'var(--muted)', fontSize: 14 }}>{tr('Keine Treffer.')}</div>
              )}
              {events.length === 0 && (
                <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--muted)', fontSize: 14 }}>
                  {tr('Noch keine Einträge im Verlauf. Tanken, Laden und erledigte Punkte landen automatisch hier.')}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'km' && <OdometerView embedded onChanged={load} />}
      </div>
    </div>
  );
}

// --- KPI-Uebersicht ---

function BarChart({ data, unit }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {data.map(d => (
        <div key={d.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
            <span style={{ color: 'var(--text)' }}>{d.label}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
              {unit === 'money' ? fmtMoney(d.value) : `${unit || ''}${d.value.toLocaleString(numLocale())}`}
            </span>
          </div>
          <div style={{ background: 'var(--input-bg)', borderRadius: 6, height: 10, overflow: 'hidden' }}>
            <div style={{
              width: `${max > 0 ? (d.value / max) * 100 : 0}%`, height: '100%',
              background: d.color || 'var(--forest)', borderRadius: 6, transition: 'width 0.5s ease-out'
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, sub }) {
  return (
    <div style={{
      background: 'var(--card-alt)', border: '1px solid var(--border)', borderRadius: 14,
      padding: 14, minWidth: 0
    }}>
      <Icon size={18} color="var(--forest)" style={{ marginBottom: 8 }} />
      <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 20, fontWeight: 700, color: 'var(--forest)', whiteSpace: 'nowrap' }}>{value}</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function KpiView({ onBack, embedded }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await fetch('/api/kpis');
      if (!r.ok) throw new Error(tr('Konnte nicht geladen werden.'));
      setData(await r.json());
    } catch (e) {
      if (!silent) setError(e.message === 'Failed to fetch' ? tr('Server nicht erreichbar.') : e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load);

  return (
    <div style={embedded ? {} : { minHeight: '100%', background: 'var(--bg)', color: 'var(--text)', paddingBottom: 60 }}>
      {!embedded && (
        <div style={headerBarStyle}>
          <button onClick={onBack} style={iconButtonStyle}><ArrowLeft size={21} /></button>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 19 }}>{tr('Statistiken')}</span>
          <div style={{ width: 44 }} />
        </div>
      )}

      <div style={embedded ? {} : { padding: '14px 18px 0' }}>
        {loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            {[0, 1, 2, 3].map(i => <SkeletonBlock key={i} h={96} r={14} />)}
          </div>
        )}
        {error && <div style={{ color: '#B3402A', fontSize: 14 }}>{error}</div>}

        {data && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 20 }}>
              <KpiCard label={tr('Trips')} value={data.stopps} icon={Tent} />
              <KpiCard label={tr('Übernachtungen')} value={data.naechte} icon={Calendar} />
              <KpiCard label={tr('Ø Bewertung')} value={data.bewertungDurchschnitt != null ? `${data.bewertungDurchschnitt}/5` : '–'} icon={Star} />
              <KpiCard label={tr('km laufender Zeitraum')} value={data.kmThisYear.toLocaleString(numLocale())} icon={Gauge}
                sub={tr('von {kmBudget} km', { kmBudget: data.kmBudget.toLocaleString(numLocale()) })} />
              {data.ausgabenProNacht != null && (
                <KpiCard label={tr('Ø Übernachtung/Nacht')} value={fmtMoney(data.ausgabenProNacht)} icon={Wallet} />
              )}
              {data.ausgabenProNachtMitAktivitaeten != null && (
                <KpiCard label={tr('Ø Übernachtung+Aktivitäten/Nacht')} value={fmtMoney(data.ausgabenProNachtMitAktivitaeten)} icon={Wallet} />
              )}
              {data.treibstoffKostenProKm != null && (
                <KpiCard label={tr('Ø Treibstoff/Laden pro km')} value={fmtMoney(data.treibstoffKostenProKm)} icon={Wallet} />
              )}
            </div>

            {(data.ausgabenUebernachtung || data.ausgabenRestaurant || data.ausgabenAktivitaeten) > 0 && (
              <>
                <div style={sectionLabelStyle}>{tr('Kosten nach Kategorie')}</div>
                <div style={{
                  background: 'var(--card-alt)', border: '1px solid var(--border)', borderRadius: 14,
                  padding: 16, marginBottom: 20
                }}>
                  <BarChart unit="money" data={[
                    { label: tr('Übernachtung'), value: data.ausgabenUebernachtung, color: 'var(--forest)' },
                    { label: tr('Restaurant & Einkäufe'), value: data.ausgabenRestaurant, color: 'var(--yellow)' },
                    { label: tr('Aktivitäten'), value: data.ausgabenAktivitaeten, color: '#5C7A99' }
                  ]} />
                </div>
              </>
            )}

            {data.topTags.length > 0 && (
              <>
                <div style={sectionLabelStyle}>{tr('Meistgenutzte Tags')}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                  {data.topTags.map(t => (
                    <div key={t.tag} style={{
                      display: 'flex', alignItems: 'center', gap: 10, background: 'var(--card-alt)',
                      border: '1px solid var(--border)', borderRadius: 10, padding: '10px 13px'
                    }}>
                      <Tag size={15} color="var(--forest)" />
                      <span style={{ flex: 1, fontSize: 14 }}>{tr(t.tag)}</span>
                      <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13, color: 'var(--muted)' }}>{t.count}×</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Rueckblick: Einstieg zu Lessons Learnt und Karte, darunter die Statistiken.
function RueckblickView({ lessons, entries, navigate }) {
  const offen = lessons.filter(l => l.status !== 'umgesetzt').length;
  const mitOrt = entries.filter(e => e.ort).length;
  const rows = [
    { key: 'lessons', label: tr('Lessons Learnt'), icon: Lightbulb,
      sub: lessons.length ? (offen ? tr('{offen} offen · {v} umgesetzt', { offen: offen, v: lessons.length - offen }) : tr('Alle {length} umgesetzt', { length: lessons.length })) : tr('Noch keine gesammelt') },
    { key: 'map', label: tr('Karte'), icon: MapPin, sub: mitOrt ? tr('{mitOrt} Orte', { mitOrt: mitOrt }) : tr('Noch keine Orte') }
  ];
  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)', color: 'var(--text)' }}>
      <TabHeader title={tr('Rückblick')} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '4px 18px 32px' }}>
        <div style={{ border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
          {rows.map((r, i) => {
            const Icon = r.icon;
            return (
              <button key={r.key} onClick={() => navigate({ name: r.key, from: 'rueckblick' })} style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 14px', background: '#FFFFFF',
                border: 'none', borderBottom: i === rows.length - 1 ? 'none' : '1px solid #EEF2EB', cursor: 'pointer',
                textAlign: 'left', fontFamily: 'var(--font-body)', color: 'var(--text)'
              }}>
                <span style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--card-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={20} color="var(--forest)" />
                </span>
                <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{r.label}</span>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>{r.sub}</span>
                </span>
                <ChevronRight size={18} color="var(--muted)" />
              </button>
            );
          })}
        </div>
        <h2 style={{ margin: '4px 0 -6px', fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>{tr('Statistiken')}</h2>
        <KpiView embedded />
      </div>
    </div>
  );
}

// --- Finanzen ---

const FINANCE_TYP_LABELS = {
  get monatlich() { return tr('pro Monat'); },
  get jaehrlich() { return tr('pro Jahr'); },
  get einmalig() { return tr('einmalig'); }
};
// Als Funktion, weil die Bezeichnung der Fahrzeug-Kategorie aus den Einstellungen kommt.
function financeKategorien() {
  return [
    { key: 'fahrzeug', label: vehicleLabel() },
    { key: 'camping', label: tr('Camping') },
    { key: 'sonstiges', label: tr('Sonstiges') }
  ];
}

function FinanceItemForm({ existing, defaultKategorie, onSaved, onCancel, onDelete }) {
  const [bezeichnung, setBezeichnung] = useState(existing?.bezeichnung || '');
  const [betrag, setBetrag] = useState(existing?.betrag ?? '');
  const [typ, setTyp] = useState(existing?.typ || 'einmalig');
  const [kategorie, setKategorie] = useState(existing?.kategorie || defaultKategorie || 'fahrzeug');
  const [faelligDatum, setFaelligDatum] = useState(existing?.faellig_datum || '');
  const [maxPerioden, setMaxPerioden] = useState(existing?.max_perioden ?? '');
  const [saving, setSaving] = useState(false);

  async function doSave() {
    if (!bezeichnung.trim() || betrag === '') return null;
    const url = existing ? `/api/finance-items/${existing.id}` : '/api/finance-items';
    const method = existing ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bezeichnung: bezeichnung.trim(), betrag: Number(betrag), typ, kategorie,
        faellig_datum: faelligDatum || null,
        max_perioden: maxPerioden === '' ? null : Number(maxPerioden)
      })
    });
    return res.ok ? res.json() : null;
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const saved = await doSave();
      if (saved) onSaved(saved);
    } finally {
      setSaving(false);
    }
  }

  const autosaveMounted = useRef(false);
  const [justSaved, triggerSaved] = useSavedIndicator();
  useEffect(() => {
    if (!existing) return;
    if (!autosaveMounted.current) { autosaveMounted.current = true; return; }
    const timer = setTimeout(async () => {
      const saved = await doSave();
      if (saved) triggerSaved();
      else showToast(tr('Konnte nicht gespeichert werden.'), 'error');
    }, 800);
    return () => clearTimeout(timer);
  }, [bezeichnung, betrag, typ, kategorie, faelligDatum, maxPerioden]);

  return (
    <form onSubmit={submit} style={{
      display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--card-alt)',
      border: '1px solid var(--border)', borderRadius: 14, padding: 14, marginBottom: 14
    }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {financeKategorien().map(k => (
          <TagChip key={k.key} label={k.label} active={kategorie === k.key} onClick={() => setKategorie(k.key)} />
        ))}
      </div>
      <input value={bezeichnung} onChange={e => setBezeichnung(e.target.value)} placeholder={tr('Bezeichnung, z.B. Vignette')}
        style={inputStyle} required />
      <CurrencyAmountInput value={betrag} onChange={setBetrag} placeholder={tr('Betrag')} />
      <div style={{ display: 'flex', gap: 8 }}>
        {Object.entries(FINANCE_TYP_LABELS).map(([key, label]) => (
          <TagChip key={key} label={label} active={typ === key} onClick={() => setTyp(key)} />
        ))}
      </div>
      <Field label={typ === 'einmalig' ? tr('Datum (optional, leer = sofort angefallen)') : tr('Erste Fälligkeit')}>
        <input type="date" value={faelligDatum} onChange={e => setFaelligDatum(e.target.value)} style={inputStyle} />
      </Field>
      {typ !== 'einmalig' && (
        <Field label={tr('Laufzeit in Perioden (optional, z.B. 24 Monate bei Leasing)')}>
          <input type="number" value={maxPerioden} onChange={e => setMaxPerioden(e.target.value)} style={inputStyle}
            placeholder={tr('unbegrenzt, falls leer')} />
        </Field>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button type="button" onClick={onCancel} style={{
          ...iconButtonStyle, width: 'auto', flex: 1, background: 'var(--input-bg)', border: '1px solid var(--border)'
        }}>{existing ? tr('Fertig') : tr('Abbrechen')}</button>
        <SavedCheckmark show={justSaved} />
        {existing && onDelete && (
          <button type="button" onClick={onDelete} aria-label={tr('Posten löschen')} style={{ ...iconButtonStyle, color: '#B3402A' }}>
            <Trash2 size={18} />
          </button>
        )}
        {!existing && (
          <button type="submit" disabled={saving} style={{ ...primaryButtonStyle, flex: 2 }}>
            {saving ? <Loader2 size={17} className="spin" /> : tr('Speichern')}
          </button>
        )}
      </div>
    </form>
  );
}

// Zeigt die einzelnen Buchungen (Datum, Notiz, Betrag), aus denen sich eine automatisch
// berechnete Finanzen-Kategorie zusammensetzt.
function FinanceDetailModal({ category, label, onClose }) {
  const [state, setState] = useState({ loading: true, error: null, transactions: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/finance-summary/details?category=${encodeURIComponent(category)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || tr('Konnte nicht geladen werden.'));
        if (!cancelled) setState({ loading: false, error: null, transactions: data.transactions || [] });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: e.message === 'Failed to fetch' ? tr('Server nicht erreichbar.') : e.message, transactions: null });
      }
    })();
    return () => { cancelled = true; };
  }, [category]);

  const total = (state.transactions || []).reduce((s, t) => s + (t.betrag || 0), 0);

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(30,43,31,0.45)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 24
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#FFFFFF', borderRadius: 16, padding: 20, maxWidth: 380, width: '100%',
        maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 50px rgba(0,0,0,0.3)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>{label}</span>
          <button onClick={onClose} style={{ ...iconButtonStyle, width: 30, height: 30 }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {state.loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 30, color: 'var(--muted)' }}>
              <Loader2 size={20} className="spin" />
            </div>
          )}
          {state.error && <div style={{ fontSize: 13, color: '#B3402A' }}>{state.error}</div>}
          {state.transactions && state.transactions.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: 20 }}>
              {tr('Keine Buchungen vorhanden.')}
            </div>
          )}
          {state.transactions && state.transactions.map((t, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px',
              background: 'var(--card-alt)', border: '1px solid var(--border)', borderRadius: 10
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t.notiz || '–'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {formatDate(t.datum)}
                </div>
              </div>
              <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13, whiteSpace: 'nowrap' }}>
                {fmtMoney(t.betrag)}
              </span>
            </div>
          ))}
        </div>
        {state.transactions && state.transactions.length > 0 && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14,
            paddingTop: 10, borderTop: '1px solid var(--border)'
          }}>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>{tr('Total')}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 16, fontWeight: 700 }}>
              {fmtMoney(total)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function addMonthsISO(iso, months) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1 + months, d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function monthYearLabel(iso) {
  if (!iso) return '';
  const [y, m] = iso.split('-').map(Number);
  return `${monthNames()[m - 1]} ${y}`;
}

// Eine Zeile in einer Finanz-Karte. Antippen oeffnet Bearbeiten bzw. die Einzelbuchungen.
function FinRow({ label, sub, amount, onClick, chevron, last, children }) {
  const zero = !amount;
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '11px 14px', background: 'none',
      border: 'none', borderBottom: last ? 'none' : '1px solid #EEF2EB', cursor: 'pointer', textAlign: 'left',
      fontFamily: 'var(--font-body)', color: 'var(--text)', minHeight: 48
    }}>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontSize: 15, fontWeight: 500 }}>{label}</span>
        {sub && <span style={{ fontSize: 13, color: 'var(--muted)' }}>{sub}</span>}
        {children}
      </span>
      <span style={{
        fontSize: 15, fontWeight: zero ? 400 : 500, color: zero ? '#8A9687' : 'var(--text)',
        fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap'
      }}>{fmtAmount(amount)}</span>
      {chevron && <ChevronRight size={16} color="#8A9687" style={{ flexShrink: 0 }} />}
    </button>
  );
}

function FinCard({ title, total, badge, tint = 'var(--card-alt)', border = 'var(--border)', children }) {
  return (
    <div style={{ border: `1px solid ${border}`, borderRadius: 16, overflow: 'hidden', background: '#FFFFFF' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 14px',
        background: tint, borderBottom: `1px solid ${border}`
      }}>
        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, minWidth: 0 }}>
          {title}
          {badge && <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 6px', borderRadius: 6, background: '#FFFFFF', color: 'var(--muted)' }}>{badge}</span>}
        </h3>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--forest)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', flexShrink: 0 }}>{fmtMoney(total)}</span>
      </div>
      {children}
    </div>
  );
}

function FinSectionHead({ title, color, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, borderBottom: `2px solid ${color}` }}>
      <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: color }} />{title}
      </h2>
      {right}
    </div>
  );
}

function FinTotal({ label, amount, bg, fg }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, background: bg, color: fg }}>
      <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtMoney(amount)}</span>
    </div>
  );
}

// Untertitel eines selbst erfassten Postens: Rate, Laufzeit-Fortschritt bzw. naechste Faelligkeit.
function financeItemInfo(i) {
  if (i.typ === 'einmalig') return { sub: i.faellig_datum ? formatDate(i.faellig_datum) : null };
  const perioden = i.betrag ? Math.round((i.accrued ?? 0) / i.betrag) : 0;
  const rate = `${fmtMoney(i.betrag)} ${FINANCE_TYP_LABELS[i.typ]}`;
  if (i.max_perioden) {
    const label = i.typ === 'monatlich' ? tr('Raten') : tr('Jahren');
    return { sub: tr('{rate} · {Math} von {max_perioden} {label}', { rate: rate, Math: Math.min(perioden, i.max_perioden), max_perioden: i.max_perioden, label: label }), progress: Math.min(1, perioden / i.max_perioden) };
  }
  if (i.typ === 'jaehrlich' && i.faellig_datum) {
    return { sub: tr('{rate} · nächste {faellig_datum}', { rate: rate, faellig_datum: formatDate(addMonthsISO(i.faellig_datum, 12 * Math.max(perioden, 1))) }) };
  }
  return { sub: i.faellig_datum ? tr('{rate} · seit {faellig_datum}', { rate: rate, faellig_datum: formatDate(i.faellig_datum) }) : rate };
}

function FinanceView() {
  const [summary, setSummary] = useState(null);
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formState, setFormState] = useState(null); // { existing?, defaultKategorie }
  const [detailRow, setDetailRow] = useState(null);
  const formRef = useRef(null);

  useEffect(() => {
    if (formState && formRef.current) formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [formState]);

  const load = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(''); }
    try {
      const [res, kRes] = await Promise.all([fetch('/api/finance-summary'), fetch('/api/kpis').catch(() => null)]);
      if (!res.ok) throw new Error(tr('Konnte nicht geladen werden.'));
      setSummary(await res.json());
      if (kRes && kRes.ok) setKpis(await kRes.json());
    } catch (e) {
      if (!silent) setError(e.message === 'Failed to fetch' ? tr('Server nicht erreichbar.') : e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load);

  async function removeItem(id) {
    if (!(await confirmDialog(tr('Diesen Posten wirklich löschen?')))) return;
    await fetch(`/api/finance-items/${id}`, { method: 'DELETE' });
    setFormState(null);
    load();
  }

  const header = (
    <TabHeader title={tr('Finanzen')}>
      <button onClick={() => setFormState({ defaultKategorie: 'fahrzeug' })} aria-label={tr('Neuer Posten')} style={headerPrimaryStyle}>
        <Plus size={20} />
      </button>
    </TabHeader>
  );

  if (loading || error || !summary) {
    return (
      <div style={{ minHeight: '100%', background: 'var(--bg)', color: 'var(--text)' }}>
        {header}
        <div style={{ padding: '4px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {loading && (
            <>
              <SkeletonBlock h={150} r={20} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                <SkeletonBlock h={96} r={16} /><SkeletonBlock h={96} r={16} />
              </div>
              <SkeletonBlock h={220} r={16} />
            </>
          )}
          {error && <div style={{ color: '#B3402A', fontSize: 14 }}>{error}</div>}
        </div>
      </div>
    );
  }

  const t = financeTotals(summary);
  const wiederkehrend = t.fahrzeugItems.filter(i => i.typ !== 'einmalig');
  const einmalig = t.fahrzeugItems.filter(i => i.typ === 'einmalig');
  const autoFahrzeug = [
    { key: 'treibstoff', label: tr('Treibstoff und Energie'), amount: summary.fahrzeugTreibstoffKosten ?? 0,
      sub: kpis?.treibstoffKostenProKm != null ? tr('{treibstoffKostenProKm} pro km', { treibstoffKostenProKm: fmtMoney(kpis.treibstoffKostenProKm) }) : null },
    { key: 'nachruestung', label: tr('Nachrüstung'), amount: summary.fahrzeugNachruestungKosten ?? 0 },
    { key: 'service', label: tr('Service und Reparaturen'), amount: summary.fahrzeugServiceKosten ?? 0 }
  ];
  const nights = kpis?.naechte || 0;
  const autoCamping = [
    { key: 'uebernachtung', label: tr('Übernachtung'), amount: summary.ausgabenUebernachtung ?? 0,
      sub: nights ? tr('{nights} Nächte · {v} pro Nacht', { nights: nights, v: fmtMoney((summary.ausgabenUebernachtung ?? 0) / nights) }) : null },
    { key: 'restaurant', label: tr('Restaurant und Einkäufe'), amount: summary.ausgabenRestaurant ?? 0 },
    { key: 'aktivitaeten', label: tr('Aktivitäten'), amount: summary.ausgabenAktivitaeten ?? 0 }
  ];
  const sumOf = (arr) => arr.reduce((s, i) => s + (i.accrued ?? 0), 0);
  const sumAuto = (arr) => arr.reduce((s, r) => s + r.amount, 0);
  const caliShare = t.total ? (t.california / t.total) * 100 : 0;

  function itemRows(items) {
    return items.map((i, idx) => {
      const info = financeItemInfo(i);
      return (
        <FinRow key={i.id} label={i.bezeichnung} sub={info.sub} amount={i.accrued ?? 0} last={idx === items.length - 1}
          onClick={() => setFormState({ existing: i })}>
          {info.progress != null && (
            <span style={{ display: 'block', height: 4, borderRadius: 2, background: '#E6EDE2', marginTop: 4, width: 140 }}>
              <span style={{ display: 'block', width: `${info.progress * 100}%`, height: 4, borderRadius: 2, background: 'var(--forest)' }} />
            </span>
          )}
        </FinRow>
      );
    });
  }
  function autoRows(rows) {
    return rows.map((r, idx) => (
      <FinRow key={r.key} label={r.label} sub={r.sub} amount={r.amount} chevron last={idx === rows.length - 1}
        onClick={() => setDetailRow(r)} />
    ));
  }

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)', color: 'var(--text)' }}>
      {header}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '4px 18px 32px' }}>
        {formState && (
          <div ref={formRef}>
            <FinanceItemForm key={formState.existing?.id ?? 'new'} existing={formState.existing} defaultKategorie={formState.defaultKategorie}
              onCancel={() => { setFormState(null); load(); }} onSaved={() => { setFormState(null); load(); }}
              onDelete={formState.existing ? () => removeItem(formState.existing.id) : null} />
          </div>
        )}

        <div style={{ borderRadius: 20, background: 'var(--forest)', color: '#FFFFFF', padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 13, color: '#CFE0CC' }}>{t.since ? tr('Ausgegeben seit {since}', { since: monthYearLabel(t.since) }) : tr('Ausgegeben bisher')}</span>
            <span style={{ fontSize: 30, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(t.total)}</span>
          </div>
          <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: 'var(--forest-dark)' }}>
            <div style={{ width: `${caliShare}%`, background: '#FFFFFF' }} />
            <div style={{ width: `${t.total ? (t.camping / t.total) * 100 : 0}%`, background: 'var(--yellow)' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            {[{ l: vehicleLabel(), v: t.california, c: '#FFFFFF' }, { l: tr('Camping'), v: t.camping, c: 'var(--yellow)' }].map(x => (
              <div key={x.l} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 12, color: '#CFE0CC', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: x.c }} />{x.l}
                </span>
                <span style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(x.v)}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          <div style={finKpiStyle}>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>{tr('Fixkosten pro Monat')}</span>
            <span style={finKpiValueStyle}>{fmtMoney(t.monthlyFixed)}</span>
            <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>{tr('Monatliche und anteilig jährliche Posten')}</span>
          </div>
          <div style={finKpiStyle}>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>{tr('Camping pro Nacht')}</span>
            <span style={finKpiValueStyle}>{nights ? fmtMoney(t.camping / nights) : '–'}</span>
            <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>{nights ? tr('{nights} Nächte, inkl. Restaurant und Einkäufe', { nights: nights }) : tr('Noch keine Nächte erfasst')}</span>
          </div>
        </div>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
          <FinSectionHead title={vehicleLabel()} color="var(--forest)" right={
            <button onClick={() => setFormState({ defaultKategorie: 'fahrzeug' })} style={finAddStyle}><Plus size={16} />{tr('Posten')}</button>
          } />
          {wiederkehrend.length > 0 && <FinCard title={tr('Wiederkehrend')} total={sumOf(wiederkehrend)}>{itemRows(wiederkehrend)}</FinCard>}
          {einmalig.length > 0 && <FinCard title={tr('Einmalig')} total={sumOf(einmalig)}>{itemRows(einmalig)}</FinCard>}
          <FinCard title={tr('Fahrzeug-Verlauf')} badge={tr('automatisch')} total={sumAuto(autoFahrzeug)}>{autoRows(autoFahrzeug)}</FinCard>
          <FinTotal label={tr('Total {v}', { v: vehicleLabel() })} amount={t.california} bg="var(--forest)" fg="#FFFFFF" />
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          <FinSectionHead title={tr('Camping')} color="var(--yellow)" right={
            <button onClick={() => setFormState({ defaultKategorie: 'camping' })} style={finAddStyle}><Plus size={16} />{tr('Posten')}</button>
          } />
          {t.campingItems.length > 0 && (
            <FinCard title={tr('Eigene Posten')} total={sumOf(t.campingItems)} tint="#FBF4DC" border="#EAD48A">{itemRows(t.campingItems)}</FinCard>
          )}
          <FinCard title={tr('Erfahrungsberichte')} badge={tr('automatisch')} total={sumAuto(autoCamping)} tint="#FBF4DC" border="#EAD48A">
            {autoRows(autoCamping)}
          </FinCard>
          <FinTotal label={tr('Total Camping')} amount={t.camping} bg="#7A5A12" fg="#FFFFFF" />
        </section>

        {t.sonstigeItems.length > 0 && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
            <FinSectionHead title={tr('Sonstiges')} color="#5C7A99" />
            <FinCard title={tr('Posten')} total={t.sonstiges}>{itemRows(t.sonstigeItems)}</FinCard>
          </section>
        )}
      </div>
      {detailRow && <FinanceDetailModal category={detailRow.key} label={detailRow.label} onClose={() => setDetailRow(null)} />}
    </div>
  );
}

const finKpiStyle = { borderRadius: 16, border: '1px solid var(--border)', padding: 14, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 };
const finKpiValueStyle = { fontSize: 19, fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
const finAddStyle = {
  height: 40, padding: '0 4px', border: 'none', background: 'none', fontFamily: 'var(--font-body)', fontSize: 14,
  fontWeight: 600, color: 'var(--forest)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer'
};

// --- Einstellungen ---

async function saveSetting(key, value) {
  const res = await fetch(`/api/settings/${encodeURIComponent(key)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: value ?? '' })
  });
  if (!res.ok) throw new Error(tr('Einstellung konnte nicht gespeichert werden.'));
}

// Grundeinstellungen der Installation: Startort, Waehrungen und Fahrzeugname.
function GeneralSettings({ onConfigChanged }) {
  const [homeInput, setHomeInput] = useState(APP_CONFIG.homeOrt);
  const [homeState, setHomeState] = useState({ saving: false, error: '', found: '' });
  const [vehicleInput, setVehicleInput] = useState(APP_CONFIG.vehicleName);
  const [vehicleSaved, setVehicleSaved] = useState(false);
  const [error, setError] = useState('');
  const currentHolidayCountries = () => APP_CONFIG.holidayCountries == null
    ? ['CH', 'DE', 'AT']
    : APP_CONFIG.holidayCountries.split(',').map(c => c.trim()).filter(c => HOLIDAY_COUNTRY_CHOICES.includes(c));
  const [holidayCountries, setHolidayCountries] = useState(currentHolidayCountries);

  async function toggleHolidayCountry(code) {
    const next = holidayCountries.includes(code) ? holidayCountries.filter(c => c !== code) : [...holidayCountries, code];
    const value = next.length ? next.join(',') : 'NONE';
    setError('');
    try {
      await saveSetting('holiday_countries', value);
      APP_CONFIG.holidayCountries = value;
      setHolidayCountries(next);
      invalidateHolidayCache();
      onConfigChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveHome(e) {
    e.preventDefault();
    if (!homeInput.trim()) return;
    setHomeState({ saving: true, error: '', found: '' });
    try {
      const res = await fetch('/api/home-location', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ort: homeInput.trim() })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || tr('Ort konnte nicht gefunden werden.'));
      APP_CONFIG.homeOrt = data.home_ort;
      APP_CONFIG.homeCountry = data.home_country_code || '';
      setHomeState({ saving: false, error: '', found: data.display_name || data.home_ort });
      onConfigChanged();
    } catch (err) {
      setHomeState({ saving: false, error: err.message === 'Failed to fetch' ? tr('Server nicht erreichbar.') : err.message, found: '' });
    }
  }

  async function changeCurrency(key, value) {
    setError('');
    try {
      await saveSetting(key, value);
      if (key === 'currency') APP_CONFIG.currency = value;
      else APP_CONFIG.foreignCurrency = value;
      onConfigChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveVehicle(e) {
    e.preventDefault();
    setError('');
    try {
      await saveSetting('vehicle_name', vehicleInput.trim());
      APP_CONFIG.vehicleName = vehicleInput.trim();
      onConfigChanged();
      setVehicleSaved(true);
      setTimeout(() => setVehicleSaved(false), 2000);
    } catch (err) {
      setError(err.message);
    }
  }

  const base = APP_CONFIG.currency;
  const baseChoices = base && !CURRENCY_CHOICES.includes(base) ? [base, ...CURRENCY_CHOICES] : CURRENCY_CHOICES;
  const smallText = { fontSize: 13, color: 'var(--muted)', margin: '6px 0 0', lineHeight: 1.45 };

  async function changeLanguage(value) {
    setError('');
    try {
      await saveSetting('language', value);
      APP_CONFIG.language = value;
      storageSet('cd_lang', value);
      onConfigChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <div style={sectionLabelStyle}>{tr('Sprache / Language')}</div>
        <select value={lang()} onChange={e => changeLanguage(e.target.value)} style={{ ...inputStyle, width: '100%' }}>
          <option value="de">{tr('Deutsch')}</option>
          <option value="en">{tr('English')}</option>
        </select>
      </div>

      <div>
        <div style={sectionLabelStyle}>{tr('Startort')}</div>
        <form onSubmit={saveHome} style={{ display: 'flex', gap: 8 }}>
          <input value={homeInput} onChange={e => setHomeInput(e.target.value)} placeholder={tr('z.B. Winterthur')}
            style={{ ...inputStyle, flex: 1 }} />
          <button type="submit" disabled={homeState.saving || !homeInput.trim()} style={{ ...primaryButtonStyle, padding: '0 16px' }}>
            {homeState.saving ? <Loader2 size={17} className="spin" /> : tr('Festlegen')}
          </button>
        </form>
        {homeState.found && <p style={{ ...smallText, color: 'var(--forest)' }}>{tr('Gefunden: {found}', { found: homeState.found })}</p>}
        {homeState.error && <p style={{ ...smallText, color: '#B3402A' }}>{homeState.error}</p>}
        <p style={smallText}>{tr('Ausgangspunkt für die Fahrdistanz zu Trips. Orte werden zuerst in diesem Land gesucht.')}</p>
      </div>

      <div>
        <div style={sectionLabelStyle}>{tr('Währung')}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--muted)' }}>
            {tr('Hauptwährung')}
            <select value={base} onChange={e => changeCurrency('currency', e.target.value)} style={inputStyle}>
              {!base && <option value="">{tr('Bitte wählen')}</option>}
              {baseChoices.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--muted)' }}>
            {tr('Umrechnen aus')}
            <select value={foreignCur()} onChange={e => changeCurrency('currency_foreign', e.target.value)} style={inputStyle}>
              <option value="">{tr('Keine')}</option>
              {CURRENCY_CHOICES.filter(c => c !== cur()).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>
        <p style={smallText}>
          {tr('Alle Beträge werden in der Hauptwährung gespeichert. Mit einer zweiten Währung kannst du Beträge zum Tageskurs umrechnen lassen. Ein Wechsel der Hauptwährung rechnet bestehende Beträge nicht um.')}
        </p>
      </div>

      <div>
        <div style={sectionLabelStyle}>{tr('Fahrzeug')}</div>
        <form onSubmit={saveVehicle} style={{ display: 'flex', gap: 8 }}>
          <input value={vehicleInput} onChange={e => setVehicleInput(e.target.value)} placeholder={tr('z.B. Camper')}
            style={{ ...inputStyle, flex: 1 }} />
          <button type="submit" style={{ ...primaryButtonStyle, padding: '0 16px' }}>
            {vehicleSaved ? <CheckCircle2 size={18} /> : tr('Speichern')}
          </button>
        </form>
        <p style={smallText}>{tr('Name, unter dem das Fahrzeug in Finanzen und beim Kilometerstand erscheint.')}</p>
      </div>

      <div>
        <div style={sectionLabelStyle}>{tr('Schulferien im Kalender')}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {HOLIDAY_COUNTRY_CHOICES.map(c => (
            <TagChip key={c} small label={c} active={holidayCountries.includes(c)} onClick={() => toggleHolidayCountry(c)} />
          ))}
        </div>
        <p style={smallText}>{tr('Ferien und Feiertage dieser Länder erscheinen im Kalender und in der Saisonplanung.')}</p>
      </div>
      {error && <div style={{ color: '#B3402A', fontSize: 14 }}>{error}</div>}
    </div>
  );
}

function SettingsView({ onBack, certIssued, onCertIssuedSaved, onConfigChanged, onReplayOnboarding }) {
  const [certDate, setCertDate] = useState(certIssued || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function saveCertDate(e) {
    e.preventDefault();
    if (!certDate) return;
    setSaving(true);
    try {
      await fetch('/api/settings/tls_cert_issued', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: certDate })
      });
      onCertIssuedSaved(certDate);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)', color: 'var(--text)', paddingBottom: 60 }}>
      <div style={headerBarStyle}>
        <button onClick={onBack} style={iconButtonStyle}><ArrowLeft size={21} /></button>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 19 }}>{tr('Einstellungen')}</span>
        <div style={{ width: 44 }} />
      </div>

      <div style={{ padding: '18px 18px 0', display: 'flex', flexDirection: 'column', gap: 28 }}>
        <GeneralSettings onConfigChanged={onConfigChanged} />

        <div>
          <div style={sectionLabelStyle}>{tr('Einführung')}</div>
          <button type="button" onClick={onReplayOnboarding} style={{
            ...primaryButtonStyle, width: '100%', background: 'var(--input-bg)', color: 'var(--forest)', border: '1px solid var(--border)'
          }}>
            <Sparkles size={18} /> {tr('Einführung erneut zeigen')}
          </button>
        </div>

        <div>
          <div style={sectionLabelStyle}>{tr('Daten sichern')}</div>
          <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 0, marginBottom: 12, lineHeight: 1.5 }}>
            {tr('JSON sichert alles (Einträge, Trips, Fahrzeugdaten, Finanzen, Einstellungen) für ein Backup oder einen Umzug auf einen neuen Server. CSV exportiert nur die Erfahrungsberichte als Tabelle, zum Öffnen in Excel oder Numbers.')}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href="/api/export?format=json" download style={{ ...primaryButtonStyle, textDecoration: 'none', flex: 1 }}>
              <Download size={18} />{' '}{tr('JSON')}
            </a>
            <a href="/api/export?format=csv" download style={{
              ...primaryButtonStyle, textDecoration: 'none', flex: 1,
              background: 'var(--input-bg)', color: 'var(--forest)', border: '1px solid var(--border)'
            }}>
              <Download size={18} />{' '}{tr('CSV')}
            </a>
          </div>
        </div>

        {APP_CONFIG.features.tls && <div>
          <div style={sectionLabelStyle}>{tr('HTTPS-Zertifikat')}</div>
          <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 0, marginBottom: 12, lineHeight: 1.5 }}>
            {tr('Ein Tailscale-Zertifikat ist 90 Tage gültig und muss danach auf dem Server erneuert werden (')}<code>{tr('tailscale cert')}</code>{tr('). Trag hier ein, wann es zuletzt ausgestellt wurde, dann warnt dich die App rechtzeitig vor Ablauf.')}
          </p>
          <form onSubmit={saveCertDate} style={{ display: 'flex', gap: 8 }}>
            <input type="date" value={certDate} onChange={e => setCertDate(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
            <button type="submit" disabled={saving} style={{ ...primaryButtonStyle, padding: '0 16px' }}>
              {saving ? <Loader2 size={17} className="spin" /> : saved ? <CheckCircle2 size={18} /> : tr('Speichern')}
            </button>
          </form>
        </div>}
      </div>
    </div>
  );
}

// --- Karte ---

const swissMarkerIcon = L.divIcon({
  className: '',
  html: `<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#2F5233;border:2px solid #FFFFFF;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 26]
});

async function geocode(query, countryCode) {
  const cc = countryCode ? `&countrycodes=${encodeURIComponent(countryCode)}` : '';
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1${cc}&q=${encodeURIComponent(query)}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || data.length === 0) return null;
  return { lat: Number(data[0].lat), lon: Number(data[0].lon) };
}

function MapView({ entries, onBack, onSelectEntry, onCoordsSaved }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersLayer = useRef(null);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodedCount, setGeocodedCount] = useState(0);
  const [toGeocodeCount, setToGeocodeCount] = useState(0);

  const entriesWithOrt = useMemo(() => entries.filter(e => e.ort && e.ort.trim()), [entries]);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    mapInstance.current = L.map(mapRef.current, { zoomControl: true }).setView([46.8182, 8.2275], 8);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap Mitwirkende'
    }).addTo(mapInstance.current);
    markersLayer.current = L.layerGroup().addTo(mapInstance.current);
    return () => { mapInstance.current?.remove(); mapInstance.current = null; };
  }, []);

  // Fehlende Koordinaten im Hintergrund nachladen (Nominatim erlaubt max. 1 Anfrage/Sekunde).
  useEffect(() => {
    const missing = entriesWithOrt.filter(e => e.lat == null || e.lon == null);
    if (missing.length === 0) return;
    let cancelled = false;
    setGeocoding(true);
    setToGeocodeCount(missing.length);
    setGeocodedCount(0);

    (async () => {
      for (const entry of missing) {
        if (cancelled) break;
        const result = (APP_CONFIG.homeCountry && await geocode(entry.ort, APP_CONFIG.homeCountry)) || await geocode(entry.ort);
        if (result && !cancelled) {
          await fetch(`/api/entries/${entry.id}/coords`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result)
          });
          onCoordsSaved(entry.id, result.lat, result.lon);
        }
        setGeocodedCount(c => c + 1);
        await new Promise(r => setTimeout(r, 1100));
      }
      if (!cancelled) setGeocoding(false);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entriesWithOrt.filter(e => e.lat == null).length]);

  useEffect(() => {
    if (!mapInstance.current || !markersLayer.current) return;
    markersLayer.current.clearLayers();
    const located = entriesWithOrt.filter(e => e.lat != null && e.lon != null);
    for (const entry of located) {
      const marker = L.marker([entry.lat, entry.lon], { icon: swissMarkerIcon });
      marker.bindTooltip(entry.campingplatz, { direction: 'top', offset: [0, -20] });
      marker.on('click', () => onSelectEntry(entry));
      marker.addTo(markersLayer.current);
    }
    if (located.length > 0) {
      const bounds = L.latLngBounds(located.map(e => [e.lat, e.lon]));
      mapInstance.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
    }
  }, [entriesWithOrt, onSelectEntry]);

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column' }}>
      <div style={headerBarStyle}>
        <button onClick={onBack} style={iconButtonStyle}><ArrowLeft size={21} /></button>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 19 }}>{tr('Karte')}</span>
        <div style={{ width: 44 }} />
      </div>

      {geocoding && (
        <div style={{
          padding: '8px 18px', fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6
        }}>
          <Loader2 size={13} className="spin" />{' '}{tr('Orte werden geladen (')}{geocodedCount}/{toGeocodeCount})...
        </div>
      )}

      {entriesWithOrt.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
          <Compass size={34} style={{ marginBottom: 10, opacity: 0.5 }} />
          <p style={{ fontSize: 15 }}>{tr('Noch keine Einträge mit Ort vorhanden.')}</p>
        </div>
      ) : (
        <div ref={mapRef} style={{ flex: 1, minHeight: 400 }} />
      )}
    </div>
  );
}

// --- Konsolidierte Schnellzugriffs-Listen (Einkauf/To-dos ueber alle Trips) ---

// Eine abhakbare Zeile; erledigte Punkte werden durchgestrichen und ausgegraut.
function ChecklistRow({ item, onToggle, onRemove }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4, background: item.checked ? 'transparent' : 'var(--card-alt)',
      border: '1px solid var(--border)', borderRadius: 10, padding: '2px 4px 2px 2px'
    }}>
      <button onClick={onToggle} aria-label={item.checked ? tr('Als offen markieren') : tr('Als erledigt markieren')} style={iconButtonStyle}>
        {item.checked ? <CheckCircle2 size={21} color="var(--forest)" /> : <Circle size={21} color="var(--muted)" />}
      </button>
      <span onClick={onToggle} style={{
        flex: 1, fontSize: 15, cursor: 'pointer', textDecoration: item.checked ? 'line-through' : 'none',
        color: item.checked ? '#8A9687' : 'var(--text)', padding: '10px 0'
      }}>{item.text}</span>
      {onRemove && (
        <button onClick={onRemove} aria-label={tr('Löschen')} style={{ ...iconButtonStyle, color: 'var(--muted)' }}>
          <Trash2 size={15} />
        </button>
      )}
    </div>
  );
}

function QuickListView({ type, title, icon: Icon, onBack, onGoTrips }) {
  const [items, setItems] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(''); }
    try {
      const res = await fetch(`/api/trip-items/${type}`);
      if (!res.ok) throw new Error(tr('Konnte nicht geladen werden.'));
      setItems(await res.json());
    } catch (e) {
      if (!silent) setError(e.message === 'Failed to fetch' ? tr('Server nicht erreichbar.') : e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [type]);

  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load);

  async function toggle(item) {
    await fetch(`/api/trip-items/${item.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checked: !item.checked })
    });
    load();
  }

  async function clearGroup(group) {
    if (!(await confirmDialog(tr('Alle Punkte fuer "{titel}" wirklich loeschen?', { titel: group.titel })))) return;
    await Promise.all(group.entries.map(item => fetch(`/api/trip-items/${item.id}`, { method: 'DELETE' })));
    load();
  }

  const grouped = useMemo(() => {
    const map = new Map();
    for (const it of items) {
      if (!map.has(it.trip_id)) map.set(it.trip_id, { titel: it.trip_titel, entries: [] });
      map.get(it.trip_id).entries.push(it);
    }
    return Array.from(map.values()).map(g => ({
      ...g,
      entries: [...g.entries].sort((a, b) => (a.checked === b.checked) ? 0 : (a.checked ? 1 : -1)),
      allDone: g.entries.every(e => e.checked)
    }));
  }, [items]);

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)', color: 'var(--text)', paddingBottom: 60 }}>
      <div style={headerBarStyle}>
        <button onClick={onBack} style={iconButtonStyle}><ArrowLeft size={21} /></button>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 19 }}>{title}</span>
        <div style={{ width: 44 }} />
      </div>

      <div style={{ padding: '14px 18px 0' }}>
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40, color: 'var(--muted)' }}>
            <Loader2 size={22} className="spin" />
          </div>
        )}
        {error && <div style={{ color: '#B3402A', fontSize: 14 }}>{error}</div>}

        {!loading && !error && grouped.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
            <Icon size={34} style={{ marginBottom: 10, opacity: 0.5 }} />
            <p style={{ fontSize: 15, lineHeight: 1.5, margin: '0 0 16px' }}>
              {type === 'einkauf'
                ? tr('Keine offenen Einkäufe. Einträge entstehen in der Einkaufsliste eines Trips und erscheinen dann hier gesammelt.')
                : tr('Keine offenen To-dos. Einträge entstehen in den To-dos eines Trips und erscheinen dann hier gesammelt.')}
            </p>
            {onGoTrips && (
              <button onClick={onGoTrips} style={{ ...primaryButtonStyle, display: 'inline-flex', padding: '12px 18px', fontSize: 15 }}>
                {tr('Zu den Trips')}
              </button>
            )}
          </div>
        )}

        {grouped.map(group => (
          <div key={group.titel} style={{ marginBottom: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={sectionLabelStyle}>{group.titel}</div>
              {group.allDone && (
                <button onClick={() => clearGroup(group)} style={{
                  background: 'none', border: 'none', color: '#B3402A', fontSize: 12, cursor: 'pointer', padding: 0
                }}>
                  {tr('Liste löschen')}
                </button>
              )}
            </div>
            {(() => {
              const open = group.entries.filter(i => !i.checked);
              const done = group.entries.filter(i => i.checked);
              const key = group.titel;
              const show = expanded[key];
              const visible = show ? group.entries : open;
              return (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {visible.map(item => (
                      <ChecklistRow key={item.id} item={item} onToggle={() => toggle(item)} />
                    ))}
                  </div>
                  {done.length > 0 && (
                    <button onClick={() => setExpanded(e => ({ ...e, [key]: !e[key] }))} style={{ ...doneToggleStyle, marginTop: 4 }}>
                      <ChevronDown size={16} style={{ transform: show ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                      {show ? tr('Erledigte ausblenden') : open.length === 0 ? tr('Alles erledigt · {length} anzeigen', { length: done.length }) : tr('{length} erledigte anzeigen', { length: done.length })}
                    </button>
                  )}
                </>
              );
            })()}
          </div>
        ))}
      </div>
    </div>
  );
}

// Wettervorhersage fuer die Trip-Planung, basierend auf Ort und Datum.
function TripWeather({ ort, datumVon, datumBis, onDays }) {
  const [state, setState] = useState({ loading: false, error: null, days: null, tooFar: false });

  useEffect(() => {
    if (!ort || !datumVon) { setState({ loading: false, error: null, days: null, tooFar: false }); return; }
    let cancelled = false;
    setState(s => ({ loading: true, error: null, days: null, tooFar: false }));

    (async () => {
      const today = todayISO();
      const tripEnd = datumBis && datumBis > datumVon ? datumBis : datumVon;

      if (tripEnd < today) {
        // Ganzer Trip liegt in der Vergangenheit: nur historisches Wetter, keine Vorhersage noetig.
      } else {
        const daysUntilStart = Math.round((new Date(datumVon + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
        if (daysUntilStart > 15) {
          if (!cancelled) setState({ loading: false, error: null, days: null, tooFar: true });
          return;
        }
      }

      try {
        const coords = (APP_CONFIG.homeCountry && await geocode(ort, APP_CONFIG.homeCountry)) || await geocode(ort);
        if (!coords) {
          if (!cancelled) setState({ loading: false, error: tr('Ort konnte nicht gefunden werden.'), days: null, tooFar: false });
          return;
        }

        let days = [];

        // Vergangene Tage des Trips: tatsaechliches Wetter statt Vorhersage.
        if (datumVon < today) {
          const histEnd = tripEnd < today ? tripEnd : addDaysISO(today, -1);
          const histUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${coords.lat}&longitude=${coords.lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto&start_date=${datumVon}&end_date=${histEnd}`;
          const histRes = await fetch(histUrl);
          if (histRes.ok) {
            const histData = await histRes.json();
            const histDays = (histData.daily?.time || []).map((date, i) => ({
              date, code: histData.daily.weathercode[i],
              max: histData.daily.temperature_2m_max[i], min: histData.daily.temperature_2m_min[i],
              precipMm: histData.daily.precipitation_sum ? histData.daily.precipitation_sum[i] : null,
              historical: true
            }));
            days = days.concat(histDays);
          }
        }

        // Heute und Zukunft: normale Vorhersage, gedeckelt auf 15 Tage.
        if (tripEnd >= today) {
          let end = tripEnd;
          const maxEnd = addDaysISO(today, 15);
          if (end > maxEnd) end = maxEnd;
          const start = datumVon < today ? today : datumVon;

          const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,windspeed_10m_max&timezone=auto&start_date=${start}&end_date=${end}`;
          const res = await fetch(url);
          if (res.ok) {
            const data = await res.json();
            const forecastDays = (data.daily?.time || []).map((date, i) => ({
              date, code: data.daily.weathercode[i],
              max: data.daily.temperature_2m_max[i], min: data.daily.temperature_2m_min[i],
              rain: data.daily.precipitation_probability_max ? data.daily.precipitation_probability_max[i] : null,
              wind: data.daily.windspeed_10m_max ? data.daily.windspeed_10m_max[i] : null,
              historical: false
            }));
            days = days.concat(forecastDays);
          }
        }

        if (days.length === 0) throw new Error('failed');
        if (!cancelled) { setState({ loading: false, error: null, days, tooFar: false }); onDays?.(days); }
      } catch {
        if (!cancelled) setState({ loading: false, error: tr('Wetterdaten konnten nicht geladen werden.'), days: null, tooFar: false });
      }
    })();

    return () => { cancelled = true; };
  }, [ort, datumVon, datumBis]);

  if (!ort || !datumVon) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <div style={sectionLabelStyle}>{tr('Wetter')}</div>
      {state.loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)', fontSize: 13 }}>
          <Loader2 size={14} className="spin" />{' '}{tr('Wetterdaten werden geladen...')}
        </div>
      )}
      {state.tooFar && (
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          {tr('Vorhersage ist erst ab 15 Tagen vor Reisebeginn verfügbar.')}
        </div>
      )}
      {state.error && <div style={{ fontSize: 13, color: '#B3402A' }}>{state.error}</div>}
      {state.days && state.days.length > 0 && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          {state.days.map(d => (
            <div key={d.date} style={{
              minWidth: 76, background: 'var(--card-alt)', border: '1px solid var(--border)', borderRadius: 10,
              padding: '10px 8px', textAlign: 'center', flexShrink: 0
            }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{formatDate(d.date).slice(0, 5)}</div>
              {d.historical && (
                <div style={{ fontSize: 9, color: 'var(--forest)', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2 }}>
                  {tr('tatsächlich')}
                </div>
              )}
              {d.code != null && d.code <= 1
                ? <Sun size={17} color="var(--yellow-dark)" style={{ margin: '5px 0' }} />
                : <Cloud size={17} color="var(--forest)" style={{ margin: '5px 0' }} />}
              <div style={{ fontSize: 13, fontWeight: 600 }}>{Math.round(d.max)}°</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{Math.round(d.min)}°</div>
              {!d.historical && d.rain != null && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, marginTop: 5,
                  fontSize: 12, fontWeight: d.rain >= 50 ? 700 : 400, color: d.rain >= 50 ? '#2E6C93' : 'var(--muted)'
                }}>
                  <Droplet size={13} color={d.rain >= 25 ? '#3B7BA8' : 'var(--muted)'}
                    fill={d.rain >= 25 ? '#3B7BA8' : 'none'} fillOpacity={Math.max(0.25, d.rain / 100)} />
                  {d.rain}%
                </div>
              )}
              {d.historical && d.precipMm != null && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, marginTop: 5,
                  fontSize: 12, color: d.precipMm > 0 ? '#2E6C93' : 'var(--muted)'
                }}>
                  <Droplet size={13} color={d.precipMm > 0 ? '#3B7BA8' : 'var(--muted)'}
                    fill={d.precipMm > 0 ? '#3B7BA8' : 'none'} fillOpacity={0.6} />
                  {d.precipMm.toFixed(1)}{tr('mm')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {state.days && deriveWeatherHints(state.days).length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
          {deriveWeatherHints(state.days).map((h, i) => {
            const Icon = h.icon;
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--forest)',
                background: 'var(--card-alt)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px'
              }}>
                <Icon size={15} /> {h.text}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Leitet aus den Tages-Wetterdaten kurze Packlisten-Hinweise ab (nur Anzeige, veraendert
// die Packliste nicht automatisch). Deckt nur zukuenftige Tage ab (historische Tage haben
// keine Regenwahrscheinlichkeit/Wind, nur tatsaechliche Werte, sind fuers Packen irrelevant).
function deriveWeatherHints(days) {
  const future = (days || []).filter(d => !d.historical);
  if (future.length === 0) return [];
  const hints = [];
  if (future.some(d => d.max != null && d.max >= 28)) {
    hints.push({ icon: Sun, text: tr('Sehr warm erwartet - Sonnencreme nicht vergessen') });
  }
  return hints;
}

// Zeigt Restaurants und Badis/Freibaeder rund um den Trip-Zielort in einem eigenen Fenster,
// damit die Trip-Detailansicht selbst nicht ueberladen wird.
function PoiModal({ ort, onClose }) {
  const [state, setState] = useState({ loading: true, error: null, pois: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/poi?ort=${encodeURIComponent(ort)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || tr('Points of Interest konnten nicht geladen werden.'));
        if (!cancelled) setState({ loading: false, error: null, pois: data.pois || [] });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: e.message, pois: null });
      }
    })();
    return () => { cancelled = true; };
  }, [ort]);

  const restaurants = (state.pois || []).filter(p => p.typ === 'restaurant');
  const badis = (state.pois || []).filter(p => p.typ === 'badi');

  function renderList(items, icon) {
    const Icon = icon;
    if (items.length === 0) return <div style={{ fontSize: 13, color: 'var(--muted)' }}>{tr('Nichts in der Nähe gefunden.')}</div>;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((p, i) => (
          <a key={i} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name} ${p.lat},${p.lon}`)}`}
            target="_blank" rel="noopener noreferrer" style={{
              display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'var(--text)',
              background: 'var(--card-alt)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px'
            }}>
            <Icon size={15} color="var(--forest)" style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 14 }}>{p.name}</span>
            <span style={{ fontSize: 12, color: 'var(--muted)', flexShrink: 0 }}>{tr('{distanzKm} km', { distanzKm: p.distanzKm })}</span>
          </a>
        ))}
      </div>
    );
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(30,43,31,0.45)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 24
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#FFFFFF', borderRadius: 16, padding: 20, maxWidth: 380, width: '100%',
        maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 50px rgba(0,0,0,0.3)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>{tr('In der Nähe')}</span>
          <button onClick={onClose} style={{ ...iconButtonStyle, width: 30, height: 30 }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {state.loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 30, color: 'var(--muted)' }}>
              <Loader2 size={20} className="spin" />
            </div>
          )}
          {state.error && <div style={{ fontSize: 13, color: '#B3402A' }}>{state.error}</div>}
          {state.pois && (
            <>
              <div>
                <div style={sectionLabelStyle}>{tr('Restaurants')}</div>
                {renderList(restaurants, UtensilsCrossed)}
              </div>
              <div>
                <div style={sectionLabelStyle}>{tr('Badis')}</div>
                {renderList(badis, Droplet)}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TripDistance({ trip, trips }) {
  const [state, setState] = useState({ loading: false, error: null, ownKm: null, cumulativeKm: null });
  const [budget, setBudget] = useState(null);

  useEffect(() => {
    fetch('/api/odometer')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setBudget({ kmThisYear: d.kmThisYear, budget: d.budget }); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!trip?.ort || !APP_CONFIG.homeOrt) { setState({ loading: false, error: null, ownKm: null, cumulativeKm: null }); return; }
    let cancelled = false;
    setState(s => ({ ...s, loading: true, error: null }));

    async function roundTripKmFor(ort) {
      try {
        const res = await fetch(`/api/route-km?ort=${encodeURIComponent(ort)}`);
        if (!res.ok) return null;
        const data = await res.json();
        return data.km ?? null;
      } catch {
        return null;
      }
    }

    (async () => {
      try {
        const ownKm = await roundTripKmFor(trip.ort);
        if (ownKm == null) {
          if (!cancelled) setState({ loading: false, error: tr('Distanz konnte nicht berechnet werden.'), ownKm: null, cumulativeKm: null });
          return;
        }
        // Andere noch nicht gestartete Trips, die chronologisch vor oder am selben Tag wie
        // dieser Trip liegen, zehren das km-Budget bereits vorher an - deshalb kumulieren wir.
        const today = todayISO();
        const earlierUpcoming = (trips || []).filter(t =>
          t.id !== trip.id && t.ort && t.datum_von && t.datum_von >= today && t.datum_von <= trip.datum_von
        );
        const earlierKms = await Promise.all(earlierUpcoming.map(t => roundTripKmFor(t.ort)));
        const earlierSum = earlierKms.reduce((sum, km) => sum + (km || 0), 0);
        if (!cancelled) setState({ loading: false, error: null, ownKm, cumulativeKm: ownKm + earlierSum });
      } catch {
        if (!cancelled) setState({ loading: false, error: tr('Distanz konnte nicht berechnet werden.'), ownKm: null, cumulativeKm: null });
      }
    })();

    return () => { cancelled = true; };
  }, [trip?.id, trip?.ort, trip?.datum_von, trips]);

  if (!trip?.ort || !APP_CONFIG.homeOrt) return null;

  const percent = (state.cumulativeKm != null && budget?.budget)
    ? Math.round(((budget.kmThisYear + state.cumulativeKm) / budget.budget) * 1000) / 10
    : null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>
      <Gauge size={13} />
      {state.loading && tr('Distanz wird berechnet...')}
      {state.ownKm != null && (
        <span>
          ~{state.ownKm.toLocaleString(numLocale())}{' '}{tr('km Hin- und Rückfahrt')}
          {percent != null && tr(' · → {percent}% des km-Budgets', { percent: percent })}
        </span>
      )}
      {state.error && state.error}
    </div>
  );
}

// Schwellen fuer die Wetterwarnung im Trip: kalte Nacht, spuerbarer Regen, starker Wind.
const WARN_MIN_TEMP = 10;
const WARN_RAIN_PCT = 50;
const WARN_WIND_KMH = 40;

function QuickLessonModal({ onClose, onSave }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  async function submit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    try {
      await onSave(text.trim());
      showToast(tr('Lesson gespeichert'));
      onClose();
    } finally {
      setSaving(false);
    }
  }
  return (
    <ModalShell title={tr('Lesson notieren')} onClose={onClose} onSubmit={submit}>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={3} autoFocus
        placeholder={tr('Was macht ihr beim nächsten Mal anders?')} style={{ ...inputStyle, resize: 'vertical' }} />
      <button type="submit" disabled={saving || !text.trim()} style={{ ...primaryButtonStyle, opacity: text.trim() ? 1 : 0.6 }}>
        {saving ? <Loader2 size={17} className="spin" /> : tr('Speichern')}
      </button>
    </ModalShell>
  );
}

const tripLinkChipStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 12px', borderRadius: 999,
  border: '1px solid var(--border)', background: '#FFFFFF', color: 'var(--forest)', fontSize: 13, fontWeight: 600,
  textDecoration: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)'
};

function TripDetail({ tripId, trips, entries, lessons, onRefresh, onBack, onEdit, onDeleted, onCreateEntry, onViewEntry, onAddLesson }) {
  const trip = trips.find(t => t.id === tripId);
  const today = todayISO();
  const phase = trip ? tripPhase(trip, today) : null;
  const active = phase?.phase === 'unterwegs';
  const [subtab, setSubtab] = useState(active ? 'einkauf' : 'packliste');
  const [deleting, setDeleting] = useState(false);
  const [poiOpen, setPoiOpen] = useState(false);
  const [lessonOpen, setLessonOpen] = useState(false);
  const [weatherDays, setWeatherDays] = useState(null);
  const [statusSaving, setStatusSaving] = useState(false);
  if (!trip) return null;
  const existingEntry = entries?.find(e => e.trip_id === trip.id);

  async function changeStatus(next) {
    if (next === (trip.status || 'bestaetigt') || statusSaving) return;
    setStatusSaving(true);
    try {
      const res = await fetch(`/api/trips/${trip.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next })
      });
      if (!res.ok) throw new Error(tr('Konnte nicht gespeichert werden.'));
      await onRefresh(true);
    } catch (e) {
      showToast(e.message === 'Failed to fetch' ? tr('Server nicht erreichbar.') : e.message, 'error');
    } finally {
      setStatusSaving(false);
    }
  }
  const items = trip.items || [];
  const meals = trip.meals || [];
  const countOpen = (type) => items.filter(i => i.type === type && !i.checked).length;
  const pack = items.filter(i => i.type === 'packliste');
  const todaysMeals = meals.filter(m => m.datum === today);

  // Wetterwarnungen fuer heute (unterwegs) bzw. die Tage des geplanten Trips: kalte Nacht,
  // spuerbarer Regen und starker Wind. Jeweils der kritischste Tag wird genannt.
  const weatherWarnings = [];
  if (weatherDays && phase.phase !== 'vorbei') {
    const relevant = weatherDays.filter(d => !d.historical && (active ? d.date === today : true));
    const dayLabel = (d) => d.date === today ? tr('heute') : tr('am {datum}', { datum: formatDate(d.date).slice(0, 6) });
    const pick = (key, better) => relevant.filter(d => d[key] != null).reduce((acc, d) => (acc == null || better(d[key], acc[key]) ? d : acc), null);
    const coldest = pick('min', (x, y) => x < y);
    if (coldest && coldest.min <= WARN_MIN_TEMP) {
      weatherWarnings.push(coldest.date === today ? tr('Heute Nacht nur {temp}°', { temp: Math.round(coldest.min) }) : tr('Kalte Nacht: {temp}° {tag}', { temp: Math.round(coldest.min), tag: dayLabel(coldest) }));
    }
    const wettest = pick('rain', (x, y) => x > y);
    if (wettest && wettest.rain >= WARN_RAIN_PCT) {
      weatherWarnings.push(tr('Regen {tag}: {rain}% Wahrscheinlichkeit', { tag: dayLabel(wettest), rain: wettest.rain }));
    }
    const windiest = pick('wind', (x, y) => x > y);
    if (windiest && windiest.wind >= WARN_WIND_KMH) {
      weatherWarnings.push(tr('Starker Wind {tag}: bis {wind} km/h', { tag: dayLabel(windiest), wind: Math.round(windiest.wind) }));
    }
  }

  async function remove() {
    if (!(await confirmDialog(tr('Diesen Trip wirklich löschen?')))) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/trips/${trip.id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) throw new Error(tr('Löschen fehlgeschlagen.'));
      onDeleted(trip.id);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setDeleting(false);
    }
  }

  const subtabs = [
    { key: 'einkauf', label: countOpen('einkauf') ? tr('Einkauf {v}', { v: countOpen('einkauf') }) : tr('Einkauf') },
    { key: 'packliste', label: pack.length ? tr('Packliste {length}/{length2}', { length: pack.filter(i => i.checked).length, length2: pack.length }) : tr('Packliste') },
    { key: 'todo', label: countOpen('todo') ? tr('To-dos {v}', { v: countOpen('todo') }) : tr('To-dos') },
    { key: 'meals', label: meals.length ? tr('Essen {length}', { length: meals.length }) : tr('Essen') }
  ];
  const showActionBar = active || (phase.phase === 'vorbei' && !existingEntry);
  const meta = [trip.ort, trip.datum_von ? `${formatDate(trip.datum_von)}${trip.datum_bis && trip.datum_bis !== trip.datum_von ? `–${formatDate(trip.datum_bis)}` : ''}` : null, nightsLabel(trip.datum_von, trip.datum_bis)].filter(Boolean).join(' · ');

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ ...headerBarStyle, borderBottom: 'none', paddingLeft: 8 }}>
        <button onClick={onBack} aria-label={tr('Zurück')} style={iconButtonStyle}><ArrowLeft size={22} /></button>
        <button onClick={() => onEdit(trip)} aria-label={tr('Trip bearbeiten')} title={tr('Bearbeiten')} style={headerPrimaryStyle}>
          <Pencil size={19} />
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, padding: '0 18px 28px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{
            alignSelf: 'flex-start', fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 999,
            background: active ? 'var(--forest)' : phase.phase === 'vorbei' ? '#EEF2EB' : '#E3EEDF',
            color: active ? '#FFFFFF' : phase.phase === 'vorbei' ? 'var(--muted)' : 'var(--forest)'
          }}>{phase.label}</span>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 26 }}>{trip.titel}</h1>
          {meta && (
            <span style={{ fontSize: 14, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              {trip.ort && <CountryFlag ort={trip.ort} />}{meta}
            </span>
          )}
          <TripDistance trip={trip} trips={trips} />
          {phase.phase !== 'vorbei' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              <TripStatusChips value={trip.status} onChange={changeStatus} />
              {!isConfirmed(trip) && trip.buchungsfenster_datum && (
                <span style={{ fontSize: 13, color: 'var(--forest)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Calendar size={13} />
                  {tr('Buchungsfenster öffnet {buchungsfenster_datum}', { buchungsfenster_datum: formatDate(trip.buchungsfenster_datum) })}
                </span>
              )}
            </div>
          )}
          {trip.ort && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(trip.ort)}`}
                target="_blank" rel="noopener noreferrer" style={tripLinkChipStyle}>
                <MapPin size={14} />{' '}{tr('Route')}
              </a>
              <button onClick={() => setPoiOpen(true)} style={tripLinkChipStyle}>
                <UtensilsCrossed size={14} />{' '}{tr('Restaurants und Badis')}
              </button>
            </div>
          )}
          {poiOpen && <PoiModal ort={trip.ort} onClose={() => setPoiOpen(false)} />}
          {trip.notizen && <p style={{ fontSize: 15, color: 'var(--muted)', margin: '6px 0 0', whiteSpace: 'pre-line', lineHeight: 1.5 }}>{trip.notizen}</p>}
        </div>

        <TripWeather ort={trip.ort} datumVon={trip.datum_von} datumBis={trip.datum_bis} onDays={setWeatherDays} />

        {weatherWarnings.length > 0 && (
          <div role="alert" style={{
            display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', borderRadius: 14,
            background: '#FBE9E4', border: '1px solid #E3AE9E', color: '#6E2A16'
          }}>
            <TriangleAlert size={20} color="#93341C" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {weatherWarnings.map(w => <span key={w} style={{ fontSize: 14, fontWeight: 600 }}>{w}</span>)}
            </div>
          </div>
        )}

        {active && todaysMeals.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h2 style={homeH2Style}>{tr('Essen heute')}</h2>
            <div style={{ border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
              {todaysMeals.map((m, i) => (
                <div key={m.id} style={{ padding: '12px 14px', fontSize: 15, borderBottom: i === todaysMeals.length - 1 ? 'none' : '1px solid #EEF2EB' }}>{m.text}</div>
              ))}
            </div>
          </div>
        )}

        {existingEntry && (
          <button onClick={() => onViewEntry(existingEntry)} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 14, background: 'var(--card-alt)',
            border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'var(--font-body)', color: 'var(--text)', textAlign: 'left'
          }}>
            <ClipboardList size={18} color="var(--forest)" />
            <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>{tr('Erfahrungsbericht anzeigen')}</span>
            <RatingBadge bewertung={existingEntry.bewertung} />
            <ChevronRight size={18} color="var(--muted)" />
          </button>
        )}

        <div role="tablist" style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '0 -18px', padding: '2px 18px' }}>
          {subtabs.map(t => {
            const on = subtab === t.key;
            return (
              <button key={t.key} role="tab" aria-selected={on} onClick={() => setSubtab(t.key)} style={{
                height: 38, padding: '0 14px', borderRadius: 999, flexShrink: 0, cursor: 'pointer', fontFamily: 'var(--font-body)',
                border: `1px solid ${on ? 'var(--forest)' : 'var(--border)'}`, background: on ? 'var(--forest)' : '#FFFFFF',
                color: on ? '#FFFFFF' : 'var(--text)', fontSize: 14, fontWeight: on ? 600 : 400, whiteSpace: 'nowrap'
              }}>{t.label}</button>
            );
          })}
        </div>

        <div>
          {subtab === 'meals' && <MealsSection trip={trip} onRefresh={onRefresh} />}
          {subtab !== 'meals' && <ChecklistSection key={subtab} trip={trip} type={subtab} onRefresh={onRefresh} />}
        </div>

        <button onClick={remove} disabled={deleting} style={{
          alignSelf: 'center', display: 'flex', alignItems: 'center', gap: 6, height: 44, padding: '0 8px', marginTop: 8,
          background: 'none', border: 'none', color: '#B3402A', fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)'
        }}>
          {deleting ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}{' '}{tr('Trip löschen')}
        </button>
      </div>

      {showActionBar && (
        <div style={{
          position: 'sticky', bottom: 0, background: '#FFFFFF', borderTop: '1px solid var(--border)',
          padding: '10px 18px 12px', display: 'flex', gap: 8, zIndex: 4
        }}>
          {active && (
            <button onClick={() => setLessonOpen(true)} style={{
              height: 48, padding: '0 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card-alt)',
              fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500, color: 'var(--text)', display: 'flex',
              alignItems: 'center', gap: 6, cursor: 'pointer', flexShrink: 0
            }}>
              <Lightbulb size={18} color="var(--forest)" />{' '}{tr('Lesson')}
            </button>
          )}
          <button onClick={() => onCreateEntry(trip)} style={{ ...primaryButtonStyle, flex: 1, height: 48, padding: '0 12px', fontSize: 15 }}>
            {active ? tr('Trip abschliessen und bewerten') : tr('Trip bewerten und Bericht schreiben')}
          </button>
        </div>
      )}

      {lessonOpen && <QuickLessonModal onClose={() => setLessonOpen(false)} onSave={onAddLesson} />}
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: 32, textAlign: 'center', background: 'var(--bg)', color: 'var(--text)'
        }}>
          <AlertTriangle size={32} color="#B3402A" style={{ marginBottom: 14 }} />
          <p style={{ fontSize: 15, marginBottom: 18 }}>{tr('Hier ist etwas schiefgelaufen.')}</p>
          <button onClick={() => { this.setState({ error: null }); this.props.onReset?.(); }} style={primaryButtonStyle}>
            {tr('Zurück zur Startseite')}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Einfuehrung beim ersten Start (v4.7) ---
// Ablauf: Einrichtung (nur solange Startort oder Waehrung fehlen) -> Willkommenskarten -> kurze
// Tour auf der Uebersicht. Karten und Tour erscheinen einmal pro Geraet (localStorage), die
// Einrichtung einmal pro Installation (Werte stehen in den Einstellungen auf dem Server).

const ONBOARDING_SEEN_KEY = 'cd_onboarding_v1_done';
const SETUP_DEFERRED_KEY = 'cd_setup_deferred';
function storageGet(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function storageSet(key, value) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch { /* Speicher gesperrt (z.B. privater Modus): Einfuehrung erscheint dann erneut */ }
}

// Naheliegende Hauptwaehrung zum Land des Startorts, als Vorschlag in der Einrichtung.
const COUNTRY_CURRENCY = {
  ch: 'CHF', li: 'CHF', gb: 'GBP', us: 'USD', se: 'SEK', no: 'NOK', dk: 'DKK', pl: 'PLN',
  cz: 'CZK', hu: 'HUF', ca: 'CAD', au: 'AUD', nz: 'NZD'
};

const onboardingOverlayStyle = {
  position: 'fixed', inset: 0, zIndex: 900, background: 'var(--bg)', display: 'flex', justifyContent: 'center',
  animation: 'fadeIn 0.2s ease-out'
};
const onboardingInnerStyle = {
  width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column',
  padding: 'calc(24px + env(safe-area-inset-top, 0px)) 24px calc(24px + env(safe-area-inset-bottom, 0px))',
  boxSizing: 'border-box', overflowY: 'auto'
};
const onboardingTitleStyle = { fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 600, margin: '0 0 10px', lineHeight: 1.2 };
const onboardingTextStyle = { fontSize: 15, color: 'var(--muted)', lineHeight: 1.55, margin: 0 };
const onboardingSecondaryStyle = {
  ...primaryButtonStyle, background: 'none', color: 'var(--muted)', border: 'none', boxShadow: 'none', flex: '0 0 auto', padding: '0 12px', height: 44
};

function ProgressDots({ count, index }) {
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} style={{
          width: i === index ? 20 : 7, height: 7, borderRadius: 4, transition: 'width 0.2s',
          background: i === index ? 'var(--forest)' : 'var(--border)'
        }} />
      ))}
    </div>
  );
}

function SetupWizard({ onDone, onDefer, onConfigChanged }) {
  const [step, setStep] = useState(0);
  const [, rerender] = useState(0);
  const [homeInput, setHomeInput] = useState(APP_CONFIG.homeOrt);
  const [home, setHome] = useState({ saving: false, error: '', found: APP_CONFIG.homeOrt });
  const [base, setBase] = useState(APP_CONFIG.currency || '');
  const [foreign, setForeign] = useState(APP_CONFIG.foreignCurrency || '');
  const [vehicle, setVehicle] = useState(APP_CONFIG.vehicleName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const steps = 4;

  async function chooseLanguage(l) {
    setError('');
    try {
      await saveSetting('language', l);
      APP_CONFIG.language = l;
      storageSet('cd_lang', l);
      onConfigChanged();
      rerender(n => n + 1);
      setStep(1);
    } catch (e) {
      setError(tr('setup.saveError'));
    }
  }

  async function searchHome(e) {
    e.preventDefault();
    if (!homeInput.trim()) return;
    setHome({ saving: true, error: '', found: '' });
    try {
      const res = await fetch('/api/home-location', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ort: homeInput.trim() })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(res.status === 404 ? tr('setup.homeNotFound') : tr('setup.homeError'));
      APP_CONFIG.homeOrt = data.home_ort;
      APP_CONFIG.homeCountry = data.home_country_code || '';
      if (!base) {
        const guess = COUNTRY_CURRENCY[APP_CONFIG.homeCountry] || 'EUR';
        setBase(guess);
        if (!foreign && guess !== 'EUR') setForeign('EUR');
      }
      setHome({ saving: false, error: '', found: data.display_name || data.home_ort });
      onConfigChanged();
    } catch (err) {
      setHome({ saving: false, error: err.message === 'Failed to fetch' ? tr('setup.offline') : err.message, found: '' });
    }
  }

  async function saveCurrency() {
    const b = base || 'EUR';
    setSaving(true); setError('');
    try {
      await saveSetting('currency', b);
      await saveSetting('currency_foreign', foreign && foreign !== b ? foreign : '');
      APP_CONFIG.currency = b;
      APP_CONFIG.foreignCurrency = foreign && foreign !== b ? foreign : '';
      onConfigChanged();
      setStep(3);
    } catch {
      setError(tr('setup.saveError'));
    } finally {
      setSaving(false);
    }
  }

  async function finish() {
    setSaving(true); setError('');
    try {
      await saveSetting('vehicle_name', vehicle.trim());
      APP_CONFIG.vehicleName = vehicle.trim();
      onConfigChanged();
      onDone();
    } catch {
      setError(tr('setup.saveError'));
      setSaving(false);
    }
  }

  const currentLang = lang();
  const choiceStyle = (active) => ({
    ...primaryButtonStyle, justifyContent: 'flex-start', padding: '0 18px', height: 56, fontSize: 16,
    background: active ? 'var(--forest)' : 'var(--input-bg)', color: active ? '#FFFFFF' : 'var(--text)',
    border: '1px solid var(--border)'
  });
  const labelStyle = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'var(--muted)', flex: 1 };

  return (
    <div style={onboardingOverlayStyle} role="dialog" aria-modal="true" aria-label={tr('setup.welcome')}>
      <div style={onboardingInnerStyle}>
        <ProgressDots count={steps} index={step} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18, padding: '24px 0' }}>
          {step === 0 && (
            <>
              <div>
                <Tent size={34} color="var(--forest)" />
                <h1 style={{ ...onboardingTitleStyle, marginTop: 12 }}>{tr('setup.welcome')}</h1>
                <p style={onboardingTextStyle}>{tr('setup.languageQuestion')}</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button type="button" onClick={() => chooseLanguage('de')} style={choiceStyle(currentLang === 'de')}>{tr('Deutsch')}</button>
                <button type="button" onClick={() => chooseLanguage('en')} style={choiceStyle(currentLang === 'en')}>{tr('English')}</button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div>
                <MapPin size={30} color="var(--forest)" />
                <h1 style={{ ...onboardingTitleStyle, marginTop: 12 }}>{tr('setup.homeTitle')}</h1>
                <p style={onboardingTextStyle}>{tr('setup.homeText')}</p>
              </div>
              <form onSubmit={searchHome} style={{ display: 'flex', gap: 8 }}>
                <input value={homeInput} onChange={e => setHomeInput(e.target.value)} placeholder={tr('setup.homePlaceholder')}
                  autoFocus style={{ ...inputStyle, flex: 1 }} />
                <button type="submit" disabled={home.saving || !homeInput.trim()} style={{ ...primaryButtonStyle, padding: '0 16px', flex: '0 0 auto' }}>
                  {home.saving ? <Loader2 size={17} className="spin" /> : tr('setup.search')}
                </button>
              </form>
              {home.found && <p style={{ ...onboardingTextStyle, fontSize: 14, color: 'var(--forest)' }}>{tr('setup.found', { place: home.found })}</p>}
              {home.error && <p style={{ ...onboardingTextStyle, fontSize: 14, color: '#B3402A' }}>{home.error}</p>}
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <Wallet size={30} color="var(--forest)" />
                <h1 style={{ ...onboardingTitleStyle, marginTop: 12 }}>{tr('setup.currencyTitle')}</h1>
                <p style={onboardingTextStyle}>{tr('setup.currencyText')}</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <label style={labelStyle}>
                  {tr('setup.mainCurrency')}
                  <select value={base || 'EUR'} onChange={e => setBase(e.target.value)} style={inputStyle}>
                    {CURRENCY_CHOICES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label style={labelStyle}>
                  {tr('setup.foreignCurrency')}
                  <select value={foreign} onChange={e => setForeign(e.target.value)} style={inputStyle}>
                    <option value="">{tr('setup.none')}</option>
                    {CURRENCY_CHOICES.filter(c => c !== (base || 'EUR')).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div>
                <CampervanIcon size={34} color="var(--forest)" />
                <h1 style={{ ...onboardingTitleStyle, marginTop: 12 }}>{tr('setup.vehicleTitle')}</h1>
                <p style={onboardingTextStyle}>{tr('setup.vehicleText')}</p>
              </div>
              <input value={vehicle} onChange={e => setVehicle(e.target.value)} placeholder={tr('setup.vehiclePlaceholder')}
                style={inputStyle} />
            </>
          )}
          {error && <div style={{ color: '#B3402A', fontSize: 14 }}>{error}</div>}
        </div>

        {step > 0 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" onClick={() => setStep(step - 1)} style={onboardingSecondaryStyle}>{tr('common.back')}</button>
            <div style={{ flex: 1 }} />
            {step === 1 && !home.found && (
              <button type="button" onClick={onDefer} style={onboardingSecondaryStyle}>{tr('setup.later')}</button>
            )}
            {step === 1 && (
              <button type="button" disabled={!home.found} onClick={() => setStep(2)}
                style={{ ...primaryButtonStyle, flex: '0 0 auto', padding: '0 22px', height: 48, opacity: home.found ? 1 : 0.5 }}>{tr('common.next')}</button>
            )}
            {step === 2 && (
              <button type="button" disabled={saving} onClick={saveCurrency} style={{ ...primaryButtonStyle, flex: '0 0 auto', padding: '0 22px', height: 48 }}>
                {saving ? <Loader2 size={17} className="spin" /> : tr('common.next')}
              </button>
            )}
            {step === 3 && (
              <button type="button" disabled={saving} onClick={finish} style={{ ...primaryButtonStyle, flex: '0 0 auto', padding: '0 22px', height: 48 }}>
                {saving ? <Loader2 size={17} className="spin" /> : tr('common.done')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const WELCOME_CARDS = [
  { key: 'welcome', icon: Tent },
  { key: 'trips', icon: Compass },
  { key: 'reports', icon: Star },
  { key: 'vehicle', icon: Wallet }
];

function WelcomeCards({ onSkip, onFinish }) {
  const [index, setIndex] = useState(0);
  const touchStart = useRef(null);
  const card = WELCOME_CARDS[index];
  const Icon = card.icon;
  const last = index === WELCOME_CARDS.length - 1;

  function onTouchStart(e) { touchStart.current = e.touches[0].clientX; }
  function onTouchEnd(e) {
    if (touchStart.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStart.current;
    touchStart.current = null;
    if (dx < -50 && !last) setIndex(index + 1);
    if (dx > 50 && index > 0) setIndex(index - 1);
  }

  return (
    <div style={onboardingOverlayStyle} role="dialog" aria-modal="true" aria-label={tr(`cards.${card.key}.title`)}
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div style={onboardingInnerStyle}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', minHeight: 44 }}>
          {!last && <button type="button" onClick={onSkip} style={onboardingSecondaryStyle}>{tr('common.skip')}</button>}
        </div>
        <div key={card.key} className="view-transition" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 22 }}>
          <div style={{
            width: 84, height: 84, borderRadius: 26, background: 'var(--card-alt)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Icon size={40} color="var(--forest)" />
          </div>
          <div>
            <h1 style={onboardingTitleStyle}>{tr(`cards.${card.key}.title`)}</h1>
            <p style={onboardingTextStyle}>{tr(`cards.${card.key}.text`)}</p>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <ProgressDots count={WELCOME_CARDS.length} index={index} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {index > 0
              ? <button type="button" onClick={() => setIndex(index - 1)} style={onboardingSecondaryStyle}>{tr('common.back')}</button>
              : <div />}
            <div style={{ flex: 1 }} />
            <button type="button" onClick={() => (last ? onFinish() : setIndex(index + 1))}
              style={{ ...primaryButtonStyle, flex: '0 0 auto', padding: '0 22px', height: 48 }}>
              {last ? tr('cards.startTour') : tr('common.next')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Kurze Tour auf der Uebersicht: dunkelt alles ab ausser dem erklaerten Element (data-tour="...").
const TOUR_STEPS = ['quick', 'nav', 'settings'];

function SpotlightTour({ onDone }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const step = TOUR_STEPS[index];
  const last = index === TOUR_STEPS.length - 1;

  useEffect(() => {
    let cancelled = false;
    function measure() {
      const el = document.querySelector(`[data-tour="${step}"]`);
      if (!el) { if (!cancelled) setRect(null); return; }
      const r = el.getBoundingClientRect();
      if (!cancelled) setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    }
    const el = document.querySelector(`[data-tour="${step}"]`);
    if (el && step === 'quick') el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const timer = setTimeout(measure, 350);
    window.addEventListener('resize', measure);
    return () => { cancelled = true; clearTimeout(timer); window.removeEventListener('resize', measure); };
  }, [step]);

  const pad = 6;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 400;
  const bubbleWidth = Math.min(340, vw - 32);
  const below = rect ? rect.top + rect.height / 2 < vh / 2 : true;
  const bubbleLeft = rect ? Math.max(16, Math.min(vw - bubbleWidth - 16, rect.left + rect.width / 2 - bubbleWidth / 2)) : (vw - bubbleWidth) / 2;
  const bubbleStyle = {
    position: 'fixed', left: bubbleLeft, width: bubbleWidth, boxSizing: 'border-box', background: '#FFFFFF', borderRadius: 16,
    padding: 16, boxShadow: '0 16px 40px rgba(0,0,0,0.28)', zIndex: 902, display: 'flex', flexDirection: 'column', gap: 10,
    ...(rect
      ? (below ? { top: rect.top + rect.height + pad + 12 } : { bottom: vh - rect.top + pad + 12 })
      : { top: '40%' })
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 900 }} role="dialog" aria-modal="true" aria-label={tr(`tour.${step}.title`)}>
      {rect ? (
        <div style={{
          position: 'fixed', top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2,
          borderRadius: 16, boxShadow: '0 0 0 9999px rgba(20,32,22,0.62)', zIndex: 901, pointerEvents: 'none',
          transition: 'top 0.25s, left 0.25s, width 0.25s, height 0.25s'
        }} />
      ) : (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,32,22,0.62)', zIndex: 901 }} />
      )}
      <div style={bubbleStyle}>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{index + 1} / {TOUR_STEPS.length}</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 600 }}>{tr(`tour.${step}.title`)}</div>
        <p style={{ ...onboardingTextStyle, fontSize: 14 }}>{tr(`tour.${step}.text`)}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          {!last && <button type="button" onClick={onDone} style={{ ...onboardingSecondaryStyle, height: 40 }}>{tr('common.skip')}</button>}
          <div style={{ flex: 1 }} />
          <button type="button" onClick={() => (last ? onDone() : setIndex(index + 1))}
            style={{ ...primaryButtonStyle, flex: '0 0 auto', padding: '0 20px', height: 40 }}>
            {last ? tr('tour.finish') : tr('common.next')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CampingTagebuch() {
  const [entries, setEntries] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [trips, setTrips] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lessonsLoading, setLessonsLoading] = useState(true);
  const [tripsLoading, setTripsLoading] = useState(true);
  const [wishlistLoading, setWishlistLoading] = useState(true);
  const [error, setError] = useState('');
  const [lessonsError, setLessonsError] = useState('');
  const [tripsError, setTripsError] = useState('');
  const [wishlistError, setWishlistError] = useState('');
  const [view, setView] = useState({ name: 'home' });
  const [certIssued, setCertIssued] = useState(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [configVersion, setConfigVersion] = useState(0);

  // Einstellungen und eingerichtete Module einmal laden; ein Hochzaehlen von configVersion
  // rendert die App neu, nachdem sich APP_CONFIG geaendert hat.
  const loadAppConfig = useCallback(async () => {
    const get = (u) => fetch(u).then(r => r.ok ? r.json() : null).catch(() => null);
    const [s, f] = await Promise.all([get('/api/settings'), get('/api/features')]);
    if (s) {
      applySettingsToConfig(s);
      if (s.tls_cert_issued) setCertIssued(s.tls_cert_issued);
    }
    if (f) APP_CONFIG.features = { blog: Boolean(f.blog), tls: Boolean(f.tls) };
    if (s) setConfigLoaded(true);
    storageSet('cd_lang', lang()); // fuer den Startbildschirm beim naechsten Oeffnen
    setConfigVersion(v => v + 1);
  }, []);
  useEffect(() => { loadAppConfig(); }, [loadAppConfig]);
  const onConfigChanged = useCallback(() => setConfigVersion(v => v + 1), []);

  // Einfuehrung: null | 'setup' | 'cards' | 'tour'. Startet einmal, sobald die Einstellungen da sind.
  const [onboarding, setOnboarding] = useState(null);
  const onboardingChecked = useRef(false);
  useEffect(() => {
    if (!configLoaded || onboardingChecked.current) return;
    onboardingChecked.current = true;
    if (setupIncomplete() && !storageGet(SETUP_DEFERRED_KEY)) setOnboarding('setup');
    else if (!storageGet(ONBOARDING_SEEN_KEY)) setOnboarding('cards');
  }, [configLoaded]);
  function afterSetup() {
    setOnboarding(storageGet(ONBOARDING_SEEN_KEY) ? null : 'cards');
  }
  function deferSetup() {
    storageSet(SETUP_DEFERRED_KEY, todayISO());
    setOnboarding(storageGet(ONBOARDING_SEEN_KEY) ? null : 'cards');
  }
  function startTour() {
    navigate({ name: 'home' });
    setOnboarding('tour');
  }
  function finishOnboarding() {
    storageSet(ONBOARDING_SEEN_KEY, todayISO());
    setOnboarding(null);
  }
  function replayOnboarding() {
    navigate({ name: 'home' });
    setOnboarding('cards');
  }

  const certWarning = useMemo(() => {
    if (!certIssued || !APP_CONFIG.features.tls) return null;
    const issued = new Date(certIssued + 'T00:00:00');
    const expiry = new Date(issued.getTime() + 90 * 86400000);
    const daysLeft = Math.ceil((expiry - new Date()) / 86400000);
    if (daysLeft < 0) return tr('Das HTTPS-Zertifikat ist seit {days} Tagen abgelaufen. Bitte auf dem Server erneuern.', { days: Math.abs(daysLeft) });
    if (daysLeft <= 14) return tr('Das HTTPS-Zertifikat läuft in {days} Tagen ab. Bald auf dem Server erneuern.', { days: daysLeft });
    return null;
  }, [certIssued, configVersion]);

  const loadEntries = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(''); }
    try {
      const res = await fetch('/api/entries');
      if (!res.ok) throw new Error(tr('Einträge konnten nicht geladen werden.'));
      setEntries(await res.json());
    } catch (e) {
      if (!silent) setError(e.message === 'Failed to fetch' ? tr('Server nicht erreichbar.') : e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const loadLessons = useCallback(async (silent = false) => {
    if (!silent) { setLessonsLoading(true); setLessonsError(''); }
    try {
      const res = await fetch('/api/lessons');
      if (!res.ok) throw new Error(tr('Lessons konnten nicht geladen werden.'));
      setLessons(await res.json());
    } catch (e) {
      if (!silent) setLessonsError(e.message === 'Failed to fetch' ? tr('Server nicht erreichbar.') : e.message);
    } finally {
      if (!silent) setLessonsLoading(false);
    }
  }, []);

  const loadTrips = useCallback(async (silent = false) => {
    if (!silent) { setTripsLoading(true); setTripsError(''); }
    try {
      const res = await fetch('/api/trips');
      if (!res.ok) throw new Error(tr('Trips konnten nicht geladen werden.'));
      setTrips(await res.json());
    } catch (e) {
      if (!silent) setTripsError(e.message === 'Failed to fetch' ? tr('Server nicht erreichbar.') : e.message);
    } finally {
      if (!silent) setTripsLoading(false);
    }
  }, []);

  const loadWishlist = useCallback(async (silent = false) => {
    if (!silent) { setWishlistLoading(true); setWishlistError(''); }
    try {
      const res = await fetch('/api/wishlist');
      if (!res.ok) throw new Error(tr('Wunschliste konnte nicht geladen werden.'));
      setWishlist(await res.json());
    } catch (e) {
      if (!silent) setWishlistError(e.message === 'Failed to fetch' ? tr('Server nicht erreichbar.') : e.message);
    } finally {
      if (!silent) setWishlistLoading(false);
    }
  }, []);

  useEffect(() => { loadEntries(); loadLessons(); loadTrips(); loadWishlist(); }, [loadEntries, loadLessons, loadTrips, loadWishlist]);
  useAutoRefresh(loadEntries);
  useAutoRefresh(loadLessons);
  useAutoRefresh(loadTrips);
  useAutoRefresh(loadWishlist);

  function handleSavedEntry(entry) {
    setEntries(prev => {
      const exists = prev.some(e => e.id === entry.id);
      const next = exists ? prev.map(e => (e.id === entry.id ? entry : e)) : [entry, ...prev];
      return next.sort((a, b) => (b.datum_von || '').localeCompare(a.datum_von || ''));
    });
    loadLessons();
    showToast(tr('Gespeichert'));
    setView({ name: 'detail', entry });
  }

  // Haelt die entries-Liste und die aktuell offene view.entry-Referenz synchron mit dem
  // Server, waehrend im Hintergrund autogespeichert wird. Ohne das wuerde beim Verlassen der
  // Bearbeiten-Ansicht die zuvor geladene (inzwischen veraltete) Momentaufnahme angezeigt,
  // auch wenn der Autosave laengst erfolgreich war.
  function handleEntryUpdatedInPlace(entry) {
    setEntries(prev => prev.map(e => (e.id === entry.id ? entry : e)));
    setView(prev => (prev.entry && prev.entry.id === entry.id) ? { ...prev, entry } : prev);
  }

  function handleDeletedEntry(id) {
    setEntries(prev => prev.filter(e => e.id !== id));
    setLessons(prev => prev.filter(l => l.entry_id !== id));
    showToast(tr('Gelöscht'));
    setView({ name: 'trips' });
  }

  function handleLessonChangedInEntry(entryId, lessonId, status) {
    setEntries(prev => prev.map(e => e.id !== entryId ? e : {
      ...e, lessons: e.lessons.map(l => l.id === lessonId ? { ...l, status } : l)
    }));
    setLessons(prev => prev.map(l => l.id === lessonId ? { ...l, status } : l));
    setView(v => v.name === 'detail' && v.entry.id === entryId
      ? { ...v, entry: { ...v.entry, lessons: v.entry.lessons.map(l => l.id === lessonId ? { ...l, status } : l) } }
      : v);
  }

  async function refreshEntry(entryId) {
    const res = await fetch(`/api/entries/${entryId}`);
    if (!res.ok) return;
    const updated = await res.json();
    setEntries(prev => prev.map(e => e.id === entryId ? updated : e));
    setView(v => v.name === 'detail' && v.entry.id === entryId ? { ...v, entry: updated } : v);
  }

  async function toggleLessonFromList(lesson) {
    const newStatus = lesson.status === 'umgesetzt' ? 'offen' : 'umgesetzt';
    try {
      const res = await fetch(`/api/lessons/${lesson.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) throw new Error(tr('Status konnte nicht geändert werden.'));
      setLessons(prev => prev.map(l => l.id === lesson.id ? { ...l, status: newStatus } : l));
      if (lesson.entry_id) handleLessonChangedInEntry(lesson.entry_id, lesson.id, newStatus);
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  async function deleteLesson(lesson) {
    if (!(await confirmDialog(tr('Diese Lesson wirklich löschen?')))) return;
    try {
      const res = await fetch(`/api/lessons/${lesson.id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) throw new Error(tr('Löschen fehlgeschlagen.'));
      setLessons(prev => prev.filter(l => l.id !== lesson.id));
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  async function addStandaloneLesson(text) {
    const res = await fetch('/api/lessons', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    if (!res.ok) { showToast(tr('Konnte nicht gespeichert werden.'), 'error'); return; }
    const lesson = await res.json();
    setLessons(prev => [lesson, ...prev]);
  }

  function handleSavedTrip(trip) {
    setTrips(prev => {
      const exists = prev.some(t => t.id === trip.id);
      const next = exists ? prev.map(t => (t.id === trip.id ? trip : t)) : [...prev, trip];
      return next.sort((a, b) => (a.datum_von || '').localeCompare(b.datum_von || ''));
    });
    if (view.name === 'addTrip' && view.fromWishlistId) {
      fetch(`/api/wishlist/${view.fromWishlistId}`, { method: 'DELETE' }).catch(() => {});
      setWishlist(prev => prev.filter(w => w.id !== view.fromWishlistId));
    }
    showToast(tr('Gespeichert'));
    setView({ name: 'tripDetail', tripId: trip.id });
  }

  // Aus der Saisonplanung eingeplant: Liste aktualisieren, Wunsch entfernen, auf dem Brett bleiben.
  function handlePlannedTrip(trip, wishId) {
    setTrips(prev => [...prev.filter(t => t.id !== trip.id), trip].sort((a, b) => (a.datum_von || '').localeCompare(b.datum_von || '')));
    if (wishId) setWishlist(prev => prev.filter(w => w.id !== wishId));
    showToast(tr('Eingeplant'));
  }

  function handleDeletedTrip(id) {
    setTrips(prev => prev.filter(t => t.id !== id));
    showToast(tr('Gelöscht'));
    setView({ name: 'trips' });
  }

  function handleSavedWishlistItem(item) {
    setWishlist(prev => {
      const exists = prev.some(w => w.id === item.id);
      const next = exists ? prev.map(w => (w.id === item.id ? item : w)) : [...prev, item];
      return next.sort((a, b) => {
        if (!a.buchungsfenster_datum && !b.buchungsfenster_datum) return 0;
        if (!a.buchungsfenster_datum) return 1;
        if (!b.buchungsfenster_datum) return -1;
        return a.buchungsfenster_datum.localeCompare(b.buchungsfenster_datum);
      });
    });
    showToast(tr('Gespeichert'));
    setView({ name: 'wishlist' });
  }

  async function handleDeletedWishlistItem(id) {
    if (!(await confirmDialog(tr('Diesen Wunsch wirklich löschen?')))) return;
    try {
      const res = await fetch(`/api/wishlist/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) throw new Error(tr('Löschen fehlgeschlagen.'));
      setWishlist(prev => prev.filter(w => w.id !== id));
      showToast(tr('Gelöscht'));
    } catch (e) {
      showToast(e.message === 'Failed to fetch' ? tr('Server nicht erreichbar.') : e.message, 'error');
    }
  }

  function handleCreateEntryFromTrip(trip) {
    setView({
      name: 'add',
      prefill: {
        campingplatz: trip.ort || trip.titel,
        ort: trip.ort || '',
        datum_von: trip.datum_von,
        datum_bis: trip.datum_bis,
        trip_id: trip.id
      }
    });
  }

  // Welcher Tab in der unteren Leiste zu einer Ansicht gehoert.
  const TAB_OF_VIEW = {
    home: 'home', settings: 'home', einkaufsliste: 'home', todosQuick: 'home', odometer: 'vehicle',
    trips: 'trips', wishlist: 'trips', tripDetail: 'trips', detail: 'trips',
    vehicle: 'vehicle', finanzen: 'finanzen',
    rueckblick: 'rueckblick', lessons: 'rueckblick', kpis: 'rueckblick'
  };
  const activeTab = view.name === 'map' ? (view.from === 'trips' ? 'trips' : 'rueckblick') : TAB_OF_VIEW[view.name];
  const showTabBar = Boolean(activeTab);

  const scrollRef = useRef(null);
  function navigate(next) {
    setView(next);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }

  // Ladehinweis, falls der Server beim Start nach 6 Sekunden noch nicht geantwortet hat.
  const initialLoading = loading || tripsLoading || wishlistLoading;
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!initialLoading) { setSlow(false); return; }
    const timer = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(timer);
  }, [initialLoading]);
  function retryAll() {
    setSlow(false);
    loadEntries(); loadLessons(); loadTrips(); loadWishlist();
  }

  return (
    <div className="app-shell" style={{
      // Fest am Bildschirm verankert (Position und Hoehe in .app-shell, siehe Style-Block): so kann
      // iOS die Seite selbst nicht mitscrollen, und die Navigationsleiste bleibt unten stehen.
      ...theme, width: '100%', maxWidth: 420, margin: '0 auto',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'var(--font-body)', boxShadow: '0 0 40px rgba(0,0,0,0.08)', background: 'var(--bg)'
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 0.8s linear infinite; }
        @keyframes viewEnter { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .view-transition { animation: viewEnter 0.22s ease-out; }
        @keyframes toastIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes skeletonPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
        .skeleton { animation: skeletonPulse 1.4s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .skeleton, .view-transition { animation: none; } }
        /* Die App fuellt genau das Fenster. Den Platz fuer die Home-Leiste deckt der Innenabstand
           der Navigationsleiste ab (env(safe-area-inset-bottom)). */
        .app-shell { position: fixed; top: 0; bottom: 0; left: 0; right: 0; }
      `}</style>
      <div ref={scrollRef} id="app-scroll" style={{
        flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', position: 'relative',
        overscrollBehaviorY: 'contain', WebkitOverflowScrolling: 'touch'
      }}>
      <OfflineBanner />
      <ErrorBoundary onReset={() => setView({ name: 'home' })}>
      <div key={view.name + (view.entry?.id ?? view.tripId ?? view.trip?.id ?? '')} className="view-transition" style={{ minHeight: '100%' }}>
      {view.name === 'home' && (
        <HomeScreen trips={trips} entries={entries} wishlist={wishlist} loading={initialLoading} slow={slow} onRetry={retryAll}
          certWarning={certWarning} setupHint={configLoaded && setupIncomplete()} navigate={navigate} />
      )}

      {view.name === 'settings' && (
        <SettingsView onBack={() => navigate({ name: 'home' })} certIssued={certIssued} onCertIssuedSaved={setCertIssued}
          onConfigChanged={onConfigChanged} onReplayOnboarding={replayOnboarding} />
      )}

      {view.name === 'trips' && (
        <TripsHub trips={trips} entries={entries} wishlist={wishlist} loading={loading || tripsLoading}
          error={error || tripsError} navigate={navigate} onPlanned={handlePlannedTrip} />
      )}

      {view.name === 'wishlist' && (
        <WishlistView wishlist={wishlist} loading={wishlistLoading} error={wishlistError}
          onBack={() => navigate({ name: 'trips' })}
          onAdd={() => navigate({ name: 'addWishlist' })}
          onEdit={(item) => navigate({ name: 'editWishlist', item })}
          onDelete={handleDeletedWishlistItem}
          onConvertToTrip={(item) => navigate({
            name: 'addTrip', fromWishlistId: item.id,
            prefill: {
              titel: item.name, ort: item.ort, status: 'idee', buchungsfenster_datum: item.buchungsfenster_datum || null,
              notizen: item.link ? [item.notizen, tr('Mehr Infos: {link}', { link: item.link })].filter(Boolean).join('\n\n') : (item.notizen || '')
            }
          })} />
      )}

      {view.name === 'addWishlist' && (
        <WishlistForm onSaved={handleSavedWishlistItem} onCancel={() => navigate({ name: 'wishlist' })} />
      )}

      {view.name === 'editWishlist' && (
        <WishlistForm existing={view.item} onSaved={handleSavedWishlistItem}
          onCancel={() => navigate({ name: 'wishlist' })} />
      )}

      {view.name === 'rueckblick' && (
        <RueckblickView lessons={lessons} entries={entries} navigate={navigate} />
      )}

      {view.name === 'lessons' && (
        <LessonsView lessons={lessons} loading={lessonsLoading} error={lessonsError}
          onToggle={toggleLessonFromList} onDelete={deleteLesson} onAddStandalone={addStandaloneLesson}
          onBack={() => navigate({ name: 'rueckblick' })} />
      )}

      {view.name === 'detail' && (
        <EntryDetail entry={view.entry}
          onBack={() => navigate(view.backTo || { name: 'trips' })}
          onEdit={(entry) => navigate({ name: 'edit', entry })}
          onView={(entry) => navigate({ name: 'viewReport', entry })}
          onDeleted={handleDeletedEntry}
          onLessonChanged={handleLessonChangedInEntry}
          onRefreshEntry={() => refreshEntry(view.entry.id)} />
      )}

      {view.name === 'viewReport' && (
        <EntryForm existing={view.entry} readOnly
          onCancel={() => navigate({ name: 'detail', entry: view.entry })} />
      )}

      {view.name === 'add' && (
        <EntryForm prefill={view.prefill} onSaved={handleSavedEntry}
          onCancel={() => navigate(view.prefill?.trip_id ? { name: 'tripDetail', tripId: view.prefill.trip_id } : { name: 'trips' })} />
      )}

      {view.name === 'edit' && (
        <EntryForm existing={view.entry} onSaved={handleSavedEntry} onEntryUpdated={handleEntryUpdatedInPlace}
          onCancel={() => navigate({ name: 'detail', entry: view.entry })} />
      )}

      {view.name === 'odometer' && (
        <OdometerView onBack={() => navigate({ name: 'vehicle', tab: 'km' })} />
      )}

      {view.name === 'vehicle' && (
        <VehicleView initialTab={view.tab} />
      )}

      {view.name === 'finanzen' && (
        <FinanceView />
      )}

      {view.name === 'einkaufsliste' && (
        <QuickListView type="einkauf" title={tr('Einkaufsliste')} icon={ShoppingCart} onBack={() => navigate({ name: 'home' })}
          onGoTrips={() => navigate({ name: 'trips' })} />
      )}

      {view.name === 'todosQuick' && (
        <QuickListView type="todo" title={tr('To-dos')} icon={ListTodo} onBack={() => navigate({ name: 'home' })}
          onGoTrips={() => navigate({ name: 'trips' })} />
      )}

      {view.name === 'kpis' && (
        <KpiView onBack={() => navigate({ name: 'rueckblick' })} />
      )}

      {view.name === 'map' && (
        <MapView entries={entries} onBack={() => navigate({ name: view.from || 'rueckblick' })}
          onSelectEntry={(entry) => navigate({ name: 'detail', entry, backTo: { name: 'map', from: view.from } })}
          onCoordsSaved={(id, lat, lon) => setEntries(prev => prev.map(e => e.id === id ? { ...e, lat, lon } : e))} />
      )}

      {view.name === 'tripDetail' && (
        <TripDetail tripId={view.tripId} trips={trips} entries={entries} lessons={lessons} onRefresh={loadTrips}
          onBack={() => navigate({ name: 'trips' })}
          onEdit={(trip) => navigate({ name: 'editTrip', trip })}
          onDeleted={handleDeletedTrip}
          onCreateEntry={handleCreateEntryFromTrip}
          onViewEntry={(entry) => navigate({ name: 'detail', entry, backTo: { name: 'tripDetail', tripId: view.tripId } })}
          onAddLesson={addStandaloneLesson} />
      )}

      {view.name === 'addTrip' && (
        <TripForm prefill={view.prefill} trips={trips} onSaved={handleSavedTrip} onCancel={() => navigate({ name: 'trips' })} />
      )}

      {view.name === 'editTrip' && (
        <TripForm existing={view.trip} trips={trips} onSaved={handleSavedTrip}
          onCancel={() => navigate({ name: 'tripDetail', tripId: view.trip.id })} />
      )}
      </div>
      </ErrorBoundary>
      </div>

      {showTabBar && <TabBar active={activeTab} onSelect={(key) => navigate({ name: key })} />}

      <ToastHost />
      <ConfirmHost />

      {onboarding === 'setup' && <SetupWizard onDone={afterSetup} onDefer={deferSetup} onConfigChanged={onConfigChanged} />}
      {onboarding === 'cards' && <WelcomeCards onSkip={finishOnboarding} onFinish={startTour} />}
      {onboarding === 'tour' && view.name === 'home' && <SpotlightTour onDone={finishOnboarding} />}
    </div>
  );
}
