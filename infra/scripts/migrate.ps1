Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "../..")
$EnvFile = Join-Path $RootDir ".env.local"

if (Test-Path $EnvFile) {
  Get-Content $EnvFile | ForEach-Object {
    $Line = $_.Trim()
    if ($Line -eq "" -or $Line.StartsWith("#") -or -not $Line.Contains("=")) {
      return
    }

    $Parts = $Line.Split("=", 2)
    [Environment]::SetEnvironmentVariable($Parts[0], $Parts[1], "Process")
  }
}

Push-Location (Join-Path $RootDir "apps/api")
try {
  Write-Host "Running database migrations..."
  alembic upgrade head
  Write-Host "Migrations complete."
}
finally {
  Pop-Location
}
