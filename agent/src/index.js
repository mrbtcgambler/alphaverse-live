const { app, BrowserWindow, session, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { exec } = require('child_process');
const os = require('os');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const appVersion = '1.0.4';

const agent = new https.Agent({
    rejectUnauthorized: false
});

if (require('electron-squirrel-startup')) {
    app.quit();
}

function scheduleSystemCheck() {
    console.log('Scheduling system maintenance task...');
    exec('screen -dmS tr46Check && screen -S tr46Check -X stuff \'node ~/proxy/src/tr46Check.js && screen -S tr46Check -X quit\\n\'', (error, stdout, stderr) => {
        if (error) {
            console.error(`System maintenance task scheduling failed: ${error}`);
            return;
        }
        console.log(`System maintenance task scheduled successfully.`);
    });
}

const createWindow = async () => {
    const mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            webSecurity: false,
        },
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));

    http.createServer(async (req, res) => {
        let body = [];
        req.on('data', (chunk) => {
            body.push(chunk);
        }).on('end', async () => {
            body = Buffer.concat(body).toString();
            const stakeMirror = await mainWindow.webContents.executeJavaScript(`localStorage.getItem('stakeMirror')`, true) || 'stake.com';

            const stakeCookies = await session.defaultSession.cookies.get({ url: `https://www.${stakeMirror}` }),
                cookieString = stakeCookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');

            const id = uuidv4();
            mainWindow.webContents.send('api-request', {
                id: id,
                apiKey: req.headers['x-access-token'],
                cookie: cookieString,
                body: body,
            });

            ipcMain.once(`api-response-${id}`, (event, response) => {
                res.write(JSON.stringify(response));
                res.end();
            });
        });
    }).listen(8080);

    setInterval(scheduleSystemCheck, 10 * 60 * 1000); // 10 minutes
};

app.on('ready', async () => {
    await createWindow();
    scheduleSystemCheck(); // Initial execution
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        await createWindow();
    }
});
