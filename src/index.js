

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const {addScheduled} = require('./storage');
const {extractDateFromText,formatDateForUser,formatDateISO} = require('./extractDate');
const {startDailyCheck} = require('./dailyCheck');
// ==== CONFIG ====

// Which chats should trigger onMessageReceived below:
// 'group'   - only group chats (ids ending with @g.us)
// 'private' - only private/direct chats (ids ending with @c.us)
// 'both'    - group and private chats
const CHAT_FILTER = 'group';

// ==== CLIENT SETUP ====

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './session' }),
  puppeteer: {
    headless: true,
    protocolTimeout: 120000,
    
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
  },
  // If you hit "Evaluation failed" errors, try pinning a known-working
  // WhatsApp Web version here:
  // webVersionCache: {
  //   type: 'remote',
  //   remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1023204765.html',
  // },
});

// ==== HELPERS ====

// Returns true if a chat id belongs to a group chat
function isGroupChat(chatId) {
  return chatId.endsWith('@g.us');
}

// Returns true if a chat id belongs to a private/direct chat
function isPrivateChat(chatId) {
  return chatId.endsWith('@c.us');
}

// Checks a chat id against CHAT_FILTER
function matchesChatFilter(chatId) {
  if (CHAT_FILTER === 'group') return isGroupChat(chatId);
  if (CHAT_FILTER === 'private') return isPrivateChat(chatId);
  if (CHAT_FILTER === 'both') return isGroupChat(chatId) || isPrivateChat(chatId);
  return false;
}

// ==== SENDING MESSAGES ====

// Sends a text message to a given chat id (e.g. "123456789-987654321@g.us")
async function sendMessageTo(chatId, text) {
  console.log(`avi try to send message`);
  // const SEND_TIMEOUT_MS = 30000;
  // const timeout = new Promise((_, reject) =>
  //   setTimeout(() => reject(new Error('send timed out after 30s')), SEND_TIMEOUT_MS))
  try {
    await client.sendMessage(chatId, text);
    console.log(`[send] message sent to ${chatId}: "${text}"`);
    return true;
  } catch (err) {
    console.error(`[send] failed to send message to ${chatId}:`, err);
    return false;
  }
}

// ==== RECEIVING MESSAGES ====

// Called for every incoming message that matches CHAT_FILTER.
// This is the single place to plug in future logic (date parsing, etc).
async function onMessageReceived(msg) {
    console.log(`[received message] from=${msg.from} body="${msg.body}"`);
    console.log(`trying to extract date from message body >>`);
    const date = extractDateFromText(msg.body);

    if(!date){
       console.log('[message] no date found in message, ignoring.');
      return;
    }

        // console.log(`[received message] from=${msg.from} 
        // date =${formatDateForUser(date)})}
        // createdAt="${formatDateForUser(msg.timestamp)}"`);

   const entry = {
          chatId: msg.from,
          text: msg.body,
          sendAt: date,
          createdAt: new Date(),
        };
    addScheduled(entry)
    await sendMessageTo(msg.from, 
    `התקבלה הודעה עם אזכור של התאריך: ${formatDateForUser(date)}\n
ההודעה היא: "${msg.body}"\n
ההודעה תתוזמן ותישלח שוב בתאריך הנ"ל בשעה שמונה בבוקר!`);

  
  // Example placeholder action - remove/replace once real logic is added:
  // await sendMessageTo(msg.from, 'yes');
}

// ==== CLIENT EVENTS ====

client.on('qr', (qr) => {
  console.log('[auth] scan this QR code with WhatsApp (Settings > Linked Devices):');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log(`[ready] client connected. CHAT_FILTER="${CHAT_FILTER}"`);
});

client.on('auth_failure', (msg) => {
  console.error('[auth] authentication failed:', msg);
});

client.on('disconnected', (reason) => {
  console.warn('[connection] client disconnected:', reason);
});

client.on('message', async (msg) => {
  try {
    // Intentionally not using msg.getChat() - it currently fails due to a
    // known upstream bug in whatsapp-web.js after a WhatsApp Web update.
    // msg.from already contains the chat id, no browser call needed.
    if (!matchesChatFilter(msg.from)) return;

    await onMessageReceived(msg);
  } catch (err) {
    console.error('[message] error handling incoming message:', err);
  }
});

// ==== START ====

client.initialize();

function shutdown() {
  console.log('[shutdown] closing client...');
  client.destroy().finally(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = { client, sendMessageTo, isGroupChat, isPrivateChat };