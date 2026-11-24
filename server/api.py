"""JSON API for accounts, Linh Thạch donations, leaderboard and admin review.

Mounted under /api/ by tools/serve_site.py. CSRF protection: every non-GET request must
send `X-Requested-With: vtc` (cross-site pages cannot add that header without a CORS
preflight, which this server never approves) and session cookies are SameSite=Lax.
"""
from __future__ import annotations

from http import HTTPStatus
from http.cookies import SimpleCookie
from urllib.parse import parse_qs, urlsplit
import json
import re
import time

from . import auth, db
from .cultivation import STONE_BY_KEY, STONES, public_config, realm_info

USERNAME_RE = re.compile(r"^[A-Za-z0-9_.]{3,24}$")
MAX_BODY = 16 * 1024
MAX_PENDING_PER_USER = 5
MAX_QUANTITY = 100_000


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


# ---------- helpers ----------

def _now() -> int:
    return int(time.time())


def _client_ip(handler) -> str:
    return (handler.headers.get("CF-Connecting-IP") or handler.client_address[0] or "?").strip()


def _is_https(handler) -> bool:
    proto = (handler.headers.get("X-Forwarded-Proto") or "").lower()
    visitor = (handler.headers.get("CF-Visitor") or "").lower()
    return proto == "https" or '"https"' in visitor


def _read_json(handler) -> dict:
    ctype = (handler.headers.get("Content-Type") or "").split(";")[0].strip().lower()
    if ctype != "application/json":
        raise ApiError(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, "Yêu cầu phải gửi dạng JSON.")
    try:
        length = int(handler.headers.get("Content-Length") or 0)
    except ValueError:
        length = -1
    if length < 0 or length > MAX_BODY:
        raise ApiError(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "Dữ liệu gửi lên quá lớn.")
    raw = handler.rfile.read(length) if length else b"{}"
    try:
        data = json.loads(raw.decode("utf-8") or "{}")
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise ApiError(HTTPStatus.BAD_REQUEST, "Dữ liệu JSON không hợp lệ.")
    if not isinstance(data, dict):
        raise ApiError(HTTPStatus.BAD_REQUEST, "Dữ liệu JSON không hợp lệ.")
    return data


def _session_token(handler) -> str | None:
    raw = handler.headers.get("Cookie")
    if not raw:
        return None
    cookie = SimpleCookie()
    try:
        cookie.load(raw)
    except Exception:
        return None
    morsel = cookie.get(auth.SESSION_COOKIE)
    return morsel.value if morsel and morsel.value else None


def _session_cookie(handler, token: str, max_age: int) -> str:
    parts = [f"{auth.SESSION_COOKIE}={token}", "Path=/", f"Max-Age={max_age}", "HttpOnly", "SameSite=Lax"]
    if _is_https(handler):
        parts.append("Secure")
    return "; ".join(parts)


def _current_user(conn, handler):
    token = _session_token(handler)
    if not token:
        return None
    return conn.execute(
        "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id "
        "WHERE s.token_hash = ? AND s.expires_at > ?",
        (auth.token_hash(token), _now()),
    ).fetchone()


def _require_user(conn, handler):
    user = _current_user(conn, handler)
    if not user:
        raise ApiError(HTTPStatus.UNAUTHORIZED, "Bạn cần đăng nhập để thực hiện thao tác này.")
    return user


def _require_admin(conn, handler):
    user = _require_user(conn, handler)
    if user["role"] != "admin":
        raise ApiError(HTTPStatus.FORBIDDEN, "Chỉ Chưởng Môn (quản trị viên) mới có quyền này.")
    return user


def _stone_counts(conn, user_id: int) -> dict:
    counts = {stone["key"]: 0 for stone in STONES}
    for row in conn.execute(
        "SELECT stone, SUM(quantity) AS qty FROM donations WHERE user_id = ? AND status = 'approved' GROUP BY stone",
        (user_id,),
    ):
        if row["stone"] in counts:
            counts[row["stone"]] = int(row["qty"] or 0)
    return counts


def _user_payload(conn, user, with_stones: bool = True) -> dict:
    points = int(user["points"] or 0)
    payload = {
        "id": user["id"],
        "username": user["username"],
        "role": user["role"],
        "isAdmin": user["role"] == "admin",
        "isVip": points > 0,
        "tier": "VIP" if points > 0 else "Thường",
        "points": points,
        "realm": realm_info(points),
        "createdAt": user["created_at"] * 1000,
    }
    if with_stones:
        payload["stones"] = _stone_counts(conn, user["id"])
        payload["pendingCount"] = conn.execute(
            "SELECT COUNT(*) FROM donations WHERE user_id = ? AND status = 'pending'", (user["id"],)
        ).fetchone()[0]
    return payload


def _donation_payload(row) -> dict:
    stone = STONE_BY_KEY.get(row["stone"], {"name": row["stone"], "short": row["stone"]})
    data = {
        "id": row["id"],
        "stone": row["stone"],
        "stoneName": stone["name"],
        "quantity": row["quantity"],
        "points": row["points"],
        "note": row["note"],
        "status": row["status"],
        "createdAt": row["created_at"] * 1000,
        "reviewedAt": row["reviewed_at"] * 1000 if row["reviewed_at"] else None,
    }
    if "username" in row.keys():
        data["username"] = row["username"]
    return data


def _parse_stone_qty(data: dict) -> tuple[str, int, int]:
    stone = str(data.get("stone") or "")
    if stone not in STONE_BY_KEY:
        raise ApiError(HTTPStatus.BAD_REQUEST, "Loại Linh Thạch không hợp lệ.")
    try:
        qty = int(data.get("quantity"))
    except (TypeError, ValueError):
        raise ApiError(HTTPStatus.BAD_REQUEST, "Số lượng Linh Thạch phải là số nguyên.")
    if qty < 1 or qty > MAX_QUANTITY:
        raise ApiError(HTTPStatus.BAD_REQUEST, f"Số lượng phải từ 1 đến {MAX_QUANTITY:,}.".replace(",", "."))
    return stone, qty, qty * STONE_BY_KEY[stone]["points"]


def _clean_note(data: dict) -> str:
    return " ".join(str(data.get("note") or "").split())[:200]


def _create_session(conn, user_id: int) -> str:
    token, hashed = auth.new_session_token()
    now = _now()
    conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (now,))
    conn.execute(
        "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (hashed, user_id, now, now + auth.SESSION_TTL),
    )
    conn.execute("UPDATE users SET last_login_at = ? WHERE id = ?", (now, user_id))
    return token


# ---------- route handlers: each returns (status, payload, extra_headers) ----------

def r_config(conn, handler, data, query):
    return HTTPStatus.OK, public_config(), []


def r_me(conn, handler, data, query):
    user = _current_user(conn, handler)
    return HTTPStatus.OK, {"user": _user_payload(conn, user) if user else None}, []


def r_register(conn, handler, data, query):
    ip = _client_ip(handler)
    if auth.register_attempts.blocked(ip):
        raise ApiError(HTTPStatus.TOO_MANY_REQUESTS, "Bạn tạo tài khoản quá nhiều lần. Hãy thử lại sau.")
    username = str(data.get("username") or "").strip()
    password = str(data.get("password") or "")
    if not USERNAME_RE.fullmatch(username):
        raise ApiError(HTTPStatus.BAD_REQUEST, "Tên tài khoản dài 3–24 ký tự, chỉ gồm chữ không dấu, số, dấu chấm hoặc gạch dưới.")
    if len(password) < 6 or len(password) > 128:
        raise ApiError(HTTPStatus.BAD_REQUEST, "Mật khẩu phải dài từ 6 đến 128 ký tự.")
    if password.lower() == username.lower():
        raise ApiError(HTTPStatus.BAD_REQUEST, "Mật khẩu không được trùng tên tài khoản.")
    pw_hash = auth.hash_password(password)
    auth.register_attempts.hit(ip)
    conn.execute("BEGIN IMMEDIATE")
    try:
        if conn.execute("SELECT 1 FROM users WHERE username_key = ?", (username.lower(),)).fetchone():
            raise ApiError(HTTPStatus.CONFLICT, "Tên tài khoản này đã có người sử dụng.")
        cur = conn.execute(
            "INSERT INTO users (username, username_key, password_hash, created_at) VALUES (?, ?, ?, ?)",
            (username, username.lower(), pw_hash, _now()),
        )
        token = _create_session(conn, cur.lastrowid)
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    user = conn.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
    return HTTPStatus.CREATED, {"user": _user_payload(conn, user)}, [
        ("Set-Cookie", _session_cookie(handler, token, auth.SESSION_TTL))
    ]


def r_login(conn, handler, data, query):
    ip = _client_ip(handler)
    username = str(data.get("username") or "").strip()
    password = str(data.get("password") or "")
    user_key = f"u:{username.lower()}"
    if auth.login_failures.blocked(ip) or auth.login_failures.blocked(user_key):
        raise ApiError(HTTPStatus.TOO_MANY_REQUESTS, "Đăng nhập sai quá nhiều lần. Hãy thử lại sau 15 phút.")
    user = conn.execute("SELECT * FROM users WHERE username_key = ?", (username.lower(),)).fetchone() if username else None
    ok = auth.verify_password(password, user["password_hash"] if user else auth.DUMMY_HASH)
    if not user or not ok:
        auth.login_failures.hit(ip)
        auth.login_failures.hit(user_key)
        raise ApiError(HTTPStatus.UNAUTHORIZED, "Sai tên tài khoản hoặc mật khẩu.")
    auth.login_failures.reset(user_key)
    token = _create_session(conn, user["id"])
    return HTTPStatus.OK, {"user": _user_payload(conn, user)}, [
        ("Set-Cookie", _session_cookie(handler, token, auth.SESSION_TTL))
    ]


def r_logout(conn, handler, data, query):
    token = _session_token(handler)
    if token:
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (auth.token_hash(token),))
    return HTTPStatus.OK, {"ok": True}, [("Set-Cookie", _session_cookie(handler, "", 0))]


def r_change_password(conn, handler, data, query):
    user = _require_user(conn, handler)
    current = str(data.get("currentPassword") or "")
    new = str(data.get("newPassword") or "")
    if not auth.verify_password(current, user["password_hash"]):
        raise ApiError(HTTPStatus.BAD_REQUEST, "Mật khẩu hiện tại không đúng.")
    if len(new) < 6 or len(new) > 128:
        raise ApiError(HTTPStatus.BAD_REQUEST, "Mật khẩu mới phải dài từ 6 đến 128 ký tự.")
    conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (auth.hash_password(new), user["id"]))
    # Sign out every other device.
    keep = auth.token_hash(_session_token(handler) or "")
    conn.execute("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?", (user["id"], keep))
    return HTTPStatus.OK, {"ok": True}, []


def r_my_donations(conn, handler, data, query):
    user = _require_user(conn, handler)
    rows = conn.execute(
        "SELECT * FROM donations WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 50", (user["id"],)
    ).fetchall()
    return HTTPStatus.OK, {"donations": [_donation_payload(r) for r in rows]}, []


def r_create_donation(conn, handler, data, query):
    user = _require_user(conn, handler)
    stone, qty, points = _parse_stone_qty(data)
    now = _now()
    conn.execute("BEGIN IMMEDIATE")
    try:
        cur = conn.execute(
            "INSERT INTO donations (user_id, stone, quantity, points, note, status, created_at, reviewed_at, reviewed_by) "
            "VALUES (?, ?, ?, ?, ?, 'approved', ?, ?, ?)",
            (user["id"], stone, qty, points, _clean_note(data), now, now, user["id"]),
        )
        db.recalc_points(conn, user["id"])
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    row = conn.execute("SELECT * FROM donations WHERE id = ?", (cur.lastrowid,)).fetchone()
    updated_user = conn.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
    return HTTPStatus.CREATED, {
        "donation": _donation_payload(row),
        "user": _user_payload(conn, updated_user),
    }, []


def r_leaderboard(conn, handler, data, query):
    rows = conn.execute(
        "SELECT * FROM users WHERE points > 0 ORDER BY points DESC, created_at ASC LIMIT 20"
    ).fetchall()
    board = [
        {"rank": i + 1, "username": r["username"], "points": r["points"], "realm": realm_info(r["points"])["name"]}
        for i, r in enumerate(rows)
    ]
    return HTTPStatus.OK, {"leaders": board}, []


def r_admin_donations(conn, handler, data, query):
    _require_admin(conn, handler)
    status = (query.get("status") or ["pending"])[0]
    sql = "SELECT d.*, u.username FROM donations d JOIN users u ON u.id = d.user_id"
    params: tuple = ()
    if status in ("pending", "approved", "rejected"):
        sql += " WHERE d.status = ?"
        params = (status,)
    sql += " ORDER BY d.created_at DESC, d.id DESC LIMIT 100"
    rows = conn.execute(sql, params).fetchall()
    return HTTPStatus.OK, {"donations": [_donation_payload(r) for r in rows]}, []


def _review_donation(conn, handler, donation_id: int, new_status: str):
    admin = _require_admin(conn, handler)
    conn.execute("BEGIN IMMEDIATE")
    try:
        row = conn.execute("SELECT * FROM donations WHERE id = ?", (donation_id,)).fetchone()
        if not row:
            raise ApiError(HTTPStatus.NOT_FOUND, "Không tìm thấy yêu cầu tặng Linh Thạch.")
        conn.execute(
            "UPDATE donations SET status = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ?",
            (new_status, _now(), admin["id"], donation_id),
        )
        db.recalc_points(conn, row["user_id"])
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    row = conn.execute(
        "SELECT d.*, u.username FROM donations d JOIN users u ON u.id = d.user_id WHERE d.id = ?", (donation_id,)
    ).fetchone()
    return HTTPStatus.OK, {"donation": _donation_payload(row)}, []


def r_admin_users(conn, handler, data, query):
    _require_admin(conn, handler)
    q = (query.get("q") or [""])[0].strip().lower()[:24]
    if q:
        rows = conn.execute(
            "SELECT * FROM users WHERE username_key LIKE ? ESCAPE '\\' ORDER BY points DESC, created_at ASC LIMIT 50",
            ("%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%",),
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM users ORDER BY created_at DESC LIMIT 50").fetchall()
    total = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    vip = conn.execute("SELECT COUNT(*) FROM users WHERE points > 0").fetchone()[0]
    return HTTPStatus.OK, {
        "users": [_user_payload(conn, r, with_stones=False) for r in rows],
        "totals": {"users": total, "vip": vip},
    }, []


def r_admin_grant(conn, handler, data, query):
    admin = _require_admin(conn, handler)
    username = str(data.get("username") or "").strip().lower()
    stone, qty, points = _parse_stone_qty(data)
    target = conn.execute("SELECT * FROM users WHERE username_key = ?", (username,)).fetchone()
    if not target:
        raise ApiError(HTTPStatus.NOT_FOUND, "Không tìm thấy tài khoản này.")
    now = _now()
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute(
            "INSERT INTO donations (user_id, stone, quantity, points, note, status, created_at, reviewed_at, reviewed_by) "
            "VALUES (?, ?, ?, ?, ?, 'approved', ?, ?, ?)",
            (target["id"], stone, qty, points, _clean_note(data) or "Chưởng Môn ghi nhận", now, now, admin["id"]),
        )
        db.recalc_points(conn, target["id"])
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    target = conn.execute("SELECT * FROM users WHERE id = ?", (target["id"],)).fetchone()
    return HTTPStatus.OK, {"user": _user_payload(conn, target)}, []


ROUTES = {
    ("GET", "/api/config"): r_config,
    ("GET", "/api/me"): r_me,
    ("POST", "/api/auth/register"): r_register,
    ("POST", "/api/auth/login"): r_login,
    ("POST", "/api/auth/logout"): r_logout,
    ("POST", "/api/auth/password"): r_change_password,
    ("GET", "/api/donations"): r_my_donations,
    ("POST", "/api/donations"): r_create_donation,
    ("GET", "/api/leaderboard"): r_leaderboard,
    ("GET", "/api/admin/donations"): r_admin_donations,
    ("GET", "/api/admin/users"): r_admin_users,
    ("POST", "/api/admin/grant"): r_admin_grant,
}
REVIEW_RE = re.compile(r"^/api/admin/donations/(\d{1,12})/(approve|reject)$")


def handle(handler, method: str) -> None:
    parts = urlsplit(handler.path)
    path = parts.path.rstrip("/") or "/"
    query = parse_qs(parts.query)
    status, payload, headers = HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "Lỗi máy chủ."}, []
    conn = None
    try:
        if method != "GET" and handler.headers.get("X-Requested-With") != "vtc":
            raise ApiError(HTTPStatus.FORBIDDEN, "Yêu cầu không hợp lệ.")
        route = ROUTES.get((method, path))
        review = REVIEW_RE.match(path) if method == "POST" else None
        if not route and not review:
            known = {p for (_, p) in ROUTES} | ({path} if REVIEW_RE.match(path) else set())
            if path in known:
                raise ApiError(HTTPStatus.METHOD_NOT_ALLOWED, "Phương thức không được hỗ trợ.")
            raise ApiError(HTTPStatus.NOT_FOUND, "Không tìm thấy API.")
        data = _read_json(handler) if method == "POST" else {}
        conn = db.connect()
        if review:
            status, payload, headers = _review_donation(
                conn, handler, int(review.group(1)), "approved" if review.group(2) == "approve" else "rejected"
            )
        else:
            status, payload, headers = route(conn, handler, data, query)
    except ApiError as err:
        status, payload = err.status, {"error": err.message}
    except Exception as err:  # never leak internals to the client
        handler.log_error("API error on %s %s: %r", method, path, err)
        status, payload = HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "Lỗi máy chủ, vui lòng thử lại."}
    finally:
        if conn is not None:
            conn.close()

    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("X-Content-Type-Options", "nosniff")
    for name, value in headers:
        handler.send_header(name, value)
    handler.end_headers()
    handler.wfile.write(body)
