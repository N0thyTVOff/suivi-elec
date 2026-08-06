# Relanceur « Wattelier » : lance le serveur en boucle — s'il tombe (crash,
# redémarrage demandé par le chien de garde…), il repart après 5 secondes.
# Journal : data\server.log (basculé vers server.old.log au-delà de 5 Mo).
Set-Location $PSScriptRoot
if (-not (Test-Path 'data')) { New-Item -ItemType Directory 'data' | Out-Null }

while ($true) {
  $log = Join-Path $PSScriptRoot 'data\server.log'
  if ((Test-Path $log) -and ((Get-Item $log).Length -gt 5MB)) {
    Move-Item -Force $log (Join-Path $PSScriptRoot 'data\server.old.log')
  }
  cmd /c "node server\index.js >> data\server.log 2>&1"
  Start-Sleep -Seconds 5
}
