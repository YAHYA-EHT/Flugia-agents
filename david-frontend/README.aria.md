# Aria Web (Next.js)

Web client for Aria, built per `../NEXTJS_CLIENT_SPEC.md`. Parity with the Flutter
app (`../flutter_app`): same backend contract, DTOs, mock layer, and flows.

## Run

```bash
npm run dev        # http://localhost:3000  (defaults to mock mode, no backend)
npm run build      # production build
```

Defaults to **mock mode** (`NEXT_PUBLIC_USE_MOCK_DATA=true` in `.env.local`) so all
three screens work with no server. Login → "Continue with Google" (mock) → chat;
every 3rd chat reply triggers the pending-action confirm banner; ⚙️ opens settings.

## Point at the real backend

In `.env.local` set `NEXT_PUBLIC_USE_MOCK_DATA=false` and
`NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/v1`. The backend must allow this
web origin via **CORS** (the one backend change web needs vs mobile).

## What to fill in later

| Var(s) | For |
|---|---|
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Web OAuth client id (same project caveat as mobile) |
| `NEXT_PUBLIC_FIREBASE_*` + `..._VAPID_KEY` | FCM web push (also fill `public/firebase-messaging-sw.js`) |
| `ELEVENLABS_API_KEY` (server-only) | only if swapping Web Speech voice for ElevenLabs via an `/api/stt` route |

## Layout

```
lib/aria/    config, types(+mappers), api(interface), apiClient(fetch+401 refresh),
             mockApi, index(factory), googleAuth(GIS code flow), fcm, useVoiceInput
stores/      authStore, chatStore, settingsStore (Zustand)
components/aria/  LoginScreen, ChatScreen, SettingsScreen, MessageBubble, PendingActionBanner
app/         page.tsx (auth-gated login/chat), settings/page.tsx, layout.tsx
public/      firebase-messaging-sw.js
```

## Notes / divergences from mobile
- **Voice** uses the Web Speech API (simplest). To match the mobile ElevenLabs
  pipeline, proxy via a Next route handler holding the key.
- **Push** is FCM Web Push: no delivery when the browser is closed; iOS only as an
  installed PWA ≥16.4. Keep the Flutter app for reliable mobile push.
- Tokens are in `localStorage` (see `lib/aria/tokenStorage.ts`); for production in
  flugia prefer httpOnly cookies.
```
