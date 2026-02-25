@echo off
cd /d "c:\Users\pinnovacion\Desktop\rutas\Saas-Multi-Tenant-main\Saas-Multi-Tenant-main\azure-functions\docint-proxy"
npx func start --port 7071 > func.out.log 2> func.err.log
