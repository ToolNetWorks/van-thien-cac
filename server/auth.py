"""Password hashing, sessions and simple brute-force throttling (stdlib only)."""
from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import threading
import time

PBKDF2_ITERATIONS = 310_000
SESSION_COOKIE = "vtc_session"
SESSION_TTL = 30 * 24 * 3600  # 30 days


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iterations, salt_b64, hash_b64 = stored.split("$", 3)
        if algo != "pbkdf2_sha256":
            return False
        expected = base64.b64decode(hash_b64)
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), base64.b64decode(salt_b64), int(iterations)
        )
        return hmac.compare_digest(digest, expected)
    except (ValueError, TypeError):
        return False


# Constant-cost dummy hash so unknown usernames take as long as wrong passwords.
DUMMY_HASH = hash_password(secrets.token_hex(8))


def new_session_token() -> tuple[str, str]:
    token = secrets.token_urlsafe(32)
    return token, token_hash(token)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class Throttle:
    """Sliding-window failure counter keyed by IP / username (in-memory, per process)."""

    def __init__(self, limit: int, window: int):
        self.limit = limit
        self.window = window
        self._hits: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def _prune(self, key: str, now: float) -> list[float]:
        hits = [t for t in self._hits.get(key, []) if now - t < self.window]
        if hits:
            self._hits[key] = hits
        else:
            self._hits.pop(key, None)
        return hits

    def blocked(self, key: str) -> bool:
        with self._lock:
            return len(self._prune(key, time.time())) >= self.limit

    def hit(self, key: str) -> None:
        with self._lock:
            now = time.time()
            hits = self._prune(key, now)
            hits.append(now)
            self._hits[key] = hits
            if len(self._hits) > 5000:  # bound memory
                for k in list(self._hits)[:1000]:
                    self._hits.pop(k, None)

    def reset(self, key: str) -> None:
        with self._lock:
            self._hits.pop(key, None)


login_failures = Throttle(limit=8, window=15 * 60)
register_attempts = Throttle(limit=6, window=60 * 60)
