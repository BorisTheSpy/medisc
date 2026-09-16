import { useState } from "react";
import { createPlayer } from "@/db/repo";
import { Button, Field } from "@/components/ui";
import { Logo } from "@/components/Logo";

export function Onboarding() {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    await createPlayer(name, true);
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-brand text-brand-ink">
      <div className="safe-top flex flex-1 flex-col justify-end px-6 pb-8">
        <Logo size={56} />
        <h1 className="display mt-6 text-[52px]">Chains, not spreadsheets.</h1>
        <p className="mt-4 max-w-xs text-base text-brand-ink/80">Find the course you are standing on, keep score for the whole card, and watch your game change over time.</p>
      </div>
      <form onSubmit={submit} className="safe-bottom rounded-t-sheet bg-bg px-6 pt-6 pb-8 text-ink">
        <Field label="What should we call you?" name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoFocus autoComplete="given-name" maxLength={40} />
        <Button type="submit" variant="primary" size="lg" full className="mt-4" disabled={!name.trim() || busy}>
          Start playing
        </Button>
        <p className="mt-3 text-center text-xs text-ink-3">Everything stays on this device. No account needed.</p>
      </form>
    </div>
  );
}
