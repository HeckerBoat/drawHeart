/**
 * 动态心形图案 - 核心动画逻辑
 *
 * 实现要点：
 * 1. 经典心形参数方程：x = 16 sin³(t), y = 13 cos(t) - 5 cos(2t) - 2 cos(3t) - cos(4t)
 * 2. 粒子系统：心形上分布大量粒子，每个粒子有微扰 + 拖尾
 * 3. 心跳节奏：使用周期函数让心形整体放大/收缩，模拟心跳
 * 4. 鼠标交互：移动时撒出小心形粒子
 * 5. 与后端配置同步：从 /api/config 读取参数，修改后保存
 */
(function () {
    "use strict";

    // 页面模式：edit=可编辑主页；share=只读分享页（无控制面板，禁止保存参数）
    const IS_SHARE = window.PAGE_MODE === "share";

    const canvas = document.getElementById("heart-canvas");
    const ctx = canvas.getContext("2d");

    // ============== 全局配置（与后端字段同名） ==============
    const cfg = {
        particle_count: 800,
        heart_color: "#ff2d55",
        background_color: "#0a0a1a",
        beat_speed: 1.0,
        particle_size: 2.0,
        spread_ratio: 1.0,
        show_text: true,
        text_content: "I Love You",
        text_color: "#ffffff",
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
    }
    window.addEventListener("resize", resize);
    resize();

    // ============== 颜色工具 ==============
    function hexToRgb(hex) {
        const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (!m) return { r: 255, g: 45, b: 85 };
        return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
    }
    function rgbaStr(rgb, a) { return `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`; }

    // ============== 心形参数方程 ==============
    // t ∈ [0, 2π]
    function heartPoint(t) {
        const x = 16 * Math.pow(Math.sin(t), 3);
        const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        return { x, y };
    }

    // ============== 粒子系统 ==============
    // 主心形上的粒子
    let mainParticles = [];
    // 飞散的小心形粒子（鼠标交互产生）
    let flyParticles = [];

    function rebuildMainParticles() {
        mainParticles = [];
        const N = cfg.particle_count;
        for (let i = 0; i < N; i++) {
            const t = (i / N) * Math.PI * 2;
            mainParticles.push({
                t,                         // 心形参数
                offset: Math.random() * Math.PI * 2, // 相位扰动
                radius: 0.6 + Math.random() * 0.8,   // 距离心形边的偏移
                jitter: (Math.random() - 0.5) * 0.4, // 随机抖动
                size: 0.6 + Math.random() * 0.8,      // 粒子大小系数
                alpha: 0.4 + Math.random() * 0.6,
            });
        }
    }

    function spawnFlyParticle(x, y) {
        // 在鼠标位置产生一个小的心形粒子，向外飞
        const angle = Math.random() * Math.PI * 2;
        const speed = 1 + Math.random() * 2;
        flyParticles.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 0.5, // 略向上
            life: 1.0,
            size: 1.5 + Math.random() * 2.5,
            t: Math.random() * Math.PI * 2,
        });
        if (flyParticles.length > 200) flyParticles.shift();
    }

    // ============== 心跳函数 ==============
    // 模拟心跳节奏：双跳
    function beatScale(timeSec) {
        const T = 1.0; // 1 秒一个周期
        const phase = (timeSec * cfg.beat_speed) % T / T; // [0, 1]
        // 心跳曲线：两个 bump
        const bump = (p, c, w) => Math.exp(-Math.pow((p - c) / w, 2));
        const b1 = bump(phase, 0.12, 0.05);
        const b2 = bump(phase, 0.32, 0.06);
        return 1.0 + (b1 * 0.18 + b2 * 0.10);
    }

    // ============== 绘制主心形 ==============
    function drawHeart(timeSec) {
        const cx = W / 2;
        const cy = H / 2;
        const scale = Math.min(W, H) / 40 * cfg.spread_ratio;
        const beat = beatScale(timeSec);
        const rgb = hexToRgb(cfg.heart_color);

        // 心形整体使用 lighter 合成模式让粒子叠加发光
        ctx.globalCompositeOperation = "lighter";

        for (let i = 0; i < mainParticles.length; i++) {
            const p = mainParticles[i];
            // 心形上的点（带轻微扰动）
            const tt = p.t + Math.sin(timeSec * 0.6 + p.offset) * 0.005;
            const pt = heartPoint(tt);
            // 加上粒子半径方向偏移（看起来有厚度）
            const r = p.radius * 0.4;
            const px = (pt.x + Math.cos(p.offset) * r) * scale * beat;
            const py = (-pt.y + Math.sin(p.offset) * r) * scale * beat; // y 翻转

            const x = cx + px + p.jitter * scale * 0.05;
            const y = cy + py + p.jitter * scale * 0.05;

            // 粒子绘制：径向渐变发光
            const size = p.size * cfg.particle_size;
            const alpha = p.alpha;
            const grd = ctx.createRadialGradient(x, y, 0, x, y, size * 4);
            grd.addColorStop(0, rgbaStr(rgb, alpha));
            grd.addColorStop(0.4, rgbaStr(rgb, alpha * 0.4));
            grd.addColorStop(1, rgbaStr(rgb, 0));
            ctx.fillStyle = grd;
            ctx.beginPath();
            ctx.arc(x, y, size * 4, 0, Math.PI * 2);
            ctx.fill();

            // 中心亮点
            ctx.fillStyle = rgbaStr({ r: 255, g: 255, b: 255 }, alpha * 0.8);
            ctx.beginPath();
            ctx.arc(x, y, size * 0.6, 0, Math.PI * 2);
            ctx.fill();
        }

        // 心形外圈光晕
        ctx.globalCompositeOperation = "lighter";
        const haloR = scale * 14 * beat;
        const halo = ctx.createRadialGradient(cx, cy + scale * 2, 0, cx, cy + scale * 2, haloR);
        halo.addColorStop(0, rgbaStr(rgb, 0.18));
        halo.addColorStop(0.5, rgbaStr(rgb, 0.06));
        halo.addColorStop(1, rgbaStr(rgb, 0));
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(cx, cy + scale * 2, haloR, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalCompositeOperation = "source-over";
    }

    // ============== 绘制飞散的小心形 ==============
    function drawFlyParticles() {
        ctx.globalCompositeOperation = "lighter";
        const rgb = hexToRgb(cfg.heart_color);
        for (let i = flyParticles.length - 1; i >= 0; i--) {
            const f = flyParticles[i];
            // 物理：重力 + 速度衰减
            f.vy += 0.04;
            f.vx *= 0.99;
            f.x += f.vx;
            f.y += f.vy;
            f.life -= 0.012;
            if (f.life <= 0) {
                flyParticles.splice(i, 1);
                continue;
            }
            // 画一个小心形
            const s = f.size * f.life;
            ctx.save();
            ctx.translate(f.x, f.y);
            ctx.fillStyle = rgbaStr(rgb, f.life * 0.9);
            ctx.beginPath();
            for (let t = 0; t < Math.PI * 2; t += 0.2) {
                const pt = heartPoint(t);
                const x = pt.x * s * 0.08;
                const y = -pt.y * s * 0.08;
                if (t === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
        ctx.globalCompositeOperation = "source-over";
    }

    // ============== 绘制文字 ==============
    function drawText(timeSec) {
        if (!cfg.show_text || !cfg.text_content) return;
        const cx = W / 2;
        const cy = H / 2 + Math.min(W, H) * 0.18;
        const rgb = hexToRgb(cfg.text_color);

        // 文字呼吸渐变
        const fade = 0.7 + Math.sin(timeSec * 1.4) * 0.3;

        const fontSize = Math.max(18, Math.min(W, H) * 0.045);
        ctx.font = `600 ${fontSize}px -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // 阴影
        ctx.shadowColor = rgbaStr(hexToRgb(cfg.heart_color), 0.8);
        ctx.shadowBlur = 24;
        ctx.fillStyle = rgbaStr(rgb, fade);
        ctx.fillText(cfg.text_content, cx, cy);
        ctx.shadowBlur = 0;
    }

    // ============== 背景拖尾 ==============
    function drawBackground() {
        // 半透明背景，制造拖尾效果
        const rgb = hexToRgb(cfg.background_color);
        // 拖尾透明度：0.18 让粒子有运动残留
        ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.18)`;
        ctx.fillRect(0, 0, W, H);
    }

    // ============== 主循环 ==============
    let startTime = performance.now();
    function loop() {
        const now = performance.now();
        const t = (now - startTime) / 1000;

        drawBackground();
        drawHeart(t);
        drawFlyParticles();
        drawText(t);

        requestAnimationFrame(loop);
    }

    // ============== 鼠标交互 ==============
    let lastSpawn = 0;
    window.addEventListener("mousemove", (e) => {
        const now = performance.now();
        if (now - lastSpawn < 60) return;
        lastSpawn = now;
        // 在鼠标附近撒 1~3 个小心形
        const n = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
            spawnFlyParticle(e.clientX + (Math.random() - 0.5) * 20, e.clientY + (Math.random() - 0.5) * 20);
        }
    });
    // 点击爆发
    window.addEventListener("click", (e) => {
        for (let i = 0; i < 20; i++) {
            spawnFlyParticle(e.clientX, e.clientY);
        }
    });

    // ============== 控制面板交互 ==============
    const fields = ["particle_count", "particle_size", "beat_speed", "spread_ratio"];
    const colorFields = ["heart_color", "background_color", "text_color"];
    const textFields = ["text_content"];
    const boolFields = ["show_text"];

    // 分享页没有控制面板，所有面板元素绑定前判空
    function bindRangeVal(id) {
        const el = document.getElementById(id);
        const val = document.getElementById(id + "_val");
        if (!el || !val) return;
        const update = () => {
            val.textContent = el.value;
        };
        el.addEventListener("input", () => {
            cfg[id] = parseFloat(el.value);
            if (id === "particle_count") rebuildMainParticles();
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

    // 折叠
    const collapseBtn = document.getElementById("collapse-btn");
    if (collapseBtn) {
        collapseBtn.addEventListener("click", () => {
            document.getElementById("control-panel").classList.toggle("collapsed");
        });
    }

    // ============== 与后端同步 ==============
    let saveTimer = null;
    function scheduleSave() {
        if (IS_SHARE) return; // 只读分享页禁止保存
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(saveConfig, 600); // 防抖
    }

    async function saveConfig() {
        if (IS_SHARE) return; // 只读分享页禁止保存
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
        // 分享页读取实时配置（随主页变化）；主页读取当前配置
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
    // 父页面（主页）修改配置后，分享页自动跟随变化；间隔 3 秒轻量轮询
    const SHARE_POLL_INTERVAL = 3000;
    let lastServerCfgJson = "";

    function applyServerConfig(data) {
        const countChanged = data.particle_count !== cfg.particle_count;
        Object.assign(cfg, data);
        applyCfgToUI();
        if (countChanged) rebuildMainParticles();
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
                // 轮询失败静默跳过，等待下一轮
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
                particle_count: 800,
                heart_color: "#ff2d55",
                background_color: "#0a0a1a",
                beat_speed: 1.0,
                particle_size: 2.0,
                spread_ratio: 1.0,
                show_text: true,
                text_content: "I Love You",
                text_color: "#ffffff",
            };
            Object.assign(cfg, defaults);
            applyCfgToUI();
            rebuildMainParticles();
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
                // 先保存当前参数，确保分享快照是最新效果
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
                // 尝试复制到剪贴板（失败仅打印控制台，不弹窗）
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
    loadConfigFromServer().finally(() => {
        rebuildMainParticles();
        loop();
    });
})();
