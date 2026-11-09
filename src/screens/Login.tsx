import { useState } from "react";
import { send } from "../lib/api";
import { Btn } from "../components/ui";

export default function Login({ onIn }: { onIn: () => void }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await send("POST", "/login", { passcode: code });
      onIn();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto flex min-h-dvh max-w-xs flex-col justify-center gap-4 px-4">
      <img src="/icon.svg" alt="" className="mx-auto h-16 w-16" />
      <h1 className="text-center text-2xl font-bold">Iron Log</h1>
      <input
        type="password"
        inputMode="numeric"
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Passcode"
        className="min-h-14 rounded-xl bg-card2 px-4 text-center text-xl tracking-widest outline-none focus:ring-2 focus:ring-acc"
      />
      {err && <p className="text-center text-sm text-bad">{err}</p>}
      <Btn kind="primary" type="submit" disabled={busy || !code}>
        Enter
      </Btn>
    </form>
  );
}
