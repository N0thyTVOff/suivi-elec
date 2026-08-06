# Enregistre une tâche planifiée qui lance le relanceur « Wattelier »
# (start-server.ps1, fenêtre cachée) à chaque ouverture de session Windows.
# Le relanceur redémarre le serveur automatiquement s'il s'arrête : autonomie 24 h/24.
# Exécution : clic droit → Exécuter avec PowerShell (pas besoin d'admin).

$ErrorActionPreference = 'Stop'
$projet = $PSScriptRoot

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$projet\start-server.ps1`"" `
  -WorkingDirectory $projet
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero)

# Remplace l'éventuelle ancienne version de la tâche.
Stop-ScheduledTask -TaskName 'SuiviElec' -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName 'SuiviElec' -Confirm:$false -ErrorAction SilentlyContinue
Stop-ScheduledTask -TaskName 'Wattelier' -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName 'Wattelier' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null

Write-Host 'Tâche planifiée « Wattelier » installée : le serveur tournera en continu, session ouverte.'
Write-Host 'Démarrage immédiat...'
Start-ScheduledTask -TaskName 'Wattelier'
Write-Host 'OK → http://localhost:3017 (journal : data\server.log)'
Write-Host ''
Write-Host 'Conseil : pour une collecte 24 h/24, empêchez le PC de se mettre en veille :'
Write-Host '  powercfg /change standby-timeout-ac 0'
