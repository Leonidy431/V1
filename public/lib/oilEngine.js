/**
 * OilEngine — послойный имитатор масляной живописи на HTML5 Canvas.
 * Подмалевок -> лессировки (multiply) -> блики (screen) -> лак/кракелюр.
 *
 * Каждый шаг: геометрия мазка ("план") строится один раз из seed-детерминированного
 * генератора случайных чисел, затем анимация лишь изменяет прозрачность фаз по кадрам
 * (holst-буфер this.base хранит уже зафиксированные слои, this.canvas — превью текущего
 * кадра = base + текущая фаза). Это исключает "размазывание" геометрии между кадрами
 * и делает финальный результат детерминированным для одного и того же seed.
 */
(function (global) {
  'use strict';

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seedFromStep(step, digit) {
    return (step * 101 + digit * 977 + 7) >>> 0;
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function jaggedPolygon(rng, cx, cy, w, h, points) {
    const pts = [];
    for (let p = 0; p < points; p++) {
      pts.push([cx + (rng() - 0.5) * w, cy + (rng() - 0.5) * h]);
    }
    return pts;
  }

  function fillPolygon(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
  }

  function strokePolygon(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.stroke();
  }

  class OilEngine {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.base = document.createElement('canvas');
      this.baseCtx = this.base.getContext('2d');
      this.dpr = 1;
      this.width = 0;
      this.height = 0;
      this.resize();
    }

    resize() {
      const dpr = Math.min(global.devicePixelRatio || 1, 2.5);
      this.dpr = dpr;
      const rect = this.canvas.getBoundingClientRect();
      this.width = rect.width;
      this.height = rect.height;
      const pw = Math.max(1, Math.round(this.width * dpr));
      const ph = Math.max(1, Math.round(this.height * dpr));
      this.canvas.width = pw;
      this.canvas.height = ph;
      this.base.width = pw;
      this.base.height = ph;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.baseCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    zoneRect(box) {
      return {
        x: box.x * this.width,
        y: box.y * this.height,
        w: box.w * this.width,
        h: box.h * this.height
      };
    }

    /** Копирует зафиксированный holst (base) поверх видимого canvas — сброс кадра превью. */
    _syncFromBase() {
      const { ctx } = this;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.drawImage(this.base, 0, 0);
      ctx.restore();
    }

    _animate(durationMs, onFrame) {
      return new Promise((resolve) => {
        const start = performance.now();
        const step = (now) => {
          const t = Math.min(1, (now - start) / durationMs);
          this._syncFromBase();
          onFrame(easeInOutCubic(t), this.ctx);
          if (t < 1) {
            global.requestAnimationFrame(step);
          } else {
            resolve();
          }
        };
        global.requestAnimationFrame(step);
      });
    }

    /** Слой 1: имприматура — тёплая тонированная основа с фактурой холста. Фиксируется сразу. */
    paintImprimatura() {
      const draw = (ctx) => {
        const w = this.width, h = this.height;
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;

        const grad = ctx.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, '#3a2c1c');
        grad.addColorStop(0.5, '#241a12');
        grad.addColorStop(1, '#160f0a');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        const vign = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.75);
        vign.addColorStop(0, 'rgba(0,0,0,0)');
        vign.addColorStop(1, 'rgba(0,0,0,0.45)');
        ctx.fillStyle = vign;
        ctx.fillRect(0, 0, w, h);

        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = this._weavePattern();
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      };
      draw(this.baseCtx);
      this._syncFromBase();
    }

    _weavePattern() {
      const tile = document.createElement('canvas');
      tile.width = 6;
      tile.height = 6;
      const tctx = tile.getContext('2d');
      tctx.fillStyle = '#c9b998';
      tctx.fillRect(0, 0, 6, 6);
      tctx.strokeStyle = 'rgba(60,45,25,0.6)';
      tctx.lineWidth = 1;
      tctx.beginPath();
      tctx.moveTo(0, 6); tctx.lineTo(6, 0);
      tctx.moveTo(-2, 2); tctx.lineTo(2, -2);
      tctx.moveTo(4, 8); tctx.lineTo(8, 4);
      tctx.stroke();
      return this.baseCtx.createPattern(tile, 'repeat');
    }

    /** Основной мазок Дома: мягкое проявление геометрии -> подмалёвок -> лессировки -> блики. */
    async paintStep(entry) {
      const box = entry.house.box;
      const rect = this.zoneRect(box);
      const rng = mulberry32(seedFromStep(entry.step, entry.digit));
      const palette = entry.theme.palette;
      const plan = this._buildPlan(entry.theme.key, rect, rng);

      // Фаза A: проявление геометрии Дома (0 -> 1 -> тихо гаснет к следу подмалёвка).
      await this._animate(320, (t, ctx) => {
        const alpha = Math.sin(t * Math.PI) * 0.35;
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#e8c877';
        ctx.setLineDash([6, 8]);
        ctx.lineWidth = 1.2;
        ctx.strokeRect(rect.x + 4, rect.y + 4, rect.w - 8, rect.h - 8);
        ctx.restore();
      });
      // Едва заметный след разметки остаётся на holst'е (академическая штудия).
      this.baseCtx.save();
      this.baseCtx.globalCompositeOperation = 'screen';
      this.baseCtx.globalAlpha = 0.06;
      this.baseCtx.strokeStyle = '#e8c877';
      this.baseCtx.setLineDash([6, 8]);
      this.baseCtx.lineWidth = 1.2;
      this.baseCtx.strokeRect(rect.x + 4, rect.y + 4, rect.w - 8, rect.h - 8);
      this.baseCtx.restore();
      this._syncFromBase();

      // Фаза B: подмалёвок -> лессировки -> блики, единая геометрия на весь мазок.
      await this._animate(560, (t, ctx) => {
        this._drawPlan(entry.theme.key, ctx, rect, palette, plan, t);
      });
      // Фиксируем финальный (t=1) результат мазка в holst-буфер.
      this._drawPlan(entry.theme.key, this.baseCtx, rect, palette, plan, 1);
      this._syncFromBase();
    }

    _buildPlan(key, rect, rng) {
      const { x, y, w, h } = rect;
      switch (key) {
        case 'chaos':
          return {
            polys: Array.from({ length: 4 }, () => jaggedPolygon(rng, x + rng() * w, y + rng() * h, w * 0.5, h * 0.5, 5)),
            blobs: Array.from({ length: 3 }, () => ({ x: x + rng() * w, y: y + rng() * h, r: Math.min(w, h) * (0.15 + rng() * 0.2) })),
            lines: Array.from({ length: 5 }, () => ({ x1: x + rng() * w, y1: y + rng() * h, x2: 0, y2: 0 })).map((l) => ({
              ...l, x2: l.x1 + (rng() - 0.5) * w * 0.3, y2: l.y1 + (rng() - 0.5) * h * 0.3
            }))
          };
        case 'communication':
          return {
            ribbons: Array.from({ length: 3 }, (_, i) => ({
              y0: y + h * (0.2 + i * 0.28) + (rng() - 0.5) * h * 0.1,
              c1: (rng() - 0.5) * h * 0.35,
              c2: (rng() - 0.5) * h * 0.35
            })),
            rays: Array.from({ length: 7 }, (_, i) => (i / 7) * Math.PI * 2 + rng() * 0.3)
          };
        case 'love':
          return {
            blobs: Array.from({ length: 4 }, () => {
              const ang = rng() * Math.PI * 2, dist = rng() * Math.min(w, h) * 0.25;
              return { x: x + w / 2 + Math.cos(ang) * dist, y: y + h / 2 + Math.sin(ang) * dist, r: Math.min(w, h) * (0.18 + rng() * 0.18) };
            })
          };
        case 'trial':
          return {
            shards: Array.from({ length: 4 }, () => ({
              cx: x + rng() * w, cy: y + rng() * h, s: Math.min(w, h) * (0.12 + rng() * 0.15), rot: rng() * Math.PI
            }))
          };
        case 'order':
          return {
            arches: Array.from({ length: 3 }, (_, i) => ({
              ax: x + (w / 3) * i + w / 3 * 0.15, aw: w / 3 * 0.7, ah: h * (0.5 + rng() * 0.4)
            }))
          };
        default:
          return {};
      }
    }

    _drawPlan(key, ctx, rect, palette, plan, t) {
      const fn = this._drawers[key] || this._drawers.chaos;
      fn(ctx, rect, palette, plan, t);
    }

    get _drawers() {
      return {
        chaos: (ctx, rect, palette, plan, t) => {
          ctx.save();
          if (t > 0) {
            ctx.globalCompositeOperation = 'multiply';
            ctx.globalAlpha = 0.45 * Math.min(1, t / 0.4);
            ctx.fillStyle = palette.under;
            plan.polys.forEach((pts) => fillPolygon(ctx, pts));
          }
          if (t > 0.4) {
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = 0.18 * Math.min(1, (t - 0.4) / 0.35);
            plan.blobs.forEach((b) => {
              const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
              g.addColorStop(0, palette.glaze);
              g.addColorStop(1, 'transparent');
              ctx.fillStyle = g;
              ctx.beginPath();
              ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
              ctx.fill();
            });
          }
          if (t > 0.75) {
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = 0.3 * Math.min(1, (t - 0.75) / 0.25);
            ctx.strokeStyle = palette.highlight;
            ctx.lineWidth = 1.4;
            plan.lines.forEach((l) => {
              ctx.beginPath();
              ctx.moveTo(l.x1, l.y1);
              ctx.lineTo(l.x2, l.y2);
              ctx.stroke();
            });
          }
          ctx.restore();
        },

        communication: (ctx, rect, palette, plan, t) => {
          const { x, y, w, h } = rect;
          ctx.save();
          if (t > 0) {
            ctx.globalCompositeOperation = 'multiply';
            ctx.globalAlpha = 0.35 * Math.min(1, t / 0.35);
            ctx.fillStyle = palette.under;
            ctx.fillRect(x, y, w, h);
          }
          if (t > 0.35) {
            ctx.globalCompositeOperation = 'multiply';
            ctx.globalAlpha = 0.22 * Math.min(1, (t - 0.35) / 0.4);
            ctx.strokeStyle = palette.glaze;
            ctx.lineWidth = Math.max(2, w * 0.03);
            ctx.lineCap = 'round';
            plan.ribbons.forEach((r) => {
              ctx.beginPath();
              ctx.moveTo(x, r.y0);
              ctx.bezierCurveTo(x + w * 0.3, r.y0 + r.c1, x + w * 0.6, r.y0 + r.c2, x + w, r.y0);
              ctx.stroke();
            });
          }
          if (t > 0.75) {
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = 0.32 * Math.min(1, (t - 0.75) / 0.25);
            ctx.strokeStyle = palette.highlight;
            ctx.lineWidth = 0.9;
            const ox = x + w * 0.5, oy = y + h * 0.5;
            plan.rays.forEach((ang) => {
              ctx.beginPath();
              ctx.moveTo(ox, oy);
              ctx.lineTo(ox + Math.cos(ang) * w * 0.55, oy + Math.sin(ang) * h * 0.55);
              ctx.stroke();
            });
          }
          ctx.restore();
        },

        love: (ctx, rect, palette, plan, t) => {
          const { x, y, w, h } = rect;
          const cx = x + w / 2, cy = y + h / 2;
          ctx.save();
          if (t > 0) {
            ctx.globalCompositeOperation = 'multiply';
            ctx.globalAlpha = 0.4 * Math.min(1, t / 0.4);
            const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.6);
            g.addColorStop(0, palette.under);
            g.addColorStop(1, 'transparent');
            ctx.fillStyle = g;
            ctx.fillRect(x, y, w, h);
          }
          if (t > 0.4) {
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = 0.22 * Math.min(1, (t - 0.4) / 0.4);
            plan.blobs.forEach((b) => {
              const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
              g.addColorStop(0, palette.glaze);
              g.addColorStop(1, 'transparent');
              ctx.fillStyle = g;
              ctx.beginPath();
              ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
              ctx.fill();
            });
          }
          if (t > 0.8) {
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = 0.4 * Math.min(1, (t - 0.8) / 0.2);
            const rad = Math.min(w, h) * 0.22;
            const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
            g.addColorStop(0, palette.highlight);
            g.addColorStop(1, 'transparent');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(cx, cy, rad, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        },

        trial: (ctx, rect, palette, plan, t) => {
          ctx.save();
          if (t > 0) {
            ctx.globalCompositeOperation = 'multiply';
            ctx.globalAlpha = 0.5 * Math.min(1, t / 0.4);
            ctx.fillStyle = palette.under;
            plan.shards.forEach((s) => fillPolygon(ctx, shardPoints(s.cx + 3, s.cy + 3, s.s, s.rot)));
          }
          if (t > 0.4) {
            ctx.globalCompositeOperation = 'multiply';
            ctx.globalAlpha = 0.28 * Math.min(1, (t - 0.4) / 0.35);
            ctx.fillStyle = palette.glaze;
            plan.shards.forEach((s) => fillPolygon(ctx, shardPoints(s.cx, s.cy, s.s, s.rot)));
          }
          if (t > 0.75) {
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = 0.35 * Math.min(1, (t - 0.75) / 0.25);
            ctx.strokeStyle = palette.highlight;
            ctx.lineWidth = 1;
            plan.shards.forEach((s) => strokePolygon(ctx, shardPoints(s.cx, s.cy, s.s, s.rot)));
          }
          ctx.restore();
        },

        order: (ctx, rect, palette, plan, t) => {
          const { x, y, w, h } = rect;
          const baseY = y + h;
          ctx.save();
          if (t > 0) {
            ctx.globalCompositeOperation = 'multiply';
            ctx.globalAlpha = 0.3 * Math.min(1, t / 0.4);
            const g = ctx.createRadialGradient(x + w / 2, y + h * 0.3, 0, x + w / 2, y + h * 0.3, Math.max(w, h) * 0.6);
            g.addColorStop(0, palette.under);
            g.addColorStop(1, 'transparent');
            ctx.fillStyle = g;
            ctx.fillRect(x, y, w, h);
          }
          if (t > 0.4) {
            ctx.globalCompositeOperation = 'multiply';
            ctx.globalAlpha = 0.3 * Math.min(1, (t - 0.4) / 0.38);
            ctx.fillStyle = palette.glaze;
            plan.arches.forEach((a) => { traceArch(ctx, a, baseY); ctx.fill(); });
          }
          if (t > 0.78) {
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = 0.3 * Math.min(1, (t - 0.78) / 0.22);
            ctx.strokeStyle = palette.highlight;
            ctx.lineWidth = 1;
            plan.arches.forEach((a) => { traceArch(ctx, a, baseY); ctx.stroke(); });
          }
          ctx.restore();
        }
      };
    }

    /** Финальное лакирование: световоздушный баланс. Фиксируется в holst. */
    async varnish() {
      const w = this.width, h = this.height;
      await this._animate(900, (t, ctx) => {
        ctx.save();
        ctx.globalCompositeOperation = 'soft-light';
        ctx.globalAlpha = 0.5 * t;
        const g = ctx.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, 'rgba(255,230,180,0.5)');
        g.addColorStop(1, 'rgba(40,20,10,0.3)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);

        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.35 * t;
        const vign = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.72);
        vign.addColorStop(0, 'rgba(0,0,0,0)');
        vign.addColorStop(1, 'rgba(0,0,0,0.55)');
        ctx.fillStyle = vign;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      });
      // Финальный лак фиксируется в holst как есть (t=1 кадр уже нарисован выше).
      // canvas и base совпадают по физическим пикселям — копируем в единичных координатах,
      // чтобы не применить масштаб dpr повторно поверх уже отмасштабированного кадра.
      this.baseCtx.save();
      this.baseCtx.setTransform(1, 0, 0, 1, 0, 0);
      this.baseCtx.drawImage(this.canvas, 0, 0);
      this.baseCtx.restore();
    }
  }

  function shardPoints(cx, cy, s, rot) {
    const local = [[0, -s], [s * 0.6, s * 0.5], [-s * 0.6, s * 0.5]];
    const cos = Math.cos(rot), sin = Math.sin(rot);
    return local.map(([lx, ly]) => [cx + lx * cos - ly * sin, cy + lx * sin + ly * cos]);
  }

  /** Силуэт стрельчатой (готической) арки — прямой путь на canvas, без полигональных допущений. */
  function traceArch(ctx, a, baseY) {
    const { ax, aw, ah } = a;
    ctx.beginPath();
    ctx.moveTo(ax, baseY);
    ctx.lineTo(ax, baseY - ah * 0.6);
    ctx.quadraticCurveTo(ax, baseY - ah, ax + aw / 2, baseY - ah);
    ctx.quadraticCurveTo(ax + aw, baseY - ah, ax + aw, baseY - ah * 0.6);
    ctx.lineTo(ax + aw, baseY);
    ctx.closePath();
  }

  global.OilEngine = OilEngine;
})(typeof window !== 'undefined' ? window : globalThis);
