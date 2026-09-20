"""Interval task: retries undelivered audit outbox rows (PRD §12.2 backoff). No queue needed."""

import asyncio
import logging

from app.core.db import SessionLocal
from app.services.audit import flush_pending
from app.services.emergency import sweep_overdue_justifications

logger = logging.getLogger("recordshield.audit")


async def run_forever(interval_seconds: float) -> None:
    while True:
        try:
            async with SessionLocal() as db:
                overdue = await sweep_overdue_justifications(db)
                delivered = await flush_pending(db)
            if overdue:
                logger.info("emergency_overdue_swept", extra={"count": overdue})
            if delivered:
                logger.info("audit_outbox_flushed", extra={"delivered": delivered})
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 - the loop must survive transient failures
            logger.warning("audit_outbox_flush_failed", extra={"error": type(exc).__name__})
        await asyncio.sleep(interval_seconds)
