import hashlib
import secrets
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from threading import Lock
from typing import Any
from uuid import UUID

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import clock
from app.core.errors import ApiError
from app.core.primitives import request_fingerprint
from app.models import Membership, Organization, User
from app.services.context import active_shift

PREAUTH_COOKIE = "rs_preauth"
SESSION_COOKIE = "rs_session"
IDLE_TIMEOUT = timedelta(minutes=30)
ABSOLUTE_TIMEOUT = timedelta(hours=8)
PREAUTH_TIMEOUT = timedelta(minutes=30)
FAILURE_WINDOW = timedelta(minutes=5)
MAX_FAILURES = 5

_DUMMY_PASSWORD_HASH = (
    "$argon2id$v=19$m=65536,t=3,p=4$0rEXoUekvqdRTSud8DJBbw$"
    "V2q4RNud30UNKSj/S/mCzfGG99zdIYd6ItloTzBZgTg"
)
_password_hasher = PasswordHasher()


@dataclass
class PreAuth:
    token: str
    expires_at: datetime


@dataclass
class Session:
    token: str
    user_id: UUID
    csrf_token: str
    created_at: datetime
    last_activity_at: datetime
    absolute_expires_at: datetime
    membership_id: UUID | None


@dataclass(frozen=True)
class LoginReplay:
    fingerprint: str
    session_token: str
    expires_at: datetime


@dataclass
class AuthService:
    """Server-side session state. Identity, memberships and context are read from the database."""

    preauth: dict[str, PreAuth] = field(default_factory=dict)
    sessions: dict[str, Session] = field(default_factory=dict)
    login_replays: dict[str, LoginReplay] = field(default_factory=dict)
    logout_replays: dict[str, str] = field(default_factory=dict)
    failures: dict[str, list[datetime]] = field(default_factory=dict)
    lock: Lock = field(default_factory=Lock)

    @staticmethod
    def _hash(value: str) -> str:
        return hashlib.sha256(value.encode()).hexdigest()

    @staticmethod
    def _now() -> datetime:
        return clock.now()

    @staticmethod
    def _z(value: datetime) -> str:
        return clock.z(value)

    def bootstrap_csrf(self, cookie: str | None) -> tuple[str, datetime, bool]:
        now = self._now()
        if cookie:
            entry = self.preauth.get(self._hash(cookie))
            if entry and entry.expires_at > now:
                return entry.token, entry.expires_at, False
        token = secrets.token_urlsafe(48)
        expires_at = now + PREAUTH_TIMEOUT
        self.preauth[self._hash(token)] = PreAuth(token, expires_at)
        return token, expires_at, True

    def _fail(self, username: str) -> None:
        now = self._now()
        failures = [item for item in self.failures.get(username, []) if now - item < FAILURE_WINDOW]
        failures.append(now)
        self.failures[username] = failures
        if len(failures) >= MAX_FAILURES:
            raise ApiError(
                429,
                "RATE_LIMITED",
                "Too many sign-in attempts. Try again later.",
                headers={"Retry-After": "300"},
            )

    def _generic_auth_failure(self, username: str) -> None:
        self._fail(username)
        raise ApiError(401, "AUTH_FAILED", "Unable to sign in with the supplied credentials.")

    async def _active_memberships(self, db: AsyncSession, user: User) -> list[Membership]:
        rows = await db.scalars(
            select(Membership).where(
                Membership.user_id == user.id,
                Membership.active.is_(True),
                Membership.suspended.is_(False),
            )
        )
        return list(rows)

    async def _valid_membership(
        self, db: AsyncSession, user: User, membership_id: UUID | None
    ) -> Membership | None:
        if user.kind == "PATIENT":
            return None
        memberships = await self._active_memberships(db, user)
        if membership_id is None and len(memberships) == 1:
            return memberships[0]
        for membership in memberships:
            if membership.id == membership_id:
                return membership
        return None

    async def _verify_credentials(
        self, db: AsyncSession, username: str, password: str
    ) -> User | None:
        user = await db.scalar(select(User).where(User.username == username))
        password_hash = user.password_hash if user else _DUMMY_PASSWORD_HASH
        try:
            valid = _password_hasher.verify(password_hash, password)
        except (InvalidHashError, VerificationError, VerifyMismatchError):
            valid = False
        if not user or not valid or not user.active or not user.verified:
            return None
        return user

    def login_fingerprint(self, request_body: dict[str, Any]) -> str:
        return request_fingerprint("preauth", "POST", "/auth/login", request_body)

    def replay_login(self, key: str, fingerprint: str) -> Session | None:
        replay = self.login_replays.get(key)
        if replay is None:
            return None
        if not secrets.compare_digest(replay.fingerprint, fingerprint):
            raise ApiError(
                409,
                "IDEMPOTENCY_CONFLICT",
                "The idempotency key was reused with different content.",
            )
        if replay.expires_at <= self._now():
            raise ApiError(401, "AUTH_REQUIRED", "Authentication is required.")
        session = self.sessions.get(self._hash(replay.session_token))
        if session is None or self._session_expired(session):
            raise ApiError(401, "AUTH_REQUIRED", "Authentication is required.")
        return session

    async def login(
        self,
        db: AsyncSession,
        username: str,
        password: str,
        membership_id: UUID | None,
        preauth_cookie: str | None,
        csrf_token: str | None,
        idempotency_key: str | None,
        current_session_token: str | None,
    ) -> tuple[Session, bool]:
        if not idempotency_key or len(idempotency_key) < 16 or len(idempotency_key) > 128:
            raise ApiError(
                422,
                "VALIDATION_ERROR",
                "Idempotency-Key must be between 16 and 128 characters.",
            )
        fingerprint = self.login_fingerprint(
            {
                "username": username,
                "password": password,
                "membership_id": str(membership_id) if membership_id else None,
            }
        )
        replay = self.replay_login(idempotency_key, fingerprint)
        if replay is not None:
            if current_session_token is None or secrets.compare_digest(
                replay.token, current_session_token
            ):
                return replay, True
            raise ApiError(401, "AUTH_REQUIRED", "Authentication is required.")
        if not preauth_cookie or not csrf_token:
            raise ApiError(403, "CSRF_INVALID", "The security token is invalid.")
        preauth = self.preauth.get(self._hash(preauth_cookie))
        if (
            not preauth
            or preauth.expires_at <= self._now()
            or not secrets.compare_digest(preauth.token, csrf_token)
        ):
            raise ApiError(403, "CSRF_INVALID", "The security token is invalid.")

        normalized_username = username.strip().lower()
        user = await self._verify_credentials(db, normalized_username, password)
        if user is None:
            self._generic_auth_failure(normalized_username)
        membership = await self._valid_membership(db, user, membership_id)
        if user.kind == "STAFF" and membership is None:
            self._generic_auth_failure(normalized_username)

        now = self._now()
        session_token = secrets.token_urlsafe(48)
        session = Session(
            session_token,
            user.id,
            secrets.token_urlsafe(48),
            now,
            now,
            now + ABSOLUTE_TIMEOUT,
            membership.id if membership else None,
        )
        self.sessions[self._hash(session_token)] = session
        self.preauth.pop(self._hash(preauth_cookie), None)
        self.login_replays[idempotency_key] = LoginReplay(
            fingerprint,
            session_token,
            now + timedelta(hours=24),
        )
        self.failures.pop(normalized_username, None)
        return session, False

    def _session_expired(self, session: Session) -> bool:
        now = self._now()
        return now >= session.absolute_expires_at or now - session.last_activity_at >= IDLE_TIMEOUT

    def get_session(self, token: str | None, touch: bool = True) -> Session | None:
        if not token:
            return None
        session = self.sessions.get(self._hash(token))
        if session is None:
            return None
        if self._session_expired(session):
            self.sessions.pop(self._hash(token), None)
            return None
        if touch:
            session.last_activity_at = self._now()
        return session

    async def session_user(self, db: AsyncSession, session: Session) -> User:
        user = await db.get(User, session.user_id)
        if user is None or not user.active or not user.verified:
            raise ApiError(401, "AUTH_REQUIRED", "Authentication is required.")
        return user

    async def session_membership(
        self, db: AsyncSession, session: Session, user: User
    ) -> Membership | None:
        if session.membership_id is None:
            return None
        membership = await db.get(Membership, session.membership_id)
        if (
            membership is None
            or membership.user_id != user.id
            or not membership.active
            or membership.suspended
        ):
            raise ApiError(403, "FORBIDDEN", "This operation is not permitted.")
        return membership

    def csrf_for_session(self, session: Session, header: str | None) -> None:
        if not header or not secrets.compare_digest(session.csrf_token, header):
            raise ApiError(403, "CSRF_INVALID", "The security token is invalid.")

    def logout(
        self,
        token: str | None,
        csrf_token: str | None,
        idempotency_key: str | None,
    ) -> bool:
        if not idempotency_key or len(idempotency_key) < 16 or len(idempotency_key) > 128:
            raise ApiError(
                422,
                "VALIDATION_ERROR",
                "Idempotency-Key must be between 16 and 128 characters.",
            )
        if token is None:
            if idempotency_key in self.logout_replays:
                return False
            raise ApiError(401, "AUTH_REQUIRED", "Authentication is required.")
        session = self.get_session(token, touch=False)
        if session is None:
            if idempotency_key in self.logout_replays:
                return False
            raise ApiError(401, "AUTH_REQUIRED", "Authentication is required.")
        self.csrf_for_session(session, csrf_token)
        fingerprint = self._hash(f"{idempotency_key}:{self._hash(token)}")
        previous = self.logout_replays.get(idempotency_key)
        if previous is not None:
            if previous != fingerprint:
                raise ApiError(
                    409,
                    "IDEMPOTENCY_CONFLICT",
                    "The idempotency key was reused with different content.",
                )
            return False
        self.logout_replays[idempotency_key] = fingerprint
        self.sessions.pop(self._hash(token), None)
        return True

    async def context(
        self, db: AsyncSession, session: Session, correlation_id: UUID
    ) -> dict[str, Any]:
        user = await self.session_user(db, session)
        membership = await self.session_membership(db, session, user)
        permissions: list[str]
        organization: dict[str, Any] | None = None
        shift: dict[str, Any] | None = None
        role: str | None = None
        membership_id: UUID | None = None
        if user.kind == "PATIENT":
            permissions = ["portal.read"]
        elif membership:
            role = membership.role
            membership_id = membership.id
            org = await db.get(Organization, membership.organization_id)
            if org is None:
                raise ApiError(
                    503, "SERVICE_UNAVAILABLE", "The RecordShield service is unavailable."
                )
            organization = {"organization_id": org.id, "name": org.name, "mode": org.mode}
            current_shift = await active_shift(db, membership.id)
            if current_shift:
                shift = {
                    "id": current_shift.id,
                    "starts_at": self._z(current_shift.starts_at),
                    "ends_at": self._z(current_shift.ends_at),
                    "active": True,
                }
            permissions = (
                ["trust.metadata.read", "security.review"]
                if role in {"TRUST_OPERATOR", "SECURITY_ADMIN"}
                else [
                    "local_records.read_with_context",
                    "consent.request",
                    "emergency.activate_with_context",
                ]
            )
        else:
            permissions = []
        return {
            "user": {"id": user.id, "username": user.username, "kind": user.kind},
            "membership_id": membership_id,
            "role": role,
            "organization": organization,
            "patient_id": user.patient_id,
            "shift": shift,
            "permissions_summary": permissions,
            "csrf_token": session.csrf_token,
            "idle_expires_at": self._z(session.last_activity_at + IDLE_TIMEOUT),
            "absolute_expires_at": self._z(session.absolute_expires_at),
            "correlation_id": correlation_id,
        }


auth_service = AuthService()
