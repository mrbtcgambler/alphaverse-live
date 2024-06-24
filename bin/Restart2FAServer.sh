cd ~/alphaverse-live/
screen -S 2faAPI -X quit
screen -dmS 2faAPI && 2faServer -S 2faAPI -X stuff 'cd ~/alphaverse-live && npm run 2faAPI\n'
sleep 1
exit