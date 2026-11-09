# FreeTokens release publisher (Windows GUI).
#
# Builds the downloadable packages with BuildTargets.ps1, then publishes them to GitHub Releases
# with the REST API. Native WPF, no modules or extra dependencies.
#
#   powershell -ExecutionPolicy Bypass -File scripts\release\PublishReleaseGui.ps1
#
# A GitHub PAT with the `repo` scope is required to publish. It is kept in
# scripts\release\.release_token, which is git-ignored and plain text.

# WPF needs a single-threaded apartment; pwsh starts MTA, so hand off to Windows PowerShell.
if ([System.Threading.Thread]::CurrentThread.GetApartmentState() -ne [System.Threading.ApartmentState]::STA) {
    Write-Host 'Restarting in Windows PowerShell (STA) for the WPF window...'
    Start-Process -FilePath 'powershell.exe' -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA', ('-File "{0}"' -f $PSCommandPath)
    )
    exit 0
}

Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Net.Http

if (-not ([System.Management.Automation.PSTypeName]'FreeTokensPublisher.UploadProgressStream').Type) {
    Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using System.Collections.Concurrent;

namespace FreeTokensPublisher {
    // Wraps the file stream so the UI can show upload progress without blocking the worker.
    public class UploadProgressStream : Stream {
        private readonly Stream _inner;
        private readonly long _totalBytes;
        private long _bytesSent;
        private readonly ConcurrentQueue<string> _queue;
        private int _lastPercentReported = -1;
        private readonly string _prefix;

        public UploadProgressStream(Stream inner, long totalBytes, ConcurrentQueue<string> queue, string prefix = "") {
            _inner = inner;
            _totalBytes = totalBytes;
            _queue = queue;
            _prefix = prefix ?? string.Empty;
        }

        public override bool CanRead { get { return _inner.CanRead; } }
        public override bool CanSeek { get { return _inner.CanSeek; } }
        public override bool CanWrite { get { return _inner.CanWrite; } }
        public override long Length { get { return _totalBytes; } }
        public override long Position {
            get { return _inner.Position; }
            set { _inner.Position = value; }
        }

        public override void Flush() { _inner.Flush(); }
        public override long Seek(long offset, SeekOrigin origin) { return _inner.Seek(offset, origin); }
        public override void SetLength(long value) { _inner.SetLength(value); }
        public override void Write(byte[] buffer, int offset, int count) { _inner.Write(buffer, offset, count); }

        private void ReportProgress(int bytesJustRead) {
            if (bytesJustRead <= 0 || _totalBytes <= 0) return;
            _bytesSent += bytesJustRead;
            int currentPercent = (int)((_bytesSent * 100) / _totalBytes);
            if (currentPercent != _lastPercentReported) {
                _lastPercentReported = currentPercent;
                double mbSent = Math.Round((double)_bytesSent / (1024 * 1024), 2);
                double mbTotal = Math.Round((double)_totalBytes / (1024 * 1024), 2);
                if (_queue != null) {
                    _queue.Enqueue(string.Format("PROGRESS:{0}:{1:0.00}:{2:0.00}:{3}", currentPercent, mbSent, mbTotal, _prefix));
                }
            }
        }

        public override int Read(byte[] buffer, int offset, int count) {
            int read = _inner.Read(buffer, offset, count);
            ReportProgress(read);
            return read;
        }

        public override async Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken) {
            int read = await _inner.ReadAsync(buffer, offset, count, cancellationToken);
            ReportProgress(read);
            return read;
        }

        protected override void Dispose(bool disposing) {
            if (disposing) {
                _inner.Dispose();
            }
            base.Dispose(disposing);
        }
    }
}
"@
}

$scriptDir = $PSScriptRoot
$rootDir = (Get-Item (Join-Path (Join-Path $scriptDir '..') '..')).FullName
Set-Location $rootDir
. (Join-Path $scriptDir 'ReleaseAssets.ps1')

$repoSlug = 'tverma101/FreeTokens'
$repoUrl = "https://github.com/$repoSlug"
$tokenFile = Join-Path $scriptDir '.release_token'
$buildScript = Join-Path $scriptDir 'BuildTargets.ps1'
$distDir = Join-Path $rootDir 'dist'
$appDir = Join-Path $rootDir 'dist-app'
$isMacHost = Test-FreeTokensMacHost

function Brush([string] $hex) {
    $color = [System.Windows.Media.ColorConverter]::ConvertFromString($hex)
    return (New-Object System.Windows.Media.SolidColorBrush($color))
}
$brandBrush = Brush '#4cc38a'
$warnBrush = Brush '#e8b45c'
$dangerBrush = Brush '#f08a72'
$mutedBrush = Brush '#b8afa1'
$okBrush = Brush '#7ad8a9'

# Latest tag drives the default version; GoReleaser strips the leading v for asset names.
$defaultVersion = '0.1.0'
$prev = & git -C $rootDir describe --tags --abbrev=0 2>$null
if ($LASTEXITCODE -eq 0 -and $prev) { $defaultVersion = ($prev.Trim() -replace '^[vV]', '') }

$savedToken = ''
if (Test-Path -LiteralPath $tokenFile) {
    try { $savedToken = (Get-Content -LiteralPath $tokenFile -Raw).Trim() } catch { }
}

$preflightBits = New-Object System.Collections.Generic.List[string]
$goCmd = Get-Command go -ErrorAction SilentlyContinue
if ($goCmd) {
    $goParts = ((& go version) -split '\s+')
    if ($goParts.Count -ge 3) { $preflightBits.Add(($goParts[2] -replace '^go', 'go ')) } else { $preflightBits.Add('go') }
} else { $preflightBits.Add('go missing') }
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd) { $preflightBits.Add("node $((& node --version))") } else { $preflightBits.Add('node missing') }
$isccPath = Find-FreeTokensIscc
if ($isccPath) { $preflightBits.Add('Inno Setup 6') } else { $preflightBits.Add('no Inno Setup') }
if (Get-Command tar.exe -ErrorAction SilentlyContinue) { $preflightBits.Add('tar') }
$branch = (& git -C $rootDir rev-parse --abbrev-ref HEAD 2>$null)
if ($branch) {
    $dirty = (& git -C $rootDir status --porcelain 2>$null)
    $state = 'clean'
    if ($dirty) { $state = 'dirty' }
    $preflightBits.Add("$($branch.Trim()) ($state)")
}
$preflight = $preflightBits -join '  |  '

[xml]$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="FreeTokens - Release Publisher" Height="900" Width="800"
        MinWidth="720" MinHeight="700"
        WindowStartupLocation="CenterScreen"
        Background="#161512" Foreground="#f2ede6"
        FontFamily="Segoe UI" UseLayoutRounding="True" SnapsToDevicePixels="True">
    <Window.Resources>
        <Style TargetType="TextBox">
            <Setter Property="Background" Value="#1e1c19" />
            <Setter Property="Foreground" Value="#f2ede6" />
            <Setter Property="BorderBrush" Value="#3a352e" />
            <Setter Property="BorderThickness" Value="1" />
            <Setter Property="Padding" Value="8,6" />
            <Setter Property="FontSize" Value="12" />
            <Setter Property="CaretBrush" Value="#4cc38a" />
            <Setter Property="SelectionBrush" Value="#4cc38a" />
        </Style>
        <Style TargetType="PasswordBox">
            <Setter Property="Background" Value="#1e1c19" />
            <Setter Property="Foreground" Value="#f2ede6" />
            <Setter Property="BorderBrush" Value="#3a352e" />
            <Setter Property="BorderThickness" Value="1" />
            <Setter Property="Padding" Value="8,6" />
            <Setter Property="FontSize" Value="12" />
            <Setter Property="CaretBrush" Value="#4cc38a" />
            <Setter Property="SelectionBrush" Value="#4cc38a" />
        </Style>
        <Style TargetType="Button">
            <Setter Property="Background" Value="#2a2722" />
            <Setter Property="Foreground" Value="#f2ede6" />
            <Setter Property="BorderBrush" Value="#3a352e" />
            <Setter Property="BorderThickness" Value="1" />
            <Setter Property="Padding" Value="12,6" />
            <Setter Property="FontSize" Value="12" />
            <Setter Property="Cursor" Value="Hand" />
            <Setter Property="Template">
                <Setter.Value>
                    <ControlTemplate TargetType="Button">
                        <Border x:Name="Chrome" Background="{TemplateBinding Background}"
                                BorderBrush="{TemplateBinding BorderBrush}" BorderThickness="{TemplateBinding BorderThickness}"
                                CornerRadius="6" SnapsToDevicePixels="True">
                            <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"
                                              Margin="{TemplateBinding Padding}" />
                        </Border>
                        <ControlTemplate.Triggers>
                            <Trigger Property="IsMouseOver" Value="True">
                                <Setter TargetName="Chrome" Property="Background" Value="#332f29" />
                            </Trigger>
                            <Trigger Property="IsPressed" Value="True">
                                <Setter TargetName="Chrome" Property="Background" Value="#3a352e" />
                            </Trigger>
                            <Trigger Property="IsEnabled" Value="False">
                                <Setter TargetName="Chrome" Property="Opacity" Value="0.4" />
                                <Setter Property="Cursor" Value="Arrow" />
                            </Trigger>
                        </ControlTemplate.Triggers>
                    </ControlTemplate>
                </Setter.Value>
            </Setter>
        </Style>
        <Style TargetType="CheckBox">
            <Setter Property="Foreground" Value="#d8d2c8" />
            <Setter Property="FontSize" Value="11.5" />
            <Setter Property="Cursor" Value="Hand" />
            <Setter Property="Template">
                <Setter.Value>
                    <ControlTemplate TargetType="CheckBox">
                        <StackPanel Orientation="Horizontal" Background="Transparent">
                            <Border x:Name="Box" Width="14" Height="14" CornerRadius="3"
                                    Background="#1e1c19" BorderBrush="#3a352e" BorderThickness="1"
                                    VerticalAlignment="Center">
                                <Path x:Name="Tick" Data="M 1,5 L 4,8 L 9,1" Stroke="#161512" StrokeThickness="2"
                                      Visibility="Collapsed" HorizontalAlignment="Center" VerticalAlignment="Center"
                                      StrokeStartLineCap="Round" StrokeEndLineCap="Round" />
                            </Border>
                            <ContentPresenter Margin="7,0,0,0" VerticalAlignment="Center" />
                        </StackPanel>
                        <ControlTemplate.Triggers>
                            <Trigger Property="IsChecked" Value="True">
                                <Setter TargetName="Box" Property="Background" Value="#4cc38a" />
                                <Setter TargetName="Box" Property="BorderBrush" Value="#4cc38a" />
                                <Setter TargetName="Tick" Property="Visibility" Value="Visible" />
                            </Trigger>
                            <Trigger Property="IsMouseOver" Value="True">
                                <Setter TargetName="Box" Property="BorderBrush" Value="#7ad8a9" />
                            </Trigger>
                            <Trigger Property="IsEnabled" Value="False">
                                <Setter Property="Opacity" Value="0.4" />
                            </Trigger>
                        </ControlTemplate.Triggers>
                    </ControlTemplate>
                </Setter.Value>
            </Setter>
        </Style>
        <Style TargetType="ProgressBar">
            <Setter Property="Background" Value="#2f2b26" />
            <Setter Property="Foreground" Value="#4cc38a" />
            <Setter Property="BorderThickness" Value="0" />
        </Style>
        <Style x:Key="Label" TargetType="TextBlock">
            <Setter Property="FontSize" Value="11" />
            <Setter Property="FontWeight" Value="SemiBold" />
            <Setter Property="Foreground" Value="#b8afa1" />
            <Setter Property="Margin" Value="0,0,0,4" />
        </Style>
        <Style x:Key="Hint" TargetType="TextBlock">
            <Setter Property="FontSize" Value="10" />
            <Setter Property="Foreground" Value="#9a9184" />
            <Setter Property="Margin" Value="0,4,0,0" />
        </Style>
        <Style x:Key="LinkButton" TargetType="Button" BasedOn="{StaticResource {x:Type Button}}">
            <Setter Property="Background" Value="Transparent" />
            <Setter Property="BorderThickness" Value="0" />
            <Setter Property="Foreground" Value="#7ad8a9" />
            <Setter Property="FontSize" Value="10.5" />
            <Setter Property="Padding" Value="6,2" />
            <Setter Property="Cursor" Value="Hand" />
        </Style>
    </Window.Resources>

    <Grid Margin="22,18,22,18">
        <Grid.RowDefinitions>
            <RowDefinition Height="Auto" />
            <RowDefinition Height="Auto" />
            <RowDefinition Height="Auto" />
            <RowDefinition Height="Auto" />
            <RowDefinition Height="Auto" />
            <RowDefinition Height="Auto" />
            <RowDefinition Height="*" />
            <RowDefinition Height="Auto" />
        </Grid.RowDefinitions>

        <!-- Header -->
        <Border Grid.Row="0" BorderThickness="0,0,0,1" BorderBrush="#2a2722" Padding="0,0,0,12" Margin="0,0,0,14">
            <Grid>
                <Grid.ColumnDefinitions>
                    <ColumnDefinition Width="*" />
                    <ColumnDefinition Width="Auto" />
                </Grid.ColumnDefinitions>
                <StackPanel Grid.Column="0">
                    <StackPanel Orientation="Horizontal" VerticalAlignment="Center">
                        <TextBlock Text="FreeTokens" FontWeight="Bold" FontSize="17" Foreground="#4cc38a" />
                        <TextBlock Text="  Release Publisher" FontWeight="SemiBold" FontSize="17" Foreground="#f2ede6" />
                    </StackPanel>
                    <TextBlock Text="Windows, Linux and macOS downloads for github.com/tverma101/FreeTokens"
                               FontSize="10.5" Foreground="#9a9184" Margin="0,3,0,0" />
                    <TextBlock Name="lblPreflight" Text="" FontSize="10" Foreground="#9a9184" Margin="0,3,0,0" />
                </StackPanel>
                <StackPanel Grid.Column="1" Orientation="Horizontal" VerticalAlignment="Center">
                    <Button Name="btnOpenDist" Content="Open dist" Style="{StaticResource LinkButton}" Margin="0,0,10,0" />
                    <Button Name="btnOpenReleases" Content="Releases page" Style="{StaticResource LinkButton}" />
                </StackPanel>
            </Grid>
        </Border>

        <!-- Version -->
        <Grid Grid.Row="1" Margin="0,0,0,12">
            <Grid.ColumnDefinitions>
                <ColumnDefinition Width="170" />
                <ColumnDefinition Width="14" />
                <ColumnDefinition Width="*" />
            </Grid.ColumnDefinitions>
            <StackPanel Grid.Column="0">
                <TextBlock Text="Release tag" Style="{StaticResource Label}" />
                <TextBox Name="txtTag" Text="v$defaultVersion" />
            </StackPanel>
            <StackPanel Grid.Column="2">
                <TextBlock Text="Release title" Style="{StaticResource Label}" />
                <TextBox Name="txtTitle" Text="FreeTokens v$defaultVersion" />
            </StackPanel>
        </Grid>

        <!-- Token -->
        <StackPanel Grid.Row="2" Margin="0,0,0,12">
            <Grid Margin="0,0,0,4">
                <Grid.ColumnDefinitions>
                    <ColumnDefinition Width="*" />
                    <ColumnDefinition Width="Auto" />
                </Grid.ColumnDefinitions>
                <TextBlock Grid.Column="0" Text="GitHub token (PAT, repo scope)" Style="{StaticResource Label}" />
                <TextBlock Grid.Column="1" Name="lblTokenStatus" Text="" FontSize="10.5" FontWeight="SemiBold"
                           Foreground="#4cc38a" />
            </Grid>
            <Grid>
                <Grid.ColumnDefinitions>
                    <ColumnDefinition Width="*" />
                    <ColumnDefinition Width="6" />
                    <ColumnDefinition Width="Auto" />
                    <ColumnDefinition Width="6" />
                    <ColumnDefinition Width="Auto" />
                    <ColumnDefinition Width="6" />
                    <ColumnDefinition Width="Auto" />
                </Grid.ColumnDefinitions>
                <Grid Grid.Column="0">
                    <PasswordBox Name="txtToken" />
                    <TextBox Name="txtTokenPlain" Visibility="Collapsed" />
                </Grid>
                <Button Grid.Column="2" Name="btnToggleTokenVisibility" Content="Show" Padding="10,5"
                        ToolTip="Toggle token visibility" />
                <Button Grid.Column="4" Name="btnSaveToken" Content="Save" Padding="12,5" Foreground="#7ad8a9"
                        BorderBrush="#4cc38a" ToolTip="Save the token to scripts\release\.release_token and verify it" />
                <Button Grid.Column="6" Name="btnForgetToken" Content="Clear" Padding="10,5" Foreground="#f08a72"
                        ToolTip="Delete the saved token from disk" />
            </Grid>
            <TextBlock Text="Saved to scripts\release\.release_token (git-ignored, plain text). Nothing is sent anywhere except api.github.com."
                       Style="{StaticResource Hint}" />
        </StackPanel>

        <!-- Targets -->
        <Border Grid.Row="3" Background="#1e1c19" BorderBrush="#2a2722" BorderThickness="1" CornerRadius="6"
                Padding="12,10" Margin="0,0,0,12">
            <StackPanel>
                <Grid Margin="0,0,0,6">
                    <Grid.ColumnDefinitions>
                        <ColumnDefinition Width="*" />
                        <ColumnDefinition Width="Auto" />
                    </Grid.ColumnDefinitions>
                    <StackPanel Grid.Column="0" Orientation="Horizontal" VerticalAlignment="Center">
                        <TextBlock Text="Build and publish" FontSize="11" FontWeight="SemiBold" Foreground="#b8afa1" />
                        <TextBlock Name="lblTargetSummary" Text="" FontSize="10" Foreground="#7ad8a9" Margin="8,1,0,0" />
                    </StackPanel>
                    <StackPanel Grid.Column="1" Orientation="Horizontal">
                        <Button Name="btnSelectAllTargets" Content="All" Style="{StaticResource LinkButton}" />
                        <Button Name="btnSelectWinTarget" Content="Windows" Style="{StaticResource LinkButton}" />
                        <Button Name="btnClearTargets" Content="None" Style="{StaticResource LinkButton}" Foreground="#9a9184" />
                    </StackPanel>
                </Grid>
                <WrapPanel Orientation="Horizontal">
                    <CheckBox Name="chkTargetWin64" Content="Windows x64 - zip + Setup.exe" IsChecked="True" Margin="0,3,20,3" />
                    <CheckBox Name="chkTargetWinArm" Content="Windows ARM64 - zip" IsChecked="True" Margin="0,3,20,3" />
                    <CheckBox Name="chkTargetLinux64" Content="Linux x64 - tar.gz" IsChecked="True" Margin="0,3,20,3" />
                    <CheckBox Name="chkTargetLinuxArm" Content="Linux ARM64 - tar.gz" IsChecked="True" Margin="0,3,20,3" />
                    <CheckBox Name="chkTargetMacCli" Content="macOS CLI x64 + ARM64 - tar.gz" IsChecked="True" Margin="0,3,20,3" />
                    <CheckBox Name="chkTargetMacApp" Content="macOS app - zip" IsChecked="True" Margin="0,3,20,3" />
                </WrapPanel>
                <TextBlock Name="lblMacNote" Text="" Style="{StaticResource Hint}" />
            </StackPanel>
        </Border>

        <!-- Notes -->
        <StackPanel Grid.Row="4" Margin="0,0,0,10">
            <Grid Margin="0,0,0,4">
                <Grid.ColumnDefinitions>
                    <ColumnDefinition Width="*" />
                    <ColumnDefinition Width="Auto" />
                </Grid.ColumnDefinitions>
                <TextBlock Grid.Column="0" Text="Release notes (Markdown)" Style="{StaticResource Label}" />
                <Button Grid.Column="1" Name="btnGenerateNotes" Content="Regenerate from git" Style="{StaticResource LinkButton}" />
            </Grid>
            <TextBox Name="txtNotes" Height="120" TextWrapping="Wrap" AcceptsReturn="True"
                     VerticalScrollBarVisibility="Auto" FontFamily="Consolas" FontSize="11.5" />
        </StackPanel>

        <!-- Options -->
        <Border Grid.Row="5" BorderThickness="0,1,0,0" BorderBrush="#2a2722" Padding="0,10,0,8" Margin="0,0,0,8">
            <Grid>
                <Grid.ColumnDefinitions>
                    <ColumnDefinition Width="*" />
                    <ColumnDefinition Width="Auto" />
                </Grid.ColumnDefinitions>
                <WrapPanel Grid.Column="0" Orientation="Horizontal">
                    <CheckBox Name="chkDraft" Content="Draft" Margin="0,0,16,0"
                              ToolTip="Create the release as a draft; nothing is public until you publish it on GitHub" />
                    <CheckBox Name="chkPreRelease" Content="Pre-release" Margin="0,0,16,0" />
                    <CheckBox Name="chkBuildFirst" Content="Build before publishing" IsChecked="True" Margin="0,0,16,0" />
                    <CheckBox Name="chkRebuildUi" Content="Rebuild popover UI" IsChecked="True"
                              ToolTip="Run npm ci and npm run build for the embedded frontend" />
                </WrapPanel>
                <TextBlock Grid.Column="1" Name="lblProgress" Text="" FontSize="11" FontWeight="SemiBold"
                           Foreground="#7ad8a9" VerticalAlignment="Center" />
            </Grid>
        </Border>

        <!-- Log -->
        <Grid Grid.Row="6" Margin="0,0,0,12">
            <Grid.RowDefinitions>
                <RowDefinition Height="Auto" />
                <RowDefinition Height="*" />
                <RowDefinition Height="Auto" />
            </Grid.RowDefinitions>
            <Grid Grid.Row="0" Margin="0,0,0,4">
                <Grid.ColumnDefinitions>
                    <ColumnDefinition Width="*" />
                    <ColumnDefinition Width="Auto" />
                </Grid.ColumnDefinitions>
                <TextBlock Grid.Column="0" Text="Activity" Style="{StaticResource Label}" />
                <Button Grid.Column="1" Name="btnClearLog" Content="Clear" Style="{StaticResource LinkButton}" Foreground="#9a9184" />
            </Grid>
            <TextBox Grid.Row="1" Name="txtLog" Background="#100f0d" Foreground="#d8d2c8" BorderBrush="#2a2722"
                     IsReadOnly="True" AcceptsReturn="True" TextWrapping="Wrap"
                     VerticalScrollBarVisibility="Auto" FontFamily="Consolas" FontSize="11" Padding="8" />
            <ProgressBar Grid.Row="2" Name="pbUpload" Height="5" Margin="0,6,0,0" Minimum="0" Maximum="100" Value="0"
                         Visibility="Collapsed" />
        </Grid>

        <!-- Actions -->
        <Grid Grid.Row="7">
            <Grid.ColumnDefinitions>
                <ColumnDefinition Width="*" />
                <ColumnDefinition Width="Auto" />
                <ColumnDefinition Width="8" />
                <ColumnDefinition Width="Auto" />
            </Grid.ColumnDefinitions>
            <TextBlock Grid.Column="0" Name="lblDist" Text="" FontSize="10" Foreground="#9a9184"
                       VerticalAlignment="Center" TextTrimming="CharacterEllipsis" />
            <Button Grid.Column="1" Name="btnBuildOnly" Content="Build selected" Padding="16,8" />
            <Button Grid.Column="3" Name="btnPublish" Content="Build and publish" Padding="18,8"
                    Background="#4cc38a" Foreground="#161512" BorderThickness="0" FontWeight="SemiBold" />
        </Grid>
    </Grid>
</Window>
"@

$reader = New-Object System.Xml.XmlNodeReader($xaml)
$window = [System.Windows.Markup.XamlReader]::Load($reader)

try {
    $iconUri = New-Object System.Uri((Join-Path $rootDir 'cmd\freetokens\build\windows\icon.ico'))
    $window.Icon = [System.Windows.Media.Imaging.BitmapFrame]::Create($iconUri)
} catch { }

$txtTag = $window.FindName('txtTag')
$txtTitle = $window.FindName('txtTitle')
$txtToken = $window.FindName('txtToken')
$txtTokenPlain = $window.FindName('txtTokenPlain')
$btnToggleTokenVisibility = $window.FindName('btnToggleTokenVisibility')
$btnSaveToken = $window.FindName('btnSaveToken')
$btnForgetToken = $window.FindName('btnForgetToken')
$lblTokenStatus = $window.FindName('lblTokenStatus')
$btnGenerateNotes = $window.FindName('btnGenerateNotes')
$txtNotes = $window.FindName('txtNotes')
$txtLog = $window.FindName('txtLog')
$lblProgress = $window.FindName('lblProgress')
$pbUpload = $window.FindName('pbUpload')
$chkDraft = $window.FindName('chkDraft')
$chkPreRelease = $window.FindName('chkPreRelease')
$chkBuildFirst = $window.FindName('chkBuildFirst')
$chkRebuildUi = $window.FindName('chkRebuildUi')
$btnBuildOnly = $window.FindName('btnBuildOnly')
$btnPublish = $window.FindName('btnPublish')
$btnOpenReleases = $window.FindName('btnOpenReleases')
$btnOpenDist = $window.FindName('btnOpenDist')
$btnClearLog = $window.FindName('btnClearLog')
$lblPreflight = $window.FindName('lblPreflight')
$lblDist = $window.FindName('lblDist')
$lblMacNote = $window.FindName('lblMacNote')
$lblTargetSummary = $window.FindName('lblTargetSummary')

$chkTargetWin64 = $window.FindName('chkTargetWin64')
$chkTargetWinArm = $window.FindName('chkTargetWinArm')
$chkTargetLinux64 = $window.FindName('chkTargetLinux64')
$chkTargetLinuxArm = $window.FindName('chkTargetLinuxArm')
$chkTargetMacCli = $window.FindName('chkTargetMacCli')
$chkTargetMacApp = $window.FindName('chkTargetMacApp')
$btnSelectAllTargets = $window.FindName('btnSelectAllTargets')
$btnSelectWinTarget = $window.FindName('btnSelectWinTarget')
$btnClearTargets = $window.FindName('btnClearTargets')

$script:targetBoxes = @(
    [pscustomobject]@{ Box = $chkTargetWin64; Ids = @('windows-amd64') }
    [pscustomobject]@{ Box = $chkTargetWinArm; Ids = @('windows-arm64') }
    [pscustomobject]@{ Box = $chkTargetLinux64; Ids = @('linux-amd64') }
    [pscustomobject]@{ Box = $chkTargetLinuxArm; Ids = @('linux-arm64') }
    [pscustomobject]@{ Box = $chkTargetMacCli; Ids = @('darwin-amd64', 'darwin-arm64') }
    [pscustomobject]@{ Box = $chkTargetMacApp; Ids = @('macos-app') }
)
$script:busy = $false
$script:publishAfterBuild = $false

function Write-LogMessage([string] $message) {
    $line = "$message`r`n"
    if ($txtLog.Dispatcher.CheckAccess()) {
        $txtLog.AppendText($line)
        $txtLog.ScrollToEnd()
    } else {
        $txtLog.Dispatcher.Invoke([Action] { $txtLog.AppendText($line); $txtLog.ScrollToEnd() })
    }
}

function Get-SelectedTargets {
    $ids = New-Object System.Collections.Generic.List[string]
    foreach ($entry in $script:targetBoxes) {
        if ($entry.Box.IsChecked -eq $true) {
            foreach ($id in $entry.Ids) { if (-not $ids.Contains($id)) { $ids.Add($id) } }
        }
    }
    return $ids.ToArray()
}

function Set-TargetSelection {
    param([string[]] $Ids)
    foreach ($entry in $script:targetBoxes) {
        $on = $false
        foreach ($id in $entry.Ids) { if ($Ids -contains $id) { $on = $true } }
        $entry.Box.IsChecked = $on
    }
}

function Get-ActiveToken {
    if ($txtTokenPlain.Visibility -eq [System.Windows.Visibility]::Visible) {
        return $txtTokenPlain.Text.Trim()
    }
    return $txtToken.Password.Trim()
}

function Set-ActiveToken([string] $value) {
    $txtToken.Password = $value
    $txtTokenPlain.Text = $value
}

function Set-Busy([bool] $on) {
    $script:busy = $on
    $btnBuildOnly.IsEnabled = -not $on
    $btnPublish.IsEnabled = -not $on
    foreach ($entry in $script:targetBoxes) { $entry.Box.IsEnabled = -not $on }
    $btnSelectAllTargets.IsEnabled = -not $on
    $btnSelectWinTarget.IsEnabled = -not $on
    $btnClearTargets.IsEnabled = -not $on
    $txtTag.IsEnabled = -not $on
    $txtTitle.IsEnabled = -not $on
    $chkDraft.IsEnabled = -not $on
    $chkPreRelease.IsEnabled = -not $on
    $chkBuildFirst.IsEnabled = -not $on
    $chkRebuildUi.IsEnabled = -not $on
    $btnGenerateNotes.IsEnabled = -not $on
    Confirm-MacAppAvailable
}

function Set-Progress([string] $text, $brush) {
    $lblProgress.Text = $text
    if ($brush) { $lblProgress.Foreground = $brush }
}

function Get-CleanVersion([string] $tag) {
    return ($tag.Trim() -replace '^[vV]', '')
}

function Test-Tag([string] $tag) {
    return ($tag.Trim() -match '^v\d+(\.\d+)*([-.][0-9A-Za-z.\-]+)?$')
}

function Confirm-MacAppAvailable {
    $clean = Get-CleanVersion $txtTag.Text
    $zip = Join-Path $appDir "FreeTokens-$clean-macOS.zip"
    $available = $isMacHost -or (Test-Path -LiteralPath $zip)
    $chkTargetMacApp.IsEnabled = (-not $script:busy) -and $available
    if ($available) {
        if ($isMacHost) {
            $lblMacNote.Text = 'The macOS app is built here with Swift and signed ad hoc, then attached as FreeTokens-<version>-macOS.zip.'
        } else {
            $lblMacNote.Text = "The macOS app is not compiled on this machine (Swift and codesign need macOS). dist-app\FreeTokens-$clean-macOS.zip will be uploaded instead."
        }
    } else {
        $chkTargetMacApp.IsChecked = $false
        $lblMacNote.Text = "No macOS app zip for $clean. Compile it on a Mac with scripts\build-macos-app.sh, or grab it from CI, to attach it here."
    }
}

function Update-TargetSummary {
    $ids = Get-SelectedTargets
    $lblTargetSummary.Text = "$($ids.Count) selected"
}

function Get-GeneratedNotes([string] $tag) {
    $clean = Get-CleanVersion $tag
    $previous = $null
    $last = & git -C $rootDir describe --tags --abbrev=0 2>$null
    if ($LASTEXITCODE -eq 0 -and $last) { $previous = $last.Trim() }

    $logArgs = @('-C', $rootDir, 'log', '--no-merges', '--pretty=format:%h %s')
    if ($previous) { $logArgs += "$previous..HEAD" } else { $logArgs += @('-n', '100') }
    $commits = @(& git @logArgs 2>$null)

    $features = New-Object System.Collections.Generic.List[string]
    $fixes = New-Object System.Collections.Generic.List[string]
    $other = New-Object System.Collections.Generic.List[string]
    foreach ($line in $commits) {
        if (-not $line) { continue }
        $subject = $line
        if ($line -match '^[0-9a-fA-F]{6,}\s+(.+)$') { $subject = $matches[1] }
        if ($subject -match '^(feat|feature)(\([^)]+\))?!?:\s*(.+)$') {
            $features.Add("- $($matches[3].Trim())")
        } elseif ($subject -match '^(fix|bug)(\([^)]+\))?!?:\s*(.+)$') {
            $fixes.Add("- $($matches[3].Trim())")
        } elseif ($subject -match '^(docs|test|tests|ci|chore|build|style)(\([^)]+\))?!?:\s*(.+)$') {
            continue
        } elseif ($subject -match '^(refactor|perf|perfomance)(\([^)]+\))?!?:\s*(.+)$') {
            $other.Add("- $($matches[3].Trim())")
        } else {
            $other.Add("- $subject.Trim()")
        }
    }

    $selected = Get-SelectedTargets
    $md = New-Object System.Text.StringBuilder
    [void]$md.AppendLine("## FreeTokens $tag")
    [void]$md.AppendLine('')

    $downloads = New-Object System.Collections.Generic.List[string]
    if ($selected -contains 'windows-amd64') {
        $downloads.Add('- Windows x64: `freetokens_' + $clean + '_windows_amd64.zip`, or `FreeTokens-' + $clean + '-Setup-x64.exe`')
    }
    if ($selected -contains 'windows-arm64') {
        $downloads.Add('- Windows ARM64: `freetokens_' + $clean + '_windows_arm64.zip`')
    }
    if ($selected -contains 'linux-amd64') {
        $downloads.Add('- Linux x64: `freetokens_' + $clean + '_linux_amd64.tar.gz`')
    }
    if ($selected -contains 'linux-arm64') {
        $downloads.Add('- Linux ARM64: `freetokens_' + $clean + '_linux_arm64.tar.gz`')
    }
    if ($selected -contains 'macos-app') {
        $downloads.Add('- macOS: `FreeTokens-' + $clean + '-macOS.zip` (menu bar app, Apple silicon and Intel)')
    }
    if ($selected -contains 'darwin-amd64' -or $selected -contains 'darwin-arm64') {
        $downloads.Add('- macOS CLI: `freetokens_' + $clean + '_darwin_arm64.tar.gz` and `freetokens_' + $clean + '_darwin_amd64.tar.gz`')
    }
    if ($downloads.Count -gt 0) {
        [void]$md.AppendLine('### Downloads')
        foreach ($item in $downloads) { [void]$md.AppendLine($item) }
        [void]$md.AppendLine('')
    }

    if ($features.Count -gt 0) {
        [void]$md.AppendLine('### Features')
        foreach ($item in $features) { [void]$md.AppendLine($item) }
        [void]$md.AppendLine('')
    }
    if ($fixes.Count -gt 0) {
        [void]$md.AppendLine('### Fixes')
        foreach ($item in $fixes) { [void]$md.AppendLine($item) }
        [void]$md.AppendLine('')
    }
    if ($other.Count -gt 0) {
        [void]$md.AppendLine('### Other changes')
        foreach ($item in $other) { [void]$md.AppendLine($item) }
        [void]$md.AppendLine('')
    }

    if ($previous) {
        [void]$md.AppendLine("**Full changelog:** $repoUrl/compare/$previous...$tag")
    } else {
        [void]$md.AppendLine("Built from $((& git -C $rootDir rev-parse --short HEAD 2>$null)) with no previous tag to compare against.")
    }
    [void]$md.AppendLine('')
    [void]$md.AppendLine('Verify downloads against `checksums.txt`. The in-app updater checks it automatically and only runs when you turn it on (Settings > Updates).')
    return $md.ToString()
}

function Invoke-Worker {
    param(
        [scriptblock] $Worker,
        [object[]] $Arguments,
        [string] $BusyText,
        [scriptblock] $OnDone
    )
    Set-Busy $true
    if ($BusyText) { Set-Progress $BusyText $brandBrush }

    $queue = New-Object 'System.Collections.Concurrent.ConcurrentQueue[string]'
    $resultQueue = New-Object 'System.Collections.Concurrent.ConcurrentQueue[object]'
    $ps = [PowerShell]::Create()
    [void]$ps.AddScript($Worker.ToString())
    foreach ($arg in $Arguments) { [void]$ps.AddArgument($arg) }
    [void]$ps.AddArgument($queue)
    [void]$ps.AddArgument($resultQueue)
    $handle = $ps.BeginInvoke()

    $timer = New-Object System.Windows.Threading.DispatcherTimer
    $timer.Interval = [TimeSpan]::FromMilliseconds(120)
    $handler = {
        $line = $null
        while ($queue.TryDequeue([ref]$line)) {
            if ($line -like 'PROGRESS:*') { Show-UploadProgress $line } else { Write-LogMessage $line }
        }
        if (-not $handle.IsCompleted) { return }
        $timer.Stop()
        $rest = $null
        while ($queue.TryDequeue([ref]$rest)) {
            if ($rest -notlike 'PROGRESS:*') { Write-LogMessage $rest }
        }
        try { $ps.EndInvoke($handle) | Out-Null } catch { }
        $ps.Dispose()
        $result = $null
        if (-not $resultQueue.TryDequeue([ref]$result)) {
            $result = @{ Success = $false; Message = 'the worker returned no result' }
        }
        Set-Busy $false
        if ($OnDone) { & $OnDone $result }
    }
    $timer.Add_Tick($handler.GetNewClosure())
    $timer.Start()
}

function Show-UploadProgress([string] $line) {
    $parts = $line -split ':', 5
    if ($parts.Count -lt 4) { return }
    $pct = 0
    [void][int]::TryParse($parts[1], [ref]$pct)
    $pbUpload.Visibility = [System.Windows.Visibility]::Visible
    $pbUpload.Value = $pct
    $name = ''
    if ($parts.Count -ge 5) { $name = $parts[4] }
    Set-Progress "$name $pct%  ($($parts[2]) / $($parts[3]) MB)" $brandBrush
}

# Worker: run BuildTargets.ps1 and stream its output into the activity log.
$buildWorker = {
    param($root, $script, $version, $targets, $skipFrontend, $logQueue, $resultQueue)

    function Q([string] $value) {
        if ($value -match '[\s"]') { return '"' + $value + '"' }
        return $value
    }

    try {
        $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Q $script),
            '-Version', (Q $version), '-Targets', (Q ($targets -join ',')))
        if ($skipFrontend) { $arguments += '-SkipFrontend' }

        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = 'powershell.exe'
        $psi.Arguments = ($arguments -join ' ')
        $psi.WorkingDirectory = $root
        $psi.UseShellExecute = $false
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError = $true
        $psi.CreateNoWindow = $true

        $proc = New-Object System.Diagnostics.Process
        $proc.StartInfo = $psi
        [void]$proc.Start()
        # Drain stderr in parallel so a chatty failure cannot fill the pipe and deadlock.
        $stderr = $proc.StandardError.ReadToEndAsync()
        while (-not $proc.StandardOutput.EndOfStream) {
            $line = $proc.StandardOutput.ReadLine()
            if ($line) { $logQueue.Enqueue($line) }
        }
        $proc.WaitForExit()
        $errors = $stderr.Result
        if ($errors) {
            foreach ($line in ($errors -split "`r?`n")) { if ($line) { $logQueue.Enqueue($line) } }
        }
        if ($proc.ExitCode -eq 0) {
            $resultQueue.Enqueue(@{ Success = $true })
        } else {
            $resultQueue.Enqueue(@{ Success = $false; Message = "BuildTargets.ps1 exited with code $($proc.ExitCode)" })
        }
    } catch {
        $resultQueue.Enqueue(@{ Success = $false; Message = $_.Exception.Message })
    }
}

# Worker: create or reuse the release, then upload every file. checksums.txt is passed last.
$publishWorker = {
    param($repo, $tag, $title, $body, $token, $draft, $prerelease, $targetCommitish, $files, $logQueue, $resultQueue)

    function Log([string] $message) { $logQueue.Enqueue($message) }

    try {
        $http = New-Object System.Net.Http.HttpClient
        $http.Timeout = [TimeSpan]::FromMinutes(30)
        $http.DefaultRequestHeaders.Add('User-Agent', 'FreeTokens-ReleasePublisher/1.0')
        $http.DefaultRequestHeaders.Add('Authorization', "Bearer $token")
        $http.DefaultRequestHeaders.Add('Accept', 'application/vnd.github+json')

        $payload = @{
            tag_name = $tag
            name = $title
            body = $body
            draft = [bool]$draft
            prerelease = [bool]$prerelease
            target_commitish = $targetCommitish
        } | ConvertTo-Json

        Log "[1/3] Creating release $tag on $repo..."
        $content = [System.Net.Http.StringContent]::new($payload, [System.Text.Encoding]::UTF8, 'application/json')
        $response = $http.PostAsync("https://api.github.com/repos/$repo/releases", $content).GetAwaiter().GetResult()
        $release = $null

        if ($response.IsSuccessStatusCode) {
            $release = ($response.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json)
            Log "[+] Created release $($release.tag_name) (id $($release.id))."
        } else {
            $status = [int]$response.StatusCode
            $detail = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
            if ($status -eq 422) {
                Log "[*] $tag already exists. Looking for its release..."
                $existing = $http.GetAsync("https://api.github.com/repos/$repo/releases/tags/$tag").GetAwaiter().GetResult()
                if (-not $existing.IsSuccessStatusCode) {
                    Log "[ERROR] GitHub rejected the release and no release exists for $tag"
                    Log $detail
                    $resultQueue.Enqueue(@{ Success = $false; Message = "GitHub API ${status}: $detail" })
                    return
                }
                $release = ($existing.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json)
                Log "[*] Reusing release $($release.name) (id $($release.id)); its assets are refreshed below."
                $patch = @{
                    name = $title
                    body = $body
                    draft = [bool]$draft
                    prerelease = [bool]$prerelease
                } | ConvertTo-Json
                $patchContent = [System.Net.Http.StringContent]::new($patch, [System.Text.Encoding]::UTF8, 'application/json')
                $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Patch,
                    "https://api.github.com/repos/$repo/releases/$($release.id)")
                $request.Content = $patchContent
                $patched = $http.SendAsync($request).GetAwaiter().GetResult()
                if ($patched.IsSuccessStatusCode) {
                    Log '[*] Release title, notes and flags updated.'
                } else {
                    Log "[WARN] Could not update the existing release ($([int]$patched.StatusCode)); uploads continue."
                }
            } else {
                Log "[ERROR] GitHub rejected the release ($status)"
                Log $detail
                $resultQueue.Enqueue(@{ Success = $false; Message = "GitHub API ${status}: $detail" })
                return
            }
        }

        $uploadTemplate = $release.upload_url
        $htmlUrl = $release.html_url
        $existingAssets = @()
        if ($release.assets) { $existingAssets = $release.assets }

        Log "[2/3] Uploading $($files.Count) file(s)..."
        $index = 0
        $totalMb = 0
        foreach ($path in $files) {
            if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
                $resultQueue.Enqueue(@{ Success = $false; Message = "missing file: $path" })
                return
            }
            $index++
            $file = Get-Item -LiteralPath $path
            $name = $file.Name
            $sizeMb = [Math]::Round($file.Length / 1MB, 2)
            $totalMb += $sizeMb
            $prefix = "[$index/$($files.Count)] $name"

            $previous = $existingAssets | Where-Object { $_.name -eq $name } | Select-Object -First 1
            if ($previous) {
                Log "[*] $name is already attached (id $($previous.id)); replacing it."
                $deleted = $http.DeleteAsync("https://api.github.com/repos/$repo/releases/assets/$($previous.id)").GetAwaiter().GetResult()
                if (-not $deleted.IsSuccessStatusCode) {
                    Log "[WARN] Could not delete the old $name ($([int]$deleted.StatusCode)); the upload may fail."
                }
            }

            Log "[*] $prefix ($sizeMb MB)"
            $url = ($uploadTemplate -replace '\{\?name,label\}', ('?name=' + [Uri]::EscapeDataString($name)))
            $stream = [System.IO.File]::OpenRead($file.FullName)
            $progress = [FreeTokensPublisher.UploadProgressStream]::new($stream, $file.Length, $logQueue, $name)
            try {
                $streamContent = [System.Net.Http.StreamContent]::new($progress, 65536)
                $streamContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse('application/octet-stream')
                $streamContent.Headers.ContentLength = $file.Length
                $upload = $http.PostAsync($url, $streamContent).GetAwaiter().GetResult()
                if (-not $upload.IsSuccessStatusCode) {
                    $detail = $upload.Content.ReadAsStringAsync().GetAwaiter().GetResult()
                    Log "[ERROR] Upload failed for $name ($([int]$upload.StatusCode))"
                    Log $detail
                    $resultQueue.Enqueue(@{ Success = $false; Message = "upload failed for $($name): $detail" })
                    return
                }
                Log "[+] Uploaded $name"
            } finally {
                $progress.Dispose()
            }
        }

        $releaseState = 'published'
        if ($draft) { $releaseState = 'draft' }

        Log ''
        Log '=========================================================='
        Log "Release $tag is $releaseState with $($files.Count) file(s) ($([Math]::Round($totalMb, 2)) MB)."
        Log "URL: $htmlUrl"
        Log '=========================================================='
        $resultQueue.Enqueue(@{ Success = $true; Url = $htmlUrl; Tag = $tag; Count = $files.Count; Size = [Math]::Round($totalMb, 2); Draft = [bool]$draft })
    } catch {
        Log "[EXCEPTION] $($_.Exception.Message)"
        $resultQueue.Enqueue(@{ Success = $false; Message = $_.Exception.Message })
    }
}

function Start-Build([switch] $ThenPublish) {
    if ($script:busy) { return }
    $tag = $txtTag.Text.Trim()
    if (-not (Test-Tag $tag)) {
        [void][System.Windows.MessageBox]::Show("Release tag must look like v1.2.3 (it becomes the git tag).", 'Check the tag',
            [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Warning)
        return
    }
    $targets = Get-SelectedTargets
    if ($targets.Count -eq 0) {
        [void][System.Windows.MessageBox]::Show('Select at least one target platform.', 'No target selected',
            [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Warning)
        return
    }

    $clean = Get-CleanVersion $tag
    $skipFrontend = ($chkRebuildUi.IsChecked -ne $true)
    $txtLog.Clear()
    $pbUpload.Visibility = [System.Windows.Visibility]::Collapsed
    $script:publishAfterBuild = [bool]$ThenPublish

    Write-LogMessage "Building FreeTokens $clean for: $($targets -join ', ')"
    if ($skipFrontend) { Write-LogMessage 'Reusing the existing popover build (npm was not run).' }

    Invoke-Worker -Worker $buildWorker -Arguments @($rootDir, $buildScript, $clean, $targets, $skipFrontend) -BusyText "Building $clean..." -OnDone {
        param($result)
        if ($result.Success) {
            Set-Progress 'Build succeeded' $okBrush
            Write-LogMessage '[SUCCESS] Build finished.'
            $got = @()
            foreach ($target in (Get-SelectedTargets)) {
                foreach ($name in (Get-FreeTokensAssetNames -Version (Get-CleanVersion $txtTag.Text) -Target $target)) {
                    if (Test-Path -LiteralPath (Join-Path $distDir $name)) { $got += $name }
                }
            }
            Write-LogMessage "Files ready in dist: $($got -join ', ')"
            if ($script:publishAfterBuild) { Start-Publish }
            $script:publishAfterBuild = $false
        } else {
            Set-Progress 'Build failed' $dangerBrush
            Write-LogMessage "[ERROR] $($result.Message)"
            [void][System.Windows.MessageBox]::Show("Build failed: $($result.Message)`n`nThe activity log has the compiler output.", 'Build failed',
                [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Error)
            $script:publishAfterBuild = $false
        }
    }
}

function Open-DistFolder {
    if (-not (Test-Path -LiteralPath $distDir)) { New-Item -ItemType Directory -Path $distDir -Force | Out-Null }
    [System.Diagnostics.Process]::Start('explorer.exe', $distDir)
}

function Open-Url([string] $url) {
    [System.Diagnostics.Process]::Start([System.Diagnostics.ProcessStartInfo]@{ FileName = $url; UseShellExecute = $true }) | Out-Null
}

function Start-Publish {
    if ($script:busy) { return }
    $tag = $txtTag.Text.Trim()
    $title = $txtTitle.Text.Trim()
    $token = Get-ActiveToken
    $clean = Get-CleanVersion $tag

    if (-not (Test-Tag $tag)) {
        [void][System.Windows.MessageBox]::Show('Release tag must look like v1.2.3.', 'Check the tag',
            [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Warning)
        return
    }
    if (-not $title) {
        [void][System.Windows.MessageBox]::Show('Give the release a title.', 'Title required',
            [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Warning)
        return
    }
    if (-not $token) {
        [void][System.Windows.MessageBox]::Show("Publishing needs a GitHub token with the repo scope for $repoSlug.", 'Token required',
            [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Warning)
        return
    }

    $targets = Get-SelectedTargets
    $names = New-Object System.Collections.Generic.List[string]
    foreach ($target in $targets) {
        foreach ($name in (Get-FreeTokensAssetNames -Version $clean -Target $target)) {
            if (-not $names.Contains($name)) { $names.Add($name) }
        }
    }
    if ($names.Count -eq 0) {
        [void][System.Windows.MessageBox]::Show('Select at least one target platform.', 'No target selected',
            [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Warning)
        return
    }

    $missing = @()
    foreach ($name in $names) {
        if (-not (Test-Path -LiteralPath (Join-Path $distDir $name) -PathType Leaf)) { $missing += $name }
    }
    if ($missing.Count -gt 0) {
        Write-LogMessage '[!] Missing:'
        foreach ($name in $missing) { Write-LogMessage "    $name" }
        [void][System.Windows.MessageBox]::Show("These files are not in dist:`n`n$($missing -join "`n")`n`nBuild them first (leave 'Build before publishing' checked).", 'Nothing to publish',
            [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Warning)
        return
    }

    # checksums.txt must list exactly what this release uploads; the updater verifies against it.
    $checksumFile = Write-FreeTokensChecksums -OutDir $distDir -Names $names.ToArray()
    if (-not $checksumFile) { return }
    $files = @()
    foreach ($name in $names) { $files += (Join-Path $distDir $name) }
    $files += $checksumFile

    # Catch a mislabelled build before it reaches users, when the host can run the binary.
    $probe = Join-Path (Join-Path $distDir '.stage') 'windows-amd64\freetokens.exe'
    if (($names -contains "freetokens_${clean}_windows_amd64.zip") -and (Test-Path -LiteralPath $probe)) {
        try {
            $reported = (& $probe version 2>$null) -join ' '
            if ($reported -and $reported -notmatch [regex]::Escape($clean)) {
                Write-LogMessage "[!] $probe reports '$reported', which does not contain $clean"
            } else {
                Write-LogMessage "[*] Built binary reports: $reported"
            }
        } catch { }
    }

    if (-not $txtNotes.Text.Trim()) {
        $answer = [System.Windows.MessageBox]::Show('Release notes are empty. Publish anyway?', 'Empty notes',
            [System.Windows.MessageBoxButton]::YesNo, [System.Windows.MessageBoxImage]::Question)
        if ($answer -ne [System.Windows.MessageBoxResult]::Yes) { return }
    }

    $commit = (& git -C $rootDir rev-parse HEAD 2>$null)
    if (-not $commit) { $commit = '' }
    $branch = (& git -C $rootDir rev-parse --abbrev-ref HEAD 2>$null)
    if ($branch -and $branch.Trim() -ne 'main') {
        Write-LogMessage "[!] HEAD is on '$($branch.Trim())', not main. The release tag will point at this commit."
    }
    $dirty = (& git -C $rootDir status --porcelain 2>$null)
    if ($dirty) { Write-LogMessage '[!] Working tree has uncommitted changes; they are not part of the tagged source.' }

    Write-LogMessage "[*] Uploading to $repoSlug as $(if ($chkDraft.IsChecked -eq $true) { 'a draft' } else { 'a public release' })."
    $pbUpload.Value = 0
    $pbUpload.Visibility = [System.Windows.Visibility]::Visible

    Invoke-Worker -Worker $publishWorker -Arguments @(
        $repoSlug, $tag, $title, $txtNotes.Text, $token,
        ($chkDraft.IsChecked -eq $true), ($chkPreRelease.IsChecked -eq $true),
        $commit.Trim(), $files
    ) -BusyText "Publishing $tag..." -OnDone {
        param($result)
        if ($result.Success) {
            $pbUpload.Value = 100
            Set-Progress "Published $($result.Count) file(s)" $okBrush
            if ($result.Draft) {
                Set-Progress 'Draft created' $warnBrush
                Write-LogMessage '[SUCCESS] Draft release created. Publish it on GitHub when the notes are ready.'
            }
            $answer = [System.Windows.MessageBox]::Show(
                "Release $($result.Tag) is on GitHub with $($result.Count) file(s) ($($result.Size) MB).`n`nOpen it in your browser?",
                'Release uploaded', [System.Windows.MessageBoxButton]::YesNo, [System.Windows.MessageBoxImage]::Information)
            if ($answer -eq [System.Windows.MessageBoxResult]::Yes) { Open-Url $result.Url }
        } else {
            Set-Progress 'Publish failed' $dangerBrush
            Write-LogMessage "[ERROR] $($result.Message)"
            [void][System.Windows.MessageBox]::Show("Publishing failed: $($result.Message)`n`nThe activity log has GitHub's response.", 'Publish failed',
                [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Error)
        }
    }
}

# --- Event wiring -------------------------------------------------------------------------------

$txtTag.Add_TextChanged({
    Update-TargetSummary
    if (-not $script:busy) { Confirm-MacAppAvailable }
})
foreach ($entry in $script:targetBoxes) {
    $entry.Box.Add_Click({ Update-TargetSummary })
}

$btnSelectAllTargets.Add_Click({
    Set-TargetSelection -Ids @('windows-amd64', 'windows-arm64', 'linux-amd64', 'linux-arm64', 'darwin-amd64', 'darwin-arm64', 'macos-app')
    Confirm-MacAppAvailable
    Update-TargetSummary
})
$btnSelectWinTarget.Add_Click({
    Set-TargetSelection -Ids @('windows-amd64', 'windows-arm64')
    Update-TargetSummary
})
$btnClearTargets.Add_Click({
    Set-TargetSelection -Ids @()
    Update-TargetSummary
})

$btnToggleTokenVisibility.Add_Click({
    if ($txtTokenPlain.Visibility -eq [System.Windows.Visibility]::Visible) {
        $txtToken.Password = $txtTokenPlain.Text
        $txtTokenPlain.Visibility = [System.Windows.Visibility]::Collapsed
        $txtToken.Visibility = [System.Windows.Visibility]::Visible
        $btnToggleTokenVisibility.Content = 'Show'
    } else {
        $txtTokenPlain.Text = $txtToken.Password
        $txtToken.Visibility = [System.Windows.Visibility]::Collapsed
        $txtTokenPlain.Visibility = [System.Windows.Visibility]::Visible
        $btnToggleTokenVisibility.Content = 'Hide'
    }
})

$btnSaveToken.Add_Click({
    $value = Get-ActiveToken
    if (-not $value) {
        $lblTokenStatus.Text = 'Enter a token first'
        $lblTokenStatus.Foreground = $warnBrush
        return
    }
    try {
        [System.IO.File]::WriteAllText($tokenFile, $value, (New-Object System.Text.UTF8Encoding($false)))
        $lblTokenStatus.Text = 'Checking with GitHub...'
        $lblTokenStatus.Foreground = $mutedBrush
        Write-LogMessage '[*] Token saved. Verifying it against api.github.com...'
        Invoke-Worker -Worker {
            param($token, $logQueue, $resultQueue)
            try {
                $http = New-Object System.Net.Http.HttpClient
                $http.Timeout = [TimeSpan]::FromSeconds(10)
                $http.DefaultRequestHeaders.Add('User-Agent', 'FreeTokens-ReleasePublisher/1.0')
                $http.DefaultRequestHeaders.Add('Authorization', "Bearer $token")
                $http.DefaultRequestHeaders.Add('Accept', 'application/vnd.github+json')
                $response = $http.GetAsync('https://api.github.com/user').GetAwaiter().GetResult()
                if ($response.IsSuccessStatusCode) {
                    $user = ($response.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json)
                    $resultQueue.Enqueue(@{ Success = $true; User = $user.login })
                } else {
                    $resultQueue.Enqueue(@{ Success = $false; Message = "GitHub answered $([int]$response.StatusCode). Check the token's repo scope." })
                }
            } catch {
                $resultQueue.Enqueue(@{ Success = $false; Message = "Could not reach GitHub: $($_.Exception.Message)" })
            }
        } -Arguments @($value) -BusyText $null -OnDone {
            param($result)
            if ($result.Success) {
                $lblTokenStatus.Text = "Verified (@$($result.User))"
                $lblTokenStatus.Foreground = $okBrush
                Write-LogMessage "[+] Token works for @$($result.User)."
            } else {
                $lblTokenStatus.Text = 'Not verified'
                $lblTokenStatus.Foreground = $warnBrush
                Write-LogMessage "[!] $($result.Message)"
            }
        }
    } catch {
        $lblTokenStatus.Text = "Save failed"
        $lblTokenStatus.Foreground = $dangerBrush
        Write-LogMessage "[!] Could not save the token: $($_.Exception.Message)"
    }
})

$btnForgetToken.Add_Click({
    if (Test-Path -LiteralPath $tokenFile) { Remove-Item -LiteralPath $tokenFile -Force -ErrorAction SilentlyContinue }
    Set-ActiveToken ''
    $lblTokenStatus.Text = 'Cleared'
    $lblTokenStatus.Foreground = $mutedBrush
    Write-LogMessage '[-] Saved token deleted.'
})

$btnGenerateNotes.Add_Click({
    try {
        $txtNotes.Text = Get-GeneratedNotes $txtTag.Text.Trim()
        Write-LogMessage '[*] Notes rebuilt from git history.'
    } catch {
        Write-LogMessage "[!] Could not generate notes: $($_.Exception.Message)"
    }
})

$btnClearLog.Add_Click({ $txtLog.Clear() })
$btnOpenDist.Add_Click({ Open-DistFolder })
$btnOpenReleases.Add_Click({ Open-Url "$repoUrl/releases" })
$btnBuildOnly.Add_Click({ Start-Build })
$btnPublish.Add_Click({
    if ($chkBuildFirst.IsChecked -eq $true) { Start-Build -ThenPublish } else { Start-Publish }
})

# --- Startup ------------------------------------------------------------------------------------

$lblPreflight.Text = $preflight
$lblDist.Text = "Output: $distDir"
$lblPreflight.Foreground = $mutedBrush
if ($preflight -match 'missing') { $lblPreflight.Foreground = $warnBrush }

if ($savedToken) {
    Set-ActiveToken $savedToken
    $lblTokenStatus.Text = 'Saved'
    $lblTokenStatus.Foreground = $mutedBrush
}

Update-TargetSummary
Confirm-MacAppAvailable

Write-LogMessage "FreeTokens release publisher - $repoUrl"
Write-LogMessage $preflight
Write-LogMessage ''
if (-not $goCmd) { Write-LogMessage '[!] Go is not on PATH; builds will fail until it is installed.' }
if (-not $nodeCmd) { Write-LogMessage '[!] Node is not on PATH; the popover frontend cannot be rebuilt.' }
if (-not $isccPath) { Write-LogMessage '[!] Inno Setup 6 not found; the Windows x64 zip still builds but Setup.exe will be skipped.' }
if (-not $savedToken) { Write-LogMessage '[*] No saved token. Paste a GitHub PAT with repo scope (Settings > Developer settings > Tokens).' }

try {
    $txtNotes.Text = Get-GeneratedNotes $txtTag.Text.Trim()
} catch {
    Write-LogMessage "[!] Could not draft notes from git: $($_.Exception.Message)"
}

[void]$window.ShowDialog()
