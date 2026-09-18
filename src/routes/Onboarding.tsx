import { useState } from "react";
import { createPlayer } from "@/db/repo";
import { login, register } from "@/services/auth";
import { adoptAccount } from "@/services/sync";
import { Button, Field, Segmented, Spinner } from "@/components/ui";
import { Logo } from "@/components/Logo";

export function Onboarding() {
  const [mode, setMode] = useState<"create" | "signin">("create");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const user = mode === "create" ? await register(username.trim(), pin.trim(), name.trim() || username.trim()) : await login(username.trim(), pin.trim());
      // Create the local "me" player under the account id, then pull anything the account already has.
      const me = await createPlayer(mode === "create" ? name.trim() || user.displayName : user.displayName, true);
      void me;
      await adoptAccount(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  const valid = /^[a-zA-Z0-9_.-]{2,24}$/.test(username.trim()) && /^\d{4,8}$/.test(pin.trim()) && (mode === "signin" || name.trim().length > 0);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-brand text-brand-ink">
      <div className="safe-top flex flex-1 flex-col justify-end px-6 pb-6">
        <Logo size={56} />
        <h1 className="display mt-6 text-[48px]">Chains, not spreadsheets.</h1>
        <p className="mt-4 max-w-xs text-base text-brand-ink/80">Find the course you are standing on, keep score for the whole card, and watch your game change over time.</p>
      </div>
      <form onSubmit={submit} className="safe-bottom rounded-t-sheet bg-bg px-6 pt-5 pb-8 text-ink">
        <Segmented
          value={mode}
          onChange={(m) => {
            setMode(m);
            setError(null);
          }}
          options={[
            { value: "create", label: "New account" },
            { value: "signin", label: "I have one" },
          ]}
          className="mb-4 w-full justify-between"
        />
        <div className="space-y-3">
          {mode === "create" && <Field label="Your name" name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ivan" autoComplete="given-name" maxLength={40} />}
          <Field label="Username" name="username" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} placeholder="ivan" autoCapitalize="none" autoCorrect="off" autoComplete="username" maxLength={24} hint={mode === "create" ? "Letters, numbers, dots, dashes or underscores." : undefined} />
          <Field label="PIN" name="pin" type="password" inputMode="numeric" pattern="[0-9]*" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="4 digits" autoComplete={mode === "create" ? "new-password" : "current-password"} maxLength={8} hint={mode === "create" ? "4 to 8 digits. This is just to keep your stats yours, not bank-grade security." : undefined} />
        </div>
        {error && <p className="mt-3 rounded-card bg-danger/10 px-3 py-2 text-sm">{error}</p>}
        <Button type="submit" variant="primary" size="lg" full className="mt-4" disabled={!valid || busy}>
          {busy ? <Spinner /> : mode === "create" ? "Create account and start" : "Sign in"}
        </Button>
        <p className="mt-3 text-center text-xs text-ink-3">Your rounds sync to your account so your stats follow you to any phone.</p>
      </form>
    </div>
  );
}
