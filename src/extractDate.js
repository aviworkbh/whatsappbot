// extractDate.js
// Extracts a date from a free-text message, in many formats, and returns
// a valid native JavaScript Date object.

// ==== dictionaries (built once at module load, not on every call) ====

// Gregorian month names as commonly written in Hebrew, including common
// alternate/partial spellings (e.g. "נובמר", "נומבר" for נובמבר).
const MONTH_NAMES = {
  'ינואר': 1, 'פברואר': 2, 'מרץ': 3, 'אפריל': 4, 'מאי': 5, 'יוני': 6,
  'יולי': 7, 'אוגוסט': 8, 'ספטמבר': 9, 'אוקטובר': 10,
  'נובמבר': 11, 'נובמר': 11, 'נומבר': 11,
  'דצמבר': 12,
};

// Ordinal number words (1st, 2nd, 3rd...), used both for "the Nth day"
// (e.g. "השלישי") and for "the Nth month" (e.g. "לרביעי" = "of the 4th month").
const ORDINAL_WORDS = {
  'ראשון': 1, 'שני': 2, 'שלישי': 3, 'רביעי': 4, 'חמישי': 5, 'שישי': 6,
  'שביעי': 7, 'שמיני': 8, 'תשיעי': 9, 'עשירי': 10,
  'אחד עשר': 11, 'שנים עשר': 12, 'שלושה עשר': 13, 'ארבעה עשר': 14,
  'חמישה עשר': 15, 'שישה עשר': 16, 'שבעה עשר': 17, 'שמונה עשר': 18,
  'תשעה עשר': 19, 'עשרים': 20,
  'עשרים ואחד': 21, 'עשרים ושניים': 22, 'עשרים ושלושה': 23,
  'עשרים וארבעה': 24, 'עשרים וחמישה': 25, 'עשרים ושישה': 26,
  'עשרים ושבעה': 27, 'עשרים ושמונה': 28, 'עשרים ותשעה': 29,
  'שלושים': 30, 'שלושים ואחד': 31,
};

// Cardinal ("counting") number words for day-of-month (1-31), auto-generated
// to cover every common combination - so there's no difference between
// masculine/feminine forms or full/defective spelling: "שלוש"="שלושה",
// "חמישה עשר"="חמש עשרה"="חמשה עשר", "עשרים ושניים"="עשרים ושנים", etc.
const ONES_VARIANTS = {
  1: ['אחד', 'אחת'],
  2: ['שניים', 'שני', 'שנים', 'שתיים', 'שתי', 'שתים'],
  3: ['שלושה', 'שלוש'],
  4: ['ארבעה', 'ארבע'],
  5: ['חמישה', 'חמשה', 'חמש'],
  6: ['שישה', 'שש'],
  7: ['שבעה', 'שבע'],
  8: ['שמונה'],
  9: ['תשעה', 'תשע'],
};

function buildNumberWords() {
  const dict = {};

  for (const [n, variants] of Object.entries(ONES_VARIANTS)) {
    for (const v of variants) dict[v] = Number(n);
  }

  dict['עשרה'] = 10;
  dict['עשר'] = 10;

  for (const [n, variants] of Object.entries(ONES_VARIANTS)) {
    for (const v of variants) {
      dict[`${v} עשר`] = 10 + Number(n);
      dict[`${v} עשרה`] = 10 + Number(n);
    }
  }

  dict['עשרים'] = 20;

  for (const [n, variants] of Object.entries(ONES_VARIANTS)) {
    for (const v of variants) {
      dict[`עשרים ו${v}`] = 20 + Number(n);
    }
  }

  dict['שלושים'] = 30;

  for (const v of ONES_VARIANTS[1]) {
    dict[`שלושים ו${v}`] = 31;
  }

  return dict;
}

const NUMBER_WORDS = buildNumberWords();

// ==== regex helpers (built once) ====

const toAlternation = (dict) =>
  Object.keys(dict)
    .sort((a, b) => b.length - a.length)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');

const ORDINAL_PATTERN = toAlternation(ORDINAL_WORDS);
const MONTH_NAME_PATTERN = toAlternation(MONTH_NAMES);
const NUMBER_WORDS_PATTERN = toAlternation(NUMBER_WORDS);

// A "day" token can be plain digits, a cardinal number word, or an ordinal word
const DAY_TOKEN_PATTERN = `(?:\\d{1,2}|${NUMBER_WORDS_PATTERN}|${ORDINAL_PATTERN})`;

// Optional "ב"/"ה" prefix before the day, with optional space/dash after it
// (so "ב30", "ב 30" and "ב-30" all match)
const DAY_PREFIX = '(?:[הב]-?\\s*)?';

const NUMERIC_DATE_REGEX = /\b(\d{1,2})[./\-](\d{1,2})(?:[./\-](\d{2,4}))?\b/;
const NAMED_MONTH_REGEX = new RegExp(
  `${DAY_PREFIX}(${DAY_TOKEN_PATTERN})\\s*[בל]-?\\s*(${MONTH_NAME_PATTERN})(?:\\s+(\\d{4}))?`
);
const ORDINAL_MONTH_REGEX = new RegExp(
  `${DAY_PREFIX}(${DAY_TOKEN_PATTERN})\\s*ל-?\\s*(${ORDINAL_PATTERN})(?![\\u05D0-\\u05EA])`
);
// Day + "ל" + numeric month (no month name): "30 ל 11", "ב30 ל11"
const NUMERIC_MONTH_CONNECTOR_REGEX = new RegExp(
  `${DAY_PREFIX}(${DAY_TOKEN_PATTERN})\\s*ל-?\\s*(\\d{1,2})\\b(?:\\s+(\\d{4}))?`
);

// Converts a matched day token ("5", "שלושה", "חמישי"...) into a number
function dayTokenToNumber(token) {
  if (/^\d+$/.test(token)) return parseInt(token, 10);
  if (NUMBER_WORDS[token] !== undefined) return NUMBER_WORDS[token];
  return ORDINAL_WORDS[token];
}

const stripTime = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

// ==== builds the final Date, completing a missing year ====
function buildDate(day, month, year, referenceDate) {
  if (!day || !month || day < 1 || day > 31 || month < 1 || month > 12) return null;

  let fullYear = year;
  if (fullYear === undefined || fullYear === null) {
    fullYear = referenceDate.getFullYear();
  } else if (fullYear < 100) {
    fullYear += 2000;
  }

  const date = new Date(fullYear, month - 1, day, 0, 0, 0, 0);

  if ((year === undefined || year === null) && date.getTime() < stripTime(referenceDate)) {
    date.setFullYear(fullYear + 1);
  }

  return date;
}

/**
 * Extracts a date from a free-text message. Tries several formats in order
 * and returns the first valid match as a native Date object, or null.
 */
function extractDateFromText(text, referenceDate = new Date()) {
  if (!text || typeof text !== 'string') return null;

  // 1. Numeric: 25/02/26, 23.11.2026, 22.11 ...
  let match = NUMERIC_DATE_REGEX.exec(text);
  if (match) {
    const result = buildDate(
      parseInt(match[1], 10),
      parseInt(match[2], 10),
      match[3] ? parseInt(match[3], 10) : undefined,
      referenceDate
    );
    if (result) return result;
  }

  // 2. Day + Gregorian month name: "ראשון לינואר", "8 ליולי", "ב20 לנומבר"
  match = NAMED_MONTH_REGEX.exec(text);
  if (match) {
    const result = buildDate(
      dayTokenToNumber(match[1]),
      MONTH_NAMES[match[2]],
      match[3] ? parseInt(match[3], 10) : undefined,
      referenceDate
    );
    if (result) return result;
  }

  // 3. Day + ordinal month word: "השלישי לרביעי", "בחמישי לשני"
  match = ORDINAL_MONTH_REGEX.exec(text);
  if (match) {
    const month = ORDINAL_WORDS[match[2]];
    if (month && month <= 12) {
      const result = buildDate(dayTokenToNumber(match[1]), month, undefined, referenceDate);
      if (result) return result;
    }
  }

  // 4. Day + numeric month (no month name): "30 ל 11", "ב30 ל11", "בשלושים ל11"
  match = NUMERIC_MONTH_CONNECTOR_REGEX.exec(text);
  if (match) {
    const result = buildDate(
      dayTokenToNumber(match[1]),
      parseInt(match[2], 10),
      match[3] ? parseInt(match[3], 10) : undefined,
      referenceDate
    );
    if (result) return result;
  }

  return null;
}

function formatDateForUser(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) {
    throw new Error('formatDateForUser received an invalid date: ' + date);
  }

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

  return `${day}/${month}/${year}`;
}

// Converts a Date object into an ISO 8601 string - safe for storage,
// and always parseable back correctly by `new Date(...)`.
function formatDateISO(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) {
    throw new Error('formatDateISO received an invalid date: ' + date);
  }
  return d.toISOString();
}

module.exports = { extractDateFromText, formatDateForUser, formatDateISO };
