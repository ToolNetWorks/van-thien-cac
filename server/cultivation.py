"""Linh Thạch tiers and cultivation realm rules (single source of truth for the API)."""

# Contribution points granted per stone of each tier (1 point = 1% tu vi, 100 points = +1 realm).
STONES = [
    {"key": "ha-pham", "name": "Hạ Phẩm Linh Thạch", "short": "Hạ Phẩm", "points": 1},
    {"key": "trung-pham", "name": "Trung Phẩm Linh Thạch", "short": "Trung Phẩm", "points": 10},
    {"key": "thuong-pham", "name": "Thượng Phẩm Linh Thạch", "short": "Thượng Phẩm", "points": 50},
    {"key": "cuc-pham", "name": "Cực Phẩm Linh Thạch", "short": "Cực Phẩm", "points": 100},
]
STONE_BY_KEY = {stone["key"]: stone for stone in STONES}

REALMS = [
    "Phàm Nhân",
    "Linh Khí",
    "Trúc Cơ",
    "Kim Đan",
    "Nguyên Anh",
    "Hóa Thần",
    "Luyện Hư",
    "Hợp Thể",
    "Đại Thừa",
    "Độ Kiếp",
    "Tán Tiên",
    "Chân Tiên",
    "Thái Ất Kim Tiên",
    "Đại La Kim Tiên",
    "Tiên Đế",
]

# 1 point = 1% progress; 100 points = break through one realm.
POINTS_PER_REALM = 100


def realm_info(points: int) -> dict:
    points = max(0, int(points or 0))
    last = len(REALMS) - 1
    index = min(last, points // POINTS_PER_REALM)
    is_max = index == last
    in_realm = POINTS_PER_REALM if is_max else points % POINTS_PER_REALM
    return {
        "index": index,
        "level": index + 1,
        "total": len(REALMS),
        "name": REALMS[index],
        "next": None if is_max else REALMS[index + 1],
        "progress": 100 if is_max else round(in_realm * 100 / POINTS_PER_REALM),
        "pointsInRealm": in_realm,
        "pointsToNext": 0 if is_max else POINTS_PER_REALM - in_realm,
        "isMax": is_max,
    }


def public_config() -> dict:
    return {"stones": STONES, "realms": REALMS, "pointsPerRealm": POINTS_PER_REALM}
