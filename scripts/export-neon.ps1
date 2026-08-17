param(
    [string]$CredentialFile = (Join-Path $PSScriptRoot '..\neon-export-url.private')
)

$ErrorActionPreference = 'Stop'

function Find-PostgresTool([string]$Name) {
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    foreach ($root in @('C:\Program Files\PostgreSQL', 'C:\Program Files\pgAdmin 4')) {
        if (-not (Test-Path -LiteralPath $root)) {
            continue
        }

        $candidate = Get-ChildItem -LiteralPath $root -Recurse -Filter "$Name.exe" -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending |
            Select-Object -First 1 -ExpandProperty FullName

        if ($candidate) {
            return $candidate
        }
    }

    throw "$Name is not installed. Install PostgreSQL command-line tools and run this script again."
}

$resolvedCredentialFile = [System.IO.Path]::GetFullPath($CredentialFile)
if (-not (Test-Path -LiteralPath $resolvedCredentialFile)) {
    throw "Credential file not found: $resolvedCredentialFile"
}

$databaseLine = Get-Content -LiteralPath $resolvedCredentialFile |
    Where-Object { $_ -match '^NEON_DATABASE_URL=' } |
    Select-Object -First 1

if (-not $databaseLine) {
    throw 'NEON_DATABASE_URL is missing from the private credential file.'
}

$databaseUrl = $databaseLine.Substring('NEON_DATABASE_URL='.Length).Trim().Trim('"').Trim("'")
if (-not $databaseUrl.StartsWith('postgresql://') -and -not $databaseUrl.StartsWith('postgres://')) {
    throw 'Paste the complete direct Neon postgresql:// connection string into neon-export-url.private.'
}

$pgDump = Find-PostgresTool 'pg_dump'
$pgRestore = Find-PostgresTool 'pg_restore'
$backupDirectory = Join-Path $PSScriptRoot '..\emergency-backups\neon-export'
$timestamp = Get-Date -Format 'yyyy-MM-dd-HHmmss'
$dumpFile = Join-Path $backupDirectory "bluecrest-neon-$timestamp.dump"
$inventoryFile = "$dumpFile.contents.txt"
$checksumFile = "$dumpFile.sha256.txt"

New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null

$previousDatabase = $env:PGDATABASE
$env:PGDATABASE = $databaseUrl

try {
    Write-Host "Exporting Neon database to $dumpFile"
    & $pgDump --format=custom --verbose --no-owner --no-privileges --file=$dumpFile
    if ($LASTEXITCODE -ne 0) {
        throw "pg_dump failed with exit code $LASTEXITCODE."
    }

    & $pgRestore --list $dumpFile | Set-Content -LiteralPath $inventoryFile -Encoding utf8
    if ($LASTEXITCODE -ne 0) {
        throw "pg_restore validation failed with exit code $LASTEXITCODE."
    }

    $checksum = Get-FileHash -LiteralPath $dumpFile -Algorithm SHA256
    "$($checksum.Hash)  $($checksum.Path)" | Set-Content -LiteralPath $checksumFile -Encoding ascii

    $dumpInfo = Get-Item -LiteralPath $dumpFile
    Remove-Item -LiteralPath $resolvedCredentialFile -Force

    Write-Host 'Neon export completed and validated.'
    Write-Host "Dump: $($dumpInfo.FullName)"
    Write-Host "Size: $($dumpInfo.Length) bytes"
    Write-Host "Contents: $inventoryFile"
    Write-Host "Checksum: $checksumFile"
    Write-Host 'Temporary credential file removed.'
}
finally {
    if ($null -eq $previousDatabase) {
        Remove-Item Env:PGDATABASE -ErrorAction SilentlyContinue
    } else {
        $env:PGDATABASE = $previousDatabase
    }
    $databaseUrl = $null
}
