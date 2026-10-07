"""API 路由：提供配置读取与更新接口，以及主页面渲染。"""
from __future__ import annotations

from flask import Blueprint, jsonify, render_template, request

from backend.database import create_share, load_config, load_share_config, save_config

main_bp = Blueprint("main", __name__)


@main_bp.route("/")
def index():
    """主页：渲染心形动画页面（可编辑）。"""
    return render_template("index.html", readonly=False)


@main_bp.route("/api/config", methods=["GET"])
def get_config():
    """读取当前配置，启动时前端同步使用。"""
    try:
        return jsonify({"code": 0, "data": load_config()})
    except Exception as exc:  # noqa: BLE001
        # 所有报错打印在后端日志，不弹窗
        print(f"[ERROR] /api/config GET: {exc}")
        return jsonify({"code": 500, "msg": "读取配置失败"}), 500


@main_bp.route("/api/config", methods=["POST"])
def update_config():
    """前端修改参数后同步保存到 sqlite。"""
    try:
        data = request.get_json(silent=True) or {}
        new_cfg = save_config(data)
        return jsonify({"code": 0, "data": new_cfg})
    except Exception as exc:  # noqa: BLE001
        print(f"[ERROR] /api/config POST: {exc}")
        return jsonify({"code": 500, "msg": "保存配置失败"}), 500


@main_bp.route("/api/share", methods=["POST"])
def create_share_link():
    """生成分享外链，返回完整 URL。"""
    try:
        token = create_share()
        # 构造完整分享 URL（优先使用请求 Host，否则回退到相对路径）
        host = request.headers.get("Host", "localhost")
        scheme = request.headers.get("X-Forwarded-Proto", request.scheme)
        url = f"{scheme}://{host}/s/{token}"
        return jsonify({"code": 0, "data": {"token": token, "url": url}})
    except Exception as exc:  # noqa: BLE001
        print(f"[ERROR] /api/share POST: {exc}")
        return jsonify({"code": 500, "msg": "生成分享链接失败"}), 500


@main_bp.route("/s/<token>")
def share_page(token: str):
    """分享页面：只读渲染心形动画，隐藏控制面板。"""
    cfg = load_share_config(token)
    if cfg is None:
        return "分享链接不存在或已过期", 404
    return render_template("index.html", readonly=True)


@main_bp.route("/api/share/<token>/config", methods=["GET"])
def get_share_config(token: str):
    """分享页面专用：读取快照配置（只读，不提供保存接口）。"""
    try:
        cfg = load_share_config(token)
        if cfg is None:
            return jsonify({"code": 404, "msg": "分享链接不存在"}), 404
        return jsonify({"code": 0, "data": cfg})
    except Exception as exc:  # noqa: BLE001
        print(f"[ERROR] /api/share/{token}/config GET: {exc}")
        return jsonify({"code": 500, "msg": "读取分享配置失败"}), 500
