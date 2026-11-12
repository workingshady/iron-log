export type Env = {
  Bindings: {
    DB: D1Database;
    /** Separate test database used when logged in with DEV_PASSCODE. Real data is never touched in dev mode. */
    DB_DEV: D1Database;
    /** Workers AI: Whisper speech-to-text for voice notes. */
    AI: Ai;
    /** Chat rooms (Durable Object, one per conversation). */
    CHAT: DurableObjectNamespace;
    APP_PASSCODE: string;
    DEV_PASSCODE?: string;
    /** Secret mixed into every passcode hash and cookie signature. Falls back to APP_PASSCODE. */
    AUTH_PEPPER?: string;
    /** Sign in with Google (optional; see docs/GOOGLE_SIGNIN.md). */
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
  };
  Variables: { dev: boolean; userId: string; role?: string; programId?: string | null; prog?: import("../program").Program };
};
