# Draw Heart · 动态心形

一个基于 Flask + Canvas 的动态心形动画网站，可部署到服务器分享给朋友浏览。

灵感来自经典心形参数方程 `x = 16 sin³(t), y = 13 cos(t) − 5 cos(2t) − 2 cos(3t) − cos(4t)`，使用粒子系统、心跳节奏和鼠标交互实现动态效果。

## 功能特性

- **3D 粒子心形** —— 数百颗发光粒子组成旋转的 3D 心形曲面
- **心跳节奏** —— 双拍心跳曲线让心形自然跳动
- **鼠标交互** —— 鼠标移动撒出小心形，点击爆发
- **可定制** —— 颜色、粒子数量、跳动速度、3D 旋转速度、显示文字等，全部保存到 SQLite
- **配置持久化** —— 参数存入 SQLite，刷新后仍然生效
- **只读分享链接** —— 一键生成 `/s/<token>` 外链，朋友无法修改任何参数，页面内容实时跟随主页当前配置变化
- **可部署** —— 纯 Python 后端，任意 VPS 即可运行

## 技术栈

- 后端：Flask + SQLModel + SQLite
- 前端：HTML5 Canvas + 原生 JavaScript
- Python 3.12，使用 `uv` 管理环境

## 快速开始

```bash
# 1. 安装依赖（使用 uv）
uv pip install -r requirements.txt

# 2. 启动应用
uv run python app.py

# 3. 浏览器打开
# http://localhost:5000
```

## 部署到服务器

```bash
# Linux/macOS 使用 gunicorn
gunicorn -w 4 -b 0.0.0.0:8000 app:app

# 然后通过 http://<服务器IP>:8000 访问
```

Windows 服务器可使用 `waitress`：

```bash
uv pip install waitress
waitress-serve --listen=0.0.0.0:8000 app:app
```

## 可调参数

所有视觉参数都可在网页右上角面板实时调整，并持久化到 `db/config.db`：

| 参数 | 说明 |
|------|------|
| `particle_count` | 组成心形的粒子数量 |
| `particle_size` | 粒子大小 |
| `beat_speed` | 心跳速度倍率 |
| `spread_ratio` | 心形整体缩放系数 |
| `heart_color` | 心形粒子颜色（HEX） |
| `background_color` | 背景颜色（HEX） |
| `show_text` | 是否在心形下方显示文字 |
| `text_content` | 显示的文字内容 |
| `text_color` | 文字颜色（HEX） |
| `depth_3d` | 是否启用 3D 旋转心形 |
| `rotation_speed` | 3D 旋转速度（弧度/秒） |

## 分享只读链接

在控制面板点击「🔗 生成分享链接」，后端会生成唯一 token 存入 `ShareLink` 表并返回外链（形如 `http://<host>/s/<token>`）。分享页为只读模式：不渲染控制面板，无法调用参数保存接口，且页面内容**实时跟随主页当前配置**——在主页修改文字等参数后，分享页会自动同步变化（每 3 秒轮询一次）。

| 接口 | 说明 |
|------|------|
| `POST /api/share` | 生成分享链接（仅存 token，内容实时跟随当前配置） |
| `GET /s/<token>` | 只读分享页（token 不存在返回 404） |
| `GET /api/share/<token>/config` | 读取分享页使用的实时配置 |

## 项目结构

详细文件作用请见 [architecture.md](architecture.md)。

## 许可证

MIT —— 可自由使用、修改、分享。
