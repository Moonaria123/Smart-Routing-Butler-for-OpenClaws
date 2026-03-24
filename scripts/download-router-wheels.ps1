# 预下载 Router 的 Python 依赖为 wheels，供 Docker 构建时离线安装，确保一次成功。
# 在能访问 PyPI 的环境运行一次即可；之后构建不再访问外网。
# 用法：.\scripts\download-router-wheels.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$RouterDir = Join-Path $ProjectRoot "router"
$WheelsDir = Join-Path $RouterDir "wheels"

if (-not (Test-Path (Join-Path $RouterDir "requirements.txt"))) {
    Write-Error "未找到 router/requirements.txt，请于项目根目录执行。"
}
New-Item -ItemType Directory -Force -Path $WheelsDir | Out-Null

Write-Host "正在下载 Router 依赖到 router/wheels/ ..."
Push-Location $RouterDir
try {
    python -m pip download -r requirements.txt -d wheels
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    Pop-Location
}

$count = (Get-ChildItem -Path $WheelsDir -Filter "*.whl" -ErrorAction SilentlyContinue).Count
Write-Host "已下载 $count 个 wheel。执行 docker compose up -d --build 将离线安装，构建一次成功。"
exit 0
