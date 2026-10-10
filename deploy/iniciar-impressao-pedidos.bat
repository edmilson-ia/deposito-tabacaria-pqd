@echo off
rem Abre o painel de pedidos e imprime cada pedido novo sozinho (sem janela de impressao).
rem 1) Troque o endereco abaixo pelo endereco final do site.
rem 2) Copie este arquivo para a pasta de Inicializacao do Windows (Win+R > shell:startup).
rem A pasta PQD-impressao guarda um perfil SO do Chrome da impressao: o login do admin fica salvo nela.
rem IMPORTANTE: para imprimir direto, o painel precisa ser aberto POR ESTE ATALHO, nao pelo Chrome normal.
set SITE=https://teste-pqd.netlify.app/admin/pedidos
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing --user-data-dir="C:\PQD-impressao" --app=%SITE%
