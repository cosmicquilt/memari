"use client";

// A module being resized, as the editor does it (Andrew, 2026-09-25: "a cool
// demo of maybe like a module resizing below near Design a week once"): a
// cursor takes the habit tracker's bottom handle and drags it down, rows
// arrive and the to-do list below gives up the space; then back. Drawn by
// the editor's own painter from the editor's own renderers (resizeDemoData.ts),
// and morphed between heights the way the editor morphs: an element with
// the same id at both heights moves, one without fades. Visitors can take
// the handle themselves; the demo carries on a few seconds after they let
// go. Still, at a middle height, for reduced motion.

import { useEffect, useRef } from "react";
import { drawPreview, resolveCanvasFamily } from "@/app/planner/drawPreview";
import type { DemoMark, ResizeDemoData } from "./resizeDemoData";
import styles from "./landing.module.css";

const ACCENT = "#4a5cff";
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The marks between two heights: shared ids move, the rest fade. */
function blend(a: DemoMark[], b: DemoMark[], t: number): DemoMark[] {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const inB = new Map(b.map((m) => [m.id, m]));
  const inA = new Set(a.map((m) => m.id));
  const out: DemoMark[] = [];
  for (const m of a) {
    const n = inB.get(m.id);
    if (n && n.k === m.k && m.k === "r" && n.k === "r") out.push({ ...m, x: lerp(m.x, n.x, t), y: lerp(m.y, n.y, t), w: lerp(m.w, n.w, t), h: lerp(m.h, n.h, t) });
    else if (n && n.k === m.k && m.k === "t" && n.k === "t") out.push({ ...m, x: lerp(m.x, n.x, t), y: lerp(m.y, n.y, t), w: lerp(m.w, n.w, t) });
    else out.push({ ...m, o: (m.o ?? 1) * (1 - t) });
  }
  for (const m of b) if (!inA.has(m.id)) out.push({ ...m, o: (m.o ?? 1) * t });
  return out;
}

/** The demo's script, one loop: where the handle is (in steps from the
 *  smallest height), where the cursor is, and whether it is pressing. */
type Pose = { p: number; cursor: [number, number] | null; down: boolean };
const LOOP = 9.2;
function script(time: number, last: number, handle: (p: number) => [number, number]): Pose {
  const t = time % LOOP;
  const rest: [number, number] = [handle(0)[0] + 150, handle(0)[1] + 170];
  const seg = (a: number, b: number) => Math.min(1, Math.max(0, (t - a) / (b - a)));
  const lo = 0;
  const hi = last;
  if (t < 0.9) {
    const u = ease(seg(0, 0.9));
    const h = handle(lo);
    return { p: lo, cursor: [lerp(rest[0], h[0], u), lerp(rest[1], h[1], u)], down: false };
  }
  if (t < 1.1) return { p: lo, cursor: handle(lo), down: t > 1.0 };
  if (t < 3.1) {
    const p = lerp(lo, hi, ease(seg(1.1, 3.1)));
    return { p, cursor: handle(p), down: true };
  }
  if (t < 4.4) return { p: hi, cursor: handle(hi), down: t < 3.3 };
  if (t < 4.6) return { p: hi, cursor: handle(hi), down: t > 4.5 };
  if (t < 6.4) {
    const p = lerp(hi, lo, ease(seg(4.6, 6.4)));
    return { p, cursor: handle(p), down: true };
  }
  if (t < 6.7) return { p: lo, cursor: handle(lo), down: t < 6.55 };
  const u = ease(seg(6.7, 7.8));
  const h = handle(lo);
  return { p: lo, cursor: t < 7.8 ? [lerp(h[0], rest[0], u), lerp(h[1], rest[1], u)] : null, down: false };
}

export function ResizeDemo({ data }: { data: ResizeDemoData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { steps, width: W, height: H } = data;
    const last = steps.length - 1;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // A module's outline at a (fractional) step, in print px.
    const border = (p: number, id = "habit") => {
      const i = Math.min(last, Math.max(0, Math.floor(p)));
      const j = Math.min(last, i + 1);
      const a = steps[i].find((m) => m.id === `${id}-border`);
      const b = steps[j].find((m) => m.id === `${id}-border`);
      if (!a || !b || a.k !== "r" || b.k !== "r") return { x: 0, y: 0, w: W, h: H / 2 };
      const t = p - i;
      return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t) };
    };
    const handle = (p: number): [number, number] => {
      const b = border(p);
      return [b.x + b.w / 2, b.y + b.h];
    };

    let scale = 1;
    const size = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2.5, window.devicePixelRatio || 1);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      scale = canvas.width / W;
    };

    const draw = (pose: Pose) => {
      const i = Math.min(last, Math.max(0, Math.floor(pose.p)));
      const marks = blend(steps[i], steps[Math.min(last, i + 1)], pose.p - i);
      // Each module drawn inside its own outline as it moves, the way the
      // editor sweeps a resize: rows arriving are uncovered by the edge, not
      // faded in beyond it. (drawPreview clears only inside the clip.)
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const id of ["habit", "todo"]) {
        const b = border(pose.p, id);
        const edge = 3;
        ctx.save();
        ctx.beginPath();
        ctx.rect((b.x - edge) * scale, (b.y - edge) * scale, (b.w + edge * 2) * scale, (b.h + edge * 2) * scale);
        ctx.clip();
        drawPreview(
          ctx,
          marks.filter((m) => m.id.startsWith(`${id}-`)),
          W,
          H
        );
        ctx.restore();
      }
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      // The page's dot grid, behind the modules.
      const { dots } = data;
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = "rgba(28, 25, 23, 0.28)";
      ctx.beginPath();
      for (let r = 0; r <= dots.rows; r++)
        for (let c = 0; c <= dots.cols; c++) {
          ctx.moveTo(dots.x + c * dots.dx + 3.2, dots.y + r * dots.dy);
          ctx.arc(dots.x + c * dots.dx, dots.y + r * dots.dy, 3.2, 0, Math.PI * 2);
        }
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      // The editor's selection: an outline just outside the module and its
      // bottom handle.
      const b = border(pose.p);
      const pad = 6;
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 2.5 / scale * 1.4;
      ctx.strokeRect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2);
      const [hx, hy] = handle(pose.p);
      const r = (pose.down ? 13 : 11) / Math.sqrt(scale);
      ctx.beginPath();
      ctx.roundRect(hx - r * 2.2, hy + pad - r * 0.55, r * 4.4, r * 1.1, r * 0.55);
      ctx.fillStyle = pose.down ? ACCENT : "#ffffff";
      ctx.fill();
      ctx.lineWidth = 2 / scale * 1.4;
      ctx.stroke();
      if (pose.cursor) {
        // A pointer, its tip on the handle.
        const [cx, cy] = pose.cursor;
        const k = 1.25 / scale;
        ctx.save();
        ctx.translate(cx + 4 / scale, cy + pad + 2 / scale);
        ctx.scale(k * 1.4, k * 1.4);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, 17);
        ctx.lineTo(4.2, 13.2);
        ctx.lineTo(7.2, 19.6);
        ctx.lineTo(9.8, 18.4);
        ctx.lineTo(6.9, 12.2);
        ctx.lineTo(12.2, 12.2);
        ctx.closePath();
        ctx.fillStyle = "#1c1917";
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.4;
        ctx.lineJoin = "round";
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    };

    // What drives the handle: the script, the visitor's drag, the handle
    // easing to a whole row once let go, a hold there, or easing home
    // before the script takes over again.
    type Mode = "script" | "drag" | "settle" | "hold" | "home";
    let mode: Mode = "script";
    let p = 0;
    let scriptStart = performance.now();
    let drag = { from: 0, y0: 0 };
    let ease0 = { from: 0, to: 0, at: 0 };
    let holdUntil = 0;
    let scriptPose: Pose = { p: 0, cursor: null, down: false };

    // The step whose handle sits at `y` (print px), so the handle stays
    // under the pointer: a step is a row and its gutter, not one row.
    const stepAt = (y: number) => {
      for (let i = 0; i < last; i++) {
        const [a, b] = [handle(i)[1], handle(i + 1)[1]];
        if (y <= b) return Math.max(0, i + (y - a) / (b - a));
      }
      return last;
    };
    const nearHandle = (e: { clientX: number; clientY: number }) => {
      const rect = canvas.getBoundingClientRect();
      const [hx, hy] = handle(p);
      const k = rect.width / W;
      return Math.hypot(e.clientX - rect.left - hx * k, e.clientY - rect.top - hy * k) < 30;
    };
    // On a phone the demo is most of the screen: a finger anywhere else on it
    // scrolls the page as usual, and only one on the handle holds it still.
    const onTouch = (e: TouchEvent) => {
      if (e.touches.length === 1 && nearHandle(e.touches[0])) e.preventDefault();
    };
    canvas.addEventListener("touchstart", onTouch, { passive: false });
    const onDown = (e: PointerEvent) => {
      if (!nearHandle(e)) return;
      mode = "drag";
      drag = { from: p, y0: e.clientY };
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
      kick();
    };
    const onMove = (e: PointerEvent) => {
      if (mode !== "drag") {
        canvas.style.cursor = nearHandle(e) ? "ns-resize" : "default";
        return;
      }
      const k = canvas.getBoundingClientRect().width / W;
      p = stepAt(handle(drag.from)[1] + (e.clientY - drag.y0) / k);
      kick();
    };
    const onUp = () => {
      if (mode !== "drag") return;
      mode = "settle";
      ease0 = { from: p, to: Math.round(p), at: performance.now() };
      kick();
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    let raf = 0;
    let visible = false;
    const frame = (now: number) => {
      raf = 0;
      if (mode === "script") {
        scriptPose = script((now - scriptStart) / 1000, last, handle);
        p = scriptPose.p;
        draw(scriptPose);
      } else if (mode === "drag") {
        draw({ p, cursor: null, down: true });
      } else if (mode === "settle" || mode === "home") {
        const u = Math.min(1, (now - ease0.at) / (mode === "home" ? 600 : 220));
        p = lerp(ease0.from, ease0.to, ease(u));
        draw({ p, cursor: null, down: false });
        if (u >= 1) {
          if (mode === "settle") {
            mode = "hold";
            holdUntil = now + 4000;
          } else {
            mode = "script";
            scriptStart = now;
          }
        }
      } else {
        draw({ p, cursor: null, down: false });
        if (now > holdUntil) {
          mode = "home";
          ease0 = { from: p, to: 0, at: now };
        }
      }
      if (visible && !reduce) raf = requestAnimationFrame(frame);
    };
    const kick = () => {
      if (!raf && visible && !reduce) raf = requestAnimationFrame(frame);
    };

    const still = () => draw({ p: Math.round(last / 2), cursor: null, down: false });
    const ro = new ResizeObserver(() => {
      size();
      if (reduce || !raf) still();
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && mode === "script") scriptStart = performance.now();
      kick();
    });

    let cancelled = false;
    (async () => {
      try {
        await document.fonts.load(`40px ${resolveCanvasFamily(data.fontFamily)}`);
      } catch {
        // Drawn in the fallback face.
      }
      if (cancelled) return;
      size();
      still();
      io.observe(canvas);
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("touchstart", onTouch);
    };
  }, [data]);

  return (
    <figure className={styles.resizeDemo}>
      <div className={styles.resizeDemoPage} style={{ aspectRatio: `${data.width} / ${data.height}` }}>
        <canvas ref={canvasRef} className={styles.resizeDemoCanvas} aria-label="A habit tracker being resized: rows are added as its handle is dragged down, and the to-do list below gives up the space." role="img" />
      </div>
      <figcaption className={styles.resizeDemoCaption}>Drag a module - everything around it makes room.</figcaption>
    </figure>
  );
}
