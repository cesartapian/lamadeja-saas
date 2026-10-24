[CmdletBinding()]
param(
    [System.Security.SecureString]$Password,
    [string]$EnvFile = (Join-Path (Split-Path -Parent $PSScriptRoot) 'apps/api/.env'),
    [string]$CaCertificate,
    [switch]$Replace
)

$ErrorActionPreference = 'Stop'
$expectedRef = 'ropciikoozdbvsmiulhh'
if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) { throw 'Development environment file is missing.' }
$content = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $EnvFile).Path)
if ($content -notmatch '(?m)^SUPABASE_URL=https://ropciikoozdbvsmiulhh\.supabase\.co/?\s*$') {
    throw 'Refusing to configure a different Supabase project.'
}
if ($content -match '(?m)^DATABASE_URL=\s*\S+' -and -not $Replace) {
    throw 'DATABASE_URL is already configured. Use -Replace only to update this development connection.'
}
$encodedCaPath = $null
if ($CaCertificate) {
    if (-not (Test-Path -LiteralPath $CaCertificate -PathType Leaf)) { throw 'CA certificate file is missing.' }
    $caPath = (Resolve-Path -LiteralPath $CaCertificate).Path
    $pem = [System.IO.File]::ReadAllText($caPath)
    if ($pem -notmatch '-----BEGIN CERTIFICATE-----' -or $pem -match 'PRIVATE KEY') {
        throw 'Provide a PEM CA certificate downloaded from the development project dashboard, not a private key.'
    }
    $encodedCaPath = [Uri]::EscapeDataString($caPath)
}
if ($null -eq $Password) {
    $Password = Read-Host 'Contraseña PostgreSQL de lamadeja-saas-dev (no se mostrará)' -AsSecureString
}
if ($Password.Length -eq 0) { throw 'The database password cannot be empty.' }
$pointer = [IntPtr]::Zero
try {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Password)
    $encodedPassword = [Uri]::EscapeDataString([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer))
    # Endpoint observed in this project's Connect panel; no paid IPv4 add-on.
    $connection = "postgresql://postgres.${expectedRef}:${encodedPassword}@aws-1-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full"
    if ($encodedCaPath) { $connection += '&sslrootcert=' + $encodedCaPath }
    $line = 'DATABASE_URL=' + $connection
    if ($content -match '(?m)^DATABASE_URL=') {
        $content = [regex]::Replace($content, '(?m)^DATABASE_URL=[^\r\n]*', [System.Text.RegularExpressions.MatchEvaluator]{ param($match) $line })
    } else { $content = $content.TrimEnd() + [Environment]::NewLine + $line + [Environment]::NewLine }
    [System.IO.File]::WriteAllText((Resolve-Path -LiteralPath $EnvFile).Path, $content, [System.Text.UTF8Encoding]::new($false))
    Write-Output 'Development DATABASE_URL saved privately with TLS verification. No credentials printed.'
} finally {
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    $encodedPassword = $null; $connection = $null; $line = $null
}
