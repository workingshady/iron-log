export type Env = {
  Bindings: {
    DB: D1Database;
    /** Separate test database used when logged in with DEV_PASSCODE. Real data is never touched in dev mode. */
    DB_DEV: D1Database;
    APP_PASSCODE: string;
    DEV_PASSCODE?: string;
  };
  Variables: { dev: boolean };
};
