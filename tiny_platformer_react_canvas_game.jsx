import React, { useEffect, useRef, useState } from "react";

// Tiny 2D platformer (Mario‑like) in a single React component.
// Controls: ←/A to move left, →/D to move right, Space/↑/W to jump.
// On mobile, use the on‑screen Left / Jump / Right buttons.
// No external deps; uses a <canvas> and requestAnimationFrame.

export default function TinyPlatformer() {
  const canvasRef = useRef(null as HTMLCanvasElement | null);
  const rafRef = useRef<number | null>(null);
  const inputRef = useRef({ left: false, right: false, jump: false, jumpPressed: false });
  const [running, setRunning] = useState(true);

  // World constants
  const GRAVITY = 2000; // px/s^2
  const MOVE_ACCEL = 3000; // px/s^2
  const MOVE_MAX = 260; // px/s
  const FRICTION = 1800; // px/s^2 when no input on ground
  const JUMP_VEL = 720; // px/s
  const TILE = 48; // base tile size for platforms

  // Simple level layout (array of platform rects in world space)
  const platforms = useRef<Array<{ x: number; y: number; w: number; h: number }>>([
    // Ground segments
    { x: -400, y: 400, w: 1600, h: TILE },
    // Some floating platforms
    { x: 200, y: 320, w: TILE * 3, h: TILE / 2 },
    { x: 520, y: 260, w: TILE * 2, h: TILE / 2 },
    { x: 760, y: 300, w: TILE * 2, h: TILE / 2 },
    { x: 1040, y: 240, w: TILE * 3, h: TILE / 2 },
    { x: 1350, y: 340, w: TILE * 2.5, h: TILE / 2 },
  ]);

  // Player state
  const player = useRef({
    x: 100,
    y: 200,
    w: 28,
    h: 44,
    vx: 0,
    vy: 0,
    onGround: false,
    facing: 1 as -1 | 1,
  });

  // Camera
  const camera = useRef({ x: 0, y: 0 });

  // Resize canvas to device pixels
  const resizeCanvas = () => {
    const canvas = canvasRef.current!;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  // Input handlers
  useEffect(() => {
    const onKey = (e: KeyboardEvent, down: boolean) => {
      const k = e.key.toLowerCase();
      if (["arrowleft", "a"].includes(k)) {
        inputRef.current.left = down;
        e.preventDefault();
      }
      if (["arrowright", "d"].includes(k)) {
        inputRef.current.right = down;
        e.preventDefault();
      }
      if (["arrowup", "w", " "].includes(k)) {
        if (down) {
          // register an edge-trigger for jump presses
          if (!inputRef.current.jump) inputRef.current.jumpPressed = true;
          inputRef.current.jump = true;
        } else {
          inputRef.current.jump = false;
        }
        e.preventDefault();
      }
      if ([" ", "spacebar"].includes(k)) e.preventDefault();
    };

    const d = (e: KeyboardEvent) => onKey(e, true);
    const u = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener("keydown", d, { passive: false });
    window.addEventListener("keyup", u, { passive: false });

    const onResize = () => resizeCanvas();
    window.addEventListener("resize", onResize);
    resizeCanvas();

    return () => {
      window.removeEventListener("keydown", d as any);
      window.removeEventListener("keyup", u as any);
      window.removeEventListener("resize", onResize as any);
    };
  }, []);

  // Simple AABB collision detection/resolution
  function resolveCollisions(px: number, py: number, vx: number, vy: number) {
    let onGround = false;
    let nx = px;
    let ny = py;

    // Broad-phase: only check platforms near the player
    const nearby = platforms.current.filter((p) =>
      Math.abs(px - (p.x + p.w / 2)) < 400 && Math.abs(py - (p.y + p.h / 2)) < 400
    );

    for (const p of nearby) {
      // First resolve vertical
      const prevBottom = py + player.current.h;
      const nextBottom = ny + player.current.h + vy * dtRef.current;

      if (
        nx + player.current.w > p.x &&
        nx < p.x + p.w &&
        prevBottom <= p.y &&
        nextBottom >= p.y
      ) {
        // Landed on top
        ny = p.y - player.current.h;
        vy = 0;
        onGround = true;
      }

      // Resolve upward bump (head hit)
      const prevTop = py;
      const nextTop = ny + vy * dtRef.current;
      if (
        nx + player.current.w > p.x &&
        nx < p.x + p.w &&
        prevTop >= p.y + p.h &&
        nextTop <= p.y + p.h
      ) {
        ny = p.y + p.h;
        vy = 0;
      }

      // Horizontal collisions (simple)
      const nextRight = nx + player.current.w + vx * dtRef.current;
      const nextLeft = nx + vx * dtRef.current;

      // Collide with left side of platform
      if (
        py + player.current.h > p.y &&
        py < p.y + p.h &&
        px + player.current.w <= p.x &&
        nextRight > p.x
      ) {
        nx = p.x - player.current.w;
        vx = 0;
      }
      // Collide with right side of platform
      if (
        py + player.current.h > p.y &&
        py < p.y + p.h &&
        px >= p.x + p.w &&
        nextLeft < p.x + p.w
      ) {
        nx = p.x + p.w;
        vx = 0;
      }
    }

    return { nx, ny, vx, vy, onGround };
  }

  // Timekeeping
  const dtRef = useRef(0);
  const lastRef = useRef<number | null>(null);

  // Main game loop
  useEffect(() => {
    if (!running) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    const loop = (t: number) => {
      if (lastRef.current == null) lastRef.current = t;
      const dt = Math.min(1 / 30, (t - lastRef.current) / 1000);
      lastRef.current = t;
      dtRef.current = dt;

      update(dt);
      render(ctx);

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastRef.current = null;
    };
  }, [running]);

  function update(dt: number) {
    const p = player.current;
    const input = inputRef.current;

    // Horizontal movement
    if (input.left && !input.right) {
      p.vx -= MOVE_ACCEL * dt;
      p.facing = -1;
    } else if (input.right && !input.left) {
      p.vx += MOVE_ACCEL * dt;
      p.facing = 1;
    } else {
      // Apply friction when on ground
      if (p.onGround) {
        if (p.vx > 0) p.vx = Math.max(0, p.vx - FRICTION * dt);
        else if (p.vx < 0) p.vx = Math.min(0, p.vx + FRICTION * dt);
      } else {
        // airborne damping
        p.vx *= 0.999;
      }
    }

    // Clamp horizontal speed
    p.vx = Math.max(-MOVE_MAX, Math.min(MOVE_MAX, p.vx));

    // Gravity
    p.vy += GRAVITY * dt;

    // Jump (edge-triggered)
    if (input.jumpPressed && p.onGround) {
      p.vy = -JUMP_VEL;
      p.onGround = false;
    }
    input.jumpPressed = false; // consume edge trigger

    // Integrate
    let nx = p.x + p.vx * dt;
    let ny = p.y + p.vy * dt;

    // Resolve collisions
    const res = resolveCollisions(p.x, p.y, p.vx, p.vy);
    p.x = res.nx;
    p.y = res.ny;
    p.vx = res.vx;
    p.vy = res.vy;
    p.onGround = res.onGround;

    // If no vertical collision occurred, use integrated positions
    if (!p.onGround && Math.abs(ny - p.y) > 0.01) {
      p.y = ny;
    }
    if (Math.abs(nx - p.x) > 0.01) {
      p.x = nx;
    }

    // Update camera to follow player (smoothly)
    const targetX = p.x + p.w / 2 - 320; // center player ~1/3 from left
    camera.current.x += (targetX - camera.current.x) * Math.min(1, 10 * dt);
    camera.current.y = 0; // no vertical camera for simplicity
  }

  function render(ctx: CanvasRenderingContext2D) {
    const canvas = canvasRef.current!;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;

    // Sky background
    ctx.clearRect(0, 0, W, H);
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, "#b3e5fc");
    grd.addColorStop(1, "#e1f5fe");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    // World transform (camera)
    ctx.save();
    ctx.translate(-Math.floor(camera.current.x), -Math.floor(camera.current.y));

    // Draw ground/platforms
    for (const p of platforms.current) {
      // Platform top grass
      ctx.fillStyle = "#6ab04c";
      ctx.fillRect(p.x, p.y, p.w, Math.min(6, p.h));
      // Dirt body
      ctx.fillStyle = "#8d5524";
      ctx.fillRect(p.x, p.y + Math.min(6, p.h), p.w, p.h - Math.min(6, p.h));
      // Edge outline
      ctx.strokeStyle = "#5d3a1a";
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x + 0.5, p.y + 0.5, p.w - 1, p.h - 1);
    }

    // Draw player as a "little man": head + body + limbs
    drawLittleMan(ctx, player.current);

    // Foreground UI world text (e.g., hint)
    ctx.restore();

    // HUD
    ctx.fillStyle = "#222";
    ctx.font = "14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
    ctx.fillText("←/A = Left   →/D = Right   Space/↑/W = Jump", 12, 22);
  }

  function drawLittleMan(ctx: CanvasRenderingContext2D, p: typeof player.current) {
    const x = p.x;
    const y = p.y;

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.beginPath();
    ctx.ellipse(x + p.w / 2, y + p.h + 4, p.w * 0.6, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = "#2d3436"; // dark shirt
    ctx.fillRect(x + 6, y + 16, p.w - 12, p.h - 22);

    // Head
    ctx.fillStyle = "#f1c27d";
    const headR = 10;
    ctx.beginPath();
    ctx.arc(x + p.w / 2, y + headR, headR, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    ctx.fillStyle = "#2d3436";
    const eyeOffset = p.facing === 1 ? 3 : -3;
    ctx.fillRect(x + p.w / 2 + eyeOffset - 2, y + 6, 3, 3);

    // Arms (simple swing based on velocity)
    ctx.strokeStyle = "#2d3436";
    ctx.lineWidth = 3;
    const swing = Math.max(-8, Math.min(8, p.vx * 0.05));
    // Left arm
    ctx.beginPath();
    ctx.moveTo(x + 6, y + 22);
    ctx.lineTo(x + 6 - swing * 0.5, y + 36);
    ctx.stroke();
    // Right arm
    ctx.beginPath();
    ctx.moveTo(x + p.w - 6, y + 22);
    ctx.lineTo(x + p.w - 6 + swing * 0.5, y + 36);
    ctx.stroke();

    // Legs
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#34495e";
    // Left leg
    ctx.beginPath();
    ctx.moveTo(x + 10, y + p.h - 6);
    ctx.lineTo(x + 10 - swing * 0.4, y + p.h + 2);
    ctx.stroke();
    // Right leg
    ctx.beginPath();
    ctx.moveTo(x + p.w - 10, y + p.h - 6);
    ctx.lineTo(x + p.w - 10 + swing * 0.4, y + p.h + 2);
    ctx.stroke();
  }

  // Touch controls
  const setInput = (key: "left" | "right" | "jump", down: boolean) => {
    if (key === "jump") {
      if (down) {
        if (!inputRef.current.jump) inputRef.current.jumpPressed = true;
        inputRef.current.jump = true;
      } else {
        inputRef.current.jump = false;
      }
    } else {
      (inputRef.current as any)[key] = down;
    }
  };

  return (
    <div className="w-full h-full min-h-[520px] flex flex-col items-center justify-start gap-3 p-4 bg-gradient-to-b from-slate-100 to-slate-200">
      <h1 className="text-2xl font-bold tracking-tight">Tiny Platformer</h1>
      <p className="text-sm text-slate-600 -mt-2">Use keyboard or buttons below. Jump across the floating platforms!</p>

      <div className="w-full max-w-4xl aspect-[16/9] bg-white rounded-2xl shadow-lg overflow-hidden border border-slate-200">
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>

      <div className="flex items-center gap-4 mt-2 select-none">
        <button
          className="px-4 py-2 rounded-2xl shadow border bg-white active:scale-95"
          onPointerDown={() => setInput("left", true)}
          onPointerUp={() => setInput("left", false)}
          onPointerCancel={() => setInput("left", false)}
          onPointerLeave={() => setInput("left", false)}
        >
          ← Left
        </button>
        <button
          className="px-4 py-2 rounded-2xl shadow border bg-white active:scale-95"
          onPointerDown={() => setInput("jump", true)}
          onPointerUp={() => setInput("jump", false)}
          onPointerCancel={() => setInput("jump", false)}
          onPointerLeave={() => setInput("jump", false)}
        >
          ⤴ Jump
        </button>
        <button
          className="px-4 py-2 rounded-2xl shadow border bg-white active:scale-95"
          onPointerDown={() => setInput("right", true)}
          onPointerUp={() => setInput("right", false)}
          onPointerCancel={() => setInput("right", false)}
          onPointerLeave={() => setInput("right", false)}
        >
          Right →
        </button>
        <button
          className={`px-4 py-2 rounded-2xl shadow border ${running ? "bg-rose-50" : "bg-emerald-50"}`}
          onClick={() => setRunning((r) => !r)}
        >
          {running ? "Pause" : "Resume"}
        </button>
      </div>

      <div className="text-xs text-slate-500 mt-1">Made with React + Canvas · No libraries</div>
    </div>
  );
}
