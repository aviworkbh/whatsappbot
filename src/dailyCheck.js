// dailyCheck.js
// מפעיל בדיקה יומית בשעה 08:00: בודק אם יש הודעות מתוזמנות ליום הנוכחי
// (לפי שדה sendAt במאגר הנתונים), ואם כן שולח כל אחת מהן לקבוצה המתאימה
// לפי chatId, ואז מנקה אותן מהאחסון.

const schedule = require('node-schedule');
const storage = require('./storage');

/**
 * בודקת אם קיימות הודעות מתוזמנות שה-sendAt שלהן חל היום, ושולחת כל אחת מהן
 * לקבוצה המתאימה (לפי chatId). לאחר השליחה, ההודעות שנשלחו נמחקות מהאחסון.
 *
 * @param {import('whatsapp-web.js').Client} client - מופע לקוח וואטסאפ מחובר
 */
async function checkAndSendTodayMessages(client) {
  const todayMessages = storage.getByDate(new Date());

  if (todayMessages.length === 0) {
    console.log('[daily-check] אין הודעות מתוזמנות להיום.');
    return;
  }

  console.log(`[daily-check] נמצאו ${todayMessages.length} הודעות לשליחה היום.`);

  for (const item of todayMessages) {
    try {
      await client.sendMessage(item.chatId, item.text);
      console.log(`[daily-check] נשלחה הודעה ל-${item.chatId}: "${item.text}"`);
    } catch (err) {
      console.error(`[daily-check] שגיאה בשליחת הודעה ל-${item.chatId}:`, err);
    }
  }

  const removedCount = storage.removeByDate(new Date());
  console.log(`[daily-check] נוקו ${removedCount} הודעות מהאחסון.`);
}

/**
 * מתזמנת את checkAndSendTodayMessages לרוץ אוטומטית כל יום בשעה 08:00.
 * יש לקרוא לפונקציה הזו פעם אחת, אחרי שהלקוח (client) כבר מחובר (באירוע 'ready').
 *
 * @param {import('whatsapp-web.js').Client} client - מופע לקוח וואטסאפ מחובר
 */
function startDailyCheck(client) {
  // כלל cron: "דקה שעה יום-בחודש חודש יום-בשבוע" -> 0 8 * * * = כל יום ב-08:00
  const rule = '0 8 * * *';

  schedule.scheduleJob(rule, () => {
    console.log('[daily-check] מריץ בדיקה יומית (08:00)...');
    checkAndSendTodayMessages(client).catch((err) => {
      console.error('[daily-check] שגיאה לא צפויה בבדיקה היומית:', err);
    });
  });

  console.log('[daily-check] תוזמנה בדיקה יומית אוטומטית לשעה 08:00.');
}

module.exports = { startDailyCheck, checkAndSendTodayMessages };
