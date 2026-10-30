# WhatsApp Outreach & Admin Console (Meta Business Cloud API)

A production-ready WhatsApp outreach tool with an administrative web UI (plain HTML/CSS/JS, no frameworks), single password login, monthly cap enforcement, and auto-reply rules with interactive button handling.

---

## Features

- **Admin Web Dashboard**: Single-password login protected by HTTP-only session cookies and startup SHA-256 hash comparison.
- **Campaign Dispatcher (`POST /api/send-campaign`)**:
  - Supports templates: `hello`, `hi`, and `ek kam hai`.
  - Image header (URL or file upload saved in `/uploads`).
  - Dynamic body variables (`{{1}}`, `{{2}}`...).
  - Dynamic URL button parameters and quick-reply button payloads.
  - Live WhatsApp chat simulator preview.
- **Auto-Reply Engine (`GET` & `POST /webhook`)**:
  - Handles incoming user replies inside the 24-hour customer service window.
  - Supported reply formats: Text, Image with caption, Interactive Reply Buttons (up to 3), or Call-To-Action Link Button.
  - **Button Tap Routing**: Each reply button can have its own configured follow-up message sent when tapped!
  - Validates Meta's `X-Hub-Signature-256` against the original request body, handles message status changes, and deduplicates webhook retries in memory.
- **Monthly Cap Enforcement (800 Unique Users/Month)**:
  - Local JSON storage in `sent-log.json` keyed by calendar month (`YYYY-MM`).
  - Hard stop when limit is hit; skips remaining numbers and reports count.
  - Automatically resets each calendar month.
  - Failed sends and incoming user replies / auto-replies do not count toward the cap.
- **Recipients Management**:
  - Drag & drop or upload `recipients.csv` directly from the UI.
  - Preview table with status badges and count indicators (Total, Opted In, Opted Out).

---

## Project Structure

```
matchdistrict-whatsapp-dm/
├── public/
│   ├── css/style.css       # Clean, responsive WhatsApp-themed styling
│   ├── js/app.js           # Client-side UI logic, live preview & API client
│   ├── index.html          # Protected Admin Dashboard
│   └── login.html          # Clean password authentication page
├── uploads/                # Public media folder for Meta Cloud API
├── src/
│   ├── auth.js             # SHA-256 password hash & HMAC session token logic
│   ├── config.js           # Settings persistence in config.json
│   ├── tracker.js          # Monthly cap tracking & sent-log.json
│   ├── whatsapp.js         # Meta Graph API template & interactive message dispatcher
│   ├── campaign.js         # Bulk recipient loop & limit enforcement
│   └── server.js           # Express server & webhooks
├── config.json             # Persisted UI settings
├── sent-log.json           # Sent history keyed by YYYY-MM
├── recipients.csv          # Recipient phone numbers & opt-in status
├── Dockerfile              # Container definition for Render deployment
└── .env                    # Secrets & configuration
```

---

## Configuration (`.env`)

```env
ACCESS_TOKEN=your_meta_access_token_here
PHONE_NUMBER_ID=your_phone_number_id_here
WEBHOOK_VERIFY_TOKEN=matchdistrict_verify_token_123
META_APP_SECRET=your_meta_app_secret_here
MONTHLY_LIMIT=800
ADMIN_PASSWORD=565454
SESSION_SECRET=matchdistrict_super_secret_session_2026
PORT=3000
```

## Render webhook deployment

Set `WEBHOOK_VERIFY_TOKEN` and `META_APP_SECRET` in the Render service environment, alongside the existing WhatsApp credentials. Keep the existing Docker deployment; the server uses Render's `PORT` and binds to `0.0.0.0`.

In the Meta app's WhatsApp webhook settings, use this public callback URL (replace the host with the service's assigned Render hostname):

`https://<your-render-service>.onrender.com/webhook`

Set the verify token to the exact value of `WEBHOOK_VERIFY_TOKEN`, then subscribe to the `messages` field. Meta sends sent, delivered, read, and failed message updates on this field as well as incoming messages. Status event details are logged with message IDs and state/error codes only. Retry deduplication is in memory and lasts until eviction or process restart.
