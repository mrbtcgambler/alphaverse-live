import { readFile } from 'fs/promises';
import StakeApi from './StakeApi.mjs';

const jsonConfig = JSON.parse(await readFile(new URL('../client_config.json', import.meta.url)));
let config = {
    id: null,
    apiKey: process.env.CLIENT_API_KEY || jsonConfig.apiKey,
    currency: process.env.CLIENT_CURRENCY || jsonConfig.currency,
    recoverThreshold: process.env.CLIENT_RECOVER_THRESHOLD || jsonConfig.recoverThreshold
};

const apiClient = new StakeApi(config.apiKey);

console.log('Fetching funds...');
config.funds = await apiClient.getFunds(config.currency);
const amount = config.funds.available - config.recoverThreshold;

if (parseFloat(amount.toFixed(8)) <= 0) {
    process.exit(1);
}

console.log(`Depositing ${amount} ${config.currency.toUpperCase()} to vault...`);
await apiClient.depositToVault(config.currency, amount);