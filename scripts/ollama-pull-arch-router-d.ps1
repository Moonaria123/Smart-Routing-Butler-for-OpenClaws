# 在 D 盘部署并拉取 arch-router 1.5b
# 用法：PowerShell -ExecutionPolicy Bypass -File .\ollama-pull-arch-router-d.ps1

$modelsPath = "D:\Ollama\models"
if (-not (Test-Path $modelsPath)) {
    New-Item -ItemType Directory -Path $modelsPath -Force | Out-Null
    Write-Host "已创建目录: $modelsPath"
}

# 设置用户级环境变量（持久化）
[Environment]::SetEnvironmentVariable("OLLAMA_MODELS", $modelsPath, "User")
$env:OLLAMA_MODELS = $modelsPath
Write-Host "OLLAMA_MODELS = $modelsPath (已写入用户环境变量)"

# 若 Ollama 已在运行，需重启一次才能使用 D 盘路径
Write-Host ""
Write-Host "请确保 Ollama 已安装且已重启（使 OLLAMA_MODELS 生效）。" -ForegroundColor Yellow
Write-Host "正在拉取 fauxpaslife/arch-router:1.5b ..."
Write-Host ""

& ollama pull fauxpaslife/arch-router:1.5b
if ($LASTEXITCODE -eq 0) {
    Write-Host "拉取完成。模型将保存在: $modelsPath" -ForegroundColor Green
} else {
    Write-Host "若提示找不到 ollama，请先安装: https://ollama.com/download" -ForegroundColor Red
}
