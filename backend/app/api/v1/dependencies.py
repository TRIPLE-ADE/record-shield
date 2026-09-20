from dataclasses import dataclass
from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.errors import ApiError
from app.models import Membership, Organization, User
from app.services.auth import SESSION_COOKIE, Session, auth_service
from app.services.context import LoadedContext, load_context


@dataclass(frozen=True)
class Actor:
    session: Session
    user: User
    membership: Membership | None
    organization: Organization | None
    context: LoadedContext | None

    @property
    def organization_id(self) -> UUID:
        if self.organization is None:
            raise ApiError(403, "FORBIDDEN", "This operation is not permitted.")
        return self.organization.id


async def get_actor(request: Request, db: Annotated[AsyncSession, Depends(get_db)]) -> Actor:
    session = auth_service.get_session(request.cookies.get(SESSION_COOKIE))
    if session is None:
        raise ApiError(401, "AUTH_REQUIRED", "Authentication is required.")
    user = await auth_service.session_user(db, session)
    membership = await auth_service.session_membership(db, session, user)
    organization = None
    context = None
    if membership is not None:
        organization = await db.get(Organization, membership.organization_id)
        if organization is None:
            raise ApiError(503, "SERVICE_UNAVAILABLE", "The RecordShield service is unavailable.")
        context = await load_context(db, membership)
    return Actor(session, user, membership, organization, context)


async def get_mutation_actor(
    actor: Annotated[Actor, Depends(get_actor)],
    x_csrf_token: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> Actor:
    auth_service.csrf_for_session(actor.session, x_csrf_token)
    return actor
