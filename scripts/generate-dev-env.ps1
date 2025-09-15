$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $repoRoot '.env'

Write-Host "Generating secure development .env at $envPath"

function New-Base64RandomString([int]$numBytes) {
  $bytes = New-Object byte[] $numBytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return [Convert]::ToBase64String($bytes)
}

function New-HexRandomKey([int]$numBytes) {
  $bytes = New-Object byte[] $numBytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return '0x' + ([System.BitConverter]::ToString($bytes).Replace('-','').ToLower())
}

$envVars = @{
  'ENCRYPTION_KEY'           = New-Base64RandomString 32    # 256-bit key for AES-256-GCM
  'JWT_SECRET'               = New-Base64RandomString 48
  'JWT_REFRESH_SECRET'       = New-Base64RandomString 48
  'JWT_EXPIRES_IN'           = '1h'
  'JWT_REFRESH_EXPIRES_IN'   = '7d'
  'WALLET_PRIVATE_KEY'       = New-HexRandomKey 32
  'ADMIN_EMAIL'              = 'admin@example.com'
  'ADMIN_PASSWORD'           = 'ChangeM3Now!'
  'ADMIN_NAME'               = 'System Admin'
  'ADMIN_ORG'                = 'ForensicOrg'
  'CORS_ORIGIN'              = 'http://localhost:3000'
  'MAX_FILE_SIZE'            = '104857600'
  'ALLOWED_MIME_TYPES'       = 'image/jpeg,image/png,image/gif,video/mp4,video/avi,application/pdf,audio/mpeg,audio/wav'
}

# Preserve existing keys not being overwritten
if (Test-Path $envPath) {
  $existing = Get-Content -LiteralPath $envPath | Where-Object {$_ -match '='}
  foreach ($line in $existing) {
    $k,$v = $line.Split('=',2)
    if (-not $envVars.ContainsKey($k)) { $envVars[$k] = $v }
  }
}

$content = $envVars.GetEnumerator() | ForEach-Object { "{0}={1}" -f $_.Key, $_.Value }
Set-Content -LiteralPath $envPath -Value $content

Write-Host 'Done. You can now run: docker compose -f docker-compose.dev.yml up -d --build'


