#Requires -Version 5.1
<#
.SYNOPSIS
Builds the FreeTokens release downloads for the selected targets.

.DESCRIPTION
Produces the same artifacts as the tag-triggered GoReleaser release, but on the current machine,
so the Windows release GUI can build and publish without CI:

  freetokens_<version>_windows_<arch>.zip   freetokens.exe + freetokensw.exe + docs
  FreeTokens-<version>-Setup-x64.exe        Inno Setup 6 installer (x64 zip target)
  freetokens_<version>_linux_<arch>.tar.gz  CGO-free tracker + classic tray
  freetokens_<version>_darwin_<arch>.tar.gz CGO-free engine (the menu bar app ships in the zip)
  FreeTokens-<version>-macOS.zip            SwiftUI app, built only on macOS
  checksums.txt                             SHA-256 for every artifact above

A package the user can download is produced for each selected target; the macOS app needs macOS
and Xcode, because it is Swift and code-signed.

.PARAMETER Targets
Comma-separated target ids: windows-amd64, windows-arm64, linux-amd64, linux-arm64,
darwin-amd64, darwin-arm64, macos-app.

.PARAMETER Version
Release version without the leading v, e.g. 1.2.3.

.PARAMETER Root
Repository root. Defaults to two directories above this script.

.PARAMETER OutDir
Output directory. Defaults to <Root>\dist.

.PARAMETER SkipFrontend
Reuse the existing cmd/freetokens/web/dist instead of building the frontend again.

.PARAMETER FreshInstall
Delete and reinstall cmd/freetokens/web/node_modules (npm ci) instead of reusing a working tree.

.EXAMPLE
powershell -ExecutionPolicy Bypass -File scripts\release\BuildTargets.ps1 -Version 1.2.3 -Targets windows-amd64,linux-amd64,linux-arm64,darwin-amd64,darwin-arm64
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string[]] $Targets,
    [Parameter(Mandatory = $true)][string] $Version,
    [string] $Root,
    [string] $OutDir,
    [switch] $SkipFrontend,
    [switch] $FreshInstall
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'ReleaseAssets.ps1')

function Write-Step([string] $Message) {
    Write-Output ''
    Write-Output "== $Message"
}

function Write-Note([string] $Message) {
    Write-Output "   $Message"
}

function Fail([string] $Message) {
    Write-Output "ERROR: $Message"
    exit 1
}

function Invoke-Native {
    param([string] $Exe, [string[]] $Arguments)
    Write-Output ("   > " + $Exe + " " + ($Arguments -join ' '))
    & $Exe @Arguments
    $code = $LASTEXITCODE
    if ($code -ne 0) { Fail "$Exe exited with code $code" }
}

# Target list may arrive as separate arguments or as one comma-separated string.
$targetList = New-Object System.Collections.Generic.List[string]
foreach ($entry in $Targets) {
    foreach ($piece in $entry.Split(',')) {
        $name = $piece.Trim()
        if ($name) {
            if ($script:FreeTokensTargets -notcontains $name) {
                Fail "Unknown target '$name'. Known targets: $($script:FreeTokensTargets -join ', ')"
            }
            if (-not $targetList.Contains($name)) { $targetList.Add($name) }
        }
    }
}
if ($targetList.Count -eq 0) { Fail 'Select at least one target.' }

$cleanVer = ($Version.Trim() -replace '^[vV]', '')
if ($cleanVer -notmatch '^\d+(\.\d+)*([-.][0-9A-Za-z.\-]+)?$') {
    Fail "Version must look like 1.2.3 or 1.2.3-beta.1 (got '$Version')."
}
$numericVer = ($cleanVer -split '-')[0]

if (-not $Root) { $Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot) }
$Root = (Resolve-Path -LiteralPath $Root).Path
if (-not $OutDir) { $OutDir = Join-Path $Root 'dist' }
if (-not (Test-Path -LiteralPath $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }

$stageRoot = Join-Path $OutDir '.stage'
$isWindowsHost = -not (Test-FreeTokensMacHost)
$isMacHost = Test-FreeTokensMacHost

$commit = 'none'
$head = & git -C $Root rev-parse --short HEAD 2>$null
if ($LASTEXITCODE -eq 0 -and $head) { $commit = $head.Trim() }
$buildDate = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')

Write-Step "FreeTokens $cleanVer ($commit) for $($targetList -join ', ')"
Write-Note "repository: $Root"
Write-Note "output:     $OutDir"

# Stale output from an earlier build of the same version would be uploaded as if it were new.
Write-Step 'Clearing previous artifacts for this version'
Get-ChildItem -LiteralPath $OutDir -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like "freetokens_${cleanVer}_*" -or $_.Name -like "FreeTokens-$cleanVer-*" } |
    ForEach-Object {
        Write-Note "removed $($_.Name)"
        Remove-Item -LiteralPath $_.FullName -Force
    }
if (Test-Path -LiteralPath $stageRoot) { Remove-Item -LiteralPath $stageRoot -Recurse -Force }
New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null

# Toolchain.
Write-Step 'Checking the toolchain'
$goCmd = Get-Command go -ErrorAction SilentlyContinue
if (-not $goCmd) { Fail 'go was not found on PATH. Install Go (see go.mod for the version).' }
Write-Note ((& go version) -join ' ')

$needsFrontend = -not $SkipFrontend
if ($needsFrontend) {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail 'node was not found on PATH (Node 22+ is required for the popover).' }
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Fail 'npm was not found on PATH.' }
    Write-Note ((& node --version) -join ' ')
}

$tarCmd = Get-Command tar.exe -ErrorAction SilentlyContinue
$gzipCmd = Get-Command gzip.exe -ErrorAction SilentlyContinue
$gnuTar = $false
if ($tarCmd -and $gzipCmd) {
    $tarBanner = (& $tarCmd.Source --version 2>$null | Select-Object -First 1)
    if ($tarBanner -match 'GNU tar') { $gnuTar = $true }
}

$iscc = Find-FreeTokensIscc
if ($iscc) { Write-Note "Inno Setup: $iscc" } else { Write-Note 'Inno Setup: not found (the x64 Setup.exe will be skipped)' }

# Popover frontend: embedded into the Go binary at compile time, so it has to exist first.
if ($needsFrontend) {
    Write-Step 'Building the popover frontend'
    $web = Join-Path $Root 'cmd\freetokens\web'
    if (-not (Test-Path -LiteralPath (Join-Path $web 'package-lock.json'))) {
        Fail "package-lock.json is missing from $web; refusing to guess dependency versions."
    }
    # npm ci deletes node_modules first, which fails outright while a dev server or antivirus holds
    # a native module. A working tree is reused; -FreshInstall forces the clean install.
    $modules = Join-Path $web 'node_modules'
    $hasModules = (Test-Path -LiteralPath (Join-Path $modules '.bin')) -and -not $FreshInstall
    Push-Location $web
    try {
        if ($hasModules) {
            Write-Note 'node_modules is present; skipping npm ci (use -FreshInstall to reinstall).'
        } else {
            Invoke-Native 'npm' @('ci', '--no-audit', '--no-fund')
        }
        Invoke-Native 'npm' @('run', 'build')
    } finally {
        Pop-Location
    }
    if (-not (Test-Path -LiteralPath (Join-Path $web 'dist\index.html'))) {
        Fail 'the frontend build produced no cmd/freetokens/web/dist/index.html'
    }
} else {
    Write-Step 'Reusing the existing popover build'
    if (-not (Test-Path -LiteralPath (Join-Path $Root 'cmd\freetokens\web\dist\index.html'))) {
        Fail 'cmd/freetokens/web/dist is missing; run without -SkipFrontend once.'
    }
}

# Windows icon, version resource and manifest (cmd/freetokens/*.syso, git-ignored).
if ($targetList -contains 'windows-amd64' -or $targetList -contains 'windows-arm64') {
    Write-Step 'Generating Windows resources'
    $arches = @()
    if ($targetList -contains 'windows-amd64') { $arches += 'amd64' }
    if ($targetList -contains 'windows-arm64') { $arches += 'arm64' }
    Invoke-Native 'go' @(
        'run', 'github.com/tc-hib/go-winres@v0.3.3', 'make',
        '--in', 'winres/winres.json',
        '--out', 'cmd/freetokens/rsrc',
        '--arch', ($arches -join ','),
        '--product-version', $numericVer,
        '--file-version', $numericVer
    )
}

$ldflags = "-s -w -X main.version=$cleanVer -X main.commit=$commit -X main.date=$buildDate"
$matrix = [ordered]@{
    'windows-amd64' = @{ GOOS = 'windows'; GOARCH = 'amd64'; Kind = 'windows'; Stage = 'windows-amd64' }
    'windows-arm64' = @{ GOOS = 'windows'; GOARCH = 'arm64'; Kind = 'windows'; Stage = 'windows-arm64' }
    'linux-amd64' = @{ GOOS = 'linux'; GOARCH = 'amd64'; Kind = 'unix'; Stage = 'linux-amd64' }
    'linux-arm64' = @{ GOOS = 'linux'; GOARCH = 'arm64'; Kind = 'unix'; Stage = 'linux-arm64' }
    'darwin-amd64' = @{ GOOS = 'darwin'; GOARCH = 'amd64'; Kind = 'unix'; Stage = 'darwin-amd64' }
    'darwin-arm64' = @{ GOOS = 'darwin'; GOARCH = 'arm64'; Kind = 'unix'; Stage = 'darwin-arm64' }
}

$docs = @('README.md', 'LICENSE', 'NOTICE')
$produced = New-Object System.Collections.Generic.List[string]

foreach ($target in $matrix.Keys) {
    if ($targetList -notcontains $target) { continue }
    $spec = $matrix[$target]
    $stage = Join-Path $stageRoot $spec.Stage
    New-Item -ItemType Directory -Path $stage -Force | Out-Null
    foreach ($doc in $docs) {
        Copy-Item -LiteralPath (Join-Path $Root $doc) -Destination (Join-Path $stage $doc) -Force
    }

    Write-Step "Building $target"
    $env:CGO_ENABLED = '0'
    $env:GOOS = $spec.GOOS
    $env:GOARCH = $spec.GOARCH
    try {
        if ($spec.Kind -eq 'windows') {
            # freetokens.exe keeps the console subsystem (CLI), freetokensw.exe is windowless.
            Invoke-Native 'go' @(
                'build', '-tags', 'gui,production', '-trimpath', '-ldflags', $ldflags,
                '-o', (Join-Path $stage 'freetokens.exe'), './cmd/freetokens'
            )
            Invoke-Native 'go' @(
                'build', '-tags', 'gui,production', '-trimpath', '-ldflags', "$ldflags -H windowsgui",
                '-o', (Join-Path $stage 'freetokensw.exe'), './cmd/freetokens'
            )
            $archive = Join-Path $OutDir "freetokens_${cleanVer}_$($spec.GOOS)_$($spec.GOARCH).zip"
            if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
            Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $archive -CompressionLevel Optimal
        } else {
            # No gui tag: the CLI plus the classic tray, exactly as goreleaser builds them.
            Invoke-Native 'go' @(
                'build', '-trimpath', '-ldflags', $ldflags,
                '-o', (Join-Path $stage 'freetokens'), './cmd/freetokens'
            )
            $archive = Join-Path $OutDir "freetokens_${cleanVer}_$($spec.GOOS)_$($spec.GOARCH).tar.gz"
            if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }

            $tmpTar = Join-Path $env:TEMP ("freetokens-" + [guid]::NewGuid().ToString('N') + ".tar")
            Push-Location $stage
            try {
                if ($gnuTar) {
                    # The binary needs 0755 on Unix; docs stay 0644. GNU tar sets modes per member.
                    # --force-local stops GNU tar treating the drive letter in C:\... as a remote host.
                    & tar --force-local -cf $tmpTar --mode=755 freetokens
                    if ($LASTEXITCODE -ne 0) { Fail 'tar failed to add the binary' }
                    & tar --force-local -rf $tmpTar --mode=644 README.md LICENSE NOTICE
                    if ($LASTEXITCODE -ne 0) { Fail 'tar failed to add the docs' }
                    & gzip -9 -n -f $tmpTar
                    if ($LASTEXITCODE -ne 0) { Fail 'gzip failed' }
                } else {
                    Write-Note 'GNU tar/gzip not found; falling back to the system tar (check the exec bit after extracting).'
                    & tar -czf ($tmpTar + '.gz') freetokens README.md LICENSE NOTICE
                    if ($LASTEXITCODE -ne 0) { Fail 'tar failed' }
                }
            } finally {
                Pop-Location
            }
            Move-Item -LiteralPath ($tmpTar + '.gz') -Destination $archive -Force
        }
    } finally {
        Remove-Item Env:CGO_ENABLED -ErrorAction SilentlyContinue
        Remove-Item Env:GOOS -ErrorAction SilentlyContinue
        Remove-Item Env:GOARCH -ErrorAction SilentlyContinue
    }

    $size = [Math]::Round((Get-Item -LiteralPath $archive).Length / 1MB, 2)
    $produced.Add((Split-Path -Leaf $archive))
    Write-Output "   + $(Split-Path -Leaf $archive) ($size MB)"
}

# Inno Setup installer for Windows x64, built from the staged files.
if ($targetList -contains 'windows-amd64') {
    Write-Step 'Building the Windows installer'
    if (-not $iscc) {
        Write-Output 'WARNING: Inno Setup 6 (ISCC.exe) was not found. Skipping Setup.exe; the portable zip is ready.'
    } else {
        $winStage = Join-Path $stageRoot 'windows-amd64'
        $wrap = Join-Path $stageRoot 'freetokens-installer.iss'
        $versionParts = @(($numericVer -split '\.'))
        while ($versionParts.Count -lt 4) { $versionParts += '0' }
        $quadVersion = ($versionParts[0..3] -join '.')
        $define = @(
            "#define AppVersion `"$cleanVer`""
            "#define SourceDir `"$winStage`""
            "#define OutputDir `"$OutDir`""
            "#define OutputBase `"FreeTokens-$cleanVer-Setup-x64`""
            "#define IconFile `"$(Join-Path $Root 'cmd\freetokens\build\windows\icon.ico')`""
            "#define VersionInfoVersion `"$quadVersion`""
            "#include `"$(Join-Path $PSScriptRoot 'freetokens.iss')`""
        )
        Set-Content -LiteralPath $wrap -Value $define -Encoding ASCII
        Invoke-Native $iscc @($wrap)
        $setup = Join-Path $OutDir "FreeTokens-$cleanVer-Setup-x64.exe"
        if (-not (Test-Path -LiteralPath $setup)) { Fail 'Inno Setup reported success but produced no installer' }
        $size = [Math]::Round((Get-Item -LiteralPath $setup).Length / 1MB, 2)
        $produced.Add((Split-Path -Leaf $setup))
        Write-Output "   + $(Split-Path -Leaf $setup) ($size MB)"
    }
}

# The SwiftUI menu bar app. macOS only: Swift, lipo and codesign are not cross-compilable.
if ($targetList -contains 'macos-app') {
    Write-Step 'Building the macOS app'
    $appZipName = "FreeTokens-$cleanVer-macOS.zip"
    $appZip = Join-Path $Root (Join-Path 'dist-app' $appZipName)
    if ($isMacHost) {
        Invoke-Native 'bash' @((Join-Path $Root 'scripts\build-macos-app.sh'), $cleanVer)
    } else {
        Write-Note 'Not running on macOS, so the SwiftUI app cannot be compiled here.'
        Write-Note "Reusing $appZip if it exists (a CI artifact or a zip from a Mac)."
    }
    if (Test-Path -LiteralPath $appZip) {
        $dest = Join-Path $OutDir $appZipName
        Copy-Item -LiteralPath $appZip -Destination $dest -Force
        $size = [Math]::Round((Get-Item -LiteralPath $dest).Length / 1MB, 2)
        $produced.Add($appZipName)
        Write-Output "   + $appZipName ($size MB)"
    } else {
        Write-Output "WARNING: $appZipName was not found. Build it on macOS (scripts/build-macos-app.sh) or download it from CI."
    }
}

# Uploaded last by the publisher, and required by the in-app updater.
Write-Step 'Writing checksums.txt'
$checksumFile = Write-FreeTokensChecksums -OutDir $OutDir -Names $produced.ToArray()
if (-not $checksumFile) { Fail 'no artifacts were produced, so there is nothing to checksum' }
Get-Content -LiteralPath $checksumFile | ForEach-Object { Write-Output "   $_" }

# winget/Scoop/Homebrew files for the artifacts above. The generator hashes the files it names,
# so it must run after the build; a target that wasn't selected is skipped with a note.
Write-Step 'Writing package-manager manifests'
$manifestDir = Join-Path $OutDir 'manifests'
Push-Location $Root
try {
    & go run ./scripts/manifests -version $cleanVer -dist $OutDir -out $manifestDir
    if ($LASTEXITCODE -ne 0) {
        Write-Output 'WARNING: no package-manager manifests were written (they need the Windows or macOS artifacts).'
    }
} finally {
    Pop-Location
}

Write-Step 'Done'
Write-Output "   artifacts in $OutDir"
exit 0
