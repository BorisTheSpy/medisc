/** Canvas confetti in the app palette. Returns a function that stops the animation. */

const COLORS = ["#ffb340", "#ffc668", "#5fdcaa", "#6cb8ff", "#eef3fa", "#ff6a52"];

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rot: number;
  vrot: number;
  color: string;
  wobble: number;
}

function makePiece(width: number, height: number, fromTop: boolean): Piece {
  return {
    x: Math.random() * width,
    y: fromTop ? -20 - Math.random() * height * 0.5 : Math.random() * height,
    vx: (Math.random() - 0.5) * 2.4,
    vy: 2 + Math.random() * 3.5,
    w: 6 + Math.random() * 6,
    h: 8 + Math.random() * 10,
    rot: Math.random() * Math.PI * 2,
    vrot: (Math.random() - 0.5) * 0.25,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    wobble: Math.random() * Math.PI * 2,
  };
}

export function runConfetti(canvas: HTMLCanvasElement, count = 200): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let width = 0;
  let height = 0;

  function resize() {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();

  const pieces: Piece[] = [];
  for (let i = 0; i < count; i++) pieces.push(makePiece(width, height, i % 2 === 0));

  let frame = 0;
  let running = true;
  let last = performance.now();

  function tick(now: number) {
    if (!running) return;
    const dt = Math.min((now - last) / 16.67, 3);
    last = now;
    ctx!.clearRect(0, 0, width, height);
    for (const p of pieces) {
      p.wobble += 0.08 * dt;
      p.x += (p.vx + Math.sin(p.wobble) * 1.2) * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      if (p.y > height + 20) {
        Object.assign(p, makePiece(width, height, true));
      }
      ctx!.save();
      ctx!.translate(p.x, p.y);
      ctx!.rotate(p.rot);
      ctx!.fillStyle = p.color;
      ctx!.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx!.restore();
    }
    frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);
  window.addEventListener("resize", resize);

  return () => {
    running = false;
    cancelAnimationFrame(frame);
    window.removeEventListener("resize", resize);
    ctx.clearRect(0, 0, width, height);
  };
}
