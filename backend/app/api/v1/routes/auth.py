from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Cookie, Header, Request, Response

from app.core.errors import ApiError
from app.schemas.auth import CsrfResponse, LoginRequest, SessionContext
from app.services.auth import PREAUTH_COOKIE, SESSION_COOKIE, auth_service

router = APIRouter(tags=["auth"])


def _secure_cookie() -> bool:
    from app.core.config import settings

    return settings.environment != "development"


def _set_cookie(response: Response, name: str, value: str, max_age: int) -> None:
    response.set_cookie(
        name,
        value,
        max_age=max_age,
        httponly=True,
        secure=_secure_cookie(),
        samesite="strict",
        path="/",
    )


def _clear_cookie(response: Response, name: str) -> None:
    response.delete_cookie(
        name,
        httponly=True,
        secure=_secure_cookie(),
        samesite="strict",
        path="/",
    )


@router.get("/auth/csrf", response_model=CsrfResponse)
async def csrf_bootstrap(
    request: Request,
    response: Response,
    rs_preauth: Annotated[str | None, Cookie()] = None,
) -> CsrfResponse:
    session = auth_service.get_session(request.cookies.get(SESSION_COOKIE), touch=False)
    if session is not None:
        return CsrfResponse(
            csrf_token=session.csrf_token,
            expires_at=auth_service._z(session.absolute_expires_at),
            correlation_id=UUID(request.state.correlation_id),
        )
    token, expires_at, created = auth_service.bootstrap_csrf(rs_preauth)
    if created:
        _set_cookie(response, PREAUTH_COOKIE, token, 30 * 60)
    return CsrfResponse(
        csrf_token=token,
        expires_at=auth_service._z(expires_at),
        correlation_id=UUID(request.state.correlation_id),
    )


@router.post("/auth/login", response_model=SessionContext)
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    x_csrf_token: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
    rs_preauth: Annotated[str | None, Cookie()] = None,
) -> SessionContext:
    session, replayed = auth_service.login(
        payload.username,
        payload.password,
        payload.membership_id,
        rs_preauth,
        x_csrf_token,
        idempotency_key,
        request.cookies.get(SESSION_COOKIE),
    )
    _set_cookie(response, SESSION_COOKIE, session.token, 8 * 60 * 60)
    if not replayed:
        _clear_cookie(response, PREAUTH_COOKIE)
    return SessionContext(**auth_service.context(session, UUID(request.state.correlation_id)))


@router.post("/auth/logout", status_code=204)
async def logout(
    request: Request,
    response: Response,
    x_csrf_token: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> Response:
    auth_service.logout(request.cookies.get(SESSION_COOKIE), x_csrf_token, idempotency_key)
    _clear_cookie(response, SESSION_COOKIE)
    response.status_code = 204
    return response


@router.get("/me", response_model=SessionContext, tags=["me"])
async def me(request: Request, response: Response) -> SessionContext:
    session = auth_service.get_session(request.cookies.get(SESSION_COOKIE))
    if session is None:
        _clear_cookie(response, SESSION_COOKIE)
        raise ApiError(401, "AUTH_REQUIRED", "Authentication is required.")
    return SessionContext(**auth_service.context(session, UUID(request.state.correlation_id)))
