cd ~/alphaverse-live/
screen -S apiserver -X quit
screen -dmS apiserver && apiserver -S server -X stuff 'cd ~/alphaverse-live && npm run apiServer\n'
sleep 1
exit

