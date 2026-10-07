"""数据库表结构定义。

使用 sqlmodel 思想定义表结构，前端参数通过该表持久化到 sqlite。
程序启动时读取并同步到前端；前端修改参数后同步保存到该表。
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


class HeartConfig(SQLModel, table=True):
    """心形图案参数配置表。

    设计为单行表（id 恒为 1），便于读写。
    """

    id: int | None = Field(default=1, primary_key=True)
    # 粒子数量（组成心形的点数）
    particle_count: int = Field(default=800, ge=100, le=3000)
    # 心形主色（HEX 颜色值）
    heart_color: str = Field(default="#ff2d55", max_length=9)
    # 背景色
    background_color: str = Field(default="#0a0a1a", max_length=9)
    # 跳动速度系数（越大越快，0.5-3.0）
    beat_speed: float = Field(default=1.0, ge=0.1, le=5.0)
    # 粒子大小
    particle_size: float = Field(default=2.0, ge=0.5, le=8.0)
    # 扩散系数（粒子飞出范围的缩放）
    spread_ratio: float = Field(default=1.0, ge=0.5, le=2.0)
    # 显示文字
    show_text: bool = Field(default=True)
    # 文字内容
    text_content: str = Field(default="I Love You", max_length=64)
    # 文字颜色
    text_color: str = Field(default="#ffffff", max_length=9)
    # 是否启用 3D 心形
    depth_3d: bool = Field(default=False)
    # 3D 旋转速度（弧度/秒）
    rotation_speed: float = Field(default=0.4, ge=0.0, le=3.0)

    @staticmethod
    def default() -> "HeartConfig":
        """生成默认配置实例。"""
        return HeartConfig(id=1)

    def to_dict(self) -> dict:
        """转换为前端可用的字典。"""
        return {
            "particle_count": self.particle_count,
            "heart_color": self.heart_color,
            "background_color": self.background_color,
            "beat_speed": self.beat_speed,
            "particle_size": self.particle_size,
            "spread_ratio": self.spread_ratio,
            "show_text": self.show_text,
            "text_content": self.text_content,
            "text_color": self.text_color,
            "depth_3d": self.depth_3d,
            "rotation_speed": self.rotation_speed,
        }


class ShareLink(SQLModel, table=True):
    """分享链接表。

    仅保存唯一 token 用于校验链接有效性；
    分享页内容实时读取当前配置，随父页面（主页）设置变化而变化。
    """

    id: int | None = Field(default=None, primary_key=True)
    # 外链 token（唯一，追加在 /s/<token> 路径中）
    token: str = Field(index=True, unique=True, max_length=32)
    # 创建时间（UTC，带时区）
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
