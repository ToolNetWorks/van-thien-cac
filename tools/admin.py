#!/usr/bin/env python3
"""Command-line admin for Vân Thiên Các accounts (run on the server).

Usage:
  python3 tools/admin.py list
  python3 tools/admin.py promote <username>        # make Chưởng Môn (admin)
  python3 tools/admin.py demote <username>
  python3 tools/admin.py grant <username> <ha-pham|trung-pham|thuong-pham|cuc-pham> <quantity> [note]
  python3 tools/admin.py reset-password <username> <new-password>
"""
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from server import auth, db  # noqa: E402
from server.cultivation import STONE_BY_KEY, realm_info  # noqa: E402


def find_user(conn, username):
    row = conn.execute("SELECT * FROM users WHERE username_key = ?", (username.lower(),)).fetchone()
    if not row:
        sys.exit(f"Không tìm thấy tài khoản: {username}")
    return row


def main(argv):
    if not argv:
        sys.exit(__doc__)
    db.init_db()
    conn = db.connect()
    cmd, args = argv[0], argv[1:]
    try:
        if cmd == "list":
            for r in conn.execute("SELECT * FROM users ORDER BY points DESC, created_at ASC"):
                tier = "VIP" if r["points"] > 0 else "Thường"
                print(f"{r['username']:<24} {r['role']:<7} {tier:<6} {r['points']:>8} điểm  {realm_info(r['points'])['name']}")
        elif cmd in ("promote", "demote") and len(args) == 1:
            user = find_user(conn, args[0])
            role = "admin" if cmd == "promote" else "member"
            conn.execute("UPDATE users SET role = ? WHERE id = ?", (role, user["id"]))
            print(f"{user['username']} -> {role}")
        elif cmd == "grant" and len(args) >= 3:
            user = find_user(conn, args[0])
            stone = args[1]
            if stone not in STONE_BY_KEY:
                sys.exit(f"Loại Linh Thạch không hợp lệ. Chọn: {', '.join(STONE_BY_KEY)}")
            qty = int(args[2])
            if qty < 1:
                sys.exit("Số lượng phải >= 1")
            note = " ".join(args[3:])[:200] or "Ghi nhận qua dòng lệnh"
            now = int(time.time())
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                "INSERT INTO donations (user_id, stone, quantity, points, note, status, created_at, reviewed_at) "
                "VALUES (?, ?, ?, ?, ?, 'approved', ?, ?)",
                (user["id"], stone, qty, qty * STONE_BY_KEY[stone]["points"], note, now, now),
            )
            db.recalc_points(conn, user["id"])
            conn.execute("COMMIT")
            pts = conn.execute("SELECT points FROM users WHERE id = ?", (user["id"],)).fetchone()[0]
            info = realm_info(pts)
            print(f"{user['username']}: {pts} điểm, cảnh giới {info['name']} ({info['progress']}%)")
        elif cmd == "reset-password" and len(args) == 2:
            user = find_user(conn, args[0])
            if not 6 <= len(args[1]) <= 128:
                sys.exit("Mật khẩu phải dài 6–128 ký tự")
            conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (auth.hash_password(args[1]), user["id"]))
            conn.execute("DELETE FROM sessions WHERE user_id = ?", (user["id"],))
            print(f"Đã đặt lại mật khẩu cho {user['username']}")
        else:
            sys.exit(__doc__)
    finally:
        conn.close()


if __name__ == "__main__":
    main(sys.argv[1:])
