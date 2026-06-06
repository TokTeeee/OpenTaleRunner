"""雪花算法 ID 生成器 — 用于多人房间ID、存档ID等全局唯一标识"""

import time
import threading


class SnowflakeGenerator:
    """
    标准雪花算法实现：
    - 41位时间戳（毫秒级，从自定义起始时间开始，可用约69年）
    - 10位机器ID（支持1024个节点）
    - 12位序列号（同毫秒内4096个ID）

    生成的ID为64位整数，输出为18位数字字符串。
    """

    # 起始时间戳（2026-01-01 00:00:00 UTC）
    EPOCH = 1767225600000

    # 各部分的位数
    MACHINE_ID_BITS = 10
    SEQUENCE_BITS = 12

    MAX_MACHINE_ID = (1 << MACHINE_ID_BITS) - 1  # 1023
    MAX_SEQUENCE = (1 << SEQUENCE_BITS) - 1       # 4095

    MACHINE_ID_SHIFT = SEQUENCE_BITS              # 12
    TIMESTAMP_SHIFT = SEQUENCE_BITS + MACHINE_ID_BITS  # 22

    def __init__(self, machine_id: int = 1):
        if machine_id < 0 or machine_id > self.MAX_MACHINE_ID:
            raise ValueError(f"machine_id must be 0-{self.MAX_MACHINE_ID}")
        self.machine_id = machine_id
        self.sequence = 0
        self.last_timestamp = -1
        self._lock = threading.Lock()

    def _current_millis(self) -> int:
        return int(time.time() * 1000)

    def _wait_next_millis(self, last_timestamp: int) -> int:
        timestamp = self._current_millis()
        while timestamp <= last_timestamp:
            timestamp = self._current_millis()
        return timestamp

    def generate_id(self) -> str:
        """生成雪花ID，返回18位数字字符串"""
        with self._lock:
            timestamp = self._current_millis()

            if timestamp < self.last_timestamp:
                raise RuntimeError(
                    f"Clock moved backwards. Refusing to generate id for "
                    f"{self.last_timestamp - timestamp} milliseconds"
                )

            if timestamp == self.last_timestamp:
                self.sequence = (self.sequence + 1) & self.MAX_SEQUENCE
                if self.sequence == 0:
                    timestamp = self._wait_next_millis(self.last_timestamp)
            else:
                self.sequence = 0

            self.last_timestamp = timestamp

            snowflake_id = (
                ((timestamp - self.EPOCH) << self.TIMESTAMP_SHIFT)
                | (self.machine_id << self.MACHINE_ID_SHIFT)
                | self.sequence
            )

            return str(snowflake_id)

    def generate_uuid(self) -> str:
        """便捷方法：返回雪花ID字符串（兼容现有uuid使用习惯）"""
        return self.generate_id()


# 模块级默认实例（machine_id 从环境变量读取，支持多实例部署）
def _get_default_machine_id() -> int:
    import os
    mid = os.environ.get("SNOWFLAKE_MACHINE_ID", "1")
    try:
        return int(mid)
    except ValueError:
        return 1


default_generator = SnowflakeGenerator(machine_id=_get_default_machine_id())


def generate_snowflake_id() -> str:
    """便捷函数：生成一个雪花ID"""
    return default_generator.generate_id()
