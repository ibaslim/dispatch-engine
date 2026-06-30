Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "../..")
$EnvFile = Join-Path $RootDir ".env.local"
$ExampleFile = Join-Path $RootDir ".env.local.example"

if (Test-Path $EnvFile) {
  Write-Host "[env] .env.local already exists; reusing it."
  exit 0
}

Copy-Item $ExampleFile $EnvFile

$Bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Fill($Bytes)
$JwtSecret = -join ($Bytes | ForEach-Object { $_.ToString("x2") })

$Content = Get-Content $EnvFile -Raw
$Content = $Content.Replace("changeme-generate-a-secure-random-string", $JwtSecret)
Set-Content -Path $EnvFile -Value $Content -NoNewline

Write-Host "[env] Created .env.local with a generated JWT secret."
