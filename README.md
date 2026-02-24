# Umrah Link

Umrah Link is a verified marketplace connecting customers who need Umrah-related services with independent providers operating in Saudi Arabia.

Slogan: **Your trusted link to umrah support**

## Stack

- Frontend: Next.js + TypeScript (`/frontend`)
- Backend: Django + Django REST Framework (`/backend`)

## Product Scope Implemented

### Customer side
- Browse verified providers
- Compare services, prices, ratings, and language support
- Book:
  - Umrah Badal
  - Ziyarah Guides (Makkah / Madinah)
  - Umrah Assistants
- Create and track bookings
- Open disputes and upload evidence
- Leave reviews after completed bookings

### Provider side
- Create professional profile
- List services (Umrah Badal, Ziyarah Guide, Umrah Assistant)
- Set pricing and availability fields
- Receive booking requests
- Build review-based reputation

### Platform / admin controls
- Provider moderation (approve/reject/ban)
- Booking status controls and manual escrow release
- Payment webhook ingestion (success/fail/refund)
- Dispute decisions with refund/release outcomes

## Mission, Vision, Legal

- Mission: Make Umrah services accessible, trustworthy, and easy to book through one unified platform.
- Vision: Digitize the Umrah experience by building the world's most trusted ecosystem for pilgrimage support services.
- Legal: Umrah Link acts as an online marketplace intermediary, providing listing, booking, communication, and profile tools between customers and independent providers.

## Frontend Design

Key frontend routes:
- `/` landing page
- `/auth` sign in / register (customer + provider)
- `/marketplace` browse services and create booking requests
- `/dashboard` role-aware dashboard for bookings and provider service listings

Core UI files:
- `/Users/Master/Documents/UMRAH--LINK/frontend/app/page.tsx`
- `/Users/Master/Documents/UMRAH--LINK/frontend/app/auth/page.tsx`
- `/Users/Master/Documents/UMRAH--LINK/frontend/app/marketplace/page.tsx`
- `/Users/Master/Documents/UMRAH--LINK/frontend/app/dashboard/page.tsx`
- `/Users/Master/Documents/UMRAH--LINK/frontend/app/globals.css`
- `/Users/Master/Documents/UMRAH--LINK/frontend/lib/api.ts`

Notes:
- Uses a green/gold design direction inspired by your brand.
- Includes customer/provider flows, trust section, legal section, and strong CTA blocks.
- Includes responsive behavior for desktop and mobile.
- Current live brand logo is at `/Users/Master/Documents/UMRAH--LINK/frontend/public/umrah-link-logo.png`.

## Backend API Modules

- `accounts`: auth register endpoints, user roles, provider moderation
- `marketplace`: provider directory, services, reviews
- `bookings`: booking creation, status transitions, cancellation, escrow states, webhook events
- `messaging`: booking-scoped chat threads and messages (enabled only after paid/held/released + active booking)
- `disputes`: dispute open/review/decision and evidence uploads

## Quick Start

## 1) Backend

```bash
cd /Users/Master/Documents/UMRAH--LINK/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py makemigrations
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

Backend base URL: `http://127.0.0.1:8000`

## 2) Frontend

```bash
cd /Users/Master/Documents/UMRAH--LINK/frontend
npm install
npm run dev
```

Frontend URL: `http://localhost:3000`

Optional frontend env:

```bash
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api
```

Backend payment env (Pesapal):

```bash
PESAPAL_ENV=sandbox
PESAPAL_CONSUMER_KEY=your_key_here
PESAPAL_CONSUMER_SECRET=your_secret_here
PESAPAL_IPN_ID=
PESAPAL_IPN_URL=
PESAPAL_CALLBACK_URL=
PESAPAL_BASE_URL=
FRONTEND_BASE_URL=http://localhost:3000
```

Notes:
- Keep payment secrets in environment variables only, never hardcode in source files.
- If `PESAPAL_IPN_ID` is empty, backend will register IPN automatically using `/api/bookings/webhook/`.
- For local development, set `PESAPAL_IPN_URL` to a public HTTPS URL (for example an ngrok tunnel to `/api/bookings/webhook/`).
- Set `PESAPAL_CALLBACK_URL` to a public HTTPS frontend URL (or any HTTPS page you control) so Pesapal can return users after checkout.

## API Paths (base `/api`)

- Health: `GET /health/`
- Auth:
  - `POST /auth/register/customer/`
  - `POST /auth/register/provider/`
  - `POST /auth/login/`
  - `POST /auth/login/customer/`
  - `POST /auth/login/provider/`
  - `POST /auth/logout/`
  - `GET /auth/me/`
  - `GET /auth/admin/providers/` (admin)
  - `POST /auth/admin/providers/{id}/approve/` (admin)
  - `POST /auth/admin/providers/{id}/reject/` (admin)
  - `POST /auth/admin/providers/{id}/ban_user/` (admin)
- Marketplace:
  - `GET /marketplace/providers/`
  - `GET /marketplace/services/`
  - `POST /marketplace/services/` (provider)
  - `GET /marketplace/reviews/`
  - `POST /marketplace/reviews/` (customer)
- Bookings:
  - `GET /bookings/`
  - `POST /bookings/`
  - `POST /bookings/{id}/update_status/`
  - `POST /bookings/{id}/cancel/`
  - `POST /bookings/{id}/release_escrow/` (admin)
  - `POST /bookings/{id}/pesapal_initialize/`
  - `POST /bookings/{id}/pesapal_verify/`
  - `GET /bookings/{id}/events/`
  - `POST /bookings/webhook/`
  - `GET /bookings/webhook/` (Pesapal IPN callback)
- Messaging:
  - `GET/POST /messaging/threads/`
  - `GET/POST /messaging/messages/`
  - `POST /messaging/messages/{id}/mark_read/`
- Disputes:
  - `GET/POST /disputes/`
  - `POST /disputes/{id}/add_evidence/`
  - `POST /disputes/{id}/move_to_review/` (admin)
  - `POST /disputes/{id}/admin_decision/` (admin)

## Security Model

- Role-based user model: `CUSTOMER`, `PROVIDER`, `ADMIN`
- Token authentication for API access from frontend
- Role-specific login routes for customer and provider portals
- Booking/message/dispute querysets are scoped by owner/participant
- Messaging allowed only when booking is paid and in an active state
- Admin-only actions protect moderation and escrow overrides

## Important Production TODOs

- JWT authentication (or OAuth) and refresh tokens
- Payment gateway signature verification and secret storage (vault/KMS)
- File storage for dispute evidence uploads (S3/GCS)
- KYC/identity checks for provider verification
- Rate limiting, audit logs, and alerting
- Full automated tests (unit + API + E2E)
- Background workers for async payment/review/dispute workflows
