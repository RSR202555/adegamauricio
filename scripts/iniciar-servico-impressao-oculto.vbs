Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "G:\Meu Drive\ADEGA MAURI"
WshShell.Run "node ""G:\Meu Drive\ADEGA MAURI\scripts\printer-listener.js""", 0, False
