# ALD Connect

Kênh nội bộ ALD gồm cộng đồng, danh sách đồng nghiệp, tin nhắn riêng, bảng xếp hạng xu, thông báo và góp ý HCNS. Connect lưu dữ liệu nội bộ trong SQLite riêng. Workforce cung cấp dữ liệu chỉ đọc qua API BXH đã có.

## Chạy trên máy

Yêu cầu Node.js 22.13 trở lên và pnpm 11.9.0.

```powershell
Set-Location -LiteralPath 'D:\ALD social network'
pnpm.cmd install
pnpm.cmd dev
```

Mở http://127.0.0.1:3017. Trong một terminal khác, chạy lệnh dưới đây để tạo Admin đầu tiên và nhận liên kết kích hoạt một lần, có hiệu lực 24 giờ.

```powershell
Set-Location -LiteralPath 'D:\ALD social network'
pnpm.cmd bootstrap:admin admin "Quản trị ALD"
```

Mở liên kết mà lệnh trả về, đặt mật khẩu, rồi đăng nhập với tên `admin`. Chạy lại lệnh cùng tên khi Admin đầu tiên đang chờ kích hoạt để cấp một liên kết mới. Sau khi kích hoạt Admin, các tài khoản tiếp theo được cấp qua trang **Tài khoản**.

## Gán tài khoản Live

1. Trong `.env.local`, cấu hình `WORKFORCE_ORIGIN` bằng URL HTTPS của Workforce và `ALD_REVENUE_API_TOKEN` bằng token API doanh số đã cấp cho máy chủ.
2. Đăng nhập Admin, vào **Tài khoản** và tạo một tài khoản vai trò **Nhân viên Live**.
3. Mở tài khoản, tìm nhân viên theo mã hoặc tên ở phần **Liên kết Workforce**. Chọn hồ sơ, xác nhận cơ sở được xem BXH và lưu liên kết. Connect xác minh lại với Workforce trước khi lưu.
4. Cấp đường dẫn kích hoạt và chuyển riêng cho nhân viên. Nhân viên mở liên kết, đặt mật khẩu rồi đăng nhập để xem hai BXH.

Connect liên kết theo nguồn Workforce đã cấu hình và `staffCode` trả từ API tháng hiện tại. Danh sách cơ sở trong phản hồi giúp Admin đối chiếu. Khi chuyển cơ sở, sửa cơ sở trên chính tài khoản đó để giữ lịch sử. Nếu Workforce tạm gián đoạn, lượt gán chưa xác minh sẽ chờ thử lại. BXH tự tải lại mỗi 60 giây và báo chậm cập nhật khi còn bản dữ liệu hợp lệ gần nhất.

HCNS có thể kích hoạt, khóa hoặc mở khóa tài khoản Live đã gán. Admin cấp vai trò và đường dẫn đặt lại mật khẩu. Nhân viên và HCNS được giao trao đổi trong phiếu riêng. HCNS đăng bản tin và xem lượt xác nhận. Admin có quyền xem phiếu góp ý, cuộc trò chuyện riêng, danh tính tác giả ẩn danh và BXH của từng cơ sở. Lượt xem nội dung riêng của Admin được ghi vào nhật ký của tài khoản Admin.

## Thử cộng đồng và tin nhắn

1. Mở hai hồ sơ trình duyệt và đăng nhập bằng hai tài khoản Live đã kích hoạt ở hai cơ sở khác nhau.
2. Vào **Cộng đồng**. Tài khoản thứ nhất đăng bài. Tài khoản thứ hai bấm **Thích** hoặc **Bình luận** ngay dưới bài trên bảng tin. Tác giả sửa hoặc xóa nội dung qua nút tùy chọn. Admin có thể ẩn nội dung và xem nhật ký trong **Tài khoản**.
3. Vào **Tin nhắn**, bấm **Tin nhắn mới** rồi tìm tên đồng nghiệp. Tài khoản còn lại mở cuộc trò chuyện để trả lời. Tin được đánh dấu đã đọc khi người tham gia xem đến cuối cuộc trò chuyện. Trên điện thoại, bấm mũi tên ở đầu cuộc trò chuyện để về hộp thư. Admin có quyền xem cuộc trò chuyện để giám sát nội bộ.
4. Để thử trạng thái online, mở cùng một tài khoản trên hai hồ sơ trình duyệt. Đăng xuất một hồ sơ và xem lại từ tài khoản còn lại. Mỗi tài khoản hiện một lần và chuyển sang ngoại tuyến sau khoảng 90 giây kể từ tín hiệu cuối cùng của các phiên còn hiệu lực.

## Cấu hình lưu trữ và kiểm tra

Tệp mặc định là `.data/connect.sqlite`. Có thể đặt `ALD_CONNECT_DB_PATH` tới đường dẫn khác. Cả lệnh bootstrap và máy chủ cần dùng cùng tệp. Khi chạy qua proxy hoặc ở địa chỉ khác, đặt `CONNECT_PUBLIC_URL` theo địa chỉ mở app trên trình duyệt để tạo liên kết kích hoạt và xác minh nguồn của các yêu cầu ghi tin nhắn và trạng thái online. Xem `.env.example` để cấu hình.

```powershell
pnpm.cmd typecheck
pnpm.cmd build
```
