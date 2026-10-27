' Antigravity Controller - Lanceur Service d'Arriere-plan Silencieux
' Ce script execute PowerShell de maniere 100% invisible (fenetre masquee)

Set WshShell = CreateObject("WScript.Shell")
cmd = "powershell.exe -ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File ""G:\Mon Drive\05_Dev\tour-de-controle-web\pc_bridge\run_bridge_background.ps1"""
WshShell.Run cmd, 0, False
