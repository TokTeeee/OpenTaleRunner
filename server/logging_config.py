"""服务端日志系统"""
import logging
import os
from logging.handlers import RotatingFileHandler

LOG_ENABLED = os.getenv("SERVICE_LOG_ENABLED", "true").lower() == "true"
LOG_LEVEL = os.getenv("SERVICE_LOG_LEVEL", "INFO").upper()
LOG_DIR = os.getenv("SERVICE_LOG_DIR", os.path.join(os.path.dirname(__file__), "logs"))
LOG_FORMAT = os.getenv("SERVICE_LOG_FORMAT", "text")
LOG_MAX_BYTES = int(os.getenv("SERVICE_LOG_MAX_BYTES", str(10 * 1024 * 1024)))
LOG_BACKUP_COUNT = int(os.getenv("SERVICE_LOG_BACKUP_COUNT", "7"))

os.makedirs(LOG_DIR, exist_ok=True)

_LEVEL = getattr(logging, LOG_LEVEL, logging.INFO)


def _text_formatter() -> logging.Formatter:
    return logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")


def _json_formatter() -> logging.Formatter:
    return logging.Formatter(
        '{"time": "%(asctime)s", "level": "%(levelname)s", "logger": "%(name)s", "message": "%(message)s"}'
    )


_fmt = _json_formatter() if LOG_FORMAT == "json" else _text_formatter()


def setup_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger

    logger.setLevel(_LEVEL)
    logger.propagate = False

    if LOG_ENABLED:
        fh = RotatingFileHandler(
            os.path.join(LOG_DIR, "service.log"),
            encoding="utf-8",
            maxBytes=LOG_MAX_BYTES,
            backupCount=LOG_BACKUP_COUNT,
        )
        fh.setLevel(_LEVEL)
        fh.setFormatter(_fmt)
        logger.addHandler(fh)

    if _LEVEL <= logging.INFO:
        ch = logging.StreamHandler()
        ch.setLevel(logging.INFO)
        ch.setFormatter(_text_formatter())
        logger.addHandler(ch)

    return logger


api_log = setup_logger("api")
db_log = setup_logger("db")
npc_log = setup_logger("npc")
chronicle_log = setup_logger("chronicle")
ghost_log = setup_logger("ghost")
dashboard_log = setup_logger("dashboard")
request_log = setup_logger("request")
llm_log = setup_logger("llm")
