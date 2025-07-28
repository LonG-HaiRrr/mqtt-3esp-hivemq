cái này nó sẽ nhanh hơn rất nhiều so với ThingSpeak vì 
  kết nối với thingspeak là kết nối giữa esp và http
  còn với hivemq là kiểu mqtt - truyền nhanh những mẩu data
    hivemq đóng vai trò là 1 docker - như 1 shiper hoả tốc






mqtt là shipper. esp vừa là shop gửi hàng đi và nhận hàng về nếu khách trả hàng
. web mình code là khách hàng nhận hàng và trả hàng có nhu cầu

MQTT như "shipper": Broker MQTT (ở đây là HiveMQ) chỉ có nhiệm vụ nhận gói hàng (message) từ người gửi (publisher) và chuyển tiếp đúng tới người nhận (subscriber), nó không thay đổi nội dung gói hàng. Cũng giống như đơn vị giao hàng đưa nguyên vẹn món hàng từ shop tới khách.

ESP như "shop": Nó vừa là người gửi hàng (publish dữ liệu trạng thái, cảm biến, sự kiện nút bấm lên các topic MQTT), vừa là người nhận hàng trả lại (subscribe các topic nhận lệnh điều khiển từ web hoặc thiết bị khác).

Web bạn code như "khách hàng": Web là client MQTT, nó nhận hàng (subscribe nhận dữ liệu trạng thái, lịch sử nút bấm… từ ESP được chuyển qua HiveMQ) và cũng có thể trả hàng (gửi lệnh điều khiển) (publish các tín hiệu bật tắt LED, lệnh điều khiển… lên MQTT để ESP nhận và thực thi).

Tóm lại, thông qua MQTT broker:

ESP và web là publisher và subscriber đồng thời, có thể gửi và nhận dữ liệu.

Broker (HiveMQ) là bên trung gian đảm bảo vận chuyển dữ liệu chính xác, kịp thời giữa các client mà không can thiệp vào nội dung thông điệp.

Ví dụ như shop gửi món hàng qua shipper cho khách, khi khách có nhu cầu trả lại hoặc gửi tiếp, khách cũng gửi qua shipper. Mọi luồng dữ liệu đều thông qua một bên trung gian tin cậy (broker MQTT).
