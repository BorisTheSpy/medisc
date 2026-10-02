/**
 * The ace soundtrack: a "Nice shot" voice clip, then the song with farts over it.
 *
 * The owner drops their own recordings into public/ace/ (see the README there). When a file is
 * missing the app falls back to speech synthesis, a synthesized party beat, and synthesized farts,
 * so the party still happens on a fresh checkout. Everything is primed inside the tap that scored
 * the ace so mobile browsers allow playback.
 */

const VOICE_SRC = "/ace/nice-shot.mp3";
const SONG_SRC = "/ace/gangnam-style.mp3";
const FART_SRC = "/ace/fart.mp3";

type Stop = () => void;

let ctx: AudioContext | null = null;
function audioContext(): AudioContext | null {
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Play a file; resolve with a stop function once it starts, or reject if the file is missing. */
function playFile(src: string, { loop = false, volume = 1 } = {}): Promise<{ stop: Stop; ended: Promise<void> }> {
  return new Promise((resolve, reject) => {
    const el = new Audio(src);
    el.loop = loop;
    el.volume = volume;
    el.preload = "auto";
    const ended = new Promise<void>((done) => el.addEventListener("ended", () => done(), { once: true }));
    const stop = () => {
      el.pause();
      el.src = "";
    };
    el.addEventListener("error", () => reject(new Error(`missing ${src}`)), { once: true });
    el.play().then(() => resolve({ stop, ended })).catch(reject);
  });
}

function speak(text: string): { stop: Stop; ended: Promise<void> } {
  if (!("speechSynthesis" in window)) return { stop: () => {}, ended: Promise.resolve() };
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.95;
  u.pitch = 1.3;
  const ended = new Promise<void>((done) => {
    u.onend = () => done();
    u.onerror = () => done();
    window.setTimeout(done, 2500);
  });
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
  return { stop: () => window.speechSynthesis.cancel(), ended };
}

/** A wobbling low sawtooth with a noisy tail. Sounds exactly like you think. */
export function synthFart(ac: AudioContext, at = ac.currentTime): void {
  const dur = 0.35 + Math.random() * 0.45;
  const osc = ac.createOscillator();
  osc.type = "sawtooth";
  const base = 55 + Math.random() * 40;
  osc.frequency.setValueAtTime(base, at);
  osc.frequency.exponentialRampToValueAtTime(base * 0.55, at + dur);

  const wobble = ac.createOscillator();
  wobble.frequency.setValueAtTime(18 + Math.random() * 14, at);
  const wobbleGain = ac.createGain();
  wobbleGain.gain.value = base * 0.5;
  wobble.connect(wobbleGain).connect(osc.frequency);

  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(900, at);
  filter.frequency.exponentialRampToValueAtTime(240, at + dur);

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.5, at + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);

  osc.connect(filter).connect(gain).connect(ac.destination);
  osc.start(at);
  wobble.start(at);
  osc.stop(at + dur + 0.05);
  wobble.stop(at + dur + 0.05);
}

/** Four-on-the-floor kick, a pumping bass and a cheeky lead riff. Original, so it ships. */
function synthBeat(ac: AudioContext): Stop {
  const bpm = 132;
  const beat = 60 / bpm;
  const master = ac.createGain();
  master.gain.value = 0.35;
  master.connect(ac.destination);
  const bassNotes = [52, 52, 55, 57]; // E, E, G, A (midi)
  const riff = [76, 76, 79, 76, 74, 72, 74, 76];
  const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
  let step = 0;
  let nextTime = ac.currentTime + 0.05;
  let timer = 0;

  function scheduleStep(t: number, i: number) {
    // Kick on every beat.
    if (i % 2 === 0) {
      const k = ac.createOscillator();
      const kg = ac.createGain();
      k.frequency.setValueAtTime(150, t);
      k.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      kg.gain.setValueAtTime(0.9, t);
      kg.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      k.connect(kg).connect(master);
      k.start(t);
      k.stop(t + 0.3);
    }
    // Hat on the off-beats.
    if (i % 2 === 1) {
      const buf = ac.createBuffer(1, ac.sampleRate * 0.05, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let n = 0; n < d.length; n++) d[n] = (Math.random() * 2 - 1) * (1 - n / d.length);
      const src = ac.createBufferSource();
      src.buffer = buf;
      const hp = ac.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 7000;
      const hg = ac.createGain();
      hg.gain.value = 0.25;
      src.connect(hp).connect(hg).connect(master);
      src.start(t);
    }
    // Bass, one note per beat.
    if (i % 2 === 0) {
      const b = ac.createOscillator();
      b.type = "square";
      b.frequency.value = hz(bassNotes[Math.floor(i / 2) % bassNotes.length] - 24);
      const bg = ac.createGain();
      bg.gain.setValueAtTime(0.35, t);
      bg.gain.exponentialRampToValueAtTime(0.001, t + beat * 0.9);
      const lp = ac.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 500;
      b.connect(lp).connect(bg).connect(master);
      b.start(t);
      b.stop(t + beat);
    }
    // Lead riff, eighth notes, drops out every fourth bar for air.
    if (Math.floor(i / 8) % 4 !== 3) {
      const l = ac.createOscillator();
      l.type = "sawtooth";
      l.frequency.value = hz(riff[i % riff.length]);
      const lg = ac.createGain();
      lg.gain.setValueAtTime(0.18, t);
      lg.gain.exponentialRampToValueAtTime(0.001, t + beat * 0.45);
      l.connect(lg).connect(master);
      l.start(t);
      l.stop(t + beat * 0.5);
    }
  }

  function pump() {
    while (nextTime < ac.currentTime + 0.4) {
      scheduleStep(nextTime, step);
      nextTime += beat / 2;
      step++;
    }
    timer = window.setTimeout(pump, 100);
  }
  pump();

  return () => {
    window.clearTimeout(timer);
    master.gain.setTargetAtTime(0, ac.currentTime, 0.05);
    window.setTimeout(() => master.disconnect(), 400);
  };
}

/** Farts at random intervals until stopped. Uses the file when present, the synth otherwise. */
function startFarts(ac: AudioContext | null): Stop {
  let timer = 0;
  let stopped = false;
  let useFile = true;
  let live: Stop[] = [];

  async function one() {
    if (stopped) return;
    if (useFile) {
      try {
        const { stop } = await playFile(FART_SRC, { volume: 0.9 });
        live.push(stop);
      } catch {
        useFile = false;
        if (ac) synthFart(ac);
      }
    } else if (ac) {
      synthFart(ac);
    }
    timer = window.setTimeout(one, 800 + Math.random() * 800);
  }
  timer = window.setTimeout(one, 400);

  return () => {
    stopped = true;
    window.clearTimeout(timer);
    for (const s of live) s();
    live = [];
  };
}

/**
 * Start the full sequence. Must be called from a user gesture. Returns a function that silences
 * everything, which the overlay calls on dismiss.
 */
export function startAceAudio(): Stop {
  const ac = audioContext();
  const stops: Stop[] = [];
  let cancelled = false;
  const add = (s: Stop) => {
    if (cancelled) s();
    else stops.push(s);
  };

  async function run() {
    // Voice clip first.
    let voiceEnded: Promise<void>;
    try {
      const v = await playFile(VOICE_SRC);
      add(v.stop);
      voiceEnded = v.ended;
    } catch {
      const v = speak("Nice shot!");
      add(v.stop);
      voiceEnded = v.ended;
    }
    await voiceEnded;
    if (cancelled) return;

    // Then the song and the farts together.
    try {
      const s = await playFile(SONG_SRC, { volume: 0.8 });
      add(s.stop);
    } catch {
      if (ac) add(synthBeat(ac));
    }
    if (cancelled) return;
    add(startFarts(ac));
  }
  void run();

  return () => {
    cancelled = true;
    for (const s of stops) s();
    stops.length = 0;
  };
}
