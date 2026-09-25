@echo off
rem Abre o painel de pedidos em segundo plano e imprime cada pedido novo sozinho (sem janela de impressao).
rem 1) Troque o endereco abaixo pelo endereco final do site.
rem 2) Copie este arquivo para a pasta de Inicializacao do Windows (Win+R > shell:startup).
rem A pasta PQD-impressao guarda um perfil SO do Chrome da impressao: o login do admin fica salvo nela.
set SITE=https://sprightly-alfajores-e24cd6.netlify.app/admin/pedidos
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing --user-data-dir="C:\PQD-impressao" --app=%SITE% --window-position=-2000,0 --window-size=800,600
