# SkillSwap — Full-Stack Web Application

> HTML/CSS frontend migrated to **React + Node.js + Express + MongoDB**  
> UI is **pixel-perfect identical** to the original design. Only the internal architecture changed.

---

## 📁 Project Structure

```
skillswap/
├── backend/               ← Node.js + Express + MongoDB API
│   └── src/
│       ├── server.js
│       ├── config/db.js
│       ├── models/        ← User, Skill, SwapRequest, Message, Review
│       ├── middleware/    ← JWT auth guard
│       ├── controllers/   ← Business logic
│       └── routes/        ← API endpoints
│
└── frontend/              ← React (Vite) SPA
    └── src/
        ├── App.jsx        ← React Router setup
        ├── context/       ← AuthContext (JWT session)
        ├── services/api.js← Axios + JWT interceptor
        ├── hooks/         ← useToast
        ├── components/    ← Toast, Logo (shared)
        └── pages/         ← One page per original HTML file
```

---

## ⚙️ Prerequisites

- Node.js >= 18
- MongoDB (local or Atlas)
- npm

---

## 🚀 Setup & Run

### 1. Clone / extract the project

```bash
cd skillswap
```

### 2. Backend setup

```bash
cd backend
npm install

# Copy and configure environment variables
cp .env.example .env
# Edit .env — set MONGO_URI and JWT_SECRET
```

**.env** values to set:
```
PORT=5000
MONGO_URI=mongodb://localhost:27017/skillswap
JWT_SECRET=replace_with_a_long_random_string
JWT_EXPIRE=7d
NODE_ENV=development
```

```bash
# Start backend (development with auto-reload)
npm run dev

# OR production
npm start
```

Backend runs on **http://localhost:5000**

---

### 3. Frontend setup

```bash
cd ../frontend
npm install
npm run dev
```

Frontend runs on **http://localhost:3000**  
API calls are proxied to `localhost:5000` via Vite config — no CORS issues.

---

## 🔌 API Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | — | Create account |
| POST | `/api/auth/login` | — | Login, returns JWT |
| GET | `/api/auth/me` | ✅ | Get current user |
| GET | `/api/skills` | — | List skills (search/filter/sort) |
| POST | `/api/skills` | ✅ | Add a skill listing |
| DELETE | `/api/skills/:id` | ✅ | Remove own skill |
| GET | `/api/requests/incoming` | ✅ | Requests for my skills |
| GET | `/api/requests/sent` | ✅ | My sent requests |
| GET | `/api/requests/active` | ✅ | My accepted swaps |
| POST | `/api/requests/:skillId` | ✅ | Send swap request |
| PATCH | `/api/requests/:id/status` | ✅ | Accept / decline |
| GET | `/api/chat/:requestId` | ✅ | Get messages |
| POST | `/api/chat/:requestId` | ✅ | Send message |
| GET | `/api/reviews/:requestId` | ✅ | Get my review for swap |
| POST | `/api/reviews/:requestId` | ✅ | Submit review |
| GET | `/api/stats` | — | Platform stats |

---

## 🗄️ MongoDB Schema Overview

### User
```js
{ fname, lname, username (unique), email (unique), password (bcrypt), offer, want }
```

### Skill
```js
{ name, category, desc, wantLearn, avail, emoji, owner (ref User), offeredBy, username }
```

### SwapRequest
```js
{ skill (ref), skillName, requester (ref), requestedBy, requestedByName,
  skillOwner (ref), offeredBy, offeredByUsername, status: pending|accepted|declined }
```

### Message
```js
{ swapRequest (ref), sender (ref), from, text, createdAt }
```

### Review
```js
{ swapRequest (ref), reviewer (ref), reviewedByName, partnerName, skillName,
  overall (1-5), categories: {knowledge, communication, punctuality}, tags[], text }
```

---

## 🔄 localStorage → API Migration Map

| Was (localStorage key) | Now (API + MongoDB) |
|---|---|
| `ss_all_users` | `POST /api/auth/register` → `User` collection |
| `ss_user` | JWT in `localStorage.ss_token` + `GET /api/auth/me` |
| `ss_skills` | `GET/POST/DELETE /api/skills` → `Skill` collection |
| `ss_all_requests` | `GET/POST/PATCH /api/requests/*` → `SwapRequest` collection |
| `ss_chat_{rid}` | `GET/POST /api/chat/:id` → `Message` collection |
| `ss_reviews` | `GET/POST /api/reviews/:id` → `Review` collection |
| `ss_notes_{rid}` | Still localStorage (session notes, not persisted to DB) |

---

## 🛡️ Security Features Added

- **Passwords**: bcrypt hashed (never stored plain)
- **JWT**: signed with secret, expires in 7 days
- **Input validation**: `express-validator` on all POST routes
- **Auth guard**: `protect` middleware on all protected routes
- **Ownership checks**: users can only delete/update their own resources
- **Participant checks**: chat/review only accessible to swap participants

---

## 🏗️ Build for Production

```bash
# Frontend
cd frontend && npm run build
# Outputs to frontend/dist/ — serve with nginx or any static host

# Backend
cd backend && NODE_ENV=production npm start
```
