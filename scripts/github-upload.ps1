<#
    BuildPlanner — 변경사항을 GitHub에 올립니다.
    github-upload.bat 이 이 스크립트를 호출합니다. (직접 실행해도 됩니다)

    한글이 깨지지 않도록 이 파일은 반드시 "UTF-8 with BOM" 으로 저장하세요.
    배치 파일에 한글을 직접 넣으면 콘솔 코드페이지에 따라 cmd 파서가 깨지므로,
    메시지는 전부 여기(PowerShell)에 둡니다.
#>
param([string]$Message = "")

# git 은 진행 상황을 stderr 로 내보냅니다. "Stop" 이면 그 정상 출력이 스크립트를
# 중단시키므로, 성공 여부는 예외가 아니라 $LASTEXITCODE 로만 판단합니다.
$ErrorActionPreference = "Continue"
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}

# 스크립트 위치의 상위 폴더 = 저장소 루트
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

function Write-Line($text, $color = "Gray") { Write-Host $text -ForegroundColor $color }

Write-Host ""
Write-Line "============================================" "Cyan"
Write-Line "   BuildPlanner  -  GitHub 업로드" "Cyan"
Write-Line "============================================" "Cyan"
Write-Host ""

# --- Git 찾기 (PATH에 없어도 동작하도록) ---
$git = (Get-Command git -ErrorAction SilentlyContinue).Source
if (-not $git) {
    $fallback = Join-Path $env:ProgramFiles "Git\cmd\git.exe"
    if (Test-Path $fallback) { $git = $fallback }
}
if (-not $git) {
    Write-Line "[오류] Git을 찾을 수 없습니다." "Red"
    Write-Line "       https://git-scm.com 에서 설치한 뒤 다시 실행하세요." "Red"
    exit 1
}

# --- 변경된 파일 확인 ---
$changes = & $git status --porcelain
if (-not $changes) {
    Write-Line "변경된 파일이 없습니다. 업로드할 내용이 없습니다." "Yellow"
    exit 0
}

Write-Line "[변경된 파일]" "White"
& $git status --short
Write-Host ""

# --- 커밋 메시지 ---
if (-not $Message) {
    $Message = Read-Host "커밋 메시지 (그냥 Enter 누르면 날짜로 기록)"
}
if (-not $Message) {
    $Message = "update {0}" -f (Get-Date -Format "yyyy-MM-dd HH:mm")
}

Write-Host ""
Write-Line "[1/3] 변경사항 추가 중..." "White"
& $git add -A
if ($LASTEXITCODE -ne 0) { Write-Line "[실패] git add 오류" "Red"; exit 1 }

Write-Line "[2/3] 커밋 중..." "White"
& $git commit -m $Message
if ($LASTEXITCODE -ne 0) { Write-Line "[실패] git commit 오류" "Red"; exit 1 }

Write-Line "[3/3] GitHub로 업로드 중..." "White"
# 리다이렉트하지 않습니다. PowerShell 5.1 에서 네이티브 exe 의 stderr 를 2>&1 로
# 넘기면 정상 진행 메시지까지 빨간 오류처럼 표시됩니다.
& $git push
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Line "============================================" "Red"
    Write-Line "   [실패] 업로드하지 못했습니다." "Red"
    Write-Line "   로그인이 풀렸다면 터미널에서:  gh auth login" "Red"
    Write-Line "============================================" "Red"
    exit 1
}

Write-Host ""
Write-Line "============================================" "Green"
Write-Line "   [완료] 업로드되었습니다." "Green"
Write-Line "   https://github.com/xart0425-bit/buildplanner" "Green"
Write-Line "============================================" "Green"
