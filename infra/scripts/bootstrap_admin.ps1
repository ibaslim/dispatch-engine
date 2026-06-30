param(
  [string]$Email = $env:PLATFORM_ADMIN_EMAIL,
  [string]$Password = $env:PLATFORM_ADMIN_PASSWORD,
  [string]$Name = $env:PLATFORM_ADMIN_NAME
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Email)) {
  $Email = "admin@dispatch.local"
}

if ([string]::IsNullOrWhiteSpace($Name)) {
  $Name = "Platform Admin"
}

if ([string]::IsNullOrWhiteSpace($Password)) {
  Write-Host "Usage: .\bootstrap_admin.ps1 -Password <password>"
  Write-Host "  Or set PLATFORM_ADMIN_EMAIL, PLATFORM_ADMIN_PASSWORD, PLATFORM_ADMIN_NAME env vars."
  exit 1
}

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "../..")

Push-Location (Join-Path $RootDir "apps/api")
try {
  python -m app.cli.bootstrap_platform_admin `
    --email $Email `
    --password $Password `
    --name $Name
}
finally {
  Pop-Location
}
