// ─── Minimap Canvas ─────────────────────────────────────────────────
// Bird's-eye XY trace visualization, like a strategy-game minimap.
// Stores every visited position for future image-stitching support.

class MinimapCanvas {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    // Recorded points: { x, y, z, timestamp, image: null }
    this.points = [];

    // Current motor positions (in steps)
    this.pos = { x: 0, y: 0, z: 0 };

    // View transform
    this.padding = 40;        // px from canvas edge
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;

    // Bounding box of all recorded points (in step-space)
    this.bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    this.boundsInitialised = false;

    // Mouse state for coordinate readout
    this.mouse = null;         // { canvasX, canvasY } or null

    // Style
    this.colors = {
      bg: "#0a0a0c",
      grid: "#1a1a22",
      gridMajor: "#222230",
      trace: "rgba(255, 199, 18, 0.7)",
      traceFill: "rgba(255, 199, 18, 0.06)",
      crosshair: "#ff6b35",
      text: "#6e6e7a",
      readout: "#e8e8ec",
    };

    this._bindEvents();
    this._resize();
    this._loop();
  }

  // ─── Public API ──────────────────────────────────────────────────

  /** Called on every status update from the ESP32. */
  update(motorsData) {
    const x = motorsData[0]?.position ?? 0;
    const y = motorsData[1]?.position ?? 0;
    const z = motorsData[2]?.position ?? 0;

    // Only record if position actually changed
    if (x !== this.pos.x || y !== this.pos.y || z !== this.pos.z) {
      this.pos = { x, y, z };
      this.points.push({ x, y, z, timestamp: Date.now(), image: null });
      this._expandBounds(x, y);
    }
  }

  /** Clear the recorded trace. */
  clear() {
    this.points = [];
    this.boundsInitialised = false;
    this.bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }

  // ─── Coordinate conversion ───────────────────────────────────────

  /** Step-space → canvas pixel. */
  _toCanvas(sx, sy) {
    return {
      cx: this.offsetX + sx * this.scale,
      cy: this.offsetY - sy * this.scale,   // Y up in step-space → Y down on canvas
    };
  }

  /** Canvas pixel → step-space. */
  _toStep(cx, cy) {
    return {
      sx: (cx - this.offsetX) / this.scale,
      sy: -(cy - this.offsetY) / this.scale,
    };
  }

  // ─── Bounds & viewport ───────────────────────────────────────────

  _expandBounds(x, y) {
    if (!this.boundsInitialised) {
      this.bounds = { minX: x, maxX: x, minY: y, maxY: y };
      this.boundsInitialised = true;
      return;
    }
    if (x < this.bounds.minX) this.bounds.minX = x;
    if (x > this.bounds.maxX) this.bounds.maxX = x;
    if (y < this.bounds.minY) this.bounds.minY = y;
    if (y > this.bounds.maxY) this.bounds.maxY = y;
  }

  _computeViewport() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const pad = this.padding;

    const b = this.bounds;
    const rangeX = b.maxX - b.minX || 1;
    const rangeY = b.maxY - b.minY || 1;

    // Minimum visible range so it doesn't zoom in too much on tiny movements
    const minRange = 200;
    const visRangeX = Math.max(rangeX, minRange);
    const visRangeY = Math.max(rangeY, minRange);

    this.scale = Math.min(
      (w - pad * 2) / visRangeX,
      (h - pad * 2) / visRangeY,
    );

    // Center the bounds in the canvas
    const centerX = (b.minX + b.maxX) / 2;
    const centerY = (b.minY + b.maxY) / 2;

    this.offsetX = w / 2 - centerX * this.scale;
    this.offsetY = h / 2 + centerY * this.scale;   // flip Y
  }

  // ─── Drawing ─────────────────────────────────────────────────────

  _draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Background
    ctx.fillStyle = this.colors.bg;
    ctx.fillRect(0, 0, w, h);

    this._computeViewport();
    this._drawGrid();
    this._drawTrace();
    this._drawCrosshair();
    this._drawReadout();
    this._drawCoordLabel();
  }

  _drawGrid() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Determine a nice grid spacing in step-space
    const pxPerStep = this.scale;
    const targetPxGap = 50;  // aim for grid lines ~50px apart
    const rawStep = targetPxGap / pxPerStep;
    const gridStep = this._niceStep(rawStep);
    const majorEvery = 5;

    // Visible range in step-space
    const topLeft = this._toStep(0, 0);
    const bottomRight = this._toStep(w, h);
    const sxMin = Math.floor(topLeft.sx / gridStep) * gridStep;
    const sxMax = Math.ceil(bottomRight.sx / gridStep) * gridStep;
    const syMin = Math.floor(bottomRight.sy / gridStep) * gridStep;
    const syMax = Math.ceil(topLeft.sy / gridStep) * gridStep;

    ctx.lineWidth = 1;

    // Vertical lines
    for (let sx = sxMin; sx <= sxMax; sx += gridStep) {
      const { cx } = this._toCanvas(sx, 0);
      const isMajor = Math.round(sx / gridStep) % majorEvery === 0;
      ctx.strokeStyle = isMajor ? this.colors.gridMajor : this.colors.grid;
      ctx.beginPath();
      ctx.moveTo(Math.round(cx) + 0.5, 0);
      ctx.lineTo(Math.round(cx) + 0.5, h);
      ctx.stroke();
    }

    // Horizontal lines
    for (let sy = syMin; sy <= syMax; sy += gridStep) {
      const { cy } = this._toCanvas(0, sy);
      const isMajor = Math.round(sy / gridStep) % majorEvery === 0;
      ctx.strokeStyle = isMajor ? this.colors.gridMajor : this.colors.grid;
      ctx.beginPath();
      ctx.moveTo(0, Math.round(cy) + 0.5);
      ctx.lineTo(w, Math.round(cy) + 0.5);
      ctx.stroke();
    }

    // Origin axes
    const origin = this._toCanvas(0, 0);
    ctx.strokeStyle = "#2a2a3a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(Math.round(origin.cx) + 0.5, 0);
    ctx.lineTo(Math.round(origin.cx) + 0.5, h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, Math.round(origin.cy) + 0.5);
    ctx.lineTo(w, Math.round(origin.cy) + 0.5);
    ctx.stroke();
  }

  /** Round to a "nice" step: 1, 2, 5, 10, 20, 50, 100, ... */
  _niceStep(raw) {
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / pow;
    let nice;
    if (norm < 1.5) nice = 1;
    else if (norm < 3.5) nice = 2;
    else if (norm < 7.5) nice = 5;
    else nice = 10;
    return nice * pow;
  }

  _drawTrace() {
    const ctx = this.ctx;
    const pts = this.points;
    if (pts.length < 2) return;

    // Filled area under the trace
    ctx.beginPath();
    const first = this._toCanvas(pts[0].x, pts[0].y);
    ctx.moveTo(first.cx, first.cy);
    for (let i = 1; i < pts.length; i++) {
      const p = this._toCanvas(pts[i].x, pts[i].y);
      ctx.lineTo(p.cx, p.cy);
    }
    ctx.strokeStyle = this.colors.trace;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  _drawCrosshair() {
    const ctx = this.ctx;
    const { cx, cy } = this._toCanvas(this.pos.x, this.pos.y);
    const r = 8;
    const gap = 3;

    ctx.strokeStyle = this.colors.crosshair;
    ctx.lineWidth = 2;

    // Horizontal arms
    ctx.beginPath();
    ctx.moveTo(cx - r, cy);
    ctx.lineTo(cx - gap, cy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + gap, cy);
    ctx.lineTo(cx + r, cy);
    ctx.stroke();

    // Vertical arms
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx, cy - gap);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy + gap);
    ctx.lineTo(cx, cy + r);
    ctx.stroke();

    // Center dot
    ctx.fillStyle = this.colors.crosshair;
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Current position label (bottom-left corner). */
  _drawCoordLabel() {
    const ctx = this.ctx;
    ctx.font = "11px 'JetBrains Mono', monospace";
    ctx.fillStyle = this.colors.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    const label = `X: ${this.pos.x}  Y: ${this.pos.y}  Z: ${this.pos.z}`;
    ctx.fillText(label, 8, this.canvas.height - 8);
  }

  /** Coordinate readout at mouse position. */
  _drawReadout() {
    if (!this.mouse) return;
    const ctx = this.ctx;
    const { sx, sy } = this._toStep(this.mouse.canvasX, this.mouse.canvasY);

    const text = `${Math.round(sx)}, ${Math.round(sy)}`;
    ctx.font = "11px 'JetBrains Mono', monospace";
    const tw = ctx.measureText(text).width;

    const px = this.mouse.canvasX + 12;
    const py = this.mouse.canvasY - 8;

    ctx.fillStyle = "rgba(10, 10, 12, 0.85)";
    ctx.fillRect(px - 4, py - 13, tw + 8, 18);
    ctx.fillStyle = this.colors.readout;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, px, py);
  }

  // ─── Events & lifecycle ──────────────────────────────────────────

  _bindEvents() {
    // Resize canvas to match its CSS size
    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(this.canvas);

    // Mouse tracking for coordinate readout
    this.canvas.addEventListener("mousemove", (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.mouse = {
        canvasX: (e.clientX - rect.left) * dpr,
        canvasY: (e.clientY - rect.top) * dpr,
      };
    });
    this.canvas.addEventListener("mouseleave", () => {
      this.mouse = null;
    });
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
  }

  _loop() {
    this._draw();
    requestAnimationFrame(() => this._loop());
  }
}
