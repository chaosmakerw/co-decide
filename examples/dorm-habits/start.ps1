$ErrorActionPreference = 'Stop'
Write-Host '启动后请打开 http://127.0.0.1:4173/；在此窗口按 Ctrl+C 停止。'
& node (Join-Path $PSScriptRoot 'server.cjs')
