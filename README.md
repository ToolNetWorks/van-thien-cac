# Vân Thiên Các — Website Phim Tu Tiên & Huyền Huyễn

Giao diện web SPA nhẹ, không phụ thuộc framework nặng, tối ưu tốc độ mượt mà trên PC, iPad và điện thoại.

## Cấu trúc thư mục

```text
van-thien-cac/
├── index.html                        # Điểm vào duy nhất của ứng dụng SPA
├── favicon.ico                       # Biểu tượng mặc định trình duyệt
├── README.md                         # Tài liệu cấu trúc & hướng dẫn mở rộng
│
├── src/                              # Mã nguồn cốt lõi của ứng dụng
│   ├── js/
│   │   └── app.js                    # Router SPA, trạng thái, tủ phim, tìm kiếm, player
│   └── styles/
│       └── main.css                  # Biến màu, bố cục chung, thẻ phim, responsive
│
├── components/                       # Các thành phần UI & sân khấu độc lập (dễ mở rộng)
│   ├── header/                       # Thanh điều hướng đầu trang + nút Tài khoản / VIP / Tu Vi
│   │   ├── header.html
│   │   └── header.css
│   ├── footer/                       # Chân trang cố định + rồng 3D nằm mép
│   │   ├── footer.html
│   │   └── footer.css
│   └── crane/                        # Sân khấu hạc tiên bay & kiếm tiên ngự kiếm phi hành
│       └── crane-stage.html
│
├── server/                           # Backend API & SQLite Database (tài khoản, Linh Thạch, Tu Vi)
│   ├── __init__.py
│   ├── cultivation.py                # 4 phẩm cấp Linh Thạch & 15 cảnh giới Tu Tiên
│   ├── db.py                         # Khởi tạo & truy vấn SQLite (storage/van-thien-cac.db)
│   ├── auth.py                       # Băm mật khẩu PBKDF2-SHA256 & quản lý phiên đăng nhập
│   └── api.py                        # REST JSON API (/api/auth/*, /api/donations, /api/leaderboard)
│
├── data/                             # Dữ liệu JSON tĩnh
│   └── movies.json                   # Danh sách phim, điểm, tập & nguồn phát
│
├── assets/                           # Tài nguyên đa phương tiện phân nhóm rõ ràng
│   ├── icons/                        # Favicon & bộ icon SVG sprite
│   ├── scenes/                       # Cảnh nền thác nước (Animated WebP qua CSS) & vân mây
│   ├── creatures/                    # Sinh vật / nhân vật động (dễ thêm thư mục mới)
│   │   ├── crane/                    # Bộ vector khớp xương hạc tiên
│   │   └── dragon/                   # Rồng 3D động (Animated WebP)
│   └── movies/
│       ├── covers/                   # Ảnh bìa dọc phim
│       └── landscapes/               # Ảnh bìa ngang thẻ video
│
├── deploy/                           # Cấu hình triển khai & chạy thử
│   ├── nginx-example.conf
│   └── run-preview.sh
│
└── tools/                            # Server cục bộ, kiểm thử & script dựng media offline
    ├── serve_site.py                 # HTTP/1.1 Server hỗ trợ Range 206 cho video MP4
    ├── check_site.py                 # Kiểm tra toàn vẹn cấu trúc, dữ liệu & CSS
    └── media/                        # Script Python dựng video nền, mây & rồng động
```

## Hướng dẫn mở rộng nhanh

* **Thêm phim mới**: Thêm ảnh vào `assets/movies/covers/` và `assets/movies/landscapes/`, sau đó khai báo phim trong `data/movies.json`.
* **Thêm thành phần UI mới** *(ví dụ: bảng xếp hạng, lịch chiếu, nhân vật tương tác)*: Tạo thư mục riêng trong `components/<ten-component>/` gồm file `.html`, `.css`, (và `.js` nếu cần).
* **Thêm linh thú / nhân vật động mới**: Đặt tài nguyên vào `assets/creatures/<ten>/` (hoặc tạo `assets/characters/<ten>/` cho nhân vật người).

## Kiểm tra & chạy cục bộ

```bash
python3 tools/check_site.py
bash deploy/run-preview.sh
```
