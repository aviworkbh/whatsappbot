// storage.js
// אחראי על שמירה/טעינה של רשימת ההודעות המתוזמנות לקובץ JSON,
// כדי שהתזמונים לא ייעלמו אם השרת נופל או מופעל מחדש.
//
// פונקציות ציבוריות:
//   loadAll()            - טוענת את כל ההודעות המתוזמנות
//   addScheduled(entry)  - מוסיפה הודעה מתוזמנת חדשה
//   updateScheduled(id, changes) - מעדכנת שדות בהודעה קיימת לפי id
//   removeScheduled(id)  - מוחקת הודעה מתוזמנת לפי id

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'scheduled.json');

// ==== שכבת תשתית - קריאה/כתיבה גולמית לקובץ ====

// ודא שהתיקייה והקובץ קיימים
function ensureStorage() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2), 'utf8');
  }
}

// טוענת את כל ההודעות המתוזמנות (מערך גולמי מהקובץ)
function loadAll() {
  ensureStorage();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (err) {
    console.error('שגיאה בקריאת קובץ האחסון, מתחיל עם רשימה ריקה:', err);
    return [];
  }
}

// שומרת מערך שלם בחזרה לקובץ (מחליפה את כל התוכן הקיים)
function saveAll(items) {
  ensureStorage();
  fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2), 'utf8');
}

// מייצרת מזהה ייחודי חדש להודעה מתוזמנת
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ממירה תאריך (Date או מחרוזת) למפתח יום קלנדרי בפורמט "YYYY-MM-DD",
// כדי להשוות תאריכים בלי להתחשב בשעה/דקה/שנייה
function toDateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ==== פעולות ציבוריות ====

/**
 * מוסיפה הודעה מתוזמנת חדשה.
 * @param {object} entry - פרטי ההודעה (chatId, text, sendAt וכו')
 * @returns {object} הרשומה המלאה שנוצרה, כולל id ו-createdAt
 */
function addScheduled(entry) {
  const items = loadAll();

  const record = {
    id: generateId(),
    ...entry,
    createdAt: new Date().toISOString(),
  };

  items.push(record);
  saveAll(items);

  return record;
}

/**
 * מעדכנת שדות בהודעה מתוזמנת קיימת (למשל שינוי תאריך שליחה או תוכן ההודעה).
 * @param {string} id - מזהה ההודעה שרוצים לעדכן
 * @param {object} changes - אובייקט עם השדות שרוצים לשנות, למשל { sendAt: '...' }
 * @returns {object|null} הרשומה המעודכנת, או null אם לא נמצאה הודעה עם ה-id הזה
 */
function updateScheduled(id, changes) {
  const items = loadAll();
  const index = items.findIndex((item) => item.id === id);

  if (index === -1) {
    console.warn(`updateScheduled: לא נמצאה הודעה מתוזמנת עם id=${id}`);
    return null;
  }

  const updatedRecord = {
    ...items[index],
    ...changes,
    id, // לוודא שה-id לא נדרס בטעות ע"י changes
    updatedAt: new Date().toISOString(),
  };

  items[index] = updatedRecord;
  saveAll(items);

  return updatedRecord;
}

/**
 * מוחקת הודעה מתוזמנת לפי id (למשל אחרי ששליחתה בוצעה).
 * @param {string} id - מזהה ההודעה שרוצים למחוק
 * @returns {boolean} true אם נמחקה רשומה בפועל, false אם לא נמצאה
 */
function removeScheduled(id) {
  const items = loadAll();
  const filtered = items.filter((item) => item.id !== id);

  const wasRemoved = filtered.length !== items.length;
  if (wasRemoved) {
    saveAll(filtered);
  } else {
    console.warn(`removeScheduled: לא נמצאה הודעה מתוזמנת עם id=${id}`);
  }

  return wasRemoved;
}

/**
 * שולפת הודעה מתוזמנת בודדת לפי id (עוזר קטן, נוח לבדיקות/דיבוג).
 * @param {string} id
 * @returns {object|null}
 */
function getById(id) {
  const items = loadAll();
  return items.find((item) => item.id === id) || null;
}

/**
 * שולפת את כל ההודעות המתוזמנות שה-sendAt שלהן נופל על תאריך נתון
 * (משווה לפי יום קלנדרי בלבד - השעה לא משנה).
 * זו הפונקציה המרכזית לתזרים של "בדיקה יומית": קוראים לה עם תאריך היום,
 * ומקבלים בחזרה את כל ההודעות שצריך לשלוח היום.
 *
 * @param {Date|string} [date] - התאריך לבדיקה. ברירת מחדל: היום (עכשיו).
 * @returns {object[]} מערך של רשומות מתאימות (יכול להיות ריק)
 */
function getByDate(date = new Date()) {
  const targetKey = toDateKey(date);
  if (!targetKey) return [];

  return loadAll().filter((item) => toDateKey(item.sendAt) === targetKey);
}

/**
 * מוחקת את כל ההודעות המתוזמנות שה-sendAt שלהן נופל על תאריך נתון.
 * שימושי אחרי ששלחתם את כל ההודעות של היום, כדי לנקות אותן מהקובץ.
 *
 * @param {Date|string} [date] - התאריך למחיקה. ברירת מחדל: היום (עכשיו).
 * @returns {number} כמות הרשומות שנמחקו
 */
function removeByDate(date = new Date()) {
  const targetKey = toDateKey(date);
  if (!targetKey) return 0;

  const items = loadAll();
  const remaining = items.filter((item) => toDateKey(item.sendAt) !== targetKey);
  const removedCount = items.length - remaining.length;

  if (removedCount > 0) {
    saveAll(remaining);
  }

  return removedCount;
}

module.exports = {
  loadAll,
  saveAll,
  addScheduled,
  updateScheduled,
  removeScheduled,
  getById,
  getByDate,
  removeByDate,
};