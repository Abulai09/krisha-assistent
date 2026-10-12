@echo off
rem Ежедневная резервная копия БД для Планировщика заданий Windows (см. docs/deployment.md).
cd /d "%~dp0.."
if not exist logs mkdir logs
echo ==== %date% %time% >> logs\backup.log
call "C:\Program Files\nodejs\npm.cmd" run backup >> logs\backup.log 2>&1
