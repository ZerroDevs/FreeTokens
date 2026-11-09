; Inno Setup 6 script for the FreeTokens Windows installer.
;
; BuildTargets.ps1 compiles this through a generated wrapper that defines the paths and version:
;   ISCC.exe <dist>\.stage\freetokens-installer.iss
;
; To compile it by hand after a local build, from the repository root:
;   "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" scripts\release\freetokens.iss
;
; Installs per user (no UAC prompt) into %LOCALAPPDATA%\Programs\FreeTokens, which matches the
; HKCU Run value that `freetokens autostart on` and the in-app toggle write.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef SourceDir
  #define SourceDir "..\..\dist\.stage\windows-amd64"
#endif
#ifndef OutputDir
  #define OutputDir "..\..\dist"
#endif
#ifndef OutputBase
  #define OutputBase "FreeTokens-" + AppVersion + "-Setup"
#endif
#ifndef IconFile
  #define IconFile "..\..\cmd\freetokens\build\windows\icon.ico"
#endif
#ifndef VersionInfoVersion
  #define VersionInfoVersion "0.0.0.0"
#endif

[Setup]
AppId={{7C4B1E52-9A3D-4F0B-8E61-2D5A9C0B7F31}
AppName=FreeTokens
AppVersion={#AppVersion}
AppVerName=FreeTokens {#AppVersion}
AppPublisher=FreeTokens contributors
AppPublisherURL=https://github.com/tverma101/FreeTokens
AppSupportURL=https://github.com/tverma101/FreeTokens/issues
AppUpdatesURL=https://github.com/tverma101/FreeTokens/releases
DefaultDirName={autopf}\FreeTokens
DefaultGroupName=FreeTokens
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir={#OutputDir}
OutputBaseFilename={#OutputBase}
SetupIconFile={#IconFile}
UninstallDisplayIcon={app}\freetokensw.exe
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
; The tray app keeps the executables open, so let Setup offer to close it before replacing them.
CloseApplications=yes
RestartApplications=no
MinVersion=10.0
VersionInfoVersion={#VersionInfoVersion}
VersionInfoProductVersion={#VersionInfoVersion}
VersionInfoProductName=FreeTokens
VersionInfoCompany=FreeTokens contributors
VersionInfoDescription=FreeTokens installer

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "startup"; Description: "Start FreeTokens when I sign in"; GroupDescription: "Startup:"; Flags: unchecked
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: unchecked

[Files]
Source: "{#SourceDir}\freetokens.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\freetokensw.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\LICENSE"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\NOTICE"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\FreeTokens"; Filename: "{app}\freetokensw.exe"
Name: "{group}\FreeTokens status"; Filename: "{app}\freetokens.exe"; Parameters: "status"; Flags: runminimized
Name: "{group}\Uninstall FreeTokens"; Filename: "{uninstallexe}"
Name: "{autodesktop}\FreeTokens"; Filename: "{app}\freetokensw.exe"; Tasks: desktopicon

[Registry]
; Same value name the app uses, so the in-app toggle and this task never fight.
; The first entry only deletes it at uninstall time, leaving a shortcut pointing at a deleted exe.
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: none; ValueName: "FreeTokens"; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "FreeTokens"; ValueData: """{app}\freetokensw.exe"" gui"; Tasks: startup; Flags: uninsdeletevalue

[Run]
Filename: "{app}\freetokensw.exe"; Description: "Launch FreeTokens"; Flags: nowait postinstall skipifsilent
