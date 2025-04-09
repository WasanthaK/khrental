#!/bin/sh
cd /home/site/wwwroot
npm install -g serve
serve -s . -l 8080 