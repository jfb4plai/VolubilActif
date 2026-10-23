; Personnalisation de l'assistant d'installation (electron-builder, NSIS).
; Une page propose de lancer VolubilActif a l'ouverture de Windows (case non cochee par defaut) : raccourci dans le dossier Demarrage.
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

; Le lancement avec Windows passe par un raccourci du dossier Demarrage (comme Capture d'ecran PLAI) :
; sur ce PC, Windows n'a pas execute l'entree de registre Run au demarrage, et a lance le raccourci.
; Toujours le dossier Demarrage de l'utilisateur courant, meme en installation pour tous les utilisateurs.
!macro creerRaccourciDemarrage
  ${if} $installMode == "all"
    SetShellVarContext current
  ${endif}
  CreateShortCut "$SMSTARTUP\${PRODUCT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "--reduit" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
  ; Si Windows avait desactive ce raccourci (Gestionnaire des taches), la case cochee le reactive.
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder" "${PRODUCT_NAME}.lnk"
  ${if} $installMode == "all"
    SetShellVarContext all
  ${endif}
!macroend

!macro customInstall
  ${if} $AutoStartState == ${BST_CHECKED}
    !insertmacro creerRaccourciDemarrage
  ${endIf}
  ; Migration depuis la 1.8.0 : l'ancienne entree Run devient un raccourci (le choix de l'utilisateur est conserve).
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCT_NAME}"
  ${if} $0 != ""
    !insertmacro creerRaccourciDemarrage
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCT_NAME}"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "${PRODUCT_NAME}"
  ${endIf}
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    ${if} $installMode == "all"
      SetShellVarContext current
    ${endif}
    Delete "$SMSTARTUP\${PRODUCT_NAME}.lnk"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder" "${PRODUCT_NAME}.lnk"
    ${if} $installMode == "all"
      SetShellVarContext all
    ${endif}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCT_NAME}"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "${PRODUCT_NAME}"
  ${endIf}
!macroend
