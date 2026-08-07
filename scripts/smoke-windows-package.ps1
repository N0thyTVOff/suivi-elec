param(
  [string]$ReleaseDirectory = (Join-Path $PSScriptRoot '..\release')
)

$ErrorActionPreference = 'Stop'
$packageVersion = (Get-Content -Raw (Join-Path $PSScriptRoot '..\package.json') | ConvertFrom-Json).version
$resolvedRelease = [System.IO.Path]::GetFullPath($ReleaseDirectory)
$setupPath = Join-Path $resolvedRelease "Wattelier-Setup-v$packageVersion-x64.exe"
$portableSource = Join-Path $resolvedRelease "Wattelier-Portable-v$packageVersion-x64.exe"
$smokeRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("wattelier-package-smoke-" + [guid]::NewGuid().ToString('N'))
$resolvedSmokeRoot = [System.IO.Path]::GetFullPath($smokeRoot)
$resolvedTempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$installedDirectory = Join-Path $resolvedSmokeRoot 'installed'
$testAppData = Join-Path $resolvedSmokeRoot 'appdata'
$testUserData = Join-Path $resolvedSmokeRoot 'user-data'
$portableDirectory = Join-Path $resolvedSmokeRoot 'portable'
$portablePath = Join-Path $portableDirectory "Wattelier-Portable-v$packageVersion-x64.exe"
$desktopShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Wattelier.lnk'
$startMenuShortcut = Join-Path ([Environment]::GetFolderPath('Programs')) 'Wattelier.lnk'
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$installedPort = Get-Random -Minimum 45100 -Maximum 47999
$portablePort = Get-Random -Minimum 48000 -Maximum 50999
$originalAppData = $env:APPDATA
$originalPort = $env:PORT
$originalSkipImport = $env:WATTELIER_SKIP_LEGACY_IMPORT
$installedProcess = $null
$portableProcess = $null

if (-not $resolvedSmokeRoot.StartsWith($resolvedTempRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
    ([System.IO.Path]::GetFileName($resolvedSmokeRoot) -notlike 'wattelier-package-smoke-*')) {
  throw 'Le dossier temporaire du smoke test est invalide.'
}
if (-not (Test-Path -LiteralPath $setupPath) -or -not (Test-Path -LiteralPath $portableSource)) {
  throw 'Les deux exécutables Wattelier sont requis avant le smoke test.'
}
if ((Test-Path -LiteralPath $desktopShortcut) -or (Test-Path -LiteralPath $startMenuShortcut)) {
  throw 'Un raccourci Wattelier existe déjà : le smoke test refuse de le remplacer.'
}

$previousRunValue = $null
try {
  $previousRunValue = (Get-ItemProperty -LiteralPath $runKey -Name Wattelier -ErrorAction SilentlyContinue).Wattelier
} catch {
  $previousRunValue = $null
}
if ($previousRunValue) {
  throw 'Un démarrage automatique Wattelier existe déjà : le smoke test refuse de le remplacer.'
}

function Wait-WattelierEndpoint([int]$Port) {
  $deadline = (Get-Date).AddSeconds(30)
  do {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/api/setup/status" -TimeoutSec 2
      if ($response.StatusCode -eq 200) {
        return
      }
    } catch {
      Start-Sleep -Milliseconds 350
    }
  } while ((Get-Date) -lt $deadline)
  throw "Wattelier n'a pas répondu sur le port $Port."
}

function Stop-WattelierOnPort([int]$Port) {
  $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($connection) {
    Stop-Process -Id $connection.OwningProcess -Force -ErrorAction SilentlyContinue
  }
}

function Stop-TestProcess($Process) {
  if ($null -eq $Process) { return }
  $Process.Refresh()
  if (-not $Process.HasExited) {
    Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
    [void]$Process.WaitForExit(5000)
  }
}

function Remove-SmokeDirectory {
  for ($attempt = 1; $attempt -le 10; $attempt++) {
    try {
      Remove-Item -LiteralPath $resolvedSmokeRoot -Recurse -Force -ErrorAction Stop
      return
    } catch {
      if ($attempt -eq 10) { throw }
      Start-Sleep -Milliseconds 500
    }
  }
}

try {
  New-Item -ItemType Directory -Path $installedDirectory, $testAppData, $testUserData, $portableDirectory | Out-Null
  $install = Start-Process -FilePath $setupPath -ArgumentList '/S', "/D=$installedDirectory" -Wait -PassThru
  if ($install.ExitCode -ne 0) { throw "L'installation silencieuse a échoué ($($install.ExitCode))." }

  $installedExecutable = Join-Path $installedDirectory 'Wattelier.exe'
  $uninstaller = Join-Path $installedDirectory 'Uninstall Wattelier.exe'
  if (-not (Test-Path -LiteralPath $installedExecutable)) { throw "L'exécutable installé est absent." }
  if (-not (Test-Path -LiteralPath $desktopShortcut)) { throw 'Le raccourci Bureau est absent.' }
  if (-not (Test-Path -LiteralPath $startMenuShortcut)) { throw 'Le raccourci menu Démarrer est absent.' }

  $env:APPDATA = $testAppData
  $env:WATTELIER_SKIP_LEGACY_IMPORT = '1'
  $env:PORT = [string]$installedPort
  $installedProcess = Start-Process -FilePath $installedExecutable -ArgumentList '--hidden', "--user-data-dir=$testUserData" -PassThru
  Wait-WattelierEndpoint $installedPort
  $installedDatabase = Get-ChildItem -LiteralPath $testUserData -Filter 'elec.db' -File -Recurse |
    Select-Object -First 1
  if (-not $installedDatabase -or $installedDatabase.Directory.Name -ne 'app-data') {
    throw "La version installée n'a pas créé sa base dans le profil Windows de test."
  }

  $runValue = (Get-ItemProperty -LiteralPath $runKey -Name Wattelier).Wattelier
  if ($runValue -notlike "*$installedExecutable*" -or $runValue -notlike '*--hidden*') {
    throw 'Le démarrage automatique caché ne cible pas le bon exécutable.'
  }

  $second = Start-Process -FilePath $installedExecutable -ArgumentList '--hidden', "--user-data-dir=$testUserData" -PassThru
  if (-not $second.WaitForExit(5000)) {
    Stop-Process -Id $second.Id -ErrorAction SilentlyContinue
    throw "La seconde instance ne s'est pas arrêtée."
  }

  Stop-WattelierOnPort $installedPort
  Stop-TestProcess $installedProcess
  $uninstall = Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait -PassThru
  if ($uninstall.ExitCode -ne 0) { throw "La désinstallation silencieuse a échoué ($($uninstall.ExitCode))." }
  if (Test-Path -LiteralPath $installedExecutable) { throw 'Le programme installé existe encore.' }
  if (Test-Path -LiteralPath $desktopShortcut) { throw 'Le raccourci Bureau existe encore.' }
  if (Test-Path -LiteralPath $startMenuShortcut) { throw 'Le raccourci menu Démarrer existe encore.' }
  if (-not (Test-Path -LiteralPath $installedDatabase.FullName)) {
    throw 'La désinstallation a supprimé ou déplacé les données.'
  }
  if ((Get-ItemProperty -LiteralPath $runKey -Name Wattelier -ErrorAction SilentlyContinue).Wattelier) {
    throw 'Le démarrage automatique existe encore après désinstallation.'
  }

  Copy-Item -LiteralPath $portableSource -Destination $portablePath
  $env:PORT = [string]$portablePort
  $portableProcess = Start-Process -FilePath $portablePath -ArgumentList '--hidden' -PassThru
  Wait-WattelierEndpoint $portablePort
  if (-not (Test-Path -LiteralPath (Join-Path $portableDirectory 'Wattelier-data\elec.db'))) {
    throw "La version portable n'a pas créé Wattelier-data à côté de l'exécutable."
  }
  if ((Get-ItemProperty -LiteralPath $runKey -Name Wattelier -ErrorAction SilentlyContinue).Wattelier) {
    throw 'La version portable a créé un démarrage automatique.'
  }
  Stop-WattelierOnPort $portablePort
  Stop-TestProcess $portableProcess

  Write-Host 'Smoke test Windows validé : installation, raccourcis, instance unique, démarrage caché, désinstallation avec conservation des données et portable.'
} finally {
  Stop-WattelierOnPort $installedPort
  Stop-WattelierOnPort $portablePort
  Stop-TestProcess $installedProcess
  Stop-TestProcess $portableProcess
  $env:APPDATA = $originalAppData
  $env:PORT = $originalPort
  $env:WATTELIER_SKIP_LEGACY_IMPORT = $originalSkipImport
  if (Test-Path -LiteralPath (Join-Path $installedDirectory 'Uninstall Wattelier.exe')) {
    Start-Process -FilePath (Join-Path $installedDirectory 'Uninstall Wattelier.exe') -ArgumentList '/S' -Wait | Out-Null
  }
  Remove-Item -LiteralPath $desktopShortcut -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $startMenuShortcut -ErrorAction SilentlyContinue
  Remove-ItemProperty -LiteralPath $runKey -Name Wattelier -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $resolvedSmokeRoot) {
    Remove-SmokeDirectory
  }
}
