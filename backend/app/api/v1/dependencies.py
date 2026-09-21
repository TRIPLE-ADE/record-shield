from dataclasses import dataclass
from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.errors import ApiError
from app.models import Membership, Organization, User
from app.services import audit
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
    try:
        membership = await auth_service.session_membership(db, session, user)
    except ApiError as exc:
        # FR12 / AR09: a suspended or deactivated identity attempting protected access is
        # itself evidence. The denial never waits for the audit process.
        stale = await db.get(Membership, session.membership_id) if session.membership_id else None
        reason = "MEMBERSHIP_SUSPENDED" if stale and stale.suspended else "MEMBERSHIP_INACTIVE"
        await audit.deny(
            db,
            user.id,
            stale.organization_id if stale else None,
            reason,
            "membership",
            session.membership_id or user.id,
            {"path": request.url.path},
            status_code=exc.status_code,
            public_code=exc.code,
            message=exc.message,
            role_snapshot=stale.role if stale else None,
        )
        raise exc
    organization = None
    context = None
    if membership is not None:
        organization = await db.get(Organization, membership.organization_id)
        if organization is None:
            raise ApiError(503, "SERVICE_UNAVAILABLE", "The RecordShield service is unavailable.")
        if organization.status == "SUSPENDED":
            await audit.deny(
                db,
                user.id,
                organization.id,
                "ORG_SUSPENDED",
                "organization",
                organization.id,
                {"path": request.url.path},
                role_snapshot=membership.role,
            )
        context = await load_context(db, membership)
    return Actor(session, user, membership, organization, context)


async def get_mutation_actor(
    actor: Annotated[Actor, Depends(get_actor)],
    x_csrf_token: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> Actor:
    auth_service.csrf_for_session(actor.session, x_csrf_token)
    return actor
