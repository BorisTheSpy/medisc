import { useEffect, useRef } from "react";
import { runConfetti } from "./confetti";
import { Dancer } from "./Dancer";

export interface Ace {
  playerName: string;
  holeNumber: number;
  /** Silences the audio sequence started by the tap that scored the ace. */
  stopAudio: () => void;
}

const AUTO_DISMISS_MS = 15000;

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Full-screen ace celebration. Tap anywhere to dismiss; closes itself after a while. */
export function AceParty({ ace, onDone }: { ace: Ace | null; onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!ace) return;
    const stopConfetti = canvasRef.current && !reducedMotion() ? runConfetti(canvasRef.current) : () => {};
    const timer = window.setTimeout(onDone, AUTO_DISMISS_MS);
    return () => {
      stopConfetti();
      window.clearTimeout(timer);
      ace.stopAudio();
    };
    // Each ace is a fresh party; onDone is stable enough for the lifetime of one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ace]);

  if (!ace) return null;
  return (
    <button
      type="button"
      onClick={onDone}
      className="fixed inset-0 z-[60] flex w-full cursor-pointer flex-col items-center justify-center bg-bg-deep/85 px-6 text-center backdrop-blur-[2px]"
      aria-label="Ace celebration. Tap to continue."
    >
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
      <div className="party-in relative flex flex-col items-center">
        <Dancer size={220} />
        <h1 className="party-headline display mt-2 text-[56px] leading-none text-live drop-shadow-[0_4px_0_rgba(0,0,0,0.45)]">Great Shot!!!</h1>
        <p className="mt-5 text-[17px] font-bold text-ink">
          {ace.playerName} aced hole {ace.holeNumber}
        </p>
        <p className="label mt-8 text-ink-3">Tap anywhere to continue</p>
      </div>
    </button>
  );
}
