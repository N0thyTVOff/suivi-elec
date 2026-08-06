# Supprime les tâches planifiées Wattelier et héritée « SuiviElec ».
$ErrorActionPreference = 'Stop'
Stop-ScheduledTask -TaskName 'SuiviElec' -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName 'SuiviElec' -Confirm:$false -ErrorAction SilentlyContinue
Stop-ScheduledTask -TaskName 'Wattelier' -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName 'Wattelier' -Confirm:$false -ErrorAction SilentlyContinue
Write-Host 'Tâche planifiée « Wattelier » supprimée.'
