# Frequency Match — full Supabase cloud setup via Management API
# Usage:
#   $env:SUPABASE_ACCESS_TOKEN = 'sbp_...'
#   .\scripts\setup-supabase.ps1
# Optional:
#   .\scripts\setup-supabase.ps1 -ProjectRef 'abcd1234'
#   .\scripts\setup-supabase.ps1 -CreateNew -ProjectName 'frequency-match'

param(
  [string]$AccessToken = $env:SUPABASE_ACCESS_TOKEN,
  [string]$ProjectRef = '',
  [switch]$CreateNew,
  [string]$ProjectName = 'frequency-match',
  [string]$OrgId = '',
  [string]$DbPassword = '',
  [string]$Region = 'us-east-1'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$Api = 'https://api.supabase.com/v1'
function Invoke-Sb {
  param([string]$Method, [string]$Path, $Body = $null)
  $headers = @{
    Authorization = "Bearer $AccessToken"
    'Content-Type' = 'application/json'
  }
  $params = @{
    Method  = $Method
    Uri     = "$Api$Path"
    Headers = $headers
  }
  if ($null -ne $Body) {
    $params.Body = ($Body | ConvertTo-Json -Depth 10 -Compress)
  }
  return Invoke-RestMethod @params
}

if (-not $AccessToken) {
  Write-Host ""
  Write-Host "Need a Supabase personal access token." -ForegroundColor Yellow
  Write-Host "1) Open: https://supabase.com/dashboard/account/tokens"
  Write-Host "2) Generate token → copy sbp_..."
  Write-Host '3) $env:SUPABASE_ACCESS_TOKEN = "sbp_..."'
  Write-Host "4) Re-run: .\scripts\setup-supabase.ps1"
  Write-Host ""
  Start-Process 'https://supabase.com/dashboard/account/tokens'
  exit 1
}

Write-Host "== Frequency Match · Supabase setup ==" -ForegroundColor Cyan

# Validate token + list projects
try {
  $projects = Invoke-Sb -Method GET -Path '/projects'
} catch {
  Write-Host "Token rejected or API error: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

Write-Host "Projects found: $($projects.Count)"
$projects | ForEach-Object {
  Write-Host ("  - {0}  ref={1}  status={2}" -f $_.name, $_.id, $_.status)
}

if ($CreateNew) {
  if (-not $OrgId) {
    $orgs = Invoke-Sb -Method GET -Path '/organizations'
    if (-not $orgs -or $orgs.Count -eq 0) {
      Write-Host "No organizations on this account. Create one in the dashboard first." -ForegroundColor Red
      exit 1
    }
    $OrgId = $orgs[0].id
    Write-Host "Using org: $($orgs[0].name) ($OrgId)"
  }
  if (-not $DbPassword) {
    $DbPassword = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
    Write-Host "Generated DB password (save it): $DbPassword" -ForegroundColor Yellow
  }
  Write-Host "Creating project '$ProjectName' in $Region ..."
  $created = Invoke-Sb -Method POST -Path '/projects' -Body @{
    name                   = $ProjectName
    organization_id        = $OrgId
    db_pass                = $DbPassword
    region                 = $Region
    plan                   = 'free'
  }
  $ProjectRef = $created.id
  Write-Host "Created ref=$ProjectRef — waiting until ACTIVE_HEALTHY ..."
  $deadline = (Get-Date).AddMinutes(8)
  do {
    Start-Sleep -Seconds 8
    $proj = Invoke-Sb -Method GET -Path "/projects/$ProjectRef"
    Write-Host "  status=$($proj.status)"
    if ($proj.status -eq 'ACTIVE_HEALTHY') { break }
  } while ((Get-Date) -lt $deadline)
  if ($proj.status -ne 'ACTIVE_HEALTHY') {
    Write-Host "Project still not healthy. Re-run this script with -ProjectRef $ProjectRef later." -ForegroundColor Yellow
    exit 2
  }
}

if (-not $ProjectRef) {
  $healthy = @($projects | Where-Object { $_.status -eq 'ACTIVE_HEALTHY' })
  if ($healthy.Count -eq 1) {
    $ProjectRef = $healthy[0].id
    Write-Host "Auto-selected only healthy project: $($healthy[0].name) ($ProjectRef)" -ForegroundColor Green
  } elseif ($healthy.Count -gt 1) {
    Write-Host "Multiple healthy projects — re-run with -ProjectRef <ref> or -CreateNew" -ForegroundColor Yellow
    $healthy | ForEach-Object { Write-Host ("  {0}  {1}" -f $_.id, $_.name) }
    exit 1
  } else {
    Write-Host "No healthy projects. Re-run with -CreateNew" -ForegroundColor Yellow
    exit 1
  }
}

$Url = "https://$ProjectRef.supabase.co"
Write-Host "Target: $Url" -ForegroundColor Cyan

# Fetch API keys
$keys = Invoke-Sb -Method GET -Path "/projects/$ProjectRef/api-keys"
$publishable = $null
$anon = $null
foreach ($k in $keys) {
  if ($k.name -eq 'anon' -or $k.type -eq 'legacy' -and $k.name -match 'anon') { $anon = $k.api_key }
  if ($k.type -eq 'publishable' -or $k.name -match 'publishable') { $publishable = $k.api_key }
}
if (-not $publishable) { $publishable = $anon }
if (-not $publishable) {
  # Fallback shapes
  $publishable = ($keys | Select-Object -First 1).api_key
}
if (-not $publishable) {
  Write-Host "Could not read publishable/anon key from API." -ForegroundColor Red
  $keys | ConvertTo-Json -Depth 5
  exit 1
}
Write-Host "Publishable key acquired (length $($publishable.Length))" -ForegroundColor Green

# Apply schema via database query API (Management)
$sqlPath = Join-Path $Root 'supabase\schema.sql'
$sql = Get-Content -Raw -Path $sqlPath
Write-Host "Applying schema ($([math]::Round($sql.Length/1KB,1)) KB) ..."

$schemaOk = $false
try {
  # POST /v1/projects/{ref}/database/query  (newer API)
  Invoke-Sb -Method POST -Path "/projects/$ProjectRef/database/query" -Body @{ query = $sql } | Out-Null
  $schemaOk = $true
  Write-Host "Schema applied via database/query API." -ForegroundColor Green
} catch {
  Write-Host "database/query failed: $($_.Exception.Message)" -ForegroundColor Yellow
  try {
    Invoke-Sb -Method POST -Path "/projects/$ProjectRef/database/query" -Body @{ query = $sql; read_only = $false } | Out-Null
    $schemaOk = $true
    Write-Host "Schema applied (read_only=false)." -ForegroundColor Green
  } catch {
    Write-Host "Auto schema apply failed. Opening SQL editor — paste supabase/schema.sql and Run." -ForegroundColor Yellow
    Start-Process "https://supabase.com/dashboard/project/$ProjectRef/sql/new"
  }
}

# Auth URL config (best-effort)
try {
  Invoke-Sb -Method PATCH -Path "/projects/$ProjectRef/config/auth" -Body @{
    site_url = 'https://frequency.thefirstspark.shop'
    uri_allow_list = "https://frequency.thefirstspark.shop/**,http://localhost:3000/**,http://127.0.0.1:5500/**,http://localhost:5500/**"
  } | Out-Null
  Write-Host "Auth site URL configured." -ForegroundColor Green
} catch {
  Write-Host "Could not set auth URLs automatically (set in Dashboard → Auth → URL config)." -ForegroundColor Yellow
  Write-Host "  Site URL: https://frequency.thefirstspark.shop"
}

# Write js/config.js
$configPath = Join-Path $Root 'js\config.js'
@"
/**
 * Frequency Match — public client config (generated by scripts/setup-supabase.ps1)
 * Never put secret keys here.
 */
window.FM_CONFIG = {
  SUPABASE_URL: '$Url',
  SUPABASE_PUBLISHABLE_KEY: '$publishable',
  STRIPE_PRICE_ID: '',
  FUNCTIONS_BASE: '$Url/functions/v1',
  FREE_MATCH_LIMIT: 3,
  PRO_PRICE_LABEL: '`$4.99/mo',
  PRO_NAME: 'Frequency Pro',
  SITE_NAME: 'Frequency Match',
};
"@ | Set-Content -Path $configPath -Encoding utf8

Write-Host "Wrote js/config.js" -ForegroundColor Green

# Also save private note for secrets (gitignored ideally)
$localEnv = Join-Path $Root '.env.local'
@"
# Local only — do not commit
SUPABASE_URL=$Url
SUPABASE_PUBLISHABLE_KEY=$publishable
SUPABASE_PROJECT_REF=$ProjectRef
"@ | Set-Content -Path $localEnv -Encoding utf8

# Ensure .gitignore
$gi = Join-Path $Root '.gitignore'
if (-not (Test-Path $gi)) {
  @"
.env
.env.local
.env.*.local
node_modules/
"@ | Set-Content $gi -Encoding utf8
} elseif (-not (Select-String -Path $gi -Pattern '\.env\.local' -Quiet)) {
  Add-Content $gi "`n.env`n.env.local`n"
}

Write-Host ""
Write-Host "=== DONE (Supabase) ===" -ForegroundColor Green
Write-Host "Project: $ProjectRef"
Write-Host "URL:     $Url"
if (-not $schemaOk) {
  Write-Host "Schema:  MANUAL — run supabase/schema.sql in SQL editor" -ForegroundColor Yellow
} else {
  Write-Host "Schema:  applied"
}
Write-Host ""
Write-Host "Next:"
Write-Host "  git add js/config.js .gitignore"
Write-Host "  git commit -m `"Wire Frequency Match to Supabase`""
Write-Host "  git push"
Write-Host ""
Write-Host "Still needed for paid Pro:"
Write-Host "  - Stripe product `$4.99/mo → STRIPE_PRICE_ID in js/config.js"
Write-Host "  - Deploy edge functions + stripe secrets (see docs/FREEMIUM.md)"
Write-Host ""
