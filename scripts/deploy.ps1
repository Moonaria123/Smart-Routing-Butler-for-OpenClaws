# Smart Router Butler — 一键部署到 Docker（构建镜像 + 启动 + Prisma 迁移）
# 用于拉取最新代码后的「上线/更新」验证前部署；详见 docs/DEPLOY-DOCKER.md、docs/USER-VALIDATION.md
# 用法：
#   .\scripts\deploy.ps1                          # 增量构建并启动
#   .\scripts\deploy.ps1 -SkipWheels              # 已预下载 router wheels 时跳过提示
#   .\scripts\deploy.ps1 -NoCache                 # 不使用构建缓存（发版/怀疑缓存脏时）
#   .\scripts\deploy.ps1 -Services dashboard      # 仅重建并启动指定服务（逗号分隔多服务）
#   .\scripts\deploy.ps1 -UseReleaseImages        # 拉取 GHCR 预构建镜像（.env 中配置 GHCR_OWNER），不本地 build

param(
    [switch]$SkipWheels,
    [switch]$NoCache,
    [string]$Services = "",
    [switch]$UseReleaseImages
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $ProjectRoot ".env"
$EnvExample = Join-Path $ProjectRoot ".env.example"
$WheelsDir = Join-Path $ProjectRoot "router\wheels"
$WheelsCount = (Get-ChildItem -Path $WheelsDir -Filter "*.whl" -ErrorAction SilentlyContinue).Count

Set-Location $ProjectRoot

$ComposeFile = "docker-compose.yml"
if ($UseReleaseImages) {
    $ComposeFile = "docker-compose.release.yml"
}

# 1. 若无 .env 则从 .env.example 复制
if (-not (Test-Path $EnvFile)) {
    if (Test-Path $EnvExample) {
        Copy-Item $EnvExample $EnvFile
        Write-Host "已从 .env.example 生成 .env，请按需修改敏感项后重新运行本脚本。"
        exit 0
    } else {
        Write-Error "缺少 .env 和 .env.example，无法部署。"
    }
}

Write-Host ""
Write-Host "[部署提示] 最小必配（.env 与 Compose 一致）："
Write-Host "  - ENCRYPTION_KEY（32 字节随机串，AES-256）"
Write-Host "  - BETTER_AUTH_SECRET、BETTER_AUTH_URL（与访问 Dashboard 的 URL 同源）"
Write-Host "  - DATABASE_URL（须与 postgres 服务账号库名一致）"
Write-Host "  宿主机端口默认见 compose/ports.env；若冲突可在 .env 中设 PROXY_PORT、DASHBOARD_PORT 等覆盖（后加载优先）。"
Write-Host "  可选：CRON_SECRET — 配置后可用 POST /api/cron/data-retention 做日志保留清理（Bearer）。"
Write-Host "  可选：REDIS_URL — Dashboard 与 Proxy 共用，默认 redis://redis:6379"
Write-Host ""
if ($UseReleaseImages) {
    Write-Host "[预构建镜像] 使用 $ComposeFile；请确认 .env 中 GHCR_OWNER 为上游仓库的 GitHub 用户名（小写）。"
    Write-Host ""
}

# 2. 若未预下载 wheels 且未指定 -SkipWheels，提示先下载（可选）
if (-not $UseReleaseImages -and -not $SkipWheels -and $WheelsCount -eq 0) {
    Write-Host "未检测到 router/wheels/*.whl。为保障 Router 构建一次成功，建议先运行："
    Write-Host "  .\scripts\download-router-wheels.ps1"
    Write-Host "是否继续构建（Router 将在线安装依赖，可能因网络失败）？ [y/N]"
    $r = Read-Host
    if ($r -notmatch '^[yY]') { exit 0 }
}

if ($UseReleaseImages -and (Test-Path $EnvFile)) {
    $ghcr = ""
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match '^\s*GHCR_OWNER\s*=\s*(.+)$') { $ghcr = $Matches[1].Trim().Trim('"').Trim("'") }
    }
    if ([string]::IsNullOrWhiteSpace($ghcr) -or $ghcr -eq "your-github-username") {
        Write-Error "使用 -UseReleaseImages 时请在 .env 中设置 GHCR_OWNER 为发布镜像的 GitHub 用户名（非占位符）。"
    }
}

# 读取 .env 中的宿主机端口（避免与自定义端口不一致）
$DashboardPort = "3000"
$ProxyPort = "8080"
$RouterPort = "8001"
if (Test-Path $EnvFile) {
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match '^\s*DASHBOARD_PORT\s*=\s*(.+)$') { $DashboardPort = $Matches[1].Trim().Trim('"').Trim("'") }
        if ($_ -match '^\s*PROXY_PORT\s*=\s*(.+)$')     { $ProxyPort = $Matches[1].Trim().Trim('"').Trim("'") }
        if ($_ -match '^\s*ROUTER_PORT\s*=\s*(.+)$')    { $RouterPort = $Matches[1].Trim().Trim('"').Trim("'") }
    }
}

# 3. 构建并启动（服务名通过数组传给 docker compose，避免 PowerShell  splat 误用）
$composeBase = @('-f', $ComposeFile)
if ($UseReleaseImages) {
    if ($Services.Trim().Length -gt 0) {
        $svcList = @(
            $Services -split ',' |
            ForEach-Object { $_.Trim() } |
            Where-Object { $_ }
        )
        Write-Host "正在拉取并启动服务: $($svcList -join ', ')..."
        $pullArgs = $composeBase + @('pull') + $svcList
        & docker compose @pullArgs
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        $upArgs = $composeBase + @('up', '-d') + $svcList
        & docker compose @upArgs
    } else {
        Write-Host "正在拉取预构建镜像并启动所有服务..."
        & docker compose @composeBase pull
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        & docker compose @composeBase up -d
    }
} elseif ($Services.Trim().Length -gt 0) {
    $svcList = @(
        $Services -split ',' |
        ForEach-Object { $_.Trim() } |
        Where-Object { $_ }
    )
    Write-Host "正在构建并启动服务: $($svcList -join ', ')..."
    if ($NoCache) {
        $buildArgs = $composeBase + @('build', '--no-cache') + $svcList
        & docker compose @buildArgs
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        $upArgs = $composeBase + @('up', '-d') + $svcList
        & docker compose @upArgs
    } else {
        $upArgs = $composeBase + @('up', '-d', '--build') + $svcList
        & docker compose @upArgs
    }
} elseif ($NoCache) {
    Write-Host "正在无缓存构建镜像并启动所有服务..."
    & docker compose @composeBase build --no-cache
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & docker compose @composeBase up -d
} else {
    Write-Host "正在构建并启动所有服务..."
    & docker compose @composeBase up -d --build
}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 4. 等待 Dashboard 就绪后执行迁移
Write-Host "等待 Dashboard 就绪..."
$dashboardUrl = "http://localhost:$DashboardPort/"
$max = 60
$n = 0
do {
    Start-Sleep -Seconds 3
    try {
        $r = Invoke-WebRequest -Uri $dashboardUrl -Method Head -TimeoutSec 2 -UseBasicParsing -ErrorAction SilentlyContinue
        if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 400) { break }
    } catch {}
    $n++
} while ($n -lt $max)
if ($n -ge $max) {
    Write-Host "Dashboard 未在预期内就绪，请稍后手动执行迁移： docker compose -f $ComposeFile exec dashboard npx prisma migrate deploy"
} else {
    Write-Host "执行数据库迁移..."
    & docker compose @composeBase exec -T dashboard npx prisma migrate deploy
}

Write-Host ""
Write-Host "========== 部署完成 =========="
Write-Host "  Dashboard : http://localhost:$DashboardPort"
Write-Host "  Proxy     : http://localhost:$ProxyPort"
Write-Host "  Router    : http://localhost:$RouterPort"
Write-Host ""
Write-Host "【继续验证】请打开："
Write-Host "  - docs/USER-VALIDATION.md        （功能验收清单）"
Write-Host "  - docs/ISSUE-LOG.md （已知问题与 CR 跟踪）"
Write-Host "  - docs/TEST-PLAN.md              （E2E 前置与测试范围）"
Write-Host "  - docs/DEPLOY-DOCKER.md          （手动命令与排障）"
Write-Host ""
