# Shared helpers for the FreeTokens release tools (BuildTargets.ps1 and PublishReleaseGui.ps1).
# Windows PowerShell 5.1 compatible: no ternaries, no ??, no Join-Path with three arguments.

# Ordered target ids. The GUI checkboxes and the build matrix both use these names.
$script:FreeTokensTargets = @(
    'windows-amd64'
    'windows-arm64'
    'linux-amd64'
    'linux-arm64'
    'darwin-amd64'
    'darwin-arm64'
    'macos-app'
)

# Release asset names must end in _<os>_<arch> for the in-app updater (go-selfupdate), and the
# macOS app archive must be FreeTokens-<version>-macOS.zip for internal/update.AppAssetPattern.
function Get-FreeTokensAssetNames {
    param(
        [Parameter(Mandatory = $true)][string] $Version,
        [Parameter(Mandatory = $true)][string] $Target
    )
    switch ($Target) {
        'windows-amd64' { @("freetokens_${Version}_windows_amd64.zip", "FreeTokens-$Version-Setup-x64.exe") }
        'windows-arm64' { @("freetokens_${Version}_windows_arm64.zip") }
        'linux-amd64' { @("freetokens_${Version}_linux_amd64.tar.gz") }
        'linux-arm64' { @("freetokens_${Version}_linux_arm64.tar.gz") }
        'darwin-amd64' { @("freetokens_${Version}_darwin_amd64.tar.gz") }
        'darwin-arm64' { @("freetokens_${Version}_darwin_arm64.tar.gz") }
        'macos-app' { @("FreeTokens-$Version-macOS.zip") }
        default { @() }
    }
}

# goreleaser writes "<sha256>  <name>" lines, lower-case hex, LF endings.
function Write-FreeTokensChecksums {
    param(
        [Parameter(Mandatory = $true)][string] $OutDir,
        [Parameter(Mandatory = $true)][string[]] $Names
    )
    $lines = New-Object System.Collections.Generic.List[string]
    foreach ($name in ($Names | Sort-Object -Unique)) {
        $path = Join-Path $OutDir $name
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { continue }
        $hash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
        $lines.Add("$hash  $name")
    }
    if ($lines.Count -eq 0) { return $null }
    $file = Join-Path $OutDir 'checksums.txt'
    $text = ($lines -join "`n") + "`n"
    [System.IO.File]::WriteAllText($file, $text, (New-Object System.Text.UTF8Encoding($false)))
    return $file
}

# Inno Setup 6 ships per-user or per-machine; both install locations are tried.
function Find-FreeTokensIscc {
    $candidates = @(
        (Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe')
        (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe')
        (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe')
    )
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) { return $candidate }
    }
    $cmd = Get-Command ISCC.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

function Test-FreeTokensMacHost {
    return [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform(
        [System.Runtime.InteropServices.OSPlatform]::OSX)
}
