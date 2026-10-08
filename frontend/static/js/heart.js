/**
 * 3D 心形粒子动画 - Three.js 版
 *
 * 视觉构成：
 * 1. THREE.Shape + ExtrudeGeometry 生成真正的 3D 心形几何体
 * 2. MeshSurfaceSampler 从心脏表面均匀采样粒子点
 * 3. 粒子跟随心脏脉动，带 Simplex 噪声自然蠕动
 * 4. OrbitControls 鼠标交互旋转/缩放
 * 5. 鼠标移动洒落星光、点击绽放爱心
 * 6. 烟花特效：火箭升空爆炸绽放，可由配置开关启停
 * 7. 与后端配置同步：从 /api/config 读取参数，修改后保存
 */
import * as THREE from "three";
import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

(function () {
    "use strict";

    // 页面模式：edit=可编辑主页；share=只读分享页
    const IS_SHARE = window.PAGE_MODE === "share";

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
        show_fireworks: true,
    };

    // ============== 颜色工具 ==============
    function hexToRgb(hex) {
        const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (!m) return { r: 255, g: 111, b: 156 };
        return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
    }

    /** 根据主色生成 4 色调色板（亮白→柔粉→主色→深红） */
    function buildPalette(hex) {
        const base = new THREE.Color(hex);
        const light = base.clone().lerp(new THREE.Color(0xffffff), 0.6);
        const pink = base.clone().lerp(new THREE.Color(0xffb6d5), 0.35);
        const deep = base.clone().multiplyScalar(0.6);
        return [light, pink, base, deep];
    }

    // ============== 简易 Simplex 噪声（内嵌，避免外部依赖） ==============
    // 基于 Stefan Gustavson 的 simplex noise 精简实现
    const SIMPLEX = (function () {
        const grad3 = [
            [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
            [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
            [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
        ];
        const p = new Uint8Array(512);
        const perm = new Uint8Array(512);
        const permMod12 = new Uint8Array(512);
        for (let i = 0; i < 256; i++) p[i] = Math.floor(Math.random() * 256);
        for (let i = 0; i < 512; i++) {
            perm[i] = p[i & 255];
            permMod12[i] = perm[i] % 12;
        }
        const F3 = 1 / 3, G3 = 1 / 6;
        function noise3D(xin, yin, zin) {
            let n0, n1, n2, n3;
            const s = (xin + yin + zin) * F3;
            const i = Math.floor(xin + s);
            const j = Math.floor(yin + s);
            const k = Math.floor(zin + s);
            const t = (i + j + k) * G3;
            const X0 = i - t, Y0 = j - t, Z0 = k - t;
            const x0 = xin - X0, y0 = yin - Y0, z0 = zin - Z0;
            let i1, j1, k1, i2, j2, k2;
            if (x0 >= y0) {
                if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
                else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
                else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
            } else {
                if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
                else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
                else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
            }
            const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
            const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
            const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
            const ii = i & 255, jj = j & 255, kk = k & 255;
            let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
            if (t0 < 0) n0 = 0;
            else {
                t0 *= t0;
                const gi0 = permMod12[ii + perm[jj + perm[kk]]];
                n0 = t0 * t0 * (grad3[gi0][0] * x0 + grad3[gi0][1] * y0 + grad3[gi0][2] * z0);
            }
            let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
            if (t1 < 0) n1 = 0;
            else {
                t1 *= t1;
                const gi1 = permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]];
                n1 = t1 * t1 * (grad3[gi1][0] * x1 + grad3[gi1][1] * y1 + grad3[gi1][2] * z1);
            }
            let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
            if (t2 < 0) n2 = 0;
            else {
                t2 *= t2;
                const gi2 = permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]];
                n2 = t2 * t2 * (grad3[gi2][0] * x2 + grad3[gi2][1] * y2 + grad3[gi2][2] * z2);
            }
            let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
            if (t3 < 0) n3 = 0;
            else {
                t3 *= t3;
                const gi3 = permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]];
                n3 = t3 * t3 * (grad3[gi3][0] * x3 + grad3[gi3][1] * y3 + grad3[gi3][2] * z3);
            }
            return 32 * (n0 + n1 + n2 + n3);
        }
        return { noise3D };
    })();

    // ============== Three.js 场景搭建 ==============
    const canvas = document.getElementById("heart-canvas");
    let scene, camera, renderer, controls;
    let heartGroup, particles, particleGeom, particleMat;
    let sampler = null;
    let basePositions = [];  // 粒子在心脏表面的基础位置（采样点）
    let particleColors = []; // 每个粒子的颜色索引
    let palette = [];
    let flySprites = [];     // 鼠标飞散粒子（2D Canvas 叠加层）

    function initThree() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(cfg.background_color);

        camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0, 0, 2.6);

        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(window.innerWidth, window.innerHeight);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.enablePan = false;
        controls.minDistance = 1.2;
        controls.maxDistance = 6;
        controls.autoRotate = false;

        heartGroup = new THREE.Group();
        scene.add(heartGroup);
    }

    // ============== 创建 3D 心形几何体 ==============
    function createHeartGeometry() {
        const shape = new THREE.Shape();
        // 经典心形贝塞尔曲线
        shape.moveTo(0, 0.5);
        shape.bezierCurveTo(0, 0.5, -0.3, 1.1, -1.1, 1.1);
        shape.bezierCurveTo(-2.1, 1.1, -2.1, -0.1, -2.1, -0.1);
        shape.bezierCurveTo(-2.1, -0.85, -1.4, -1.6, 0, -2.4);
        shape.bezierCurveTo(1.4, -1.6, 2.1, -0.85, 2.1, -0.1);
        shape.bezierCurveTo(2.1, -0.1, 2.1, 1.1, 1.1, 1.1);
        shape.bezierCurveTo(0.4, 1.1, 0, 0.5, 0, 0.5);

        const extrudeSettings = {
            depth: 0.8,
            bevelEnabled: true,
            bevelSegments: 6,
            steps: 4,
            bevelSize: 0.25,
            bevelThickness: 0.25,
            curveSegments: 48,
        };

        const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geom.center();
        // shape 定义的心形本身就是圆弧朝上、尖端朝下，无需额外旋转
        return geom;
    }

    // ============== 3D 文字（作为 heartGroup 子节点，固定在爱心正中央，随心脏一起旋转） ==============
    let textMesh = null;
    let textTexture = null;
    let textCanvas2D = null;
    let textFrontRatio = 1;  // 正面文字 em 高占纹理高度的比例（用于换算平面尺寸）

    function createTextTexture() {
        if (!textCanvas2D) {
            textCanvas2D = document.createElement("canvas");
        }
        const canvas = textCanvas2D;
        const ctx = canvas.getContext("2d");
        const text = cfg.text_content || "";
        const fontSize = 96;
        // 立体艺术字：英文用 Georgia 粗斜体（优雅衬线感），中文优先行楷/楷体
        const font = `italic 900 ${fontSize}px Georgia, "Times New Roman", "STXingkai", "华文行楷", "KaiTi", "STKaiti", "Microsoft YaHei", sans-serif`;

        ctx.font = font;
        const textWidth = ctx.measureText(text).width;

        // 挤出厚度（光从左上来，厚度向右下延伸）+ 发光留白
        const depth = fontSize * 0.24;
        const glowPad = fontSize * 0.55 + 12;
        // 对称留白：保证正面字形居中于纹理，同时右下仍有空间容纳挤出与发光
        const pad = glowPad + depth / 2;

        canvas.width = Math.ceil(textWidth + pad * 2);
        canvas.height = Math.ceil(fontSize + pad * 2);

        // 改动 canvas 尺寸会重置上下文状态，需要重新设置
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = font;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineJoin = "round";
        ctx.miterLimit = 2;

        // 正面文字锚点即纹理中心（人眼以正面字形为定位基准，侧面为附属厚度）
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;

        const toCss = (c, a) => {
            const r = Math.round(THREE.MathUtils.clamp(c.r, 0, 1) * 255);
            const g = Math.round(THREE.MathUtils.clamp(c.g, 0, 1) * 255);
            const b = Math.round(THREE.MathUtils.clamp(c.b, 0, 1) * 255);
            return a === undefined ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
        };
        const front = new THREE.Color(cfg.text_color);

        // ① 挤出侧面：从最远（最暗）画到最近（较亮），多层连续渐变形成立体厚度
        const sideDeep = front.clone().multiplyScalar(0.10);
        const sideNear = front.clone().multiplyScalar(0.42);
        const layers = 20;
        for (let i = layers; i >= 1; i--) {
            const t = i / layers;
            ctx.fillStyle = toCss(sideNear.clone().lerp(sideDeep, t));
            ctx.fillText(text, cx + depth * t, cy + depth * t * 0.92);
        }

        // ② 心形色外发光
        ctx.save();
        ctx.shadowColor = cfg.heart_color;
        ctx.shadowBlur = fontSize * 0.5;
        ctx.fillStyle = toCss(front);
        ctx.fillText(text, cx, cy);
        ctx.shadowBlur = fontSize * 0.22;
        ctx.fillText(text, cx, cy);
        ctx.restore();

        // ③ 正面纵向渐变（上亮下暗，模拟受光圆柱面）
        const faceGrad = ctx.createLinearGradient(0, cy - fontSize * 0.55, 0, cy + fontSize * 0.55);
        faceGrad.addColorStop(0, toCss(front.clone().lerp(new THREE.Color(0xffffff), 0.85)));
        faceGrad.addColorStop(0.42, toCss(front.clone().lerp(new THREE.Color(0xffffff), 0.12)));
        faceGrad.addColorStop(0.58, toCss(front));
        faceGrad.addColorStop(1, toCss(front.clone().multiplyScalar(0.6)));
        ctx.fillStyle = faceGrad;
        ctx.fillText(text, cx, cy);

        // ④ 深色细描边，让文字轮廓更锐利
        ctx.lineWidth = Math.max(2, fontSize * 0.025);
        ctx.strokeStyle = toCss(front.clone().multiplyScalar(0.28), 0.9);
        ctx.strokeText(text, cx, cy);

        // ⑤ 顶部高光（玻璃/金属质感反光）
        ctx.save();
        ctx.beginPath();
        ctx.rect(cx - textWidth / 2 - fontSize * 0.3, cy - fontSize,
                 textWidth + fontSize * 0.6, fontSize * 0.62);
        ctx.clip();
        const hiGrad = ctx.createLinearGradient(0, cy - fontSize * 0.5, 0, cy + fontSize * 0.12);
        hiGrad.addColorStop(0, "rgba(255,255,255,0)");
        hiGrad.addColorStop(1, "rgba(255,255,255,0.7)");
        ctx.fillStyle = hiGrad;
        ctx.fillText(text, cx, cy);
        ctx.restore();

        // 记录正面 em 高占纹理比，供 rebuildText 换算平面尺寸
        textFrontRatio = fontSize / canvas.height;

        if (textTexture) {
            textTexture.needsUpdate = true;
        } else {
            textTexture = new THREE.CanvasTexture(canvas);
        }
        return textTexture;
    }

    function rebuildText() {
        if (!scene) return;

        // 移除旧文字
        if (textMesh) {
            heartGroup.remove(textMesh);
            textMesh.geometry.dispose();
            textMesh.material.dispose();
            textMesh = null;
        }

        if (!cfg.show_text || !cfg.text_content) return;

        const texture = createTextTexture();
        texture.colorSpace = THREE.SRGBColorSpace;
        const aspect = textCanvas2D.width / textCanvas2D.height;

        // 以正面文字 em 高 0.62 世界单位为基准，并限制最大宽度（心形宽约 4.2）
        let planeHeight = 0.62 / textFrontRatio;
        let planeWidth = planeHeight * aspect;
        const maxWidth = 3.6;
        if (planeWidth > maxWidth) {
            planeWidth = maxWidth;
            planeHeight = planeWidth / aspect;
        }

        const geom = new THREE.PlaneGeometry(planeWidth, planeHeight);
        const mat = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
        });

        textMesh = new THREE.Mesh(geom, mat);
        // 文字固定在爱心视觉正中央：心形上宽下窄（两瓣+收尖），
        // 视觉重心在包围盒中心偏上约 0.4 处；作为 heartGroup 子节点随心脏一起旋转
        textMesh.position.set(0, 0.4, 0);
        textMesh.renderOrder = 20;
        heartGroup.add(textMesh);
    }

    // ============== 粒子系统 ==============
    function rebuildParticles() {
        if (!heartGroup) return;

        // 清理旧粒子
        if (particles) {
            heartGroup.remove(particles);
            particleGeom.dispose();
            particleMat.dispose();
        }

        const heartGeom = createHeartGeometry();
        const heartMesh = new THREE.Mesh(heartGeom, new THREE.MeshBasicMaterial({ visible: false }));
        heartGroup.add(heartMesh);

        // 从心脏表面采样粒子点
        sampler = new MeshSurfaceSampler(heartMesh).build();
        const N = cfg.particle_count;
        basePositions = new Float32Array(N * 3);
        particleColors = new Float32Array(N * 3);

        palette = buildPalette(cfg.heart_color);
        const tmpPos = new THREE.Vector3();

        for (let i = 0; i < N; i++) {
            sampler.sample(tmpPos);
            basePositions[i * 3] = tmpPos.x;
            basePositions[i * 3 + 1] = tmpPos.y;
            basePositions[i * 3 + 2] = tmpPos.z;

            const c = palette[Math.floor(Math.random() * palette.length)];
            particleColors[i * 3] = c.r;
            particleColors[i * 3 + 1] = c.g;
            particleColors[i * 3 + 2] = c.b;
        }

        particleGeom = new THREE.BufferGeometry();
        particleGeom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(basePositions), 3));
        particleGeom.setAttribute("color", new THREE.BufferAttribute(new Float32Array(particleColors), 3));

        particleMat = new THREE.PointsMaterial({
            size: cfg.particle_size * 0.012,
            vertexColors: true,
            transparent: true,
            opacity: 0.95,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true,
        });

        particles = new THREE.Points(particleGeom, particleMat);
        heartGroup.add(particles);

        // 清理临时 mesh（采样后不再需要几何体本身）
        heartGroup.remove(heartMesh);
        heartGeom.dispose();
    }

    // ============== 心跳动画 ==============
    function beatScale(timeSec) {
        const T = 1.15;
        const phase = ((timeSec * cfg.beat_speed) % T) / T;
        const bump = (p, c, w) => Math.exp(-Math.pow((p - c) / w, 2));
        const pulse = bump(phase, 0.09, 0.075) * 0.12 + bump(phase, 0.30, 0.095) * 0.07;
        const breathe = Math.sin(timeSec * 0.8) * 0.02;
        return 1 + pulse + breathe;
    }

    // ============== 渲染循环 ==============
    let startTime = performance.now();
    let lastFrame = startTime;
    const tmpVec = new THREE.Vector3();

    function animate() {
        requestAnimationFrame(animate);
        const now = performance.now();
        const t = (now - startTime) / 1000;
        const dt = Math.min(0.05, (now - lastFrame) / 1000);
        lastFrame = now;

        if (particles) {
            const scale = beatScale(t) * cfg.spread_ratio;
            const positions = particleGeom.attributes.position.array;
            const N = basePositions.length / 3;

            for (let i = 0; i < N; i++) {
                const bx = basePositions[i * 3];
                const by = basePositions[i * 3 + 1];
                const bz = basePositions[i * 3 + 2];

                // Simplex 噪声驱动的表面蠕动
                const noise = SIMPLEX.noise3D(bx * 1.5, by * 1.5, bz * 1.5 + t * 0.4);
                const noise2 = SIMPLEX.noise3D(bx * 4, by * 4, bz * 4 + t * 0.8);

                // 基础缩放 + 噪声扰动
                const s = scale + noise * 0.04 * (1 + scale - 1);
                const jitter = noise2 * 0.015;

                positions[i * 3] = bx * s + jitter;
                positions[i * 3 + 1] = by * s + jitter;
                positions[i * 3 + 2] = bz * s + jitter;
            }
            particleGeom.attributes.position.needsUpdate = true;

            // 心跳时整体脉冲缩放粒子大小
            const pulse = Math.max(0, scale - 1);
            particleMat.size = cfg.particle_size * 0.012 * (1 + pulse * 1.5);
        }

        if (heartGroup && cfg.rotation_speed > 0) {
            heartGroup.rotation.y += dt * cfg.rotation_speed * 0.5;
        }

        // 文字作为 heartGroup 子节点随心脏一起旋转，仅随心跳轻微脉动
        if (textMesh) {
            textMesh.scale.setScalar(1 + (beatScale(t) - 1) * 0.5);
        }

        controls.update();
        renderer.render(scene, camera);

        drawFlySprites(dt);
        updateFireworks(dt, t);
    }

    // ============== 鼠标飞散粒子（2D Canvas 叠加层） ==============
    const flyCanvas = document.createElement("canvas");
    flyCanvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:5;";
    document.body.appendChild(flyCanvas);
    const flyCtx = flyCanvas.getContext("2d");

    function resizeFlyCanvas() {
        flyCanvas.width = window.innerWidth * (window.devicePixelRatio || 1);
        flyCanvas.height = window.innerHeight * (window.devicePixelRatio || 1);
        flyCanvas.style.width = window.innerWidth + "px";
        flyCanvas.style.height = window.innerHeight + "px";
        flyCtx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    }
    window.addEventListener("resize", resizeFlyCanvas);
    resizeFlyCanvas();

    function spawnFlyParticle(x, y) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.8 + Math.random() * 2.2;
        flySprites.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 1.2,
            life: 1.0,
            decay: 0.012 + Math.random() * 0.01,
            size: 6 + Math.random() * 8,
            phase: Math.random() * Math.PI * 2,
            isHeart: Math.random() < 0.65,
        });
        if (flySprites.length > 300) flySprites.shift();
    }

    function drawFlySprites(dt) {
        flyCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        flyCtx.globalCompositeOperation = "lighter";
        const rgb = hexToRgb(cfg.heart_color);
        const step = dt * 60;

        for (let i = flySprites.length - 1; i >= 0; i--) {
            const f = flySprites[i];
            f.vy += 0.015 * step;
            f.vx *= Math.pow(0.985, step);
            f.vy *= Math.pow(0.992, step);
            f.x += f.vx * step;
            f.y += f.vy * step;
            f.life -= f.decay * step;
            if (f.life <= 0) { flySprites.splice(i, 1); continue; }

            const twinkle = 0.6 + 0.4 * Math.sin(performance.now() * 0.01 + f.phase);
            flyCtx.globalAlpha = Math.max(0, f.life) * twinkle;

            if (f.isHeart) {
                drawMiniHeart(f.x, f.y, f.size * f.life, rgb);
            } else {
                const d = f.size * 2 * f.life;
                const grd = flyCtx.createRadialGradient(f.x, f.y, 0, f.x, f.y, d);
                grd.addColorStop(0, `rgba(255,255,255,${f.life})`);
                grd.addColorStop(0.3, `rgba(${rgb.r},${rgb.g},${rgb.b},${f.life * 0.8})`);
                grd.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
                flyCtx.fillStyle = grd;
                flyCtx.beginPath();
                flyCtx.arc(f.x, f.y, d, 0, Math.PI * 2);
                flyCtx.fill();
            }
        }
        flyCtx.globalAlpha = 1;
        flyCtx.globalCompositeOperation = "source-over";
    }

    function drawMiniHeart(cx, cy, size, rgb) {
        flyCtx.save();
        flyCtx.translate(cx, cy);
        flyCtx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${flyCtx.globalAlpha})`;
        flyCtx.shadowColor = `rgba(${rgb.r},${rgb.g},${rgb.b},0.9)`;
        flyCtx.shadowBlur = 12;
        flyCtx.beginPath();
        const s = size / 16;
        flyCtx.moveTo(0, -4 * s);
        flyCtx.bezierCurveTo(0, -4 * s, -8 * s, -12 * s, -8 * s, -2 * s);
        flyCtx.bezierCurveTo(-8 * s, 4 * s, 0, 10 * s, 0, 12 * s);
        flyCtx.bezierCurveTo(0, 10 * s, 8 * s, 4 * s, 8 * s, -2 * s);
        flyCtx.bezierCurveTo(8 * s, -12 * s, 0, -4 * s, 0, -4 * s);
        flyCtx.fill();
        flyCtx.restore();
    }

    // ============== 烟花特效（2D 叠加层，随 show_fireworks 开关启停） ==============
    const fireworksRockets = [];  // 上升中的火箭
    const fireworksSparks = [];   // 爆炸后的火花
    let nextFireworkTime = 0.8;   // 下次发射时刻（秒）

    // 烟花主色调：偏暖（玫红/金色）为主，偶发随机色，与心形主题呼应
    function fireworkHue() {
        const r = Math.random();
        if (r < 0.4) return 320 + Math.random() * 40;  // 玫红/粉
        if (r < 0.7) return 25 + Math.random() * 35;   // 金/橙
        return Math.random() * 360;                     // 随机彩色
    }

    function launchFirework() {
        fireworksRockets.push({
            x: window.innerWidth * (0.12 + Math.random() * 0.76),
            y: window.innerHeight + 12,
            vx: (Math.random() - 0.5) * 1.2,
            vy: -(9 + Math.random() * 4),
            targetY: window.innerHeight * (0.14 + Math.random() * 0.32),
            hue: fireworkHue(),
        });
    }

    function explodeFirework(r) {
        const count = 60 + Math.floor(Math.random() * 50);
        const isRing = Math.random() < 0.4;  // 环形（整齐）或球形（随机）绽放
        for (let i = 0; i < count; i++) {
            let angle, speed;
            if (isRing) {
                angle = (i / count) * Math.PI * 2 + Math.random() * 0.05;
                speed = 3.8 + Math.random() * 0.8;
            } else {
                angle = Math.random() * Math.PI * 2;
                speed = Math.pow(Math.random(), 0.6) * 5.2;
            }
            fireworksSparks.push({
                x: r.x, y: r.y,
                vx: Math.cos(angle) * speed + r.vx,
                vy: Math.sin(angle) * speed + r.vy * 0.3,
                life: 1.0,
                decay: 0.008 + Math.random() * 0.012,
                size: 1.2 + Math.random() * 1.6,
                hue: r.hue + (Math.random() - 0.5) * 50,
                phase: Math.random() * Math.PI * 2,
            });
        }
    }

    function updateFireworks(dt, t) {
        const step = dt * 60;
        const ctx = flyCtx;

        // 发射调度：关闭开关后不再发射，存量火花自然熄灭淡出
        if (cfg.show_fireworks && t >= nextFireworkTime && fireworksSparks.length < 1600) {
            const burst = 1 + (Math.random() < 0.3 ? 1 : 0) + (Math.random() < 0.12 ? 1 : 0);
            for (let i = 0; i < burst; i++) launchFirework();
            nextFireworkTime = t + 1.1 + Math.random() * 1.4;
        }

        ctx.globalCompositeOperation = "lighter";

        // 火箭：上升、到顶爆炸
        for (let i = fireworksRockets.length - 1; i >= 0; i--) {
            const r = fireworksRockets[i];
            r.x += r.vx * step;
            r.y += r.vy * step;
            r.vy += 0.05 * step;

            if (r.y <= r.targetY || r.vy >= -1.2) {
                explodeFirework(r);
                fireworksRockets.splice(i, 1);
                continue;
            }

            // 头部亮斑 + 尾焰
            ctx.strokeStyle = `hsla(${r.hue}, 100%, 75%, 0.9)`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(r.x - r.vx * 3, r.y - r.vy * 3);
            ctx.lineTo(r.x, r.y);
            ctx.stroke();
            ctx.fillStyle = "rgba(255,255,255,0.9)";
            ctx.beginPath();
            ctx.arc(r.x, r.y, 1.6, 0, Math.PI * 2);
            ctx.fill();
        }

        // 火花：重力下坠 + 空气阻力 + 闪烁淡出
        for (let i = fireworksSparks.length - 1; i >= 0; i--) {
            const s = fireworksSparks[i];
            s.x += s.vx * step;
            s.y += s.vy * step;
            s.vy += 0.045 * step;
            const drag = Math.pow(0.982, step);
            s.vx *= drag;
            s.vy *= drag;
            s.life -= s.decay * step;
            if (s.life <= 0) { fireworksSparks.splice(i, 1); continue; }

            const twinkle = 0.55 + 0.45 * Math.sin(t * 12 + s.phase);
            const alpha = Math.max(0, s.life) * twinkle;
            // 外圈柔光 + 内核亮斑
            ctx.fillStyle = `hsla(${s.hue}, 100%, 62%, ${alpha * 0.35})`;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.size * 2.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = `hsla(${s.hue}, 100%, ${Math.round(68 + 25 * twinkle)}%, ${alpha})`;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.globalCompositeOperation = "source-over";
    }




    // ============== 鼠标交互 ==============
    let lastSpawn = 0;
    window.addEventListener("mousemove", (e) => {
        const now = performance.now();
        if (now - lastSpawn < 60) return;
        lastSpawn = now;
        const n = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < n; i++) {
            spawnFlyParticle(e.clientX + (Math.random() - 0.5) * 20, e.clientY + (Math.random() - 0.5) * 20);
        }
    });
    window.addEventListener("click", (e) => {
        for (let i = 0; i < 28; i++) {
            spawnFlyParticle(e.clientX, e.clientY);
        }
    });

    // ============== 窗口缩放 ==============
    window.addEventListener("resize", () => {
        if (!camera || !renderer) return;
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // ============== 控制面板交互 ==============
    const fields = ["particle_count", "particle_size", "beat_speed", "spread_ratio", "rotation_speed"];
    const colorFields = ["heart_color", "background_color", "text_color"];
    const textFields = ["text_content"];
    const boolFields = ["show_text", "depth_3d", "show_fireworks"];

    function bindRangeVal(id) {
        const el = document.getElementById(id);
        const val = document.getElementById(id + "_val");
        if (!el || !val) return;
        const update = () => { val.textContent = el.value; };
        el.addEventListener("input", () => {
            cfg[id] = parseFloat(el.value);
            if (id === "particle_count") rebuildParticles();
            if (id === "background_color" && scene) scene.background = new THREE.Color(cfg.background_color);
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
            if (id === "heart_color") { rebuildParticles(); rebuildText(); }
            if (id === "text_color") rebuildText();
            if (id === "background_color" && scene) scene.background = new THREE.Color(cfg.background_color);
            scheduleSave();
        });
    });

    textFields.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener("input", () => {
            cfg[id] = el.value;
            rebuildText();
            scheduleSave();
        });
    });

    boolFields.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener("change", () => {
            cfg[id] = el.checked;
            if (id === "show_text") rebuildText();
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
        const colorChanged = data.heart_color !== cfg.heart_color;
        const bgChanged = data.background_color !== cfg.background_color;
        Object.assign(cfg, data);
        applyCfgToUI();
        if (countChanged || colorChanged) rebuildParticles();
        if (bgChanged && scene) scene.background = new THREE.Color(cfg.background_color);
        rebuildText();
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
            } catch (_) { /* 轮询失败静默跳过 */ }
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
                show_fireworks: true,
            };
            Object.assign(cfg, defaults);
            applyCfgToUI();
            if (scene) scene.background = new THREE.Color(cfg.background_color);
            rebuildParticles();
            rebuildText();
            scheduleSave();
        });
    }

    // 显式保存按钮
    const saveBtn = document.getElementById("save-btn");
    if (saveBtn) {
        saveBtn.addEventListener("click", () => { saveConfig(); });
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
                if (input) { input.value = fullUrl; input.focus(); input.select(); }
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
    initThree();
    loadConfigFromServer().finally(() => {
        scene.background = new THREE.Color(cfg.background_color);
        rebuildParticles();
        rebuildText();
        animate();
    });
})();
