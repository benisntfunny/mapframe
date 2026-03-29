#!/bin/bash
while true; do
  node server.js >> /tmp/mapframe.log 2>&1
  echo [mapframe] restarting... >> /tmp/mapframe.log
  sleep 2
done
