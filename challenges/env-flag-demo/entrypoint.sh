#!/bin/sh
# Ghi flag từ biến môi trường FLAG vào file flag.txt
echo "Flag is: $FLAG" > /usr/share/nginx/html/flag.txt

# Khởi động nginx
exec nginx -g "daemon off;"