# Plan: multi-user, social, chat, programs (Nov 2026)

Goal: friends get their own account, data, plan and profile; you can share (or not) with each other, post, and chat.
Hard rule: **your existing data, program (ppl-arnold v2.9), recommended weights and logs must not change.** Every step is additive,
real data is backed up first, and everything is tested in DEV mode before it touches the real database.

## Phase 1 — foundation (done by the main session, sequential)
1. Backup the real DB (`private/backups/…pre-multiuser…sql`).
2. Migration 0012 (additive, no table dropped):
   - `user_id` on sessions, sets, feedback, cardio, events, tests, journal, intake, photos, blocks → existing rows set to the
     **first user** (you on the real DB, `dev` on the DEV DB).
   - `settings` and `body` had single-column keys (one person). New `user_settings (user_id,key)` and `body_logs (user_id,date)`
     are created and **copied** from the old tables; the old tables stay untouched as a backup.
   - users: email, google_sub (unique), role, privacy (JSON), prefs (JSON: accent colour, chat theme…), last_seen_at.
   - New tables: invites, friendships, posts, post_likes, post_comments, notifications, conversations, conversation_members,
     messages, message_reactions, media (voice notes), user_programs, custom_exercises.
3. Every API query scoped to the logged-in user (`own(c, table)` helper). Program per user: you stay on `CURRENT`;
   friends get the template they pick (`progFor(c)`).
4. Sign-up only with an **invite code** from an existing member (the app isn't open to the whole internet).
5. DEV database: 3 users (dev, dev_omar, dev_sara) with dummy workouts, photos, posts, a chat — for testing social + chat.

## Phase 2 — parallel agents (each owns separate files, no schema changes, no deploys)
| Agent | Owns | Delivers |
|---|---|---|
| **Auth & brand** | `src/screens/Login.tsx`, `src/screens/Splash.tsx`, `src/screens/Security.tsx`, `worker/routes/auth.ts`, `public/brand/*`, `docs/GOOGLE_SIGNIN.md` | animated SVG splash, login / sign-up (invite) / Google sign-in, change passcode, sessions & security page, refreshed logo |
| **Social** | `worker/routes/social.ts`, `src/screens/{Feed,Friends,UserProfile,Privacy}.tsx`, `src/components/Post*.tsx` | friends (requests / accept / block), privacy controls, feed of posts (photo, workout, PR, progress), likes, comments, friend profile view, notifications |
| **Chat** | `worker/chat.ts` (Durable Object), `worker/routes/chat.ts`, `src/screens/{Chats,ChatRoom}.tsx`, `src/components/chat/*` | real-time chat over WebSockets (hibernation), text, emoji, stickers, images, voice notes, reply-to, reactions, typing, read receipts, themes, offline queue |
| **Programs** | `program/templates/*`, `program/exercises.ts` (append only), `worker/routes/programs.ts`, `src/screens/{Programs,ProgramEditor}.tsx` | plan templates (2-6 days: full body, upper/lower, PPL, PHUL, bro split, Arnold), pick + customise days / exercises / sets / reps, bigger exercise bank |

## Phase 3 — integration (main session)
Navigation re-organised (bottom bar: Home · Plan · Feed · Chat · You), screen order / user stories, full DEV test,
deploy, verify real data untouched, docs.

## Privacy defaults (research: least-privilege, user-controlled sharing)
| Data | Default | Can share with friends? |
|---|---|---|
| Profile (name, photo, bio, stats) | friends | yes / hide |
| Workouts done, PRs, streak | friends | yes / hide |
| Photos | **private** | per photo |
| Body weight, waist, sleep | **private** | opt-in |
| Journal, set notes, pain | **always private** | no |
| Chat | members of the chat only | — |
