# Draw Heart · 项目架构与文件作用说明

> 本文件记录每个文件的作用，便于后续快速定位功能。新增文件时请同步更新本表。

## 目录结构

```
drawHeart/
├── app.py                       # 前端启动入口（Flask 主应用），启动主循环
├── backend/                     # 后端目录：业务逻辑、数据库、API
│   ├── __init__.py              # 包初始化
│   ├── database.py              # 数据库连接、初始化、配置读写、分享链接生成与 token 校验（sqlmodel + sqlite）
│   ├── models.py                # 表结构定义：HeartConfig（心形参数配置表）、ShareLink（分享链接 token 表）
│   └── routes.py                # 路由与 API：渲染主页/分享页、读取/保存配置、生成分享链接
├── frontend/                     # 前端目录：模板、静态资源
│   ├── templates/
│   │   └── index.html           # 主页模板：Canvas + 控制面板；readonly 模式渲染只读分享页
│   └── static/
│       ├── css/
│       │   └── style.css        # 全局样式、控制面板样式、分享按钮与只读标识样式
│       └── js/
│           └── heart.js        # 动态心形动画核心逻辑（粒子系统、心跳、交互、配置同步、生成分享链接）
├── db/                           # SQLite 数据库目录（运行时生成 config.db）
├── weights/                      # 权重模型目录（本项目暂未使用，预留）
├── .venv/                        # Python 虚拟环境（git 忽略）
├── .python-version               # Python 版本固定（3.12）
├── .gitignore                    # Git 忽略规则
├── requirements.txt              # Python 依赖清单
├── README.md                     # 项目说明（英文）
├── README_zh.md                  # 项目说明（中文）
└── architecture.md               # 本文件
```

## 文件作用速查

| 文件 | 作用 |
|------|------|
| `app.py` | Flask 应用入口，启动后端服务、注册路由、初始化数据库 |
| `backend/database.py` | 创建 sqlite 引擎与表，提供 `load_config` / `save_config` / `create_share` / `load_share_config`（实时配置） |
| `backend/models.py` | 定义 `HeartConfig` 表（粒子数、颜色、跳动速度、文字、3D 开关、旋转速度等）和 `ShareLink` 表（分享 token、创建时间） |
| `backend/routes.py` | 提供 `/` 主页、`GET/POST /api/config` 接口、`POST /api/share` 生成分享链接、`GET /s/<token>` 只读分享页、`GET /api/share/<token>/config` 读取实时配置 |
| `frontend/templates/index.html` | 页面结构：全屏 Canvas + 浮动控制面板；`readonly=True` 时不渲染控制面板，显示只读分享标识 |
| `frontend/static/css/style.css` | 页面与控制面板样式、分享按钮样式、只读分享标识样式 |
| `frontend/static/js/heart.js` | 3D 心形动画核心逻辑（3D 心形曲面、自动旋转、透视投影、深度排序、粒子系统、心跳、交互、配置同步、生成分享链接） |
| `db/config.db` | sqlite 数据库文件（运行时生成，保存前端参数和分享链接 token） |

## 数据流

1. 启动：`app.py` → `init_db()` 建表 → 注册路由 → Flask 服务启动
2. 前端打开：浏览器请求 `/` → 后端渲染 `index.html`（`readonly=False`）
3. 前端启动时：JS 调用 `GET /api/config` 读取 sqlite 中保存的参数
4. 用户调整参数：JS 实时更新动画 + 防抖调用 `POST /api/config` 保存到 sqlite
5. 刷新页面：参数从数据库恢复，确保设置持久化

## 分享链接数据流

1. 用户在主页点击「生成分享链接」→ JS 先调用 `POST /api/config` 保存当前参数 → 调用 `POST /api/share`
2. 后端生成唯一 token 写入 `ShareLink` 表（仅存 token，不存配置快照），返回完整 URL（`/s/<token>`）
3. 朋友打开 `/s/<token>` → 后端验证 token 存在后渲染 `index.html`（`readonly=True`，无控制面板）
4. 分享页 JS 通过 `GET /api/share/<token>/config` 读取实时配置渲染动画，且禁止调用保存接口
5. 主页修改文字等参数后，分享页每 3 秒轮询自动跟随变化（内容实时同步主页配置）

## 部署

- 本地开发：`uv run python app.py`
- 生产部署：`gunicorn -w 4 -b 0.0.0.0:8000 app:app`
