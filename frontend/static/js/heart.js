/**
 * 动态心形图案 - 核心动画逻辑（3D 心形版）
 *
 * 视觉构成：
 * 1. 3D 心形参数方程（沿 Y 轴旋转的心形曲面）
 * 2. 透视投影：近大远小，带深度雾化
 * 3. 自动旋转：绕 Y 轴持续旋转，速度可调
 * 4. 鼠标交互：移动洒落星光小爱心，点击绽放
 * 5. 柔光精灵预渲染：发光点与爱心烘焙到离屏画布，运行时仅 drawImage
 * 6. 与后端配置同步：从 /api/config 读取参数，修改后保存
 */
(function () {
    "use strict";

    // 页面模式：edit=可编辑主页；share=只读分享页（无控制面板，禁止保存参数）
    const IS_SHARE = window.PAGE_MODE === "share";

    const canvas = document.getElementById("heart-canvas");
    const ctx = canvas.getContext("2d");

    // ============== 全局配置（与后端字段同名） ==============
    const cfg = {
        particle_count: 1200,
        heart_color: "#ff6f9c",
        background_color: "#140b24",
        beat_speed: 1.0,
        particle_size: 2.0,
        spread_ratio: 1.0,
        show_text: true,
        text_content: "I Love You",
        text_color: "#ffeef4",
        depth_3d: true,
        rotation_speed: 0.4,
    };

    // ============== 画布尺寸 ==============
    let W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
        W = window.innerWidth;
        H = window.innerHeight;
        canvas.width = W * DPR;
        canvas.height = H * DPR;
        canvas.style.width = W + "px";
        canvas.style.height = H + "px";
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        rebuildStars();
    }
    window.addEventListener("resize", resize);

    // ============== 颜色工具 ==============
    function hexToRgb(hex) {
        const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (!m) return { r: 255, g: 111, b: 156 };
        return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
    }
    function rgbaStr(rgb, a) { return `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`; }
    function mixRgb(a, b, t) {
        return {
            r: Math.round(a.r + (b.r - a.r) * t),
            g: Math.round(a.g + (b.g - a.g) * t),
            b: Math.round(a.b + (b.b - a.b) * t),
        };
    }

    // ============== 3D 心形参数方程 ==============
    /**
     * 3D 心形曲面参数方程
     * x = 16 sin³(t)
     * y = 13 cos(t) - 5 cos(2t) - 2 cos(3t) - cos(4t)
     * z = z 方向厚度（用 u 参数控制，让心形沿 z 轴有体积）
     */
    function heart3D(t, u) {
        const x = 16 * Math.pow(Math.sin(t), 3);
        const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        // z 方向厚度：越靠近边缘越薄，中心最厚
        const thickness = Math.sin(t) * 0.6 + 0.4;
        const z = u * 10 * thickness;
        return { x, y, z };
    }

    // 旋转矩阵（绕 Y 轴）
    function rotateY(x, z, angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return {
            x: x * cos - z * sin,
            z: x * sin + z * cos,
        };
    }

    // 透视投影
    function project(x, y, z, fov, scale) {
        const depth = z + 35; // 把心形推到相机前方
        const s = fov / Math.max(depth, 1);
        return {
            x: x * s * scale,
            y: y * s * scale,
            scale: s,
            depth: depth,
        };
    }

    // ============== 柔光精灵（离屏预烘焙） ==============
    let sprites = null;
    let spriteColor = "";

    function makeGlowSprite(rgb) {
        const S = 128;
        const c = document.createElement("canvas");
        c.width = c.height = S;
        const g = c.getContext("2d");
        const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
        grd.addColorStop(0, rgbaStr(rgb, 0.95));
        grd.addColorStop(0.22, rgbaStr(rgb, 0.42));
        grd.addColorStop(0.55, rgbaStr(rgb, 0.12));
        grd.addColorStop(1, rgbaStr(rgb, 0));
        g.fillStyle = grd;
        g.fillRect(0, 0, S, S);
        return c;
    }

    function traceHeartPath(g, s) {
        g.beginPath();
        const step = 0.08;
        for (let tt = 0; tt <= Math.PI * 2 + 0.001; tt += step) {
            const pt = heart3D(tt, 0);
            const x = pt.x * s;
            const y = -pt.y * s;
            if (tt === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
        }
        g.closePath();
    }

    function makeHeartSprite(rgb) {
        const S = 160;
        const c = document.createElement("canvas");
        c.width = c.height = S;
        const g = c.getContext("2d");
        g.translate(S / 2, S / 2 + 4);
        const s = 2.7;

        traceHeartPath(g, s);
        g.shadowColor = rgbaStr(rgb, 0.95);
        g.shadowBlur = 26;
        g.fillStyle = rgbaStr(rgb, 0.95);
        g.fill();

        g.shadowBlur = 0;
        g.fill();

        g.save();
        traceHeartPath(g, s);
        g.clip();
        const hl = g.createRadialGradient(0, -s * 3, 0, 0, -s * 3, s * 13);
        hl.addColorStop(0, "rgba(255,255,255,0.5)");
        hl.addColorStop(0.5, "rgba(255,255,255,0.12)");
        hl.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = hl;
        g.fillRect(-70, -70, 140, 140);
        g.restore();
        return c;
    }

    function ensureSprites() {
        if (spriteColor === cfg.heart_color && sprites) return;
        const main = hexToRgb(cfg.heart_color);
        const light = mixRgb(main, { r: 255, g: 240, b: 246 }, 0.55);
        sprites = {
            glowMain: makeGlowSprite(main),
            glowLight: makeGlowSprite(light),
            glowWhite: makeGlowSprite({ r: 255, g: 255, b: 255 }),
            heartMain: makeHeartSprite(main),
            heartLight: makeHeartSprite(light),
            heartWhite: makeHeartSprite(mixRgb(main, { r: 255, g: 255, b: 255 }, 0.75)),
        };
        spriteColor = cfg.heart_color;
    }

    // ============== 背景渐变层缓存 ==============
    let bgLayer = { key: "", canvas: null };
    function ensureBackground() {
        const key = W + "_" + H + "_" + cfg.background_color + "_" + cfg.heart_color;
        if (bgLayer.key === key && bgLayer.canvas) return bgLayer.canvas;

        const c = document.createElement("canvas");
        c.width = W * DPR;
        c.height = H * DPR;
        const g = c.getContext("2d");
        g.setTransform(DPR, 0, 0, DPR, 0, 0);

        const bg = hexToRgb(cfg.background_color);
        const center = mixRgb(bg, { r: 255, g: 255, b: 255 }, 0.07);
        const warm = mixRgb(bg, hexToRgb(cfg.heart_color), 0.22);
        const grd = g.createRadialGradient(
            W / 2, H * 0.44, 0,
            W / 2, H * 0.5, Math.max(W, H) * 0.78
        );
        grd.addColorStop(0, rgbaStr(center, 1));
        grd.addColorStop(0.5, rgbaStr(warm, 1));
        grd.addColorStop(1, rgbaStr(bg, 1));
        g.fillStyle = grd;
        g.fillRect(0, 0, W, H);

        bgLayer = { key, canvas: c };
        return c;
    }

    // ============== 粒子系统 ==============
    let particles3d = [];
    let stars = [];
    let embers = [];
    let flyParticles = [];

    function rebuildStars() {
        stars = [];
        const count = Math.min(190, Math.floor((W * H) / 8500));
        for (let i = 0; i < count; i++) {
            stars.push({
                x: Math.random() * W,
                y: Math.random() * H,
                r: 0.4 + Math.random() * 1.2,
                phase: Math.random() * Math.PI * 2,
                tw: 0.4 + Math.random() * 1.4,
                tint: Math.random() < 0.72 ? 2 : 1,
            });
        }
    }

    function rebuildEmbers() {
        embers = [];
        for (let i = 0; i < 38; i++) {
            embers.push({
                ph: Math.random(),
                rise: 0.018 + Math.random() * 0.03,
                ox: Math.random() * W,
                sway: Math.random() * Math.PI * 2,
                amp: 12 + Math.random() * 26,
                size: 0.9 + Math.random() * 1.8,
                tint: Math.random() < 0.55 ? 1 : (Math.random() < 0.7 ? 2 : 0),
            });
        }
    }

    function rebuildParticles() {
        particles3d = [];
        const N = cfg.particle_count;
        const glowTints = [0, 1, 2]; // 主色 / 柔粉 / 白

        for (let i = 0; i < N; i++) {
            const t = Math.random() * Math.PI * 2;
            // u 控制 z 方向厚度：-1 到 1
            const u = (Math.random() * 2 - 1) * (0.3 + Math.random() * 0.7);
            const pos = heart3D(t, u);

            const roll = Math.random();
            particles3d.push({
                t: t,
                u: u,
                x: pos.x,
                y: pos.y,
                z: pos.z,
                // 沿曲面缓慢流动
                flowSpeed: 0.05 + Math.random() * 0.15,
                // 闪烁
                phase: Math.random() * Math.PI * 2,
                tw: 1.2 + Math.random() * 2.8,
                sizeMul: 0.6 + Math.random() * 0.9,
                base: 0.55 + Math.random() * 0.45,
                tint: roll < 0.54 ? 0 : (roll < 0.91 ? 1 : 2),
                // 随机偏移让表面更自然
                offsetX: (Math.random() - 0.5) * 0.4,
                offsetY: (Math.random() - 0.5) * 0.4,
            });
        }
    }

    function spawnFlyParticle(x, y) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.6 + Math.random() * 1.8;
        flyParticles.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 0.9,
            rot: Math.random() * Math.PI * 2,
            vr: (Math.random() - 0.5) * 2.4,
            life: 1.0,
            decay: 0.009 + Math.random() * 0.008,
            size: 11 + Math.random() * 12,
            phase: Math.random() * Math.PI * 2,
            kind: Math.random() < 0.72 ? 0 : 1,
            tint: Math.random() < 0.5 ? 0 : (Math.random() < 0.7 ? 1 : 2),
        });
        if (flyParticles.length > 260) flyParticles.shift();
    }

    // ============== 心跳函数 ==============
    function beatState(timeSec) {
        const T = 1.15;
        const phase = ((timeSec * cfg.beat_speed) % T) / T;
        const bump = (p, c, w) => Math.exp(-Math.pow((p - c) / w, 2));
        const pulse = bump(phase, 0.09, 0.075) * 0.085 + bump(phase, 0.30, 0.095) * 0.05;
        const breathe = Math.sin(timeSec * 0.8) * 0.015;
        return { scale: 1 + pulse + breathe, pulse };
    }

    // ============== 绘制背景 ==============
    function drawBackground() {
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        ctx.fillStyle = cfg.background_color;
        ctx.fillRect(0, 0, W, H);
        ctx.drawImage(ensureBackground(), 0, 0, W, H);
    }

    // ============== 绘制闪烁星空 ==============
    function drawStars(timeSec) {
        ctx.globalCompositeOperation = "source-over";
        const list = [sprites.glowMain, sprites.glowLight, sprites.glowWhite];
        for (let i = 0; i < stars.length; i++) {
            const s = stars[i];
            const tw = Math.pow(0.5 + 0.5 * Math.sin(timeSec * s.tw + s.phase), 2);
            const alpha = 0.12 + 0.6 * tw;
            const d = s.r * (5 + tw * 3.5);
            ctx.globalAlpha = alpha;
            ctx.drawImage(list[s.tint], s.x - d / 2, s.y - d / 2, d, d);
        }
        ctx.globalAlpha = 1;
    }

    // ============== 绘制上升的许愿光点 ==============
    function drawEmbers(timeSec, dt) {
        ctx.globalCompositeOperation = "lighter";
        const list = [sprites.glowMain, sprites.glowLight, sprites.glowWhite];
        for (let i = 0; i < embers.length; i++) {
            const e = embers[i];
            e.ph -= dt * e.rise;
            if (e.ph <= 0) {
                e.ph = 1;
                e.ox = Math.random() * W;
                e.sway = Math.random() * Math.PI * 2;
            }
            const y = H * (1 - e.ph) + 12;
            const x = e.ox + Math.sin(timeSec * 0.9 + e.sway) * e.amp;
            const alpha = Math.sin(e.ph * Math.PI) * 0.7;
            const d = e.size * 7.5;
            ctx.globalAlpha = alpha;
            ctx.drawImage(list[e.tint], x - d / 2, y - d / 2, d, d);
        }
        ctx.globalAlpha = 1;
    }

    // ============== 绘制 3D 心形 ==============
    let rotAngle = 0;

    function drawHeart3D(timeSec, dt) {
        const cx = W / 2;
        const cy = H / 2;
        const baseScale = Math.min(W, H) / 45 * cfg.spread_ratio;
        const beat = beatState(timeSec);
        const fov = 60;

        // 更新旋转角度
        rotAngle += cfg.rotation_speed * dt;

        ctx.globalCompositeOperation = "lighter";

        // 心形整体光晕（2D 层，不旋转）
        const haloD = baseScale * 30 * beat.scale;
        ctx.globalAlpha = 0.10 + beat.pulse * 0.5;
        ctx.drawImage(sprites.glowMain, cx - haloD / 2, cy - haloD / 2, haloD, haloD);
        const haloD2 = baseScale * 15 * beat.scale;
        ctx.globalAlpha = 0.06 + beat.pulse * 0.35;
        ctx.drawImage(sprites.glowWhite, cx - haloD2 / 2, cy - haloD2 / 2, haloD2, haloD2);

        // 预计算所有粒子的投影位置并排序
        const projected = [];
        const glowList = [sprites.glowMain, sprites.glowLight, sprites.glowWhite];

        for (let i = 0; i < particles3d.length; i++) {
            const p = particles3d[i];

            // 沿曲面缓慢流动
            p.t += p.flowSpeed * dt;
            if (p.t > Math.PI * 2) p.t -= Math.PI * 2;

            // 重新计算 3D 位置（带流动和心跳）
            const pos = heart3D(p.t, p.u);
            const x3 = (pos.x + p.offsetX) * beat.scale;
            const y3 = (pos.y + p.offsetY) * beat.scale;
            const z3 = pos.z * beat.scale;

            // 绕 Y 轴旋转
            const rot = rotateY(x3, z3, rotAngle);

            // 透视投影
            const proj = project(rot.x, y3, rot.z, fov, baseScale);

            projected.push({
                screenX: cx + proj.x,
                screenY: cy - proj.y,
                scale: proj.scale,
                depth: proj.depth,
                particle: p,
            });
        }

        // 按深度排序：远的先画，近的后画（ painter's algorithm ）
        projected.sort((a, b) => b.depth - a.depth);

        // 绘制排序后的粒子
        for (let i = 0; i < projected.length; i++) {
            const item = projected[i];
            const p = item.particle;

            // 闪烁
            const tw = Math.pow(0.5 + 0.5 * Math.sin(timeSec * p.tw + p.phase), 2.2);
            const depthFade = Math.max(0.15, Math.min(1, 1.4 - item.depth / 60));
            const alpha = p.base * (0.2 + 0.5 * tw) * depthFade;

            // 大小随透视缩放
            const d = cfg.particle_size * p.sizeMul * 6.5 * item.scale * beat.scale;

            ctx.globalAlpha = alpha;
            ctx.drawImage(
                glowList[p.tint],
                item.screenX - d / 2,
                item.screenY - d / 2,
                d,
                d
            );
        }

        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
    }

    // ============== 绘制 2D 心形（兼容模式） ==============
    function drawHeart2D(timeSec, dt) {
        const cx = W / 2;
        const cy = H / 2;
        const scale = Math.min(W, H) / 40 * cfg.spread_ratio;
        const beat = beatState(timeSec);

        ctx.globalCompositeOperation = "lighter";

        const haloD = scale * 34 * beat.scale;
        ctx.globalAlpha = 0.12 + beat.pulse * 0.55;
        ctx.drawImage(sprites.glowMain, cx - haloD / 2, cy - haloD / 2 + scale * 1.5, haloD, haloD);
        const haloD2 = scale * 17 * beat.scale;
        ctx.globalAlpha = 0.07 + beat.pulse * 0.4;
        ctx.drawImage(sprites.glowWhite, cx - haloD2 / 2, cy - haloD2 / 2 + scale * 1.5, haloD2, haloD2);

        const glowList = [sprites.glowMain, sprites.glowLight, sprites.glowWhite];

        for (let i = 0; i < particles3d.length; i++) {
            const p = particles3d[i];
            p.t += p.flowSpeed * dt;
            if (p.t > Math.PI * 2) p.t -= Math.PI * 2;

            const pos = heart3D(p.t, 0);
            const X = (pos.x + p.offsetX) * beat.scale;
            const Y = (-pos.y + p.offsetY) * beat.scale;

            const tw = Math.pow(0.5 + 0.5 * Math.sin(timeSec * p.tw + p.phase), 2.2);
            const alpha = p.base * (0.2 + 0.5 * tw);
            const d = cfg.particle_size * p.sizeMul * 7 * beat.scale;

            ctx.globalAlpha = alpha;
            ctx.drawImage(glowList[p.tint], cx + X * scale - d / 2, cy + Y * scale - d / 2, d, d);
        }

        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
    }

    // ============== 绘制飞散的星光小爱心 ==============
    function drawFlyParticles(timeSec, dt) {
        ctx.globalCompositeOperation = "lighter";
        const step = dt * 60;
        const heartImgs = [sprites.heartMain, sprites.heartLight, sprites.heartWhite];
        const glowImgs = [sprites.glowMain, sprites.glowLight, sprites.glowWhite];

        for (let i = flyParticles.length - 1; i >= 0; i--) {
            const f = flyParticles[i];
            f.vy += 0.012 * step;
            f.vx *= Math.pow(0.985, step);
            f.vy *= Math.pow(0.992, step);
            f.x += f.vx * step;
            f.y += f.vy * step;
            f.rot += f.vr * dt;
            f.life -= f.decay * step;
            if (f.life <= 0) {
                flyParticles.splice(i, 1);
                continue;
            }

            const twinkle = 0.65 + 0.35 * Math.sin(timeSec * 9 + f.phase);
            ctx.globalAlpha = Math.max(0, f.life) * twinkle;

            if (f.kind === 0) {
                const d = f.size * (0.55 + 0.45 * f.life);
                ctx.save();
                ctx.translate(f.x, f.y);
                ctx.rotate(f.rot);
                ctx.drawImage(heartImgs[f.tint], -d / 2, -d / 2, d, d);
                ctx.restore();
            } else {
                const d = f.size * 0.55 * (0.5 + 0.5 * f.life);
                ctx.drawImage(glowImgs[f.tint], f.x - d / 2, f.y - d / 2, d, d);
            }
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
    }

    // ============== 绘制文字 ==============
    function drawText(timeSec) {
        if (!cfg.show_text || !cfg.text_content) return;
        const cx = W / 2;
        const cy = H / 2 + Math.min(W, H) * 0.19;
        const rgb = hexToRgb(cfg.text_color);

        const fade = 0.72 + Math.sin(timeSec * 1.2) * 0.28;

        const fontSize = Math.max(16, Math.min(W, H) * 0.04);
        ctx.font = `300 ${fontSize}px -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        ctx.shadowColor = rgbaStr(hexToRgb(cfg.heart_color), 0.75);
        ctx.shadowBlur = 20;
        ctx.fillStyle = rgbaStr(rgb, fade);
        ctx.fillText(cfg.text_content, cx, cy);
        ctx.shadowBlur = 0;
    }

    // ============== 主循环 ==============
    let startTime = performance.now();
    let lastFrame = startTime;
    function loop() {
        const now = performance.now();
        const t = (now - startTime) / 1000;
        const dt = Math.min(0.05, (now - lastFrame) / 1000);
        lastFrame = now;

        ensureSprites();
        drawBackground();
        drawStars(t);
        drawEmbers(t, dt);

        if (cfg.depth_3d) {
            drawHeart3D(t, dt);
        } else {
            drawHeart2D(t, dt);
        }

        drawFlyParticles(t, dt);
        drawText(t);

        requestAnimationFrame(loop);
    }

    // ============== 鼠标交互 ==============
    let lastSpawn = 0;
    window.addEventListener("mousemove", (e) => {
        const now = performance.now();
        if (now - lastSpawn < 70) return;
        lastSpawn = now;
        const n = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < n; i++) {
            spawnFlyParticle(e.clientX + (Math.random() - 0.5) * 20, e.clientY + (Math.random() - 0.5) * 20);
        }
    });
    window.addEventListener("click", (e) => {
        for (let i = 0; i < 24; i++) {
            spawnFlyParticle(e.clientX, e.clientY);
        }
    });

    // ============== 控制面板交互 ==============
    const fields = ["particle_count", "particle_size", "beat_speed", "spread_ratio", "rotation_speed"];
    const colorFields = ["heart_color", "background_color", "text_color"];
    const textFields = ["text_content"];
    const boolFields = ["show_text", "depth_3d"];

    function bindRangeVal(id) {
        const el = document.getElementById(id);
        const val = document.getElementById(id + "_val");
        if (!el || !val) return;
        const update = () => {
            val.textContent = el.value;
        };
        el.addEventListener("input", () => {
            cfg[id] = parseFloat(el.value);
            if (id === "particle_count") rebuildParticles();
            update();
            scheduleSave();
        });
        update();
    }
    fields.forEach(bindRangeVal);

    colorFields.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener("input", () => {
            cfg[id] = el.value;
            scheduleSave();
        });
    });

    textFields.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener("input", () => {
            cfg[id] = el.value;
            scheduleSave();
        });
    });

    boolFields.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener("change", () => {
            cfg[id] = el.checked;
            scheduleSave();
        });
    });

    const collapseBtn = document.getElementById("collapse-btn");
    if (collapseBtn) {
        collapseBtn.addEventListener("click", () => {
            document.getElementById("control-panel").classList.toggle("collapsed");
        });
    }

    // ============== 与后端同步 ==============
    let saveTimer = null;
    function scheduleSave() {
        if (IS_SHARE) return;
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(saveConfig, 600);
    }

    async function saveConfig() {
        if (IS_SHARE) return;
        try {
            const resp = await fetch("/api/config", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(cfg),
            });
            const data = await resp.json();
            if (data.code !== 0) console.warn("保存失败:", data.msg);
        } catch (err) {
            console.warn("保存请求异常:", err);
        }
    }

    async function fetchConfig() {
        const url = IS_SHARE
            ? `/api/share/${window.SHARE_TOKEN}/config`
            : "/api/config";
        const resp = await fetch(url);
        const data = await resp.json();
        return data.code === 0 && data.data ? data.data : null;
    }

    async function loadConfigFromServer() {
        try {
            const data = await fetchConfig();
            if (data) {
                Object.assign(cfg, data);
                applyCfgToUI();
            }
        } catch (err) {
            console.warn("读取配置失败:", err);
        }
    }

    // ============== 分享页轮询 ==============
    const SHARE_POLL_INTERVAL = 3000;
    let lastServerCfgJson = "";

    function applyServerConfig(data) {
        const countChanged = data.particle_count !== cfg.particle_count;
        Object.assign(cfg, data);
        applyCfgToUI();
        if (countChanged) rebuildParticles();
    }

    if (IS_SHARE) {
        setInterval(async () => {
            try {
                const data = await fetchConfig();
                if (!data) return;
                const json = JSON.stringify(data);
                if (json === lastServerCfgJson) return;
                applyServerConfig(data);
                lastServerCfgJson = json;
            } catch (_) {
                // 轮询失败静默跳过
            }
        }, SHARE_POLL_INTERVAL);
    }

    function applyCfgToUI() {
        fields.forEach((id) => {
            const el = document.getElementById(id);
            const val = document.getElementById(id + "_val");
            if (el) el.value = cfg[id];
            if (val) val.textContent = cfg[id];
        });
        colorFields.forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = cfg[id];
        });
        textFields.forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = cfg[id];
        });
        boolFields.forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.checked = !!cfg[id];
        });
    }

    // 重置按钮
    const resetBtn = document.getElementById("reset-btn");
    if (resetBtn) {
        resetBtn.addEventListener("click", () => {
            const defaults = {
                particle_count: 1200,
                heart_color: "#ff6f9c",
                background_color: "#140b24",
                beat_speed: 1.0,
                particle_size: 2.0,
                spread_ratio: 1.0,
                show_text: true,
                text_content: "I Love You",
                text_color: "#ffeef4",
                depth_3d: true,
                rotation_speed: 0.4,
            };
            Object.assign(cfg, defaults);
            applyCfgToUI();
            rebuildParticles();
            scheduleSave();
        });
    }

    // 显式保存按钮
    const saveBtn = document.getElementById("save-btn");
    if (saveBtn) {
        saveBtn.addEventListener("click", () => {
            saveConfig();
        });
    }

    // ============== 生成分享链接 ==============
    const shareBtn = document.getElementById("share-btn");
    if (shareBtn) {
        shareBtn.addEventListener("click", async () => {
            const hint = document.getElementById("share-hint");
            const row = document.getElementById("share-row");
            const input = document.getElementById("share-url");
            try {
                await saveConfig();
                const resp = await fetch("/api/share", { method: "POST" });
                const data = await resp.json();
                if (data.code !== 0 || !data.data) {
                    console.warn("生成分享链接失败:", data.msg);
                    return;
                }
                const fullUrl = data.data.url;
                if (row) row.hidden = false;
                if (input) {
                    input.value = fullUrl;
                    input.focus();
                    input.select();
                }
                try {
                    await navigator.clipboard.writeText(fullUrl);
                    if (hint) hint.textContent = "链接已生成并复制，发送给朋友即可（对方只能观看，内容随本页设置实时变化）";
                } catch (_) {
                    if (hint) hint.textContent = "链接已生成，请手动复制（对方只能观看，内容随本页设置实时变化）";
                }
            } catch (err) {
                console.warn("生成分享链接异常:", err);
            }
        });
    }

    // ============== 启动 ==============
    resize();
    rebuildEmbers();
    loadConfigFromServer().finally(() => {
        ensureSprites();
        rebuildParticles();
        loop();
    });
})();
