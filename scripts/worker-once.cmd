@echo off
rem Один цикл worker'а для Планировщика заданий Windows (каждые 15 мин, см. docs/deployment.md).
rem Сбор источника всё равно не чаще WORKER_INTERVAL_MINUTES — это проверяет сам worker.
cd /d "%~dp0.."
if not exist logs mkdir logs
echo ==== %date% %time% >> logs\worker.log
call "C:\Program Files\nodejs\npm.cmd" run worker:once >> logs\worker.log 2>&1
