from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, Request

from app.core.errors import ApiError
from app.services.auth import SESSION_COOKIE, Membership, Session, User, auth_service


@dataclass(frozen=True)
class Actor:
    session: Session
    user: User
    membership: Membership | None


async def get_actor(request: Request) -> Actor:
    session = auth_service.get_session(request.cookies.get(SESSION_COOKIE))
    if session is None:
        raise ApiError(401, "AUTH_REQUIRED", "Authentication is required.")
    user = auth_service.session_user(session)
    membership = auth_service.session_membership(session, user)
    return Actor(session, user, membership)


async def get_mutation_actor(
    actor: Annotated[Actor, Depends(get_actor)],
    x_csrf_token: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> Actor:
    auth_service.csrf_for_session(actor.session, x_csrf_token)
    return actor
