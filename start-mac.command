#!/bin/bash
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Node.js is not installed. Get it from https://nodejs.org"; read -n1; exit 1; }
[ -d node_modules ] || npm install
npm start
