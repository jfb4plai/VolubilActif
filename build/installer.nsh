; Personnalisation de l'assistant d'installation (electron-builder, NSIS).
; Une page propose de lancer VolubilActif a l'ouverture de Windows (case non cochee par defaut).
; La page est sautee lors d'une mise a jour automatique : le choix deja fait n'est jamais modifie.

!include nsDialogs.nsh
!include LogicLib.nsh

; Variables seulement pour l'installateur (la passe du desinstalleur ne les utilise pas : avertissement NSIS traite comme erreur).
!ifndef BUILD_UNINSTALLER
  Var AutoStartCheckbox
  Var AutoStartState
!endif

!macro customPageAfterChangeDir
  Function AutoStartPageCreate
    ${if} ${isUpdated}
      Abort
    ${endIf}
    !insertmacro MUI_HEADER_TEXT "Options de démarrage" "Choisis comment ouvrir VolubilActif."
    nsDialogs::Create 1018
    Pop $0
    ${NSD_CreateLabel} 0 0 100% 20u "Pour l'ouvrir facilement :"
    Pop $0
    ${NSD_CreateCheckbox} 0 24u 100% 36u "Lancer VolubilActif à l'ouverture de Windows (conseillé : la dictée par raccourci ne marche que si le programme tourne)"
    Pop $AutoStartCheckbox
    nsDialogs::Show
  FunctionEnd

  Function AutoStartPageLeave
    ${NSD_GetState} $AutoStartCheckbox $AutoStartState
  FunctionEnd

  Page custom AutoStartPageCreate AutoStartPageLeave
!macroend

!macro customInstall
  ${if} $AutoStartState == ${BST_CHECKED}
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "VolubilActif" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --reduit'
    ; Si Windows avait désactivé cette entrée (Gestionnaire des tâches), la case cochée la réactive.
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "VolubilActif"
  ${endIf}
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "VolubilActif"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "VolubilActif"
  ${endIf}
!macroend
