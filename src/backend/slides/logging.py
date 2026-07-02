"""Minimal structured (JSON) log formatter, no third-party dep.

Enabled by setting LOG_FORMAT=json (production); otherwise human-readable console output. JSON logs
are what a sovereign, self-hosted Loki/Grafana stack ingests cleanly.
"""

import json
import logging


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "time": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)
