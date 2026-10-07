"""前端启动入口：启动 Flask 主应用，提供心形图案网页。

启动方法：
    uv run python app.py
或：
    python app.py

部署到服务器：
    gunicorn -w 4 -b 0.0.0.0:8000 app:app
"""
from __future__ import annotations

import os

from flask import Flask

from backend.database import init_db
from backend.routes import main_bp


def create_app() -> Flask:
    """应用工厂：创建并配置 Flask 应用。"""
    # 静态文件与模板目录指向 frontend/
    base_dir = os.path.dirname(os.path.abspath(__file__))
    static_folder = os.path.join(base_dir, "frontend", "static")
    template_folder = os.path.join(base_dir, "frontend", "templates")

    app = Flask(
        __name__,
        static_folder=static_folder,
        template_folder=template_folder,
    )
    app.config["JSON_AS_ASCII"] = False

    # 初始化数据库（启动时读取配置并同步到前端）
    init_db()

    # 注册路由
    app.register_blueprint(main_bp)

    return app


# 全局应用实例（gunicorn / wsgi 直接引用此对象）
app = create_app()


if __name__ == "__main__":
    # 本地开发：默认 5000 端口，开启自动重载
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=True)
