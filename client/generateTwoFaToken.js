import { readFile } from 'fs/promises';
import twoFactor from "node-2fa";

const jsonConfig = JSON.parse(await readFile(new URL('../client_config.json', import.meta.url)));
let config = {
    twoFaSecret: process.env.CLIENT_2FA_SECRET || jsonConfig.twoFaSecret || null,
};

if (!config.twoFaSecret) {
    console.error('Missing twoFaSecret in client_config.json');
    process.exit();
}

console.log(twoFactor.generateToken(config.twoFaSecret).token);