import logging
from collections.abc import Awaitable, Callable
from uuid import uuid4

from fastapi import Request, Response

logger = logging.getLogger("recordshield.http")


async def request_context_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    correlation_id = str(uuid4())
    request.state.correlation_id = correlation_id

    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Correlation-ID"] = correlation_id
    logger.info(
        "request_completed",
        extra={
            "correlation_id": correlation_id,
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
        },
    )
    return response
