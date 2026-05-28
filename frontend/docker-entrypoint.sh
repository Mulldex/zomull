#!/bin/sh
set -e
BACKEND_URL="${BACKEND_URL%/}"
echo "Configuring nginx with BACKEND_URL=$BACKEND_URL"
rm -f /etc/nginx/http.d/default.conf
rm -f /etc/nginx/conf.d/default.conf
sed "s|BACKEND_PLACEHOLDER|${BACKEND_URL}|g" /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf
nginx -t && exec nginx -g "daemon off;"