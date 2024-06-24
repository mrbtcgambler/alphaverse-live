cd ~/alphaverse-live/
screen -S server -X quit
sleep 1
screen -dmS server && screen -S server -X stuff 'cd ~/alphaverse-live && npm run server\n'
exit
