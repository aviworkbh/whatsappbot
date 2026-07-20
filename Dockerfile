# Dockerfile - בוט וואטסאפ (whatsapp-web.js דורש דפדפן Chromium מלא)
#
# גישה: מתקינים Chromium דרך apt (פותר את כל תלויות המערכת שלו באופן מובנה
# ומהימן) ומורים ל-Puppeteer להשתמש בו, במקום לתת ל-Puppeteer להוריד גרסה
# משלו - חוסך זמן build (בלי הורדת ~170MB) ונמנע מבעיות "ספרייה חסרה" שקורות
# כשמנסים לנחש ידנית אילו תלויות מערכת גרסת Chromium ספציפית צריכה.

FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# אומר ל-Puppeteer לא להוריד Chromium משלו, ומצביע על ה-Chromium שהתקנו לעיל
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# התקנת חבילות ה-Node (בלי הורדת Chromium - נחסך הודות למשתנים למעלה)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# העתקת שאר קוד הבוט
COPY . .

# תיקיות אלו יוחלפו ב-volumes (ראו docker-compose.yml) כדי לשמר מידע בין הפעלות
RUN mkdir -p /app/session /app/data

CMD ["node", "index.js"]
