FROM nginx:alpine

# Copy script khởi động
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Copy trang web tĩnh (tuỳ chọn)
COPY index.html /usr/share/nginx/html/index.html

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]