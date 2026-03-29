#!/bin/bash
cd "$(dirname "$0")"
# Kill anything already on 3006
fuser -k 3006/tcp 2>/dev/null
sleep 1
# Run once; PM2/systemd handles restarts in production
exec node server.js >> /tmp/mapframe.log 2>&1
