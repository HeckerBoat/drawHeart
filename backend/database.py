"""数据库连接与初始化。

使用 sqlmodel 思想操作 sqlite 数据库，数据库文件统一放在 db 文件夹中。
"""
from __future__ import annotations

import secrets
from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine, select
from sqlalchemy import text

from backend import models  # 导入后 SQLModel.metadata 才会注册表结构

# 数据库文件统一放在 db/ 目录下
DB_DIR = Path(__file__).resolve().parent.parent / "db"
DB_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DB_DIR / "config.db"

# sqlite URL（注意：使用绝对路径避免跨平台问题）
DATABASE_URL = f"sqlite:///{DB_PATH.as_posix()}"

# 连接 sqlite 时关闭 check_same_thread，便于 Flask 多线程使用
engine = create_engine(DATABASE_URL, echo=False, connect_args={"check_same_thread": False})


def _migrate_legacy_sharelink() -> None:
    """兼容旧库：移除已废弃的 config_json 快照列（分享页改为实时配置后不再使用）。"""
    with Session(engine) as session:
        conn = session.connection()
        cols = conn.execute(text("PRAGMA table_info(sharelink)")).fetchall()
        if any(col[1] == "config_json" for col in cols):
            conn.execute(text("ALTER TABLE sharelink DROP COLUMN config_json"))
            session.commit()
            print("[INFO] 已迁移 sharelink 表：移除废弃的 config_json 快照列")


def _migrate_heartconfig_3d() -> None:
    """兼容旧库：为 HeartConfig 表新增 3D 相关列（不存在时）。"""
    with Session(engine) as session:
        conn = session.connection()
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(heartconfig)")).fetchall()}
        changed = False
        if "depth_3d" not in cols:
            conn.execute(text("ALTER TABLE heartconfig ADD COLUMN depth_3d BOOLEAN DEFAULT 0"))
            changed = True
        if "rotation_speed" not in cols:
            conn.execute(text("ALTER TABLE heartconfig ADD COLUMN rotation_speed FLOAT DEFAULT 0.4"))
            changed = True
        if changed:
            session.commit()
            print("[INFO] 已迁移 heartconfig 表：新增 depth_3d / rotation_speed 列")


def _migrate_heartconfig_fireworks() -> None:
    """兼容旧库：为 HeartConfig 表新增烟花特效开关列（不存在时）。"""
    with Session(engine) as session:
        conn = session.connection()
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(heartconfig)")).fetchall()}
        if "show_fireworks" not in cols:
            conn.execute(text("ALTER TABLE heartconfig ADD COLUMN show_fireworks BOOLEAN DEFAULT 1"))
            session.commit()
            print("[INFO] 已迁移 heartconfig 表：新增 show_fireworks 列")


def _migrate_heartconfig_text_size() -> None:
    """兼容旧库：为 HeartConfig 表新增艺术字大小倍率列（不存在时）。"""
    with Session(engine) as session:
        conn = session.connection()
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(heartconfig)")).fetchall()}
        if "text_size" not in cols:
            conn.execute(text("ALTER TABLE heartconfig ADD COLUMN text_size FLOAT DEFAULT 1.0"))
            session.commit()
            print("[INFO] 已迁移 heartconfig 表：新增 text_size 列")


def _migrate_heartconfig_text_position() -> None:
    """兼容旧库：为 HeartConfig 表新增文字位置偏移列（不存在时）。"""
    with Session(engine) as session:
        conn = session.connection()
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(heartconfig)")).fetchall()}
        changed = False
        if "text_x" not in cols:
            conn.execute(text("ALTER TABLE heartconfig ADD COLUMN text_x FLOAT DEFAULT 0.0"))
            changed = True
        if "text_y" not in cols:
            conn.execute(text("ALTER TABLE heartconfig ADD COLUMN text_y FLOAT DEFAULT 0.4"))
            changed = True
        if changed:
            session.commit()
            print("[INFO] 已迁移 heartconfig 表：新增 text_x / text_y 列")


def init_db() -> None:
    """初始化数据库：创建所有表、迁移旧表结构并写入默认配置。"""
    SQLModel.metadata.create_all(engine)
    _migrate_legacy_sharelink()
    _migrate_heartconfig_3d()
    _migrate_heartconfig_fireworks()
    _migrate_heartconfig_text_size()
    _migrate_heartconfig_text_position()

    # 写入默认配置（如果不存在）
    with Session(engine) as session:
        existing = session.exec(select(models.HeartConfig)).first()
        if existing is None:
            session.add(models.HeartConfig.default())
            session.commit()


def get_session() -> Session:
    """获取数据库会话。"""
    return Session(engine)


def load_config() -> dict:
    """读取当前心形配置参数，返回字典。"""
    with Session(engine) as session:
        cfg = session.exec(select(models.HeartConfig)).first()
        if cfg is None:
            # 兜底：写入默认值
            cfg = models.HeartConfig.default()
            session.add(cfg)
            session.commit()
        return cfg.to_dict()


def save_config(data: dict) -> dict:
    """更新心形配置参数并返回最新值。"""
    with Session(engine) as session:
        cfg = session.exec(select(models.HeartConfig)).first()
        if cfg is None:
            cfg = models.HeartConfig.default()
            session.add(cfg)
        # 仅更新允许的字段
        allowed = {
            "particle_count", "heart_color", "background_color",
            "beat_speed", "text_content", "show_text", "text_color",
            "text_size", "text_x", "text_y",
            "particle_size", "spread_ratio", "depth_3d",
            "rotation_speed", "show_fireworks",
        }
        for key, value in data.items():
            if key in allowed:
                setattr(cfg, key, value)
        session.add(cfg)
        session.commit()
        session.refresh(cfg)
        return cfg.to_dict()


def create_share() -> str:
    """生成分享链接：仅保存唯一 token，页面内容实时跟随当前配置。"""
    # token_urlsafe(8) 生成约 11 位随机字符串，足够防猜测
    token = secrets.token_urlsafe(8)
    with Session(engine) as session:
        link = models.ShareLink(token=token)
        session.add(link)
        session.commit()
    print(f"[INFO] 生成分享链接: /s/{token}")
    return token


def share_token_exists(token: str) -> bool:
    """校验分享 token 是否有效。"""
    with Session(engine) as session:
        link = session.exec(
            select(models.ShareLink).where(models.ShareLink.token == token)
        ).first()
        return link is not None


def load_share_config(token: str) -> dict | None:
    """按 token 读取分享页配置。

    分享页内容实时跟随主页当前配置：token 仅用于校验链接有效性，
    校验通过后返回最新的当前配置（父页面修改文字后子页面随之变化）。
    token 不存在返回 None。
    """
    if not share_token_exists(token):
        return None
    return load_config()
