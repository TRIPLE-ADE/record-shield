from collections.abc import Mapping
from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class ApiError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: list[dict[str, str]] | None = None,
        headers: Mapping[str, str] | None = None,
        extra: Mapping[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details
        self.headers = headers
        self.extra = extra


def _correlation_id(request: Request) -> str:
    return getattr(request.state, "correlation_id", "00000000-0000-4000-8000-000000000000")


def _response(
    request: Request,
    status_code: int,
    code: str,
    message: str,
    details: list[dict[str, str]] | None = None,
    headers: Mapping[str, str] | None = None,
    extra: Mapping[str, Any] | None = None,
) -> JSONResponse:
    error: dict[str, Any] = {"code": code, "message": message}
    if details:
        error["details"] = details

    response = JSONResponse(
        status_code=status_code,
        content={"error": error, "correlation_id": _correlation_id(request), **(extra or {})},
        headers={"Cache-Control": "no-store", "X-Correlation-ID": _correlation_id(request)},
    )
    if headers:
        for key, value in headers.items():
            response.headers[key] = value
    return response


async def api_error_handler(request: Request, exc: ApiError) -> JSONResponse:
    return _response(
        request,
        exc.status_code,
        exc.code,
        exc.message,
        exc.details,
        exc.headers,
        exc.extra,
    )


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    details: list[dict[str, str]] = []
    for error in exc.errors():
        location = [
            str(item)
            for item in error.get("loc", ())
            if item not in {"body", "query", "path", "header"}
        ]
        details.append(
            {"field": ".".join(location) or "request", "code": str(error.get("type", "INVALID"))}
        )
    return _response(
        request,
        422,
        "VALIDATION_ERROR",
        "The request could not be validated.",
        details,
    )


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    if exc.status_code == 404:
        return _response(request, 404, "NOT_FOUND", "The requested resource was not found.")
    if exc.status_code == 405:
        headers = (
            {"Allow": str(exc.headers["Allow"])}
            if exc.headers and "Allow" in exc.headers
            else None
        )
        return _response(
            request,
            405,
            "METHOD_NOT_ALLOWED",
            "This HTTP method is not allowed.",
            headers=headers,
        )
    return _response(
        request,
        exc.status_code,
        "REQUEST_FAILED",
        "The request could not be completed.",
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    return _response(
        request,
        500,
        "SERVICE_UNAVAILABLE",
        "The RecordShield service is unavailable.",
    )
