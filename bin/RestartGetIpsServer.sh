cd ~/alphaverse-live/
screen -S getIPs -X quit
screen -dmS getIPs && screen -S getIPs -X stuff 'cd ~/alphaverse-live && npm run getIPs\n'
sleep 1
exit