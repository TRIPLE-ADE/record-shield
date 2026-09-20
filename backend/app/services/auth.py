import hashlib
import secrets
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime, timedelta
from threading import Lock
from typing import Any
from uuid import UUID

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.core.errors import ApiError
from app.core.primitives import request_fingerprint

PREAUTH_COOKIE = "rs_preauth"
SESSION_COOKIE = "rs_session"
IDLE_TIMEOUT = timedelta(minutes=30)
ABSOLUTE_TIMEOUT = timedelta(hours=8)
PREAUTH_TIMEOUT = timedelta(minutes=30)
FAILURE_WINDOW = timedelta(minutes=5)
MAX_FAILURES = 5

_PASSWORD_HASH = (
    "$argon2id$v=19$m=65536,t=3,p=4$0rEXoUekvqdRTSud8DJBbw$"
    "V2q4RNud30UNKSj/S/mCzfGG99zdIYd6ItloTzBZgTg"
)
_password_hasher = PasswordHasher()


@dataclass(frozen=True)
class Organization:
    id: UUID
    name: str
    mode: str


@dataclass(frozen=True)
class Shift:
    id: UUID
    starts_at: datetime
    ends_at: datetime


@dataclass(frozen=True)
class Membership:
    id: UUID
    organization: Organization
    role: str
    active: bool = True
    suspended: bool = False
    shift: Shift | None = None


@dataclass(frozen=True)
class User:
    id: UUID
    username: str
    kind: str
    password_hash: str
    verified: bool = True
    active: bool = True
    patient_id: UUID | None = None
    memberships: tuple[Membership, ...] = ()
    is_trust_operator: bool = False


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
    users: dict[str, User] = field(default_factory=dict)
    preauth: dict[str, PreAuth] = field(default_factory=dict)
    sessions: dict[str, Session] = field(default_factory=dict)
    login_replays: dict[str, LoginReplay] = field(default_factory=dict)
    logout_replays: dict[str, str] = field(default_factory=dict)
    failures: dict[str, list[datetime]] = field(default_factory=dict)
    lock: Lock = field(default_factory=Lock)

    def __post_init__(self) -> None:
        if self.users:
            return
        unity = Organization(UUID("00000000-0000-4000-8000-000000000003"), "Unity Medical", "LITE")
        mercy = Organization(
            UUID("00000000-0000-4000-8000-000000000002"),
            "Mercy General",
            "MOCK_EMR",
        )
        shift = Shift(
            UUID("00000000-0000-4000-8000-000000000017"),
            datetime(2026, 9, 20, 8, tzinfo=UTC),
            datetime(2026, 9, 20, 16, tzinfo=UTC),
        )
        unity_membership = Membership(
            UUID("00000000-0000-4000-8000-000000000005"),
            unity,
            "EMERGENCY_DOCTOR",
            shift=shift,
        )
        mercy_membership = Membership(
            UUID("00000000-0000-4000-8000-000000000006"),
            mercy,
            "ATTENDING_DOCTOR",
            shift=shift,
        )
        multi_unity_membership = Membership(
            UUID("00000000-0000-4000-8000-000000000011"),
            unity,
            "EMERGENCY_DOCTOR",
            shift=shift,
        )
        self.users.update(
            {
                "amina.unity": User(
                    UUID("00000000-0000-4000-8000-000000000004"),
                    "amina.unity",
                    "STAFF",
                    _PASSWORD_HASH,
                    memberships=(unity_membership,),
                ),
                "multi.staff": User(
                    UUID("00000000-0000-4000-8000-000000000007"),
                    "multi.staff",
                    "STAFF",
                    _PASSWORD_HASH,
                    memberships=(multi_unity_membership, mercy_membership),
                ),
                "musa.patient": User(
                    UUID("00000000-0000-4000-8000-000000000008"),
                    "musa.patient",
                    "PATIENT",
                    _PASSWORD_HASH,
                    patient_id=UUID("00000000-0000-4000-8000-000000000101"),
                ),
                "trust.operator": User(
                    UUID("00000000-0000-4000-8000-000000000009"),
                    "trust.operator",
                    "STAFF",
                    _PASSWORD_HASH,
                    memberships=(
                        Membership(
                            UUID("00000000-0000-4000-8000-000000000010"),
                            unity,
                            "TRUST_OPERATOR",
                        ),
                    ),
                    is_trust_operator=True,
                ),
            }
        )

    @staticmethod
    def _hash(value: str) -> str:
        return hashlib.sha256(value.encode()).hexdigest()

    @staticmethod
    def _now() -> datetime:
        return datetime.now(UTC)

    @staticmethod
    def _z(value: datetime) -> str:
        return value.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")

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

    def _valid_membership(self, user: User, membership_id: UUID | None) -> Membership | None:
        active_memberships = [
            item for item in user.memberships if item.active and not item.suspended
        ]
        if user.kind == "PATIENT" or user.is_trust_operator:
            return None
        if membership_id is None and len(active_memberships) == 1:
            return active_memberships[0]
        for membership in active_memberships:
            if membership.id == membership_id:
                return membership
        return None

    def _verify_credentials(self, username: str, password: str) -> User | None:
        user = self.users.get(username)
        password_hash = user.password_hash if user else _PASSWORD_HASH
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

    def login(
        self,
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
        user = self._verify_credentials(normalized_username, password)
        if user is None:
            self._generic_auth_failure(normalized_username)
        membership = self._valid_membership(user, membership_id)
        if user.kind == "STAFF" and not user.is_trust_operator and membership is None:
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

    def session_user(self, session: Session) -> User:
        user = next((item for item in self.users.values() if item.id == session.user_id), None)
        if user is None or not user.active or not user.verified:
            raise ApiError(401, "AUTH_REQUIRED", "Authentication is required.")
        return user

    def session_membership(self, session: Session, user: User) -> Membership | None:
        if session.membership_id is None:
            return None
        membership = next(
            (item for item in user.memberships if item.id == session.membership_id),
            None,
        )
        if membership is None or not membership.active or membership.suspended:
            raise ApiError(403, "FORBIDDEN", "This operation is not permitted.")
        return membership

    def suspend_membership(self, membership_id: UUID, suspended: bool) -> None:
        for username, user in self.users.items():
            if not any(item.id == membership_id for item in user.memberships):
                continue
            memberships = tuple(
                replace(item, suspended=suspended) if item.id == membership_id else item
                for item in user.memberships
            )
            self.users[username] = replace(user, memberships=memberships)

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

    def context(self, session: Session, correlation_id: UUID) -> dict[str, Any]:
        user = self.session_user(session)
        membership = self.session_membership(session, user)
        permissions: list[str]
        organization: dict[str, Any] | None = None
        shift: dict[str, Any] | None = None
        role: str | None = None
        membership_id: UUID | None = None
        if user.kind == "PATIENT":
            permissions = ["portal.read"]
        elif user.is_trust_operator:
            role = "TRUST_OPERATOR"
            permissions = ["trust.metadata.read", "security.review"]
        elif membership:
            role = membership.role
            membership_id = membership.id
            organization = {
                "organization_id": membership.organization.id,
                "name": membership.organization.name,
                "mode": membership.organization.mode,
            }
            if membership.shift:
                shift = {
                    "id": membership.shift.id,
                    "starts_at": self._z(membership.shift.starts_at),
                    "ends_at": self._z(membership.shift.ends_at),
                    "active": True,
                }
            permissions = (
                ["trust.metadata.read", "security.review"]
                if role == "TRUST_OPERATOR"
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
