!macro customUnInstall
  ; Electron enregistre le lancement automatique sous ce nom. On retire uniquement
  ; cette valeur ; le dossier de données utilisateur est volontairement conservé.
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Wattelier"
!macroend
