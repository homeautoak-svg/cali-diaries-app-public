const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const yaml = require('js-yaml');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
const PORT = process.env.PORT || 4000;

// Optionales Blog-Modul (Erfahrungsbericht -> Blogbeitrag per Claude API -> GitHub-Repo).
// Es ist nur aktiv, wenn ANTHROPIC_API_KEY, GITHUB_TOKEN und ein Ziel-Repo gesetzt sind; sonst
// blendet die App die Blog-Knoepfe aus. Repo, Pfade und eigene Prompt-Texte koennen in
// data/blog.json hinterlegt werden (liegt mit den Daten ausserhalb des Codes), einzelne Werte
// auch per Umgebungsvariable, die dann Vorrang hat.
function loadBlogFileConfig() {
  const file = path.join(DATA_DIR, 'blog.json');
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8')) || {};
  } catch (e) {
    console.error('data/blog.json konnte nicht gelesen werden:', e.message);
  }
  return {};
}
const BLOG_FILE = loadBlogFileConfig();
const GITHUB_REPO = process.env.GITHUB_REPO || BLOG_FILE.repo || '';
const GITHUB_POSTS_PATH = process.env.GITHUB_POSTS_PATH || BLOG_FILE.postsPath || 'src/posts';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || BLOG_FILE.branch || 'main';
const GITHUB_EN_POSTS_PATH = process.env.GITHUB_EN_POSTS_PATH || BLOG_FILE.enPostsPath || 'src/en/posts';
const BLOG_ENABLED = Boolean(process.env.ANTHROPIC_API_KEY && process.env.GITHUB_TOKEN && GITHUB_REPO);

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Lokale Datumsarithmetik (kein toISOString(), das bei UTC+1/+2 den Tag verschieben kann).
function addDaysISO(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

const db = new Database(path.join(DATA_DIR, 'camping-diary.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author_name TEXT,
    campingplatz TEXT NOT NULL,
    ort TEXT,
    datum_von TEXT,
    datum_bis TEXT,
    bewertung INTEGER,
    wetter TEXT,
    kosten_pro_nacht REAL,
    kosten_restaurant REAL,
    kosten_aktivitaeten REAL,
    stellplatzgroesse TEXT,
    kilometerstand INTEGER,
    lat REAL,
    lon REAL,
    lessons_learnt TEXT,
    notizen TEXT,
    tags TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS lessons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id INTEGER,
    text TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'offen',
    erledigt_am TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS trips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titel TEXT NOT NULL,
    ort TEXT,
    datum_von TEXT,
    datum_bis TEXT,
    notizen TEXT,
    status TEXT NOT NULL DEFAULT 'bestaetigt',
    buchungsfenster_datum TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS trip_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    text TEXT NOT NULL,
    checked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS trip_meals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL,
    tag_label TEXT,
    datum TEXT,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS entry_todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    checked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS odometer_readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    datum TEXT NOT NULL,
    km INTEGER NOT NULL,
    note TEXT,
    entry_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  -- Cache fuer Ort -> Hin-und-Rueckfahrt-km (Geocoding + OSRM sind langsam und aendern sich
  -- fuer denselben Ort praktisch nie), damit die kumulierte km-Budget-Berechnung bei mehreren
  -- geplanten Trips nicht fuer denselben Ort wiederholt angefragt werden muss.
  CREATE TABLE IF NOT EXISTS geo_km_cache (
    ort TEXT PRIMARY KEY,
    km INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Cache fuer Points-of-Interest-Abfragen (Overpass API) pro Ort, damit derselbe Ort nicht
  -- wiederholt abgefragt wird (Overpass ist ein geteilter, oeffentlicher Dienst mit Etikette
  -- gegen zu haeufige Anfragen). poi_json enthaelt das fertige JSON-Array der gefundenen Orte.
  CREATE TABLE IF NOT EXISTS poi_cache (
    ort TEXT PRIMARY KEY,
    poi_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS vehicle_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    datum TEXT NOT NULL,
    typ TEXT NOT NULL,
    titel TEXT NOT NULL,
    beschreibung TEXT,
    kosten REAL,
    km_stand INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS vehicle_todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    typ TEXT NOT NULL DEFAULT 'sonstiges',
    beschreibung TEXT,
    kosten REAL,
    km_stand INTEGER,
    checked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS finance_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bezeichnung TEXT NOT NULL,
    betrag REAL NOT NULL,
    typ TEXT NOT NULL DEFAULT 'einmalig',
    kategorie TEXT NOT NULL DEFAULT 'fahrzeug',
    faellig_datum TEXT,
    max_perioden INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Cache fuer Ort -> Laendercode (ISO 3166-1 alpha-2, z.B. "ch", "de"), fuer die kleine
  -- Flaggen-Anzeige neben dem Ort in Trip und Erfahrungsbericht. Dauerhaft gecacht wie
  -- geo_km_cache und poi_cache, da sich das Land eines Ortsnamens praktisch nie aendert.
  CREATE TABLE IF NOT EXISTS ort_country_cache (
    ort TEXT PRIMARY KEY,
    country_code TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Schul- und Feiertage pro Land, Jahr und Sprache (OpenHolidays API). Die Daten aendern sich
  -- selten, deshalb wird nur nachgeladen, wenn der Eintrag aelter als 30 Tage ist.
  CREATE TABLE IF NOT EXISTS holiday_cache (
    country TEXT NOT NULL,
    year INTEGER NOT NULL,
    kind TEXT NOT NULL,
    data_json TEXT NOT NULL,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (country, year, kind)
  );

  CREATE TABLE IF NOT EXISTS wishlist_campsites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    ort TEXT,
    buchungsfenster_datum TEXT,
    min_naechte INTEGER,
    link TEXT,
    notizen TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Migration: kategorie-Spalte fuer bestehende Installationen nachruesten.
const financeColumns = db.prepare("PRAGMA table_info(finance_items)").all().map(c => c.name);
if (!financeColumns.includes('kategorie')) {
  db.exec("ALTER TABLE finance_items ADD COLUMN kategorie TEXT NOT NULL DEFAULT 'fahrzeug'");
}
if (!financeColumns.includes('faellig_datum')) {
  db.exec('ALTER TABLE finance_items ADD COLUMN faellig_datum TEXT');
}
if (!financeColumns.includes('max_perioden')) {
  db.exec('ALTER TABLE finance_items ADD COLUMN max_perioden INTEGER');
}

// Migration: Detailfelder fuer vehicle_todos nachruesten (Typ, Kosten, km-Stand, Notizen).
const vehicleTodoColumns = db.prepare("PRAGMA table_info(vehicle_todos)").all().map(c => c.name);
if (!vehicleTodoColumns.includes('typ')) db.exec("ALTER TABLE vehicle_todos ADD COLUMN typ TEXT NOT NULL DEFAULT 'sonstiges'");
if (!vehicleTodoColumns.includes('beschreibung')) db.exec('ALTER TABLE vehicle_todos ADD COLUMN beschreibung TEXT');
if (!vehicleTodoColumns.includes('kosten')) db.exec('ALTER TABLE vehicle_todos ADD COLUMN kosten REAL');
if (!vehicleTodoColumns.includes('km_stand')) db.exec('ALTER TABLE vehicle_todos ADD COLUMN km_stand INTEGER');

// Neue Installationen starten ohne Fixkosten und ohne km-Startbestand; beides wird in der App
// erfasst (Finanzen bzw. KM-Stand). Bestehende Datenbanken behalten ihre Werte unveraendert.

// Einstellungen lesen (Schluessel-Wert-Tabelle "settings").
function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}
function getCurrency() {
  return getSetting('currency') || 'EUR';
}

// Migration: alte packing_templates-Tabelle (falls vorhanden) in die neue generische
// templates-Tabelle uebernehmen.
const hasOldPackingTemplates = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name='packing_templates'"
).get();
if (hasOldPackingTemplates) {
  const oldRows = db.prepare('SELECT text FROM packing_templates').all();
  const insertTpl = db.prepare('INSERT INTO templates (category, text) VALUES (?, ?)');
  for (const row of oldRows) insertTpl.run('packliste', row.text);
  db.exec('DROP TABLE packing_templates');
}

// Migration fuer bestehende Installationen: neue Spalten nachruesten, falls sie fehlen.
const entryColumns = db.prepare("PRAGMA table_info(entries)").all().map(c => c.name);
if (!entryColumns.includes('tags')) db.exec('ALTER TABLE entries ADD COLUMN tags TEXT');
if (!entryColumns.includes('stellplatzgroesse')) db.exec('ALTER TABLE entries ADD COLUMN stellplatzgroesse TEXT');
if (!entryColumns.includes('trip_id')) db.exec('ALTER TABLE entries ADD COLUMN trip_id INTEGER');
if (!entryColumns.includes('kilometerstand')) db.exec('ALTER TABLE entries ADD COLUMN kilometerstand INTEGER');
if (!entryColumns.includes('lat')) db.exec('ALTER TABLE entries ADD COLUMN lat REAL');
if (!entryColumns.includes('lon')) db.exec('ALTER TABLE entries ADD COLUMN lon REAL');
if (!entryColumns.includes('kosten_restaurant')) db.exec('ALTER TABLE entries ADD COLUMN kosten_restaurant REAL');
if (!entryColumns.includes('kosten_aktivitaeten')) db.exec('ALTER TABLE entries ADD COLUMN kosten_aktivitaeten REAL');

const lessonColumns = db.prepare("PRAGMA table_info(lessons)").all().map(c => c.name);
if (!lessonColumns.includes('erledigt_am')) db.exec('ALTER TABLE lessons ADD COLUMN erledigt_am TEXT');

// Migration v4.12: Status fuer Trips (Idee, angefragt, bestaetigt) und Buchungsfenster aus der
// Wunschliste. Bestehende Trips gelten als bestaetigt, damit sich an ihnen nichts aendert.
const tripColumns = db.prepare("PRAGMA table_info(trips)").all().map(c => c.name);
if (!tripColumns.includes('status')) db.exec("ALTER TABLE trips ADD COLUMN status TEXT NOT NULL DEFAULT 'bestaetigt'");
if (!tripColumns.includes('buchungsfenster_datum')) db.exec('ALTER TABLE trips ADD COLUMN buchungsfenster_datum TEXT');
const wishlistColumns = db.prepare("PRAGMA table_info(wishlist_campsites)").all().map(c => c.name);
if (!wishlistColumns.includes('min_naechte')) db.exec('ALTER TABLE wishlist_campsites ADD COLUMN min_naechte INTEGER');

const TRIP_STATUSES = ['idee', 'angefragt', 'bestaetigt'];
function validTripStatus(v, fallback) {
  return TRIP_STATUSES.includes(v) ? v : fallback;
}
function validMinNaechte(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 && n < 100 ? n : null;
}

const mealColumns = db.prepare("PRAGMA table_info(trip_meals)").all().map(c => c.name);
if (!mealColumns.includes('datum')) db.exec('ALTER TABLE trip_meals ADD COLUMN datum TEXT');

if (!entryColumns.includes('author_name')) {
  db.exec('ALTER TABLE entries ADD COLUMN author_name TEXT');
  // Falls eine aeltere Version mit Login/author_id existierte, Namen aus der users-Tabelle uebernehmen.
  const hasUsersTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
  const hasAuthorId = db.prepare("PRAGMA table_info(entries)").all().some(c => c.name === 'author_id');
  if (hasUsersTable && hasAuthorId) {
    db.exec(`
      UPDATE entries SET author_name = (
        SELECT display_name FROM users WHERE users.id = entries.author_id
      ) WHERE author_name IS NULL
    `);
  }
}

// Aeltere Installationen (aus der Zeit mit Login) haben noch eine NOT-NULL-Pflicht auf
// entries.author_id, die seit der Login-Entfernung nicht mehr befuellt wird. SQLite kann
// eine solche Spaltenbedingung nicht per ALTER TABLE entfernen, daher wird die Tabelle
// einmalig neu aufgebaut, alle bestehenden Daten bleiben dabei erhalten.
const stillHasAuthorId = db.prepare("PRAGMA table_info(entries)").all().some(c => c.name === 'author_id');
if (stillHasAuthorId) {
  db.exec(`
    CREATE TABLE entries_rebuilt (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      author_name TEXT,
      campingplatz TEXT NOT NULL,
      ort TEXT,
      datum_von TEXT,
      datum_bis TEXT,
      bewertung INTEGER,
      wetter TEXT,
      kosten_pro_nacht REAL,
      kosten_restaurant REAL,
      kosten_aktivitaeten REAL,
      stellplatzgroesse TEXT,
      kilometerstand INTEGER,
      lat REAL,
      lon REAL,
      lessons_learnt TEXT,
      notizen TEXT,
      tags TEXT,
      trip_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.exec(`
    INSERT INTO entries_rebuilt (
      id, author_name, campingplatz, ort, datum_von, datum_bis, bewertung, wetter,
      kosten_pro_nacht, kosten_restaurant, kosten_aktivitaeten, stellplatzgroesse,
      kilometerstand, lat, lon, lessons_learnt, notizen, tags, trip_id, created_at, updated_at
    )
    SELECT
      id, author_name, campingplatz, ort, datum_von, datum_bis, bewertung, wetter,
      kosten_pro_nacht, kosten_restaurant, kosten_aktivitaeten, stellplatzgroesse,
      kilometerstand, lat, lon, lessons_learnt, notizen, tags, trip_id, created_at, updated_at
    FROM entries;
  `);
  db.exec('DROP TABLE entries');
  db.exec('ALTER TABLE entries_rebuilt RENAME TO entries');
  console.log('Migration: alte author_id-Pflichtspalte entfernt, bestehende Eintraege uebernommen.');
}

// Einmalige Migration: alte Freitext-Lessons-Learnt-Eintraege als eigene Zeile uebernehmen,
// falls noch keine zugehoerige Lessons-Zeile existiert.
const legacyLessons = db.prepare(`
  SELECT id, lessons_learnt FROM entries
  WHERE lessons_learnt IS NOT NULL AND TRIM(lessons_learnt) != ''
  AND id NOT IN (SELECT DISTINCT entry_id FROM lessons WHERE entry_id IS NOT NULL)
`).all();
const insertLegacyLesson = db.prepare('INSERT INTO lessons (entry_id, text, status) VALUES (?, ?, ?)');
for (const row of legacyLessons) {
  insertLegacyLesson.run(row.id, row.lessons_learnt, 'offen');
}

const app = express();
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));

// Fehlermeldungen der API sind im Code deutsch. Ist in den Einstellungen Englisch gewaehlt,
// werden bekannte Meldungen vor dem Senden uebersetzt (Feld "error" der JSON-Antwort).
const ERROR_EN = {
  'Eintrag nicht gefunden.': 'Entry not found.',
  'Trip nicht gefunden.': 'Trip not found.',
  'To-do nicht gefunden.': 'To-do not found.',
  'Text ist ein Pflichtfeld.': 'Text is required.',
  'ort ist erforderlich.': 'Place is required.',
  'Ort nicht gefunden.': 'Place not found.',
  'Routenberechnung fehlgeschlagen.': 'Route calculation failed.',
  'Points of Interest konnten nicht geladen werden.': 'Points of interest could not be loaded.',
  'Name ist ein Pflichtfeld.': 'Name is required.',
  'Mahlzeit nicht gefunden.': 'Meal not found.',
  'Lesson nicht gefunden.': 'Lesson not found.',
  'lat und lon muessen Zahlen sein.': 'lat and lon must be numbers.',
  'Vorlage nicht gefunden.': 'Template not found.',
  'Ungueltiger Wert.': 'Invalid value.',
  'Unbekannte Kategorie.': 'Unknown category.',
  'Typ und Text sind Pflichtfelder.': 'Type and text are required.',
  'Titel ist ein Pflichtfeld.': 'Title is required.',
  'Startort ist noch nicht eingerichtet (Einstellungen).': 'Home location is not set yet (Settings).',
  'Ortssuche fehlgeschlagen.': 'Place search failed.',
  'Ortssuche fehlgeschlagen. Server ohne Internet?': 'Place search failed. Is the server offline?',
  'Laendercode konnte nicht ermittelt werden.': 'Country code could not be determined.',
  'Geocoding fehlgeschlagen.': 'Geocoding failed.',
  'Foto nicht gefunden.': 'Photo not found.',
  'Distanz konnte nicht berechnet werden.': 'Distance could not be calculated.',
  'Datum, Typ und Titel sind Pflichtfelder.': 'Date, type and title are required.',
  'Datum und Kilometerstand sind Pflichtfelder.': 'Date and odometer reading are required.',
  'Campingplatz ist ein Pflichtfeld.': 'Campsite is required.',
  'Bitte einen Ort angeben.': 'Please enter a place.',
  'Bezeichnung und Betrag sind Pflichtfelder.': 'Description and amount are required.',
  'Ablesung nicht gefunden.': 'Reading not found.'
};
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body && typeof body.error === 'string' && ERROR_EN[body.error]) {
      try {
        const row = db.prepare("SELECT value FROM settings WHERE key = 'language'").get();
        if (row && row.value === 'en') body = { ...body, error: ERROR_EN[body.error] };
      } catch { /* bei Datenbankproblemen Originalmeldung senden */ }
    }
    return originalJson(body);
  };
  next();
});
app.use(express.json());
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res) => {
    // Diese App aendert sich haeufig waehrend der Entwicklung; kein aggressives Browser-Caching
    // fuer bundle.js/index.html, sonst bleiben alte Versionen haengen. "no-cache" bedeutet
    // trotzdem Revalidierung mit dem Server (per ETag), nicht "gar kein Caching".
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  }
}));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

// iPhones speichern Fotos standardmaessig als HEIC/HEIF - das koennen Browser nicht als <img>
// darstellen, deshalb wird zuerst nach JPEG dekodiert. Danach werden ALLE hochgeladenen Fotos
// (auch normale JPEGs) verkleinert und neu komprimiert: Handyfotos sind oft 4000+ Pixel breit,
// was fuer die Anzeige am Bildschirm weit mehr ist als noetig. 2400px lange Kante bei Qualitaet
// 82 spart typischerweise 60-80% Dateigroesse, ohne sichtbaren Unterschied beim Betrachten.
const heicConvert = require('heic-convert');
const sharp = require('sharp');
const MAX_IMAGE_DIMENSION = 2400;
const JPEG_QUALITY = 82;

async function processUploadedImage(file) {
  const ext = path.extname(file.filename).toLowerCase();
  const isHeic = ext === '.heic' || ext === '.heif';
  const filePath = path.join(UPLOAD_DIR, file.filename);
  try {
    let inputBuffer;
    if (isHeic) {
      const heicBuffer = fs.readFileSync(filePath);
      // Qualitaet hier hoch lassen (verlustarme Zwischenstufe) - die eigentliche,
      // sichtbarkeitsrelevante Kompression uebernimmt sharp im Schritt danach.
      inputBuffer = await heicConvert({ buffer: heicBuffer, format: 'JPEG', quality: 0.92 });
    } else {
      inputBuffer = fs.readFileSync(filePath);
    }

    const outputBuffer = await sharp(inputBuffer)
      .rotate() // EXIF-Ausrichtung anwenden, bevor die Metadaten beim Neukomprimieren verloren gehen
      .resize({ width: MAX_IMAGE_DIMENSION, height: MAX_IMAGE_DIMENSION, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();

    const newFilename = isHeic ? file.filename.replace(/\.(heic|heif)$/i, '.jpg') : file.filename;
    fs.writeFileSync(path.join(UPLOAD_DIR, newFilename), outputBuffer);
    if (newFilename !== file.filename) fs.unlinkSync(filePath);
    return newFilename;
  } catch (e) {
    console.error(`Bildverarbeitung fehlgeschlagen fuer ${file.filename}:`, e.message);
    return file.filename; // Original behalten, damit der Eintrag nicht ganz verloren geht.
  }
}
async function processUploadedImages(files) {
  const result = [];
  for (const f of files) {
    const filename = await processUploadedImage(f);
    result.push({ ...f, filename });
  }
  return result;
}

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

function attachPhotos(entry) {
  const photos = db.prepare('SELECT id, filename FROM photos WHERE entry_id = ? ORDER BY id').all(entry.id);
  const lessons = db.prepare('SELECT id, text, status FROM lessons WHERE entry_id = ? ORDER BY id').all(entry.id);
  const todos = db.prepare('SELECT id, text, checked FROM entry_todos WHERE entry_id = ? ORDER BY id').all(entry.id)
    .map(t => ({ ...t, checked: !!t.checked }));
  let tags = [];
  try { tags = entry.tags ? JSON.parse(entry.tags) : []; } catch { tags = []; }
  return {
    ...entry,
    tags,
    photos: photos.map(p => ({ id: p.id, url: `/uploads/${p.filename}` })),
    lessons,
    todos
  };
}

app.get('/api/entries', (req, res) => {
  const rows = db.prepare(`SELECT * FROM entries ORDER BY datum_von DESC, id DESC`).all();
  res.json(rows.map(attachPhotos));
});

app.get('/api/entries/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM entries WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Eintrag nicht gefunden.' });
  res.json(attachPhotos(row));
});

app.post('/api/entries', upload.array('photos', 10), async (req, res) => {
  const b = req.body;
  if (!b.campingplatz) return res.status(400).json({ error: 'Campingplatz ist ein Pflichtfeld.' });
  let tagsArray = [];
  try { tagsArray = b.tags ? JSON.parse(b.tags) : []; } catch { tagsArray = []; }
  const info = db.prepare(`
    INSERT INTO entries (author_name, campingplatz, ort, datum_von, datum_bis, bewertung, wetter, kosten_pro_nacht, kosten_restaurant, kosten_aktivitaeten, stellplatzgroesse, kilometerstand, lessons_learnt, notizen, tags, trip_id)
    VALUES (@author_name, @campingplatz, @ort, @datum_von, @datum_bis, @bewertung, @wetter, @kosten_pro_nacht, @kosten_restaurant, @kosten_aktivitaeten, @stellplatzgroesse, @kilometerstand, @lessons_learnt, @notizen, @tags, @trip_id)
  `).run({
    author_name: b.actor || null,
    campingplatz: b.campingplatz,
    ort: b.ort || null,
    datum_von: b.datum_von || null,
    datum_bis: b.datum_bis || null,
    bewertung: b.bewertung ? Number(b.bewertung) : null,
    wetter: b.wetter || null,
    kosten_pro_nacht: b.kosten_pro_nacht ? Number(b.kosten_pro_nacht) : null,
    kosten_restaurant: b.kosten_restaurant ? Number(b.kosten_restaurant) : null,
    kosten_aktivitaeten: b.kosten_aktivitaeten ? Number(b.kosten_aktivitaeten) : null,
    stellplatzgroesse: b.stellplatzgroesse || null,
    kilometerstand: b.kilometerstand ? Number(b.kilometerstand) : null,
    lessons_learnt: b.lessons_learnt || null,
    notizen: b.notizen || null,
    tags: JSON.stringify(tagsArray),
    trip_id: b.trip_id ? Number(b.trip_id) : null
  });
  const entryId = info.lastInsertRowid;
  const files = await processUploadedImages(req.files || []);
  const insertPhoto = db.prepare('INSERT INTO photos (entry_id, filename) VALUES (?, ?)');
  for (const f of files) insertPhoto.run(entryId, f.filename);

  if (b.kilometerstand && Number(b.kilometerstand) > 0) {
    db.prepare('INSERT INTO odometer_readings (datum, km, note, entry_id) VALUES (?, ?, ?, ?)')
      .run(b.datum_von || new Date().toISOString().slice(0, 10), Number(b.kilometerstand), b.campingplatz, entryId);
  }

  let lessonsArray = [];
  try { lessonsArray = b.lessons ? JSON.parse(b.lessons) : []; } catch { lessonsArray = []; }
  const insertLesson = db.prepare('INSERT INTO lessons (entry_id, text, status) VALUES (?, ?, ?)');
  for (const l of lessonsArray) {
    const text = typeof l === 'string' ? l : l.text;
    if (text && text.trim()) insertLesson.run(entryId, text.trim(), (l.status === 'umgesetzt' ? 'umgesetzt' : 'offen'));
  }

  let todosArray = [];
  try { todosArray = b.todos ? JSON.parse(b.todos) : []; } catch { todosArray = []; }
  const insertTodo = db.prepare('INSERT INTO entry_todos (entry_id, text) VALUES (?, ?)');
  for (const t of todosArray) {
    const text = typeof t === 'string' ? t : t.text;
    if (text && text.trim()) insertTodo.run(entryId, text.trim());
  }

  const row = db.prepare('SELECT * FROM entries WHERE id = ?').get(entryId);
  res.status(201).json(attachPhotos(row));
});

app.put('/api/entries/:id', upload.array('photos', 10), async (req, res) => {
  const existing = db.prepare('SELECT * FROM entries WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Eintrag nicht gefunden.' });
  const b = req.body;
  let tagsArray = null;
  if (b.tags !== undefined) {
    try { tagsArray = JSON.stringify(JSON.parse(b.tags)); } catch { tagsArray = existing.tags; }
  }
  db.prepare(`
    UPDATE entries SET
      campingplatz = @campingplatz,
      ort = @ort,
      datum_von = @datum_von,
      datum_bis = @datum_bis,
      bewertung = @bewertung,
      wetter = @wetter,
      kosten_pro_nacht = @kosten_pro_nacht,
      kosten_restaurant = @kosten_restaurant,
      kosten_aktivitaeten = @kosten_aktivitaeten,
      stellplatzgroesse = @stellplatzgroesse,
      kilometerstand = @kilometerstand,
      lessons_learnt = @lessons_learnt,
      notizen = @notizen,
      tags = @tags,
      updated_at = datetime('now')
    WHERE id = @id
  `).run({
    id: req.params.id,
    campingplatz: b.campingplatz ?? existing.campingplatz,
    ort: b.ort ?? existing.ort,
    datum_von: b.datum_von ?? existing.datum_von,
    datum_bis: b.datum_bis ?? existing.datum_bis,
    bewertung: b.bewertung !== undefined ? Number(b.bewertung) : existing.bewertung,
    wetter: b.wetter ?? existing.wetter,
    kosten_pro_nacht: b.kosten_pro_nacht !== undefined ? (b.kosten_pro_nacht ? Number(b.kosten_pro_nacht) : null) : existing.kosten_pro_nacht,
    kosten_restaurant: b.kosten_restaurant !== undefined ? (b.kosten_restaurant ? Number(b.kosten_restaurant) : null) : existing.kosten_restaurant,
    kosten_aktivitaeten: b.kosten_aktivitaeten !== undefined ? (b.kosten_aktivitaeten ? Number(b.kosten_aktivitaeten) : null) : existing.kosten_aktivitaeten,
    stellplatzgroesse: b.stellplatzgroesse ?? existing.stellplatzgroesse,
    kilometerstand: b.kilometerstand !== undefined ? (b.kilometerstand ? Number(b.kilometerstand) : null) : existing.kilometerstand,
    lessons_learnt: b.lessons_learnt ?? existing.lessons_learnt,
    notizen: b.notizen ?? existing.notizen,
    tags: tagsArray !== null ? tagsArray : existing.tags
  });
  const files = await processUploadedImages(req.files || []);
  const insertPhoto = db.prepare('INSERT INTO photos (entry_id, filename) VALUES (?, ?)');
  for (const f of files) insertPhoto.run(req.params.id, f.filename);

  if (b.kilometerstand !== undefined) {
    const km = b.kilometerstand ? Number(b.kilometerstand) : null;
    const linkedReading = db.prepare('SELECT id FROM odometer_readings WHERE entry_id = ?').get(req.params.id);
    if (km && linkedReading) {
      db.prepare('UPDATE odometer_readings SET km = ?, datum = ? WHERE id = ?')
        .run(km, b.datum_von || existing.datum_von, linkedReading.id);
    } else if (km && !linkedReading) {
      db.prepare('INSERT INTO odometer_readings (datum, km, note, entry_id) VALUES (?, ?, ?, ?)')
        .run(b.datum_von || existing.datum_von || new Date().toISOString().slice(0, 10), km, b.campingplatz || existing.campingplatz, req.params.id);
    } else if (!km && linkedReading) {
      db.prepare('DELETE FROM odometer_readings WHERE id = ?').run(linkedReading.id);
    }
  }

  if (b.newLessons) {
    let newLessonsArray = [];
    try { newLessonsArray = JSON.parse(b.newLessons); } catch { newLessonsArray = []; }
    const insertLesson = db.prepare('INSERT INTO lessons (entry_id, text, status) VALUES (?, ?, ?)');
    for (const l of newLessonsArray) {
      const text = typeof l === 'string' ? l : l.text;
      if (text && text.trim()) insertLesson.run(req.params.id, text.trim(), 'offen');
    }
  }

  if (b.newTodos) {
    let newTodosArray = [];
    try { newTodosArray = JSON.parse(b.newTodos); } catch { newTodosArray = []; }
    const insertTodo = db.prepare('INSERT INTO entry_todos (entry_id, text) VALUES (?, ?)');
    for (const t of newTodosArray) {
      const text = typeof t === 'string' ? t : t.text;
      if (text && text.trim()) insertTodo.run(req.params.id, text.trim());
    }
  }

  const row = db.prepare('SELECT * FROM entries WHERE id = ?').get(req.params.id);
  res.json(attachPhotos(row));
});

app.delete('/api/entries/:id', (req, res) => {
  const photos = db.prepare('SELECT filename FROM photos WHERE entry_id = ?').all(req.params.id);
  for (const p of photos) {
    const filePath = path.join(UPLOAD_DIR, p.filename);
    fs.unlink(filePath, () => {});
  }
  db.prepare('DELETE FROM photos WHERE entry_id = ?').run(req.params.id);
  const info = db.prepare('DELETE FROM entries WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Eintrag nicht gefunden.' });
  res.status(204).send();
});

app.delete('/api/photos/:id', (req, res) => {
  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id);
  if (!photo) return res.status(404).json({ error: 'Foto nicht gefunden.' });
  fs.unlink(path.join(UPLOAD_DIR, photo.filename), () => {});
  db.prepare('DELETE FROM photos WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

app.put('/api/entries/:id/coords', (req, res) => {
  const existing = db.prepare('SELECT id FROM entries WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Eintrag nicht gefunden.' });
  const { lat, lon } = req.body || {};
  if (typeof lat !== 'number' || typeof lon !== 'number') {
    return res.status(400).json({ error: 'lat und lon muessen Zahlen sein.' });
  }
  db.prepare('UPDATE entries SET lat = ?, lon = ? WHERE id = ?').run(lat, lon, req.params.id);
  res.json({ id: Number(req.params.id), lat, lon });
});

// Erstellt aus einem Erfahrungsbericht per Claude API einen Blogbeitrags-Entwurf.
// Erfordert ANTHROPIC_API_KEY als Umgebungsvariable (nie im Frontend/Client verwenden).
// Feldnamen und -typen orientieren sich an config.yml (Decap/Netlify CMS): title, ort,
// datum (Anzeige, DD-MMM-YYYY), datum_sort (ISO), naechte, excerpt, hero_bild, fotos, body (Markdown).
// Einleitung des Blog-Prompts, in data/blog.json als "introDe" anpassbar.
const BLOG_INTRO_DE = BLOG_FILE.introDe || 'Du hilfst beim Schreiben eines persoenlichen Camping-Blogs. Schreibe aus den folgenden Stichpunkten zu einem Campingaufenthalt einen lockeren, persoenlichen Blogbeitrag auf Deutsch (Wir-Perspektive).';
const GERMAN_MONTHS_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

// Formatiert ein ISO-Datum (YYYY-MM-DD) als "12-Okt-2025".
function formatDdMmmYyyy(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  const day = String(d.getDate()).padStart(2, '0');
  const month = GERMAN_MONTHS_SHORT[d.getMonth()];
  return `${day}-${month}-${d.getFullYear()}`;
}

// Anzahl Naechte zwischen zwei ISO-Daten (mind. 0).
function naechteZwischen(vonIso, bisIso) {
  if (!vonIso || !bisIso) return null;
  const von = new Date(vonIso + 'T00:00:00');
  const bis = new Date(bisIso + 'T00:00:00');
  if (isNaN(von.getTime()) || isNaN(bis.getTime())) return null;
  const diff = Math.round((bis - von) / (1000 * 60 * 60 * 24));
  return diff >= 0 ? diff : null;
}

// Claude gibt in JSON-Feldern manchmal echte Zeilenumbrueche statt "\n" zurueck, was
// JSON.parse zum Scheitern bringt. Diese Funktion escaped Steuerzeichen, aber nur
// innerhalb von "..."-Strings (nicht ausserhalb, wo sie zur JSON-Formatierung gehoeren).
function escapeRawNewlinesInJsonStrings(text) {
  let result = '';
  let inString = false;
  let escapeNext = false;
  for (const char of text) {
    if (escapeNext) { result += char; escapeNext = false; continue; }
    if (char === '\\') { result += char; escapeNext = true; continue; }
    if (char === '"') { inString = !inString; result += char; continue; }
    if (inString && char === '\n') { result += '\\n'; continue; }
    if (inString && char === '\r') { result += '\\r'; continue; }
    if (inString && char === '\t') { result += '\\t'; continue; }
    result += char;
  }
  return result;
}

app.post('/api/entries/:id/blogpost', async (req, res) => {
  const row = db.prepare('SELECT * FROM entries WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Eintrag nicht gefunden.' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY ist auf dem Server nicht gesetzt.' });
  }

  const entry = attachPhotos(row);
  const lessonsText = (entry.lessons || []).map(l => `- ${l.text}`).join('\n') || 'keine';
  const tagsText = (entry.tags || []).join(', ') || 'keine';

  const fakten = [
    `Campingplatz: ${entry.campingplatz}`,
    entry.ort ? `Ort: ${entry.ort}` : null,
    `Zeitraum: ${entry.datum_von || '?'} bis ${entry.datum_bis || entry.datum_von || '?'}`,
    entry.wetter ? `Wetter: ${entry.wetter}` : null,
    entry.stellplatzgroesse ? `Stellplatzgroesse: ${entry.stellplatzgroesse}` : null,
    entry.kosten_pro_nacht != null ? `Kosten pro Nacht: ${getCurrency()} ${entry.kosten_pro_nacht}` : null,
    entry.kosten_restaurant != null ? `Kosten Restaurant: ${getCurrency()} ${entry.kosten_restaurant}` : null,
    entry.kosten_aktivitaeten != null ? `Kosten Aktivitaeten: ${getCurrency()} ${entry.kosten_aktivitaeten}` : null,
    entry.kilometerstand != null ? `Kilometerstand: ${entry.kilometerstand} km` : null,
    `Tags: ${tagsText}`,
    `Notizen: ${entry.notizen || 'keine'}`,
    `Lessons Learnt:\n${lessonsText}`
  ].filter(Boolean).join('\n');

  const prompt = `${BLOG_INTRO_DE} Erfinde keine zusaetzlichen Fakten, die nicht in den Stichpunkten stehen.

Wichtig: Der Fliesstext (Feld "body") darf HOECHSTENS 320 Woerter lang sein. Zaehle beim Schreiben mit und kuerze lieber, als das Limit zu ueberschreiten - eine unvollstaendige Antwort ist schlimmer als eine etwas knappere.

Antworte AUSSCHLIESSLICH mit einem einzigen validen JSON-Objekt, ohne Markdown-Codeblock (keine \`\`\`), ohne jeglichen Text davor oder danach. Das Objekt hat genau drei Felder:
- "title": ein kurzer, einladender Blogtitel (kein Klickbait, keine Anfuehrungszeichen im Titel selbst)
- "excerpt": ein bis zwei kurze Saetze als Teaser fuer die Startseiten-Karte
- "body": der eigentliche Blogtext in Markdown (Absaetze durch Leerzeilen getrennt, keine Ueberschriften, keine YAML-Syntax, keine Codebloecke), maximal 320 Woerter

Stichpunkte:
${fakten}`;

  try {
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
        max_tokens: 2500,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!apiRes.ok) {
      const errBody = await apiRes.text().catch(() => '');
      console.error('Anthropic API Fehler:', apiRes.status, errBody);
      return res.status(502).json({ error: 'Blogbeitrag konnte nicht erstellt werden (Fehler bei der Anthropic API).' });
    }

    const data = await apiRes.json();
    const rawText = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (!rawText) return res.status(502).json({ error: 'Leere Antwort von der Anthropic API.' });

    let parsed;
    try {
      const cleaned = rawText.replace(/^```json\s*|^```\s*|```$/gm, '').trim();
      parsed = JSON.parse(escapeRawNewlinesInJsonStrings(cleaned));
    } catch (parseErr) {
      console.error('Konnte Claude-Antwort nicht als JSON parsen:', rawText);
      if (data.stop_reason === 'max_tokens') {
        return res.status(502).json({ error: 'Die Antwort wurde mitten im Text abgeschnitten (zu lang fuer das Token-Limit). Bitte nochmal versuchen.' });
      }
      return res.status(502).json({ error: 'Antwort der Anthropic API hatte kein gueltiges JSON-Format.' });
    }
    if (!parsed.title || !parsed.body) {
      return res.status(502).json({ error: 'Antwort der Anthropic API war unvollstaendig (title/body fehlt).' });
    }

    // Gesamtkosten aus den Einzelposten des Berichts (Uebernachtung x Naechte + Restaurant + Aktivitaeten).
    const naechte = naechteZwischen(entry.datum_von, entry.datum_bis);
    const kostenGesamt = Math.round((
      (entry.kosten_pro_nacht != null ? entry.kosten_pro_nacht * (naechte || 1) : 0) +
      (entry.kosten_restaurant || 0) +
      (entry.kosten_aktivitaeten || 0)
    ) * 100) / 100;

    // Deterministische Felder aus den Berichtsdaten, nicht von Claude erfunden.
    const post = {
      title: parsed.title,
      campingplatz: entry.campingplatz || '',
      ort: entry.ort || '',
      datum: formatDdMmmYyyy(entry.datum_von),
      datum_sort: entry.datum_von || '',
      naechte,
      kosten_gesamt: kostenGesamt > 0 ? kostenGesamt : null,
      excerpt: parsed.excerpt || '',
      hero_bild: '',
      fotos: [],
      tags: entry.tags || [],
      body: parsed.body
    };

    res.json({ post });
  } catch (e) {
    console.error('Blogbeitrag-Generierung fehlgeschlagen:', e.message);
    res.status(500).json({ error: 'Blogbeitrag konnte nicht erstellt werden. Server nicht erreichbar?' });
  }
});

// Slug aus dem Titel fuer den Dateinamen (nur a-z, 0-9, Bindestriche).
function slugify(text) {
  return (text || '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'beitrag';
}

// Minimaler YAML-String-Quoter fuers Frontmatter (kein js-yaml als Abhaengigkeit noetig).
function yamlString(v) {
  const s = String(v ?? '');
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

// Baut eine Markdown-Datei mit YAML-Frontmatter gemaess config.yml (Decap/Netlify CMS):
// title, campingplatz, ort, datum, datum_sort, naechte, kosten_gesamt, excerpt, hero_bild,
// fotos, tags, body.
function buildMarkdownFile(post) {
  const lines = ['---'];
  lines.push(`title: ${yamlString(post.title)}`);
  lines.push(`campingplatz: ${yamlString(post.campingplatz)}`);
  lines.push(`ort: ${yamlString(post.ort)}`);
  lines.push(`datum: ${yamlString(post.datum)}`);
  // Wichtig: OHNE Anfuehrungszeichen, damit YAML das als echtes Datum parst (nicht als
  // String) - eleventy.config.js sortiert Posts per "b.data.datum_sort - a.data.datum_sort",
  // was nur mit echten Date-Objekten funktioniert, nicht mit Text.
  lines.push(`datum_sort: ${post.datum_sort || ''}`.trimEnd());
  if (post.naechte !== null && post.naechte !== undefined && post.naechte !== '') {
    lines.push(`naechte: ${Number(post.naechte)}`);
  }
  if (post.kosten_gesamt !== null && post.kosten_gesamt !== undefined && post.kosten_gesamt !== '') {
    lines.push(`kosten_gesamt: ${Number(post.kosten_gesamt)}`);
  }
  lines.push(`excerpt: ${yamlString(post.excerpt)}`);
  lines.push(`hero_bild: ${post.hero_bild ? yamlString(post.hero_bild) : ''}`.trimEnd());
  const fotos = Array.isArray(post.fotos) ? post.fotos : [];
  if (fotos.length > 0) {
    lines.push('fotos:');
    for (const f of fotos) {
      const pfad = typeof f === 'string' ? f : (f && f.foto) || '';
      lines.push(`  - foto: ${yamlString(pfad)}`);
    }
  } else {
    lines.push('fotos: []');
  }
  const tags = Array.isArray(post.tags) ? post.tags : [];
  if (tags.length > 0) {
    lines.push('tags:');
    for (const t of tags) lines.push(`  - ${yamlString(t)}`);
  } else {
    lines.push('tags: []');
  }
  lines.push('---');
  lines.push('');
  lines.push(post.body || '');
  lines.push('');
  return lines.join('\n');
}

// Lokale Bilddatei (aus uploads/) direkt via GitHub Contents API nach public/images/ hochladen.
// Gibt den public_folder-Pfad ("/images/dateiname.jpg") zurueck, den config.yml erwartet.
async function uploadImageToGithub(localFilename, ghHeaders) {
  const localPath = path.join(UPLOAD_DIR, localFilename);
  const bytes = fs.readFileSync(localPath);
  const targetRepoPath = `public/images/${localFilename}`;
  const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${targetRepoPath}`;

  let sha;
  const existingRes = await fetch(`${apiUrl}?ref=${GITHUB_BRANCH}`, { headers: ghHeaders });
  if (existingRes.ok) {
    const existingData = await existingRes.json();
    sha = existingData.sha;
  }

  const putRes = await fetch(apiUrl, {
    method: 'PUT',
    headers: { ...ghHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `Blog-Foto: ${localFilename}`,
      content: bytes.toString('base64'),
      branch: GITHUB_BRANCH,
      ...(sha ? { sha } : {})
    })
  });

  if (!putRes.ok) {
    const errBody = await putRes.text().catch(() => '');
    console.error('GitHub Foto-Upload Fehler:', putRes.status, errBody);
    throw new Error(`Foto ${localFilename} konnte nicht hochgeladen werden.`);
  }

  return `/images/${localFilename}`;
}

// ---------- Englische Fassung (seit v4.1) ----------
// Beim Publish wird der fertige deutsche Beitrag per Claude API ins Englische uebersetzt
// und unter gleichem Dateinamen nach src/en/posts/ geschrieben. Die Logik entspricht
// scripts/translate-posts.js im Blog-Repo (GitHub Action als Auffangnetz):
//  - englische Datei fehlt                             -> uebersetzen
//  - englische Datei von Hand bearbeitet               -> nie ueberschreiben
//  - automatisch uebersetzt, deutscher Text unveraendert -> nichts tun
//  - automatisch uebersetzt, deutscher Text geaendert    -> neu uebersetzen
// Erkannt wird das ueber source_hash und translation_hash im Frontmatter.

// Pruefsumme ueber die uebersetzbaren Felder. Muss mit contentHash() in
// scripts/translate-posts.js des Blogs uebereinstimmen.
function contentHash({ title, excerpt, tags, body }) {
  const normalized = JSON.stringify([
    String(title || '').trim(),
    String(excerpt || '').trim(),
    (Array.isArray(tags) ? tags : []).map(t => String(t).trim()),
    String(body || '').trim()
  ]);
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

// Frontmatter einer bestehenden englischen Datei lesen. Gibt null zurueck, wenn das
// Format nicht lesbar ist (dann wird die Datei sicherheitshalber nicht ueberschrieben).
function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text || '');
  if (!m) return null;
  try {
    const data = yaml.load(m[1]) || {};
    return { data, body: m[2] };
  } catch {
    return null;
  }
}

function buildEnglishMarkdownFile(t, sourceHash) {
  const lines = ['---'];
  lines.push(`title: ${JSON.stringify(t.title)}`);
  lines.push(`excerpt: ${JSON.stringify(t.excerpt || '')}`);
  if (Array.isArray(t.tags) && t.tags.length > 0) {
    lines.push('tags:');
    for (const tag of t.tags) lines.push(`  - ${JSON.stringify(tag)}`);
  }
  lines.push(`source_hash: ${JSON.stringify(sourceHash)}`);
  lines.push(`translation_hash: ${JSON.stringify(contentHash(t))}`);
  lines.push('---', '', String(t.body || '').trim(), '');
  return lines.join('\n');
}

// Uebersetzungs-Prompt fuer die englische Fassung, in data/blog.json als "translationPrompt"
// anpassbar (z.B. mit Angaben zu den Autoren und zum Fahrzeug).
const TRANSLATION_PROMPT = BLOG_FILE.translationPrompt || `Translate the following German blog post from a personal camping blog into natural British English.

Guidelines:
- Keep the relaxed, personal "we" tone. Write as a native speaker would, not word for word.
- Do not translate names of campsites, places, shops or people. Well-known English names may be used.
- Keep all amounts, dates and numbers unchanged; write dates like "7 August 2026" and keep currency codes.
- Keep the Markdown structure (paragraphs, headings, links) exactly as it is.
- Do not use em dashes or en dashes.
- Tags are short labels for campsite amenities; translate each one, capitalise the first letter.
- Do not add or omit any information.`;

const TRANSLATION_TOOL = {
  name: 'save_translation',
  description: 'Saves the English translation of the blog post.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      excerpt: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
      body: { type: 'string', description: 'Markdown body' }
    },
    required: ['title', 'excerpt', 'tags', 'body']
  }
};

// Uebersetzung per Tool-Aufruf: Claude liefert dabei garantiert ein Objekt, kein
// JSON im Fliesstext, das erst repariert werden muesste.
async function translatePostToEnglish(post) {
  const source = JSON.stringify({
    title: post.title || '', excerpt: post.excerpt || '', tags: post.tags || [], body: String(post.body || '').trim()
  }, null, 2);
  const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
      max_tokens: 6000,
      tools: [TRANSLATION_TOOL],
      tool_choice: { type: 'tool', name: TRANSLATION_TOOL.name },
      messages: [{ role: 'user', content: `${TRANSLATION_PROMPT}\n\nGerman post as JSON:\n${source}` }]
    })
  });
  if (!apiRes.ok) {
    const errBody = await apiRes.text().catch(() => '');
    throw new Error(`Anthropic API ${apiRes.status}: ${errBody.slice(0, 200)}`);
  }
  const data = await apiRes.json();
  const block = (data.content || []).find(b => b.type === 'tool_use');
  if (!block || !block.input || !block.input.title || !block.input.body) {
    throw new Error(`Unvollstaendige Uebersetzung (stop_reason: ${data.stop_reason})`);
  }
  return block.input;
}

// Schreibt (falls noetig) die englische Fassung ins Repo. Rueckgabe { status, path }:
// published | unchanged | manual | skipped. Fehler werden als Exception geworfen.
async function publishEnglishVersion(post, filename, ghHeaders) {
  if (!process.env.ANTHROPIC_API_KEY) return { status: 'skipped' };
  const filePath = `${GITHUB_EN_POSTS_PATH.replace(/\/+$/, '')}/${filename}`;
  const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${encodeURI(filePath)}`;
  const sourceHash = contentHash(post);

  let sha;
  const existingRes = await fetch(`${apiUrl}?ref=${GITHUB_BRANCH}`, { headers: ghHeaders });
  if (existingRes.ok) {
    const existing = await existingRes.json();
    sha = existing.sha;
    const current = parseFrontmatter(Buffer.from(existing.content || '', 'base64').toString('utf-8'));
    const untouched = current && current.data.translation_hash &&
      contentHash({ ...current.data, body: current.body }) === current.data.translation_hash;
    if (!untouched) return { status: 'manual', path: filePath };
    if (current.data.source_hash === sourceHash) return { status: 'unchanged', path: filePath };
  }

  const translation = await translatePostToEnglish(post);
  const markdown = buildEnglishMarkdownFile(translation, sourceHash);
  const putRes = await fetch(apiUrl, {
    method: 'PUT',
    headers: { ...ghHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `Blogpost (EN): ${translation.title}`,
      content: Buffer.from(markdown, 'utf-8').toString('base64'),
      branch: GITHUB_BRANCH,
      ...(sha ? { sha } : {})
    })
  });
  if (!putRes.ok) {
    const errBody = await putRes.text().catch(() => '');
    throw new Error(`GitHub ${putRes.status}: ${errBody.slice(0, 200)}`);
  }
  return { status: 'published', path: filePath };
}

// Laedt den (ggf. vom Nutzer nachbearbeiteten) Blogbeitrag als Markdown-Datei mit
// YAML-Frontmatter ins GitHub-Repo hoch (Format gemaess config.yml des Blogs).
// Optional werden vorher noch ausgewaehlte Fotos des Erfahrungsberichts direkt vom
// NAS-Dateisystem nach public/images/ hochgeladen (heroPhotoId, fotoIds) - die Bilder
// gehen dabei nie an die Anthropic API, nur der Server liest/schreibt Dateien.
app.post('/api/entries/:id/blogpost/publish', async (req, res) => {
  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    return res.status(500).json({ error: 'GITHUB_TOKEN ist auf dem Server nicht gesetzt.' });
  }
  if (!GITHUB_REPO) {
    return res.status(500).json({ error: 'Kein Blog-Repository konfiguriert (GITHUB_REPO oder data/blog.json).' });
  }
  const post = req.body?.post;
  if (!post || !post.title || !post.body) {
    return res.status(400).json({ error: 'Ungueltiger Blogbeitrag (title/body fehlt).' });
  }
  const { heroPhotoId, fotoIds } = req.body || {};

  const ghHeaders = {
    'Authorization': `Bearer ${githubToken}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'camping-diary-app'
  };

  try {
    // Nur Fotos, die tatsaechlich zu diesem Eintrag gehoeren (Sicherheitscheck).
    const entryPhotos = db.prepare('SELECT id, filename FROM photos WHERE entry_id = ?').all(req.params.id);
    const photoById = new Map(entryPhotos.map(p => [p.id, p.filename]));

    if (heroPhotoId && photoById.has(Number(heroPhotoId))) {
      post.hero_bild = await uploadImageToGithub(photoById.get(Number(heroPhotoId)), ghHeaders);
    }
    if (Array.isArray(fotoIds) && fotoIds.length > 0) {
      const fotos = [];
      for (const id of fotoIds) {
        const filename = photoById.get(Number(id));
        if (!filename) continue;
        const repoPath = await uploadImageToGithub(filename, ghHeaders);
        fotos.push({ foto: repoPath });
      }
      post.fotos = fotos;
    }

    const entryRow = db.prepare('SELECT datum_von FROM entries WHERE id = ?').get(req.params.id);
    const datePrefix = (entryRow && entryRow.datum_von) || post.datum_sort || new Date().toISOString().slice(0, 10);
    const filename = `${datePrefix}-${slugify(post.title)}.md`;
    const filePath = `${GITHUB_POSTS_PATH.replace(/\/+$/, '')}/${filename}`;
    const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`;

    // Falls die Datei schon existiert (z.B. erneutes Hochladen desselben Berichts),
    // braucht GitHub deren aktuelle sha, um sie zu ueberschreiben statt einen Fehler zu werfen.
    let sha;
    const existingRes = await fetch(`${apiUrl}?ref=${GITHUB_BRANCH}`, { headers: ghHeaders });
    if (existingRes.ok) {
      const existingData = await existingRes.json();
      sha = existingData.sha;
    }

    // Englische Fassung vor dem deutschen Commit schreiben: So findet die GitHub Action
    // des Blogs (die auf deutsche Commits reagiert) schon eine aktuelle Uebersetzung vor
    // und uebersetzt nicht doppelt. Fehler hier brechen den Publish nicht ab; die Action
    // liefert die Uebersetzung dann nach.
    let english;
    try {
      english = await publishEnglishVersion(post, filename, ghHeaders);
    } catch (e) {
      console.error('Englische Fassung fehlgeschlagen:', e.message);
      english = { status: 'error' };
    }

    const markdown = buildMarkdownFile(post);
    const contentBase64 = Buffer.from(markdown, 'utf-8').toString('base64');
    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: { ...ghHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Blogpost: ${post.title}`,
        content: contentBase64,
        branch: GITHUB_BRANCH,
        ...(sha ? { sha } : {})
      })
    });

    if (!putRes.ok) {
      const errBody = await putRes.text().catch(() => '');
      console.error('GitHub Upload Fehler:', putRes.status, errBody);
      return res.status(502).json({ error: 'Upload zu GitHub fehlgeschlagen (Antwort war nicht ok).' });
    }

    const putData = await putRes.json();
    res.json({ path: filePath, url: (putData.content && putData.content.html_url) || null, english });
  } catch (e) {
    console.error('GitHub Publish fehlgeschlagen:', e.message);
    res.status(500).json({ error: 'Upload zu GitHub fehlgeschlagen. Server nicht erreichbar?' });
  }
});

app.get('/api/lessons', (req, res) => {
  const rows = db.prepare(`
    SELECT lessons.*, entries.campingplatz, entries.datum_von
    FROM lessons LEFT JOIN entries ON entries.id = lessons.entry_id
    ORDER BY lessons.status ASC, lessons.created_at DESC
  `).all();
  res.json(rows);
});

app.post('/api/lessons', (req, res) => {
  const { text, entry_id, status } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: 'Text ist ein Pflichtfeld.' });
  const info = db.prepare('INSERT INTO lessons (entry_id, text, status) VALUES (?, ?, ?)')
    .run(entry_id || null, text.trim(), status === 'umgesetzt' ? 'umgesetzt' : 'offen');
  const row = db.prepare(`
    SELECT lessons.*, entries.campingplatz, entries.datum_von
    FROM lessons LEFT JOIN entries ON entries.id = lessons.entry_id
    WHERE lessons.id = ?
  `).get(info.lastInsertRowid);
  res.status(201).json(row);
});

app.put('/api/lessons/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM lessons WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Lesson nicht gefunden.' });
  const { text, status } = req.body || {};
  const newStatus = status !== undefined ? (status === 'umgesetzt' ? 'umgesetzt' : 'offen') : existing.status;
  let erledigtAm = existing.erledigt_am;
  if (newStatus === 'umgesetzt' && existing.status !== 'umgesetzt') {
    erledigtAm = new Date().toISOString().slice(0, 10);
  } else if (newStatus === 'offen') {
    erledigtAm = null;
  }
  db.prepare(`
    UPDATE lessons SET
      text = @text,
      status = @status,
      erledigt_am = @erledigt_am,
      updated_at = datetime('now')
    WHERE id = @id
  `).run({
    id: req.params.id,
    text: text !== undefined ? text : existing.text,
    status: newStatus,
    erledigt_am: erledigtAm
  });
  const row = db.prepare(`
    SELECT lessons.*, entries.campingplatz, entries.datum_von
    FROM lessons LEFT JOIN entries ON entries.id = lessons.entry_id
    WHERE lessons.id = ?
  `).get(req.params.id);
  res.json(row);
});

app.delete('/api/lessons/:id', (req, res) => {
  const info = db.prepare('DELETE FROM lessons WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Lesson nicht gefunden.' });
  res.status(204).send();
});

// --- Trip-Planung ---

function attachTripDetails(trip) {
  const items = db.prepare('SELECT * FROM trip_items WHERE trip_id = ? ORDER BY id').all(trip.id)
    .map(i => ({ ...i, checked: !!i.checked }));
  const meals = db.prepare('SELECT * FROM trip_meals WHERE trip_id = ? ORDER BY datum IS NULL, datum, id').all(trip.id);
  return { ...trip, items, meals };
}

app.get('/api/trips', (req, res) => {
  const rows = db.prepare('SELECT * FROM trips ORDER BY datum_von ASC, id DESC').all();
  res.json(rows.map(attachTripDetails));
});

// ICS-Kalenderexport aller Trips, zum Importieren oder Abonnieren in Apple Kalender/Google Kalender etc.
function icsEscape(text) {
  return String(text || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}
function icsDate(iso) {
  // ICS erwartet Ganztags-Termine im Format YYYYMMDD (VALUE=DATE).
  return (iso || '').replace(/-/g, '');
}
app.get('/api/trips.ics', (req, res) => {
  const trips = db.prepare('SELECT * FROM trips WHERE datum_von IS NOT NULL ORDER BY datum_von ASC').all();
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Camping-Diary//Trips//DE', 'CALSCALE:GREGORIAN'];
  for (const t of trips) {
    const start = t.datum_von;
    // DTEND bei Ganztags-Terminen ist exklusiv, deshalb bei fehlendem Enddatum einen Tag nach Start.
    const end = t.datum_bis || addDaysISO(t.datum_von, 1);
    const endExclusive = t.datum_bis ? addDaysISO(t.datum_bis, 1) : end;
    lines.push(
      'BEGIN:VEVENT',
      `UID:trip-${t.id}@camping-diary`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${icsDate(start)}`,
      `DTEND;VALUE=DATE:${icsDate(endExclusive)}`,
      `SUMMARY:${icsEscape(t.status && t.status !== 'bestaetigt' ? `${t.titel} (${t.status === 'idee' ? 'Idee' : 'angefragt'})` : t.titel)}`,
      t.ort ? `LOCATION:${icsEscape(t.ort)}` : null,
      t.notizen ? `DESCRIPTION:${icsEscape(t.notizen)}` : null,
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  const ics = lines.filter(Boolean).join('\r\n');
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="camping-trips.ics"');
  res.send(ics);
});

// Startort (Zuhause) fuer Fahrdistanz und km-Budget-Schaetzung, in den Einstellungen festgelegt.
function getHomeLocation() {
  const lat = Number(getSetting('home_lat'));
  const lon = Number(getSetting('home_lon'));
  if (!getSetting('home_lat') || !getSetting('home_lon') || isNaN(lat) || isNaN(lon)) return null;
  return { lat, lon, ort: getSetting('home_ort') || '', countryCode: getSetting('home_country_code') || '' };
}

// Nominatim erlaubt laut Nutzungsrichtlinie nur eine Anfrage pro Sekunde von derselben IP.
// Bei mehreren gleichzeitig ungecachten Orten (z.B. kumulierte km-Budget-Berechnung ueber
// mehrere Trips per Promise.all) muessen die tatsaechlichen Anfragen serialisiert werden,
// sonst liefert Nominatim bei Ueberschreitung oft stillschweigend ein leeres Ergebnis statt
// eines Fehlers zurueck.
let nominatimQueue = Promise.resolve();
function throttledNominatimFetch(url) {
  const run = nominatimQueue.then(async () => {
    const res = await fetch(url, { headers: { 'User-Agent': 'camping-diary-app' } });
    await new Promise(r => setTimeout(r, 1100));
    return res;
  });
  nominatimQueue = run.catch(() => {}); // Ein Fehler soll die Warteschlange nicht blockieren.
  return run;
}

// Erst im Land des Startorts suchen (praeziser fuer mehrdeutige Ortsnamen), bei leerem Ergebnis
// ohne Laender-Einschraenkung nochmal probieren (z.B. fuer Ziele im Ausland).
async function geocodeHomeCountryFirst(ort) {
  async function geocodeOnce(query, countryCode) {
    const cc = countryCode ? `&countrycodes=${encodeURIComponent(countryCode)}` : '';
    const geoUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1${cc}&q=${encodeURIComponent(query)}`;
    const geoRes = await throttledNominatimFetch(geoUrl);
    if (!geoRes.ok) return { error: 'Geocoding fehlgeschlagen.' };
    const geoData = await geoRes.json();
    if (!geoData || geoData.length === 0) return null;
    return {
      lat: Number(geoData[0].lat),
      lon: Number(geoData[0].lon),
      countryCode: geoData[0].address?.country_code || null
    };
  }
  const homeCountry = getSetting('home_country_code');
  let dest = homeCountry ? await geocodeOnce(ort, homeCountry) : null;
  if (dest && dest.error) return dest;
  if (!dest) dest = await geocodeOnce(ort);
  return dest;
}

// Hin-und-Rueckfahrt-km von Zuhause zu einem Ort, mit dauerhaftem DB-Cache (siehe geo_km_cache).
// Vermeidet wiederholte Nominatim/OSRM-Anfragen fuer denselben Ort ueber alle Trips/Sessions hinweg.
app.get('/api/route-km', async (req, res) => {
  const ort = (req.query.ort || '').trim();
  if (!ort) return res.status(400).json({ error: 'ort ist erforderlich.' });

  const home = getHomeLocation();
  if (!home) return res.status(409).json({ error: 'Startort ist noch nicht eingerichtet (Einstellungen).', code: 'home_missing' });

  const cached = db.prepare('SELECT km FROM geo_km_cache WHERE ort = ?').get(ort);
  if (cached) return res.json({ km: cached.km, cached: true });

  try {
    let dest = await geocodeHomeCountryFirst(ort);
    if (dest && dest.error) return res.status(502).json({ error: dest.error });
    if (!dest) return res.status(404).json({ error: 'Ort nicht gefunden.' });

    const routeUrl = `https://router.project-osrm.org/route/v1/driving/${home.lon},${home.lat};${dest.lon},${dest.lat}?overview=false`;
    const routeRes = await fetch(routeUrl);
    if (!routeRes.ok) return res.status(502).json({ error: 'Routenberechnung fehlgeschlagen.' });
    const routeData = await routeRes.json();
    const meters = routeData.routes?.[0]?.distance;
    if (meters == null) return res.status(502).json({ error: 'Routenberechnung fehlgeschlagen.' });

    const km = Math.round(meters / 1000) * 2; // Hin- und Rueckfahrt
    db.prepare('INSERT OR REPLACE INTO geo_km_cache (ort, km) VALUES (?, ?)').run(ort, km);
    res.json({ km, cached: false });
  } catch (e) {
    console.error('route-km fehlgeschlagen:', e.message);
    res.status(500).json({ error: 'Distanz konnte nicht berechnet werden.' });
  }
});

// Laendercode zu einem Ort, mit dauerhaftem DB-Cache (siehe ort_country_cache), fuer die
// kleine Flaggen-Anzeige neben dem Ort in Trip und Erfahrungsbericht.
app.get('/api/ort-country', async (req, res) => {
  const ort = (req.query.ort || '').trim();
  if (!ort) return res.status(400).json({ error: 'ort ist erforderlich.' });

  const cached = db.prepare('SELECT country_code FROM ort_country_cache WHERE ort = ?').get(ort);
  if (cached) return res.json({ country_code: cached.country_code, cached: true });

  try {
    const dest = await geocodeHomeCountryFirst(ort);
    if (dest && dest.error) return res.status(502).json({ error: dest.error });
    const countryCode = dest?.countryCode || null;
    db.prepare('INSERT OR REPLACE INTO ort_country_cache (ort, country_code) VALUES (?, ?)').run(ort, countryCode);
    res.json({ country_code: countryCode, cached: false });
  } catch (e) {
    console.error('ort-country fehlgeschlagen:', e.message);
    res.status(500).json({ error: 'Laendercode konnte nicht ermittelt werden.' });
  }
});

// Distanz zweier Koordinaten in km (Luftlinie, Haversine) - nur fuer die Anzeige "ca. X km entfernt".
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

// Points of Interest (Restaurants und Badis/Freibaeder) rund um einen Trip-Zielort, per
// Overpass API (OpenStreetMap). Dauerhaft pro Ort gecacht (siehe poi_cache), da Overpass ein
// geteilter, oeffentlicher Dienst ist und nicht fuer haeufige Wiederholungsanfragen gedacht ist.
app.get('/api/poi', async (req, res) => {
  const ort = (req.query.ort || '').trim();
  if (!ort) return res.status(400).json({ error: 'ort ist erforderlich.' });

  const cached = db.prepare('SELECT poi_json FROM poi_cache WHERE ort = ?').get(ort);
  if (cached) return res.json({ pois: JSON.parse(cached.poi_json), cached: true });

  try {
    const dest = await geocodeHomeCountryFirst(ort);
    if (dest && dest.error) return res.status(502).json({ error: dest.error });
    if (!dest) return res.status(404).json({ error: 'Ort nicht gefunden.' });

    const radius = 5000; // Meter
    // node UND way: Restaurants sind fast immer Punkte (node), Badis/Freibaeder aber oft als
    // Flaeche (way) erfasst - "out center" liefert bei Flaechen die Koordinaten unter .center.
    const tagFilters = [
      '["amenity"="restaurant"]',
      '["leisure"="swimming_area"]',
      '["leisure"="bathing_place"]',
      '["leisure"="swimming_pool"]["access"!="private"]',
      '["leisure"="beach_resort"]',
      '["natural"="beach"]'
    ];
    const clauses = tagFilters.map(f =>
      `node${f}(around:${radius},${dest.lat},${dest.lon});\n      way${f}(around:${radius},${dest.lat},${dest.lon});`
    ).join('\n      ');
    const query = `[out:json][timeout:25];(\n      ${clauses}\n    );out center 60;`;

    const overpassRes = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', 'User-Agent': 'camping-diary-app' },
      body: query
    });
    if (!overpassRes.ok) return res.status(502).json({ error: 'Points of Interest konnten nicht geladen werden.' });
    const data = await overpassRes.json();

    const pois = (data.elements || [])
      .filter(el => el.tags?.name)
      .map(el => {
        const typ = el.tags.amenity === 'restaurant' ? 'restaurant' : 'badi';
        // Nodes haben lat/lon direkt, Ways/Relations (mit "out center") unter .center.
        const lat = el.lat != null ? el.lat : el.center?.lat;
        const lon = el.lon != null ? el.lon : el.center?.lon;
        return { name: el.tags.name, typ, lat, lon, distanzKm: Math.round(haversineKm(dest.lat, dest.lon, lat, lon) * 10) / 10 };
      })
      .filter(p => p.lat != null && p.lon != null)
      .sort((a, b) => a.distanzKm - b.distanzKm)
      .slice(0, 25);

    db.prepare('INSERT OR REPLACE INTO poi_cache (ort, poi_json) VALUES (?, ?)').run(ort, JSON.stringify(pois));
    res.json({ pois, cached: false });
  } catch (e) {
    console.error('poi fehlgeschlagen:', e.message);
    res.status(500).json({ error: 'Points of Interest konnten nicht geladen werden.' });
  }
});

app.get('/api/trips/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Trip nicht gefunden.' });
  res.json(attachTripDetails(row));
});

app.post('/api/trips', (req, res) => {
  const { titel, ort, datum_von, datum_bis, notizen, status, buchungsfenster_datum } = req.body || {};
  if (!titel || !titel.trim()) return res.status(400).json({ error: 'Titel ist ein Pflichtfeld.' });
  const info = db.prepare(`
    INSERT INTO trips (titel, ort, datum_von, datum_bis, notizen, status, buchungsfenster_datum) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(titel.trim(), ort || null, datum_von || null, datum_bis || null, notizen || null,
    validTripStatus(status, 'bestaetigt'), buchungsfenster_datum || null);
  const tripId = info.lastInsertRowid;

  const packingTemplates = db.prepare("SELECT text FROM templates WHERE category = 'packliste' ORDER BY id").all();
  const todoTemplates = db.prepare("SELECT text FROM templates WHERE category = 'trip_todo' ORDER BY id").all();
  const insertItem = db.prepare('INSERT INTO trip_items (trip_id, type, text) VALUES (?, ?, ?)');
  for (const t of packingTemplates) insertItem.run(tripId, 'packliste', t.text);
  for (const t of todoTemplates) insertItem.run(tripId, 'todo', t.text);

  const row = db.prepare('SELECT * FROM trips WHERE id = ?').get(tripId);
  res.status(201).json(attachTripDetails(row));
});

app.put('/api/trips/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Trip nicht gefunden.' });
  const b = req.body || {};
  db.prepare(`
    UPDATE trips SET
      titel = @titel, ort = @ort, datum_von = @datum_von, datum_bis = @datum_bis,
      notizen = @notizen, status = @status, buchungsfenster_datum = @buchungsfenster_datum,
      updated_at = datetime('now')
    WHERE id = @id
  `).run({
    id: req.params.id,
    titel: b.titel ?? existing.titel,
    ort: b.ort ?? existing.ort,
    datum_von: b.datum_von ?? existing.datum_von,
    datum_bis: b.datum_bis ?? existing.datum_bis,
    notizen: b.notizen ?? existing.notizen,
    status: validTripStatus(b.status, existing.status || 'bestaetigt'),
    buchungsfenster_datum: b.buchungsfenster_datum !== undefined ? (b.buchungsfenster_datum || null) : existing.buchungsfenster_datum
  });
  const row = db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id);
  res.json(attachTripDetails(row));
});

app.delete('/api/trips/:id', (req, res) => {
  const info = db.prepare('DELETE FROM trips WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Trip nicht gefunden.' });
  res.status(204).send();
});

// --- Wunschliste (Campingplaetze, die wir in Zukunft besuchen wollen) ---

app.get('/api/wishlist', (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM wishlist_campsites
    ORDER BY (buchungsfenster_datum IS NULL), buchungsfenster_datum ASC, id DESC
  `).all();
  res.json(rows);
});

app.post('/api/wishlist', (req, res) => {
  const { name, ort, buchungsfenster_datum, min_naechte, link, notizen } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name ist ein Pflichtfeld.' });
  const info = db.prepare(`
    INSERT INTO wishlist_campsites (name, ort, buchungsfenster_datum, min_naechte, link, notizen)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(name.trim(), ort || null, buchungsfenster_datum || null, validMinNaechte(min_naechte), link || null, notizen || null);
  const row = db.prepare('SELECT * FROM wishlist_campsites WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(row);
});

app.put('/api/wishlist/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM wishlist_campsites WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Eintrag nicht gefunden.' });
  const { name, ort, buchungsfenster_datum, min_naechte, link, notizen } = req.body || {};
  if (name !== undefined && !name.trim()) return res.status(400).json({ error: 'Name ist ein Pflichtfeld.' });
  db.prepare(`
    UPDATE wishlist_campsites SET
      name = @name, ort = @ort, buchungsfenster_datum = @buchungsfenster_datum, min_naechte = @min_naechte,
      link = @link, notizen = @notizen, updated_at = datetime('now')
    WHERE id = @id
  `).run({
    id: req.params.id,
    name: name !== undefined ? name.trim() : existing.name,
    ort: ort !== undefined ? (ort || null) : existing.ort,
    buchungsfenster_datum: buchungsfenster_datum !== undefined ? (buchungsfenster_datum || null) : existing.buchungsfenster_datum,
    min_naechte: min_naechte !== undefined ? validMinNaechte(min_naechte) : existing.min_naechte,
    link: link !== undefined ? (link || null) : existing.link,
    notizen: notizen !== undefined ? (notizen || null) : existing.notizen
  });
  const row = db.prepare('SELECT * FROM wishlist_campsites WHERE id = ?').get(req.params.id);
  res.json(row);
});

app.delete('/api/wishlist/:id', (req, res) => {
  const info = db.prepare('DELETE FROM wishlist_campsites WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Eintrag nicht gefunden.' });
  res.status(204).send();
});

app.post('/api/trips/:id/items', (req, res) => {
  const trip = db.prepare('SELECT id FROM trips WHERE id = ?').get(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip nicht gefunden.' });
  const { type, text } = req.body || {};
  if (!type || !text || !text.trim()) return res.status(400).json({ error: 'Typ und Text sind Pflichtfelder.' });
  const info = db.prepare('INSERT INTO trip_items (trip_id, type, text) VALUES (?, ?, ?)')
    .run(req.params.id, type, text.trim());
  const row = db.prepare('SELECT * FROM trip_items WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ ...row, checked: !!row.checked });
});

app.put('/api/trip-items/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM trip_items WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Eintrag nicht gefunden.' });
  const { text, checked } = req.body || {};
  db.prepare('UPDATE trip_items SET text = @text, checked = @checked WHERE id = @id').run({
    id: req.params.id,
    text: text !== undefined ? text : existing.text,
    checked: checked !== undefined ? (checked ? 1 : 0) : existing.checked
  });
  const row = db.prepare('SELECT * FROM trip_items WHERE id = ?').get(req.params.id);
  res.json({ ...row, checked: !!row.checked });
});

app.delete('/api/trip-items/:id', (req, res) => {
  const info = db.prepare('DELETE FROM trip_items WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Eintrag nicht gefunden.' });
  res.status(204).send();
});

app.post('/api/trips/:id/meals', (req, res) => {
  const trip = db.prepare('SELECT id FROM trips WHERE id = ?').get(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip nicht gefunden.' });
  const { tag_label, datum, text } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: 'Text ist ein Pflichtfeld.' });
  const info = db.prepare('INSERT INTO trip_meals (trip_id, tag_label, datum, text) VALUES (?, ?, ?, ?)')
    .run(req.params.id, tag_label || null, datum || null, text.trim());
  const row = db.prepare('SELECT * FROM trip_meals WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(row);
});

app.put('/api/trip-meals/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM trip_meals WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Mahlzeit nicht gefunden.' });
  const { text, tag_label, datum } = req.body || {};
  db.prepare('UPDATE trip_meals SET text = @text, tag_label = @tag_label, datum = @datum WHERE id = @id').run({
    id: req.params.id,
    text: text !== undefined ? text : existing.text,
    tag_label: tag_label !== undefined ? tag_label : existing.tag_label,
    datum: datum !== undefined ? datum : existing.datum
  });
  const row = db.prepare('SELECT * FROM trip_meals WHERE id = ?').get(req.params.id);
  res.json(row);
});

app.delete('/api/trip-meals/:id', (req, res) => {
  const info = db.prepare('DELETE FROM trip_meals WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Mahlzeit nicht gefunden.' });
  res.status(204).send();
});

// --- Vorlagen (Standard-Packliste, Standard-To-dos fuer Trips und Erfahrungsberichte) ---
// category: 'packliste' | 'trip_todo' | 'entry_todo'

app.get('/api/templates/:category', (req, res) => {
  res.json(db.prepare('SELECT * FROM templates WHERE category = ? ORDER BY id').all(req.params.category));
});

app.post('/api/templates/:category', (req, res) => {
  const { text } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: 'Text ist ein Pflichtfeld.' });
  const info = db.prepare('INSERT INTO templates (category, text) VALUES (?, ?)').run(req.params.category, text.trim());
  res.status(201).json(db.prepare('SELECT * FROM templates WHERE id = ?').get(info.lastInsertRowid));
});

app.delete('/api/templates/:id', (req, res) => {
  const info = db.prepare('DELETE FROM templates WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Vorlage nicht gefunden.' });
  res.status(204).send();
});

// --- To-dos pro Erfahrungsbericht ---

app.post('/api/entries/:id/todos', (req, res) => {
  const entry = db.prepare('SELECT id FROM entries WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Eintrag nicht gefunden.' });
  const { text } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: 'Text ist ein Pflichtfeld.' });
  const info = db.prepare('INSERT INTO entry_todos (entry_id, text) VALUES (?, ?)').run(req.params.id, text.trim());
  const row = db.prepare('SELECT * FROM entry_todos WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ ...row, checked: !!row.checked });
});

app.put('/api/entry-todos/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM entry_todos WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'To-do nicht gefunden.' });
  const { text, checked } = req.body || {};
  db.prepare('UPDATE entry_todos SET text = @text, checked = @checked WHERE id = @id').run({
    id: req.params.id,
    text: text !== undefined ? text : existing.text,
    checked: checked !== undefined ? (checked ? 1 : 0) : existing.checked
  });
  const row = db.prepare('SELECT * FROM entry_todos WHERE id = ?').get(req.params.id);
  res.json({ ...row, checked: !!row.checked });
});

app.delete('/api/entry-todos/:id', (req, res) => {
  const info = db.prepare('DELETE FROM entry_todos WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'To-do nicht gefunden.' });
  res.status(204).send();
});

// --- Kilometerstand ---

function getKmAnchor() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'km_anchor_datum'").get();
  const anchorDate = row ? row.value : '2000-01-01'; // ohne Einstellung: Kalenderjahr
  const [, m, d] = anchorDate.split('-').map(Number);
  return { month: m, day: d, raw: anchorDate };
}

function computeKmPeriod(readings, budget) {
  const { month, day } = getKmAnchor();
  const now = new Date();
  let startYear = now.getFullYear();
  const anchorThisYear = new Date(startYear, month - 1, day);
  if (now < anchorThisYear) startYear -= 1;
  const periodStart = new Date(startYear, month - 1, day);
  const periodEnd = new Date(startYear + 1, month - 1, day);
  // Lokal formatieren statt toISOString(): sonst rutscht der Stichtag in Zeitzonen vor UTC
  // auf den Vortag.
  const localIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const periodStartStr = localIso(periodStart);
  const periodEndStr = localIso(periodEnd);

  const inPeriod = readings.filter(r => r.datum && r.datum >= periodStartStr && r.datum < periodEndStr);
  const beforePeriod = readings.filter(r => r.datum && r.datum < periodStartStr);

  let startKm = null;
  if (inPeriod.length > 0) {
    startKm = Math.min(...inPeriod.map(r => r.km));
    if (beforePeriod.length > 0) {
      const lastBefore = beforePeriod[beforePeriod.length - 1].km;
      if (lastBefore < startKm) startKm = lastBefore;
    }
  } else if (beforePeriod.length > 0) {
    startKm = beforePeriod[beforePeriod.length - 1].km;
  }

  const latestKm = readings.length > 0 ? readings[readings.length - 1].km : null;
  const kmThisPeriod = (startKm != null && latestKm != null) ? Math.max(0, latestKm - startKm) : 0;

  const dayOfPeriod = Math.ceil((now - periodStart) / 86400000) + 1;
  const totalDaysInPeriod = Math.ceil((periodEnd - periodStart) / 86400000);
  const expectedByNow = Math.round((budget * dayOfPeriod) / totalDaysInPeriod);

  return {
    periodStart: periodStartStr,
    periodEnd: periodEndStr,
    kmThisPeriod,
    remaining: Math.max(0, budget - kmThisPeriod),
    expectedByNow,
    onTrack: kmThisPeriod <= expectedByNow,
    latestKm
  };
}

app.get('/api/odometer', (req, res) => {
  const readings = db.prepare(`
    SELECT odometer_readings.*, entries.campingplatz
    FROM odometer_readings LEFT JOIN entries ON entries.id = odometer_readings.entry_id
    ORDER BY datum ASC, id ASC
  `).all();

  const budgetRow = db.prepare("SELECT value FROM settings WHERE key = 'km_budget_jahr'").get();
  const budget = budgetRow ? Number(budgetRow.value) : 15000;
  const period = computeKmPeriod(readings, budget);
  const startbestandRow = db.prepare("SELECT value FROM settings WHERE key = 'km_startbestand'").get();
  const kmStartbestand = startbestandRow ? Number(startbestandRow.value) : 0;

  res.json({
    readings,
    budget,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    kmThisYear: period.kmThisPeriod,
    remaining: period.remaining,
    expectedByNow: period.expectedByNow,
    onTrack: period.onTrack,
    latestKm: period.latestKm,
    kmStartbestand
  });
});

app.post('/api/odometer', (req, res) => {
  const { datum, km, note } = req.body || {};
  if (!datum || !km) return res.status(400).json({ error: 'Datum und Kilometerstand sind Pflichtfelder.' });
  const info = db.prepare('INSERT INTO odometer_readings (datum, km, note) VALUES (?, ?, ?)')
    .run(datum, Number(km), note || null);
  res.status(201).json(db.prepare('SELECT * FROM odometer_readings WHERE id = ?').get(info.lastInsertRowid));
});

app.delete('/api/odometer/:id', (req, res) => {
  const info = db.prepare('DELETE FROM odometer_readings WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Ablesung nicht gefunden.' });
  res.status(204).send();
});

app.get('/api/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const map = {};
  for (const r of rows) map[r.key] = r.value;
  res.json(map);
});

app.put('/api/settings/:key', (req, res) => {
  const { value } = req.body || {};
  if (value === undefined || value === null) {
    return res.status(400).json({ error: 'Ungueltiger Wert.' });
  }
  if (value === '') {
    db.prepare('DELETE FROM settings WHERE key = ?').run(req.params.key);
    return res.json({ key: req.params.key, value: null });
  }
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(req.params.key, String(value));
  res.json({ key: req.params.key, value: String(value) });
});

// Startort per Ortsname festlegen: wird einmal geocodiert, Koordinaten und Land werden in den
// Einstellungen gespeichert. Der Distanz-Cache gilt nur fuer den alten Startort und wird geleert.
app.put('/api/home-location', async (req, res) => {
  const ort = String((req.body || {}).ort || '').trim();
  if (!ort) return res.status(400).json({ error: 'Bitte einen Ort angeben.' });
  try {
    const geoUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&q=${encodeURIComponent(ort)}`;
    const geoRes = await throttledNominatimFetch(geoUrl);
    if (!geoRes.ok) return res.status(502).json({ error: 'Ortssuche fehlgeschlagen.' });
    const geoData = await geoRes.json();
    if (!geoData || geoData.length === 0) return res.status(404).json({ error: 'Ort nicht gefunden.' });
    const hit = geoData[0];
    const values = {
      home_ort: ort,
      home_lat: String(Number(hit.lat)),
      home_lon: String(Number(hit.lon)),
      home_country_code: (hit.address && hit.address.country_code) || ''
    };
    const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    db.transaction(() => {
      for (const [k, v] of Object.entries(values)) {
        if (v) upsert.run(k, v);
        else db.prepare('DELETE FROM settings WHERE key = ?').run(k);
      }
      db.prepare('DELETE FROM geo_km_cache').run();
    })();
    res.json({ ...values, display_name: hit.display_name || ort });
  } catch (e) {
    console.error('Startort konnte nicht gesetzt werden:', e.message);
    res.status(502).json({ error: 'Ortssuche fehlgeschlagen. Server ohne Internet?' });
  }
});

// --- Schul- und Feiertage (OpenHolidays API, openholidaysapi.org) ---
// Laender aus der Einstellung holiday_countries (z.B. "CH,DE,AT"), sonst CH, DE und AT. Pro Land,
// Jahr und Sprache wird die Antwort zwischengespeichert; ist der Dienst nicht erreichbar, werden
// die zuletzt gespeicherten Daten verwendet.
const HOLIDAY_DEFAULT_COUNTRIES = ['CH', 'DE', 'AT'];
const HOLIDAY_MAX_AGE_DAYS = 30;

function holidayCountries() {
  const raw = getSetting('holiday_countries');
  if (raw === null || raw === undefined) return HOLIDAY_DEFAULT_COUNTRIES;
  return raw.split(',').map(c => c.trim().toUpperCase()).filter(c => /^[A-Z]{2}$/.test(c));
}

function holidayText(names, lang) {
  if (!Array.isArray(names) || names.length === 0) return '';
  const hit = names.find(n => (n.language || '').toUpperCase() === lang) || names[0];
  return hit.text || '';
}

// Kanton bzw. Bundesland aus einem Unterteilungs-Code: "CH-AI-AP" -> "CH-AI", "DE-BY" -> "DE-BY".
function topRegion(code) {
  const parts = String(code || '').split('-');
  return parts.length >= 2 ? `${parts[0]}-${parts[1]}` : String(code || '');
}

async function fetchHolidayKind(country, year, kind, lang) {
  const cacheKind = `${kind}-${lang}`;
  const cached = db.prepare('SELECT data_json, fetched_at FROM holiday_cache WHERE country = ? AND year = ? AND kind = ?')
    .get(country, year, cacheKind);
  const fresh = cached && (Date.now() - new Date(cached.fetched_at.replace(' ', 'T') + 'Z').getTime()) < HOLIDAY_MAX_AGE_DAYS * 86400000;
  if (fresh) return JSON.parse(cached.data_json);
  const base = 'https://openholidaysapi.org';
  const url = kind === 'subdivisions'
    ? `${base}/Subdivisions?countryIsoCode=${country}&languageIsoCode=${lang}`
    : `${base}/${kind === 'school' ? 'SchoolHolidays' : 'PublicHolidays'}?countryIsoCode=${country}&languageIsoCode=${lang}&validFrom=${year}-01-01&validTo=${year}-12-31`;
  try {
    const r = await fetch(url, { headers: { accept: 'application/json', 'User-Agent': 'camping-diary-app' }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (!Array.isArray(data)) throw new Error('unerwartetes Format');
    db.prepare(`INSERT INTO holiday_cache (country, year, kind, data_json, fetched_at) VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(country, year, kind) DO UPDATE SET data_json = excluded.data_json, fetched_at = excluded.fetched_at`)
      .run(country, year, cacheKind, JSON.stringify(data));
    return data;
  } catch (e) {
    console.error(`Ferien ${country} ${year} ${kind} nicht geladen:`, e.message);
    return cached ? JSON.parse(cached.data_json) : null;
  }
}

app.get('/api/holidays', async (req, res) => {
  const year = Number(req.query.year);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return res.status(400).json({ error: 'Ungueltiger Wert.' });
  const lang = getSetting('language') === 'en' ? 'EN' : 'DE';
  const countries = holidayCountries();
  const result = { year, countries: [], regionTotals: {}, school: [], public: [], missing: [] };
  for (const country of countries) {
    const [school, pub, subs] = await Promise.all([
      fetchHolidayKind(country, year, 'school', lang),
      fetchHolidayKind(country, year, 'public', lang),
      fetchHolidayKind(country, 0, 'subdivisions', lang)
    ]);
    if (!school && !pub) { result.missing.push(country); continue; }
    result.countries.push(country);
    // Anzahl Kantone bzw. Bundeslaender; ohne Unterteilungsliste die in den Ferien vorkommenden.
    const topCodes = new Set((subs || []).map(s => topRegion(s.code)).filter(Boolean));
    if (topCodes.size === 0) (school || []).forEach(h => (h.subdivisions || []).forEach(s => topCodes.add(topRegion(s.code))));
    result.regionTotals[country] = topCodes.size || 1;
    for (const h of school || []) {
      const regions = Array.from(new Set((h.subdivisions || []).map(s => topRegion(s.code)).filter(Boolean)));
      result.school.push({
        country, start: h.startDate, end: h.endDate, name: holidayText(h.name, lang),
        nationwide: Boolean(h.nationwide), regions
      });
    }
    for (const h of pub || []) {
      if (h.regionalScope === 'Local') continue;
      const regions = Array.from(new Set((h.subdivisions || []).map(s => topRegion(s.code)).filter(Boolean)));
      result.public.push({
        country, start: h.startDate, end: h.endDate, name: holidayText(h.name, lang),
        nationwide: Boolean(h.nationwide), regions
      });
    }
  }
  res.json(result);
});

// Welche optionalen Module auf diesem Server eingerichtet sind; die App blendet den Rest aus.
app.get('/api/features', (req, res) => {
  res.json({
    blog: BLOG_ENABLED,
    tls: Boolean(process.env.TLS_CERT_FILE && process.env.TLS_KEY_FILE)
  });
});

// --- Datenexport (Backup) ---

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n;]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

app.get('/api/export', (req, res) => {
  const format = req.query.format === 'csv' ? 'csv' : 'json';
  const dateStamp = new Date().toISOString().slice(0, 10);

  if (format === 'csv') {
    const entries = db.prepare('SELECT * FROM entries ORDER BY datum_von ASC').all();
    const columns = [
      'id', 'campingplatz', 'ort', 'datum_von', 'datum_bis', 'bewertung', 'wetter',
      'kosten_pro_nacht', 'kosten_restaurant', 'kosten_aktivitaeten', 'stellplatzgroesse',
      'kilometerstand', 'tags', 'lessons_learnt', 'notizen'
    ];
    const lines = [columns.join(';')];
    for (const e of entries) {
      lines.push(columns.map(c => csvEscape(c === 'tags' ? e.tags : e[c])).join(';'));
    }
    const filename = `camping-diary-eintraege-${dateStamp}.csv`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send('\uFEFF' + lines.join('\n'));
    return;
  }

  const dump = {
    exported_at: new Date().toISOString(),
    entries: db.prepare('SELECT * FROM entries').all().map(attachPhotos),
    trips: db.prepare('SELECT * FROM trips').all().map(attachTripDetails),
    templates: db.prepare('SELECT * FROM templates').all(),
    odometer_readings: db.prepare('SELECT * FROM odometer_readings').all(),
    vehicle_events: db.prepare('SELECT * FROM vehicle_events').all(),
    vehicle_todos: db.prepare('SELECT * FROM vehicle_todos').all(),
    finance_items: db.prepare('SELECT * FROM finance_items').all(),
    settings: db.prepare('SELECT * FROM settings').all()
  };
  const filename = `camping-diary-export-${dateStamp}.json`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(dump, null, 2));
});

// --- Fahrzeug-Verwaltung ---

app.get('/api/vehicle-events', (req, res) => {
  res.json(db.prepare('SELECT * FROM vehicle_events ORDER BY datum DESC, id DESC').all());
});

app.post('/api/vehicle-events', (req, res) => {
  const { datum, typ, titel, beschreibung, kosten, km_stand } = req.body || {};
  if (!datum || !typ || !titel || !titel.trim()) {
    return res.status(400).json({ error: 'Datum, Typ und Titel sind Pflichtfelder.' });
  }
  const info = db.prepare(`
    INSERT INTO vehicle_events (datum, typ, titel, beschreibung, kosten, km_stand)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(datum, typ, titel.trim(), beschreibung || null, kosten ? Number(kosten) : null, km_stand ? Number(km_stand) : null);
  res.status(201).json(db.prepare('SELECT * FROM vehicle_events WHERE id = ?').get(info.lastInsertRowid));
});

app.put('/api/vehicle-events/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM vehicle_events WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Eintrag nicht gefunden.' });
  const b = req.body || {};
  db.prepare(`
    UPDATE vehicle_events SET
      datum = @datum, typ = @typ, titel = @titel, beschreibung = @beschreibung,
      kosten = @kosten, km_stand = @km_stand
    WHERE id = @id
  `).run({
    id: req.params.id,
    datum: b.datum ?? existing.datum,
    typ: b.typ ?? existing.typ,
    titel: b.titel ?? existing.titel,
    beschreibung: b.beschreibung ?? existing.beschreibung,
    kosten: b.kosten !== undefined ? (b.kosten ? Number(b.kosten) : null) : existing.kosten,
    km_stand: b.km_stand !== undefined ? (b.km_stand ? Number(b.km_stand) : null) : existing.km_stand
  });
  res.json(db.prepare('SELECT * FROM vehicle_events WHERE id = ?').get(req.params.id));
});

app.delete('/api/vehicle-events/:id', (req, res) => {
  const info = db.prepare('DELETE FROM vehicle_events WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Eintrag nicht gefunden.' });
  res.status(204).send();
});

app.get('/api/vehicle-todos', (req, res) => {
  const rows = db.prepare('SELECT * FROM vehicle_todos ORDER BY checked ASC, id DESC').all();
  res.json(rows.map(r => ({ ...r, checked: !!r.checked })));
});

app.post('/api/vehicle-todos', (req, res) => {
  const { text, typ, beschreibung, kosten, km_stand } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: 'Text ist ein Pflichtfeld.' });
  const validTyp = ['tanken', 'laden', 'service', 'reparatur', 'nachruestung', 'sonstiges'].includes(typ) ? typ : 'sonstiges';
  const info = db.prepare('INSERT INTO vehicle_todos (text, typ, beschreibung, kosten, km_stand) VALUES (?, ?, ?, ?, ?)')
    .run(text.trim(), validTyp, beschreibung || null, kosten ? Number(kosten) : null, km_stand ? Number(km_stand) : null);
  const row = db.prepare('SELECT * FROM vehicle_todos WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ ...row, checked: !!row.checked });
});

app.put('/api/vehicle-todos/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM vehicle_todos WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'To-do nicht gefunden.' });
  const b = req.body || {};
  const validTyp = ['tanken', 'laden', 'service', 'reparatur', 'nachruestung', 'sonstiges'].includes(b.typ) ? b.typ : existing.typ;
  db.prepare(`
    UPDATE vehicle_todos SET
      text = @text, typ = @typ, beschreibung = @beschreibung, kosten = @kosten,
      km_stand = @km_stand, checked = @checked
    WHERE id = @id
  `).run({
    id: req.params.id,
    text: b.text !== undefined ? b.text : existing.text,
    typ: validTyp,
    beschreibung: b.beschreibung !== undefined ? b.beschreibung : existing.beschreibung,
    kosten: b.kosten !== undefined ? (b.kosten ? Number(b.kosten) : null) : existing.kosten,
    km_stand: b.km_stand !== undefined ? (b.km_stand ? Number(b.km_stand) : null) : existing.km_stand,
    checked: b.checked !== undefined ? (b.checked ? 1 : 0) : existing.checked
  });
  const row = db.prepare('SELECT * FROM vehicle_todos WHERE id = ?').get(req.params.id);
  res.json({ ...row, checked: !!row.checked });
});

app.delete('/api/vehicle-todos/:id', (req, res) => {
  const info = db.prepare('DELETE FROM vehicle_todos WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'To-do nicht gefunden.' });
  res.status(204).send();
});

app.post('/api/vehicle-todos/:id/complete', (req, res) => {
  const existing = db.prepare('SELECT * FROM vehicle_todos WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'To-do nicht gefunden.' });
  const heute = new Date().toISOString().slice(0, 10);
  const info = db.prepare(`
    INSERT INTO vehicle_events (datum, typ, titel, beschreibung, kosten, km_stand)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(heute, existing.typ || 'sonstiges', existing.text, existing.beschreibung, existing.kosten, existing.km_stand);
  db.prepare('DELETE FROM vehicle_todos WHERE id = ?').run(req.params.id);
  res.status(201).json(db.prepare('SELECT * FROM vehicle_events WHERE id = ?').get(info.lastInsertRowid));
});

// --- KPI-Uebersicht ---

app.get('/api/kpis', (req, res) => {
  const entries = db.prepare('SELECT * FROM entries').all();
  const readings = db.prepare('SELECT * FROM odometer_readings ORDER BY datum ASC').all();

  let totalNights = 0;
  let totalUebernachtung = 0;
  let totalRestaurant = 0;
  let totalAktivitaeten = 0;
  let ratingSum = 0;
  let ratingCount = 0;
  const tagCounts = {};

  for (const e of entries) {
    let nights = 0;
    if (e.datum_von && e.datum_bis) {
      const a = new Date(e.datum_von + 'T00:00:00');
      const b = new Date(e.datum_bis + 'T00:00:00');
      nights = Math.max(0, Math.round((b - a) / 86400000));
      totalNights += nights;
    }
    if (e.kosten_pro_nacht) totalUebernachtung += e.kosten_pro_nacht * nights;
    if (e.kosten_restaurant) totalRestaurant += e.kosten_restaurant;
    if (e.kosten_aktivitaeten) totalAktivitaeten += e.kosten_aktivitaeten;
    if (e.bewertung) { ratingSum += e.bewertung; ratingCount += 1; }
    let tags = [];
    try { tags = e.tags ? JSON.parse(e.tags) : []; } catch { tags = []; }
    for (const t of tags) tagCounts[t] = (tagCounts[t] || 0) + 1;
  }

  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([tag, count]) => ({ tag, count }));
  const totalCost = totalUebernachtung + totalRestaurant + totalAktivitaeten;

  const budgetRow = db.prepare("SELECT value FROM settings WHERE key = 'km_budget_jahr'").get();
  const budget = budgetRow ? Number(budgetRow.value) : 15000;
  const period = computeKmPeriod(readings, budget);

  const treibstoffRow = db.prepare(`
    SELECT COALESCE(SUM(kosten), 0) AS total FROM vehicle_events WHERE typ IN ('tanken', 'laden')
  `).get();
  const kmStartRow = db.prepare("SELECT value FROM settings WHERE key = 'km_startbestand'").get();
  const kmStart = kmStartRow ? Number(kmStartRow.value) : 0;
  const latestKm = readings.length > 0 ? readings[readings.length - 1].km : null;
  const totalKmDriven = latestKm != null ? latestKm - kmStart : null;
  const treibstoffKostenProKm = (totalKmDriven && totalKmDriven > 0)
    ? Math.round((treibstoffRow.total / totalKmDriven) * 100) / 100
    : null;

  // Konsolidierter Schnellzugriff auf offene Einkaeufe und Pre-Trip-To-dos, ueber alle Trips hinweg.
  const einkaufOffen = db.prepare(`
    SELECT trip_items.id, trip_items.text, trips.id AS trip_id, trips.titel AS trip_titel
    FROM trip_items JOIN trips ON trips.id = trip_items.trip_id
    WHERE trip_items.type = 'einkauf' AND trip_items.checked = 0
    ORDER BY trips.datum_von ASC, trip_items.id ASC
  `).all();
  const todoOffen = db.prepare(`
    SELECT trip_items.id, trip_items.text, trips.id AS trip_id, trips.titel AS trip_titel
    FROM trip_items JOIN trips ON trips.id = trip_items.trip_id
    WHERE trip_items.type = 'todo' AND trip_items.checked = 0
    ORDER BY trips.datum_von ASC, trip_items.id ASC
  `).all();

  res.json({
    stopps: entries.length,
    naechte: totalNights,
    ausgabenTotal: Math.round(totalCost * 100) / 100,
    ausgabenUebernachtung: Math.round(totalUebernachtung * 100) / 100,
    ausgabenRestaurant: Math.round(totalRestaurant * 100) / 100,
    ausgabenAktivitaeten: Math.round(totalAktivitaeten * 100) / 100,
    ausgabenProNacht: totalNights > 0 ? Math.round((totalUebernachtung / totalNights) * 100) / 100 : null,
    bewertungDurchschnitt: ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 10) / 10 : null,
    topTags,
    einkaufOffen,
    todoOffen,
    kmThisYear: period.kmThisPeriod,
    kmBudget: budget,
    kmPeriodEnd: period.periodEnd,
    treibstoffKostenProKm
  });
});

// --- Alle Trip-Items eines Typs, ueber alle Trips (fuer die Einkaufsliste/To-dos-Kacheln,
// die erledigte Punkte durchgestrichen weiter anzeigen statt sie zu entfernen) ---

app.get('/api/trip-items/:type', (req, res) => {
  const rows = db.prepare(`
    SELECT trip_items.id, trip_items.text, trip_items.checked, trip_items.type,
           trips.id AS trip_id, trips.titel AS trip_titel
    FROM trip_items JOIN trips ON trips.id = trip_items.trip_id
    WHERE trip_items.type = ?
    ORDER BY trips.datum_von ASC, trip_items.checked ASC, trip_items.id ASC
  `).all(req.params.type);
  res.json(rows.map(r => ({ ...r, checked: !!r.checked })));
});

// --- Finanzen ---

app.get('/api/finance-items', (req, res) => {
  res.json(db.prepare('SELECT * FROM finance_items ORDER BY id').all());
});

app.post('/api/finance-items', (req, res) => {
  const { bezeichnung, betrag, typ, kategorie, faellig_datum, max_perioden } = req.body || {};
  if (!bezeichnung || !bezeichnung.trim() || betrag == null || isNaN(Number(betrag))) {
    return res.status(400).json({ error: 'Bezeichnung und Betrag sind Pflichtfelder.' });
  }
  const validTyp = ['monatlich', 'jaehrlich', 'einmalig'].includes(typ) ? typ : 'einmalig';
  const validKategorie = ['fahrzeug', 'camping', 'sonstiges'].includes(kategorie) ? kategorie : 'fahrzeug';
  const info = db.prepare('INSERT INTO finance_items (bezeichnung, betrag, typ, kategorie, faellig_datum, max_perioden) VALUES (?, ?, ?, ?, ?, ?)')
    .run(bezeichnung.trim(), Number(betrag), validTyp, validKategorie, faellig_datum || null, max_perioden ? Number(max_perioden) : null);
  res.status(201).json(db.prepare('SELECT * FROM finance_items WHERE id = ?').get(info.lastInsertRowid));
});

app.put('/api/finance-items/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM finance_items WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Eintrag nicht gefunden.' });
  const b = req.body || {};
  const validTyp = ['monatlich', 'jaehrlich', 'einmalig'].includes(b.typ) ? b.typ : existing.typ;
  const validKategorie = ['fahrzeug', 'camping', 'sonstiges'].includes(b.kategorie) ? b.kategorie : existing.kategorie;
  db.prepare('UPDATE finance_items SET bezeichnung = @bezeichnung, betrag = @betrag, typ = @typ, kategorie = @kategorie, faellig_datum = @faellig_datum, max_perioden = @max_perioden WHERE id = @id').run({
    id: req.params.id,
    bezeichnung: b.bezeichnung !== undefined ? b.bezeichnung.trim() : existing.bezeichnung,
    betrag: b.betrag !== undefined ? Number(b.betrag) : existing.betrag,
    typ: validTyp,
    kategorie: validKategorie,
    faellig_datum: b.faellig_datum !== undefined ? (b.faellig_datum || null) : existing.faellig_datum,
    max_perioden: b.max_perioden !== undefined ? (b.max_perioden ? Number(b.max_perioden) : null) : existing.max_perioden
  });
  res.json(db.prepare('SELECT * FROM finance_items WHERE id = ?').get(req.params.id));
});

app.delete('/api/finance-items/:id', (req, res) => {
  const info = db.prepare('DELETE FROM finance_items WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Eintrag nicht gefunden.' });
  res.status(204).send();
});

// Berechnet, wie viel von einem Fixkosten-Posten bis heute effektiv angefallen ist,
// basierend auf Typ und Faelligkeitsdatum (Start- bzw. Ankerdatum fuer Wiederholungen).
function computeAccrued(item, todayStr) {
  const today = new Date(todayStr + 'T00:00:00');
  if (!item.faellig_datum) {
    // Kein Datum hinterlegt: Einmalig gilt als bereits angefallen (Altverhalten), sonst 0.
    return item.typ === 'einmalig' ? item.betrag : 0;
  }
  const start = new Date(item.faellig_datum + 'T00:00:00');
  if (item.typ === 'einmalig') {
    return start <= today ? item.betrag : 0;
  }
  if (start > today) return 0;
  let occurrences = 0;
  const cursor = new Date(start);
  if (item.typ === 'monatlich') {
    while (cursor <= today) { occurrences++; cursor.setMonth(cursor.getMonth() + 1); }
  } else if (item.typ === 'jaehrlich') {
    while (cursor <= today) { occurrences++; cursor.setFullYear(cursor.getFullYear() + 1); }
  } else {
    return 0;
  }
  if (item.max_perioden) occurrences = Math.min(occurrences, item.max_perioden);
  return occurrences * item.betrag;
}

app.get('/api/finance-summary', (req, res) => {
  const entries = db.prepare('SELECT kosten_pro_nacht, kosten_restaurant, kosten_aktivitaeten, datum_von, datum_bis FROM entries').all();
  let ausgabenUebernachtung = 0, ausgabenRestaurant = 0, ausgabenAktivitaeten = 0;
  for (const e of entries) {
    let nights = 0;
    if (e.datum_von && e.datum_bis) {
      const a = new Date(e.datum_von + 'T00:00:00');
      const b = new Date(e.datum_bis + 'T00:00:00');
      nights = Math.max(0, Math.round((b - a) / 86400000));
    }
    if (e.kosten_pro_nacht) ausgabenUebernachtung += e.kosten_pro_nacht * nights;
    if (e.kosten_restaurant) ausgabenRestaurant += e.kosten_restaurant;
    if (e.kosten_aktivitaeten) ausgabenAktivitaeten += e.kosten_aktivitaeten;
  }

  const serviceRow = db.prepare(`
    SELECT COALESCE(SUM(kosten), 0) AS total FROM vehicle_events WHERE typ IN ('service', 'reparatur')
  `).get();
  const treibstoffRow = db.prepare(`
    SELECT COALESCE(SUM(kosten), 0) AS total FROM vehicle_events WHERE typ IN ('tanken', 'laden')
  `).get();
  const nachruestungRow = db.prepare(`
    SELECT COALESCE(SUM(kosten), 0) AS total FROM vehicle_events WHERE typ = 'nachruestung'
  `).get();

  const today = new Date().toISOString().slice(0, 10);
  const financeItems = db.prepare('SELECT * FROM finance_items ORDER BY id').all()
    .map(item => ({ ...item, accrued: Math.round(computeAccrued(item, today) * 100) / 100 }));

  res.json({
    ausgabenUebernachtung: Math.round(ausgabenUebernachtung * 100) / 100,
    ausgabenRestaurant: Math.round(ausgabenRestaurant * 100) / 100,
    ausgabenAktivitaeten: Math.round(ausgabenAktivitaeten * 100) / 100,
    fahrzeugServiceKosten: Math.round(serviceRow.total * 100) / 100,
    fahrzeugTreibstoffKosten: Math.round(treibstoffRow.total * 100) / 100,
    fahrzeugNachruestungKosten: Math.round(nachruestungRow.total * 100) / 100,
    financeItems
  });
});

// Liefert die einzelnen Buchungen, aus denen sich eine der automatisch berechneten
// Finanzen-Kategorien zusammensetzt (Datum, Notiz, Betrag) - dieselbe Berechnungslogik wie
// in /api/finance-summary, damit die Summe der Detailzeilen immer exakt der angezeigten
// Kategorie-Summe entspricht.
app.get('/api/finance-summary/details', (req, res) => {
  const category = (req.query.category || '').trim();
  const vehicleCategories = {
    treibstoff: ['tanken', 'laden'],
    service: ['service', 'reparatur'],
    nachruestung: ['nachruestung']
  };

  if (vehicleCategories[category]) {
    const rows = db.prepare(`
      SELECT datum, titel, beschreibung, kosten FROM vehicle_events
      WHERE typ IN (${vehicleCategories[category].map(() => '?').join(',')}) AND kosten IS NOT NULL AND kosten != 0
      ORDER BY datum DESC
    `).all(...vehicleCategories[category]);
    return res.json({
      transactions: rows.map(r => ({
        datum: r.datum,
        notiz: r.beschreibung ? `${r.titel} – ${r.beschreibung}` : r.titel,
        betrag: r.kosten
      }))
    });
  }

  if (['uebernachtung', 'restaurant', 'aktivitaeten'].includes(category)) {
    const entries = db.prepare('SELECT campingplatz, kosten_pro_nacht, kosten_restaurant, kosten_aktivitaeten, datum_von, datum_bis FROM entries').all();
    const transactions = [];
    for (const e of entries) {
      let nights = 0;
      if (e.datum_von && e.datum_bis) {
        const a = new Date(e.datum_von + 'T00:00:00');
        const b = new Date(e.datum_bis + 'T00:00:00');
        nights = Math.max(0, Math.round((b - a) / 86400000));
      }
      let betrag = null;
      if (category === 'uebernachtung' && e.kosten_pro_nacht) betrag = e.kosten_pro_nacht * nights;
      if (category === 'restaurant' && e.kosten_restaurant) betrag = e.kosten_restaurant;
      if (category === 'aktivitaeten' && e.kosten_aktivitaeten) betrag = e.kosten_aktivitaeten;
      if (betrag) transactions.push({ datum: e.datum_von, notiz: e.campingplatz, betrag });
    }
    transactions.sort((a, b) => (b.datum || '').localeCompare(a.datum || ''));
    return res.json({ transactions });
  }

  res.status(400).json({ error: 'Unbekannte Kategorie.' });
});

app.listen(PORT, () => {
  console.log(`Camping-Tagebuch API läuft auf Port ${PORT} (HTTP)`);
});

// Optionaler HTTPS-Server, falls ein Tailscale-Zertifikat hinterlegt ist.
const TLS_CERT_FILE = process.env.TLS_CERT_FILE;
const TLS_KEY_FILE = process.env.TLS_KEY_FILE;
const TLS_PORT = process.env.TLS_PORT || 4443;

if (TLS_CERT_FILE && TLS_KEY_FILE) {
  try {
    const https = require('https');
    const options = {
      cert: fs.readFileSync(TLS_CERT_FILE),
      key: fs.readFileSync(TLS_KEY_FILE)
    };
    https.createServer(options, app).listen(TLS_PORT, () => {
      console.log(`Camping-Tagebuch API läuft auf Port ${TLS_PORT} (HTTPS)`);
    });
  } catch (e) {
    console.error('HTTPS konnte nicht gestartet werden, Zertifikat/Key nicht lesbar:', e.message);
  }
} else {
  console.log('Kein TLS_CERT_FILE/TLS_KEY_FILE gesetzt, HTTPS ist deaktiviert.');
}
