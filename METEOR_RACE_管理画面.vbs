Option Explicit
Dim shell, fso, folder, command
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
command = "cmd.exe /c """ & folder & "\METEOR_RACE_管理画面.cmd"""
shell.Run command, 0, False
