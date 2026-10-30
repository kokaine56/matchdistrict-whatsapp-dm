# WhatsApp Outreach Tool (Meta Business Cloud API)

A minimal Node.js & Express service for bulk outreach and 24-hour window auto-replies using the official Meta WhatsApp Cloud API.

---

## Features

- **Bulk First Message (`POST /send-campaign`)**: Reads `recipients.csv`, checks `opted_in` status, and sends approved templates (`hello`, `hi`, `ek kam hai`).
- **Hard Cap (800 unique users / month)**: Tracks sent phone numbers in `sent-log.json` keyed by calendar month (`YYYY-MM`). Stops sending immediately once cap is reached, skips remaining, and auto-resets when the month changes.
- **Auto-Reply Webhook (`GET` & `POST /webhook`)**: Verifies with Meta and auto-replies to user responses using normal text messages inside the 24-hour service window. Auto-replies do not count against the 800 monthly cap.
- **Fail-safe Error Handling**: Invalid numbers or send errors are logged and skipped without counting toward the monthly cap.

---

## Project Structure

```
matchdistrict-whatsapp-dm/
├── .env                  # Environment variables
├── .env.example          # Environment template
├── package.json          # Dependencies & scripts
├── recipients.csv        # Recipient list with phone & opted_in columns
├── sent-log.json         # Monthly tracking log (YYYY-MM keys)
└── src/
    ├── server.js         # Express server & webhook endpoints
    ├── campaign.js       # Bulk campaign dispatcher & limit enforcement
    ├── tracker.js        # File-based monthly tracking logic
    └── whatsapp.js       # Meta Graph API template & text message client
```

---

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment (`.env`)
Fill in your credentials in `.env`:
```env
ACCESS_TOKEN=your_meta_access_token_here
PHONE_NUMBER_ID=your_phone_number_id_here
WEBHOOK_VERIFY_TOKEN=your_custom_verify_token_here
MONTHLY_LIMIT=800
PORT=3000
AUTO_REPLY_TEXT="Hello! Thank you for reaching out. We have received your message and will get back to you shortly."
```

### 3. Add Recipients (`recipients.csv`)
Ensure numbers include country codes without spaces:
```csv
phone,opted_in
+15551234567,true
+15559876543,false
+919876543210,true
```

### 4. Start the Server
```bash
npm start
```

---

## API Endpoints

### 1. Trigger Campaign
`POST /send-campaign`
```bash
curl -X POST http://localhost:3000/send-campaign \
  -H "Content-Type: application/json" \
  -d '{"template": "hello"}'
```
*Supported template values:* `"hello"`, `"hi"`, `"ek kam hai"`.

### 2. Webhook
- `GET /webhook`: Verification endpoint for Meta Cloud API.
- `POST /webhook`: Ingests incoming user messages and sends the auto-reply.

---

## Deploying on Render

1. Push your repository to GitHub / GitLab.
2. In [Render Dashboard](https://dashboard.render.com/), click **New +** $\rightarrow$ **Web Service**.
3. Connect your repository (if in a subfolder, set **Root Directory** to `matchdistrict-whatsapp-dm`).
4. Select **Docker** as the Runtime.
5. In **Environment Variables**, add:
   - `ACCESS_TOKEN`
   - `PHONE_NUMBER_ID`
   - `WEBHOOK_VERIFY_TOKEN`
   - `MONTHLY_LIMIT` (e.g. `800`)
   - `AUTO_REPLY_TEXT`
6. Click **Deploy Web Service**.
7. Once deployed, set your Meta WhatsApp Webhook URL to:
   `https://<your-render-app-name>.onrender.com/webhook`

