import { unlink, access, constants } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import StakeApi from "./StakeApi.mjs";
// infinite code stage 2 only, must be 100 start balance, vaults every 10 profit
const clientConfig = JSON.parse(await readFile(new URL('../client_config.json', import.meta.url)));
const serverConfig = JSON.parse(await readFile(new URL('../server_config.json', import.meta.url)));
let config = {
    apiKey: process.env.CLIENT_API_KEY || clientConfig.apiKey,
    password: process.env.CLIENT_PASSWORD || clientConfig.password,
    currency: process.env.CLIENT_CURRENCY || clientConfig.currency,
    recoverAmount: process.env.SERVER_RECOVER_AMOUNT || serverConfig.recoverAmount,
    recoverThreshold: process.env.CLIENT_RECOVER_THRESOLD || clientConfig.recoverThreshold,
    funds: null
};

const apiClient = new StakeApi(config.apiKey);
config.funds = await apiClient.getFunds(config.currency);

//await apiClient.depositToVault(config.currency, config.funds.available - config.recoverThreshold);
//await new Promise(r => setTimeout(r, 2000));

let balance = config.funds.available,
    targetWager = 25000,
    baseBet = 8,
    betHigh = false,
    win = false,
    betDelay = 40, // delay in milliseconds
    currentStreak = 0,
    profit = 0,
    vaulted = 0,
    wager = 0,
    bets = 0,
    stage = 2,
    winCount = 0,
    previousBet = 0,
    nextBet = baseBet,
    baseChance = 99,
    chance = baseChance,
    highestLosingStreak = 0,
    lastHourBets = [],
    paused = false,
    simulation = false;

  

function resetStats() {
    profit = 0;
}

function getBetsPerHour() {
    const now = +new Date();
    lastHourBets = lastHourBets.filter((timestamp) => now - timestamp <= 60 * 60 * 1000);

    return lastHourBets.length;
}

//console.log(balance, recoveryPot, switch2Stage1, config.funds.balance)
//await new Promise(r => setTimeout(r, 200000));

async function doBet() {
  
    if (win) {
        nextBet = baseBet;
        winCount++
    } else {
        nextBet = baseBet;
    }
}


// Delete old state file
const dicebotStateFilename = new URL('/mnt/ramdrive/dicebot_state.json', import.meta.url);
access(dicebotStateFilename, constants.F_OK, (error) => {
    if (!error) {
        unlink(dicebotStateFilename, (err) => {
        });
    }
});

async function writeStatsFile() {
    await writeFile(dicebotStateFilename, JSON.stringify({
        bets: bets,
        stage: stage,
        wager: wager,
        vaulted: vaulted,
        profit: profit,
        betSize: nextBet,
        currentStreak: currentStreak,
        highestLosingStreak: highestLosingStreak,
        betsPerHour: getBetsPerHour(),
        lastBet: (new Date()).toISOString(),
        wins: winCount,
        losses: (bets - winCount),
        paused: paused
    }));
}

let diceRoll = null,
    newBalance = null,
    roundProfit = 0,
    pauseFileUrl = new URL('pause', import.meta.url);
while (true) {
    access(pauseFileUrl, constants.F_OK, (error) => {
        paused = !error;
    });

    if (paused) {
        console.log('[INFO] Paused...');
        await writeStatsFile();
        await new Promise(r => setTimeout(r, 1000));

        continue;
    }

    try {
        diceRoll = await apiClient.diceRoll(chance, betHigh, simulation ? 0 : nextBet, config.currency).then(async (result) => {
            try {
                const data = JSON.parse(result);

                if (data.errors) {
                    console.error('[ERROR] Dicebet response: ', data);

                    if (!simulation) {
                        config.funds = await apiClient.getFunds(config.currency);
                        balance = config.funds.available;
                    }

                    return null;
                }

                return data.data.diceRoll;
            } catch (e) {
                console.error('[ERROR]', e, result);

                if (!simulation) {
                    config.funds = await apiClient.getFunds(config.currency);
                    balance = config.funds.available;
                }

                return null;
            }
        }).catch(error => console.error(error));

        if (!diceRoll || !diceRoll.state) {
            console.log('[ERROR] Pausing for 5 seconds...', diceRoll);
            await new Promise(r => setTimeout(r, 5000));

            continue;
        }

        if (simulation) {
            balance -= nextBet;
            balance += nextBet * diceRoll.payoutMultiplier;
        } else {
            newBalance = diceRoll.user.balances.filter((balance) => balance.available.currency === config.currency)[0];
            config.funds = {
                available: newBalance.available.amount,
                vault: newBalance.vault.amount,
                currency: config.currency
            };

            balance = config.funds.available;
        }

        wager += nextBet;
        profit -= nextBet;
        bets++;
        lastHourBets.push(+new Date());

        if (betHigh) {
            win = diceRoll.state.result > diceRoll.state.target;
        } else {
            win = diceRoll.state.result < diceRoll.state.target;
        }

        if (win) {
            roundProfit = diceRoll.payout;
            profit += roundProfit;

            if (currentStreak >= 0) {
                currentStreak++;
            } else {
                currentStreak = 1;
            }
        } else {
            if (currentStreak <= 0) {
                currentStreak--;
            } else {
                currentStreak = -1;
            }
        }

        //if ([50, 100, 150, 200, 250].includes(currentStreak) || currentStreak >= 300) {
        //    betHigh = !betHigh;
        //}

        if (wager >= targetWager){
            console.log('Target Wager finished: ' + wager);
            process.exit(1);
        }

        console.log(
            win ? '\x1b[32m%s\x1b[0m' : '\x1b[37m%s\x1b[0m',
            [
                'Stage: ' + stage,
                'Balance: ' + balance.toFixed(8) + ' ' + config.currency.toUpperCase(),
                'Wager: ' + wager.toFixed(8) + ' ' + config.currency.toUpperCase(),
                'Profit: ' + profit.toFixed(8) + ' ' + config.currency.toUpperCase(),
                'Bet size: ' + nextBet.toFixed(8) + ' ' + config.currency.toUpperCase(),
                'Current streak: ' + currentStreak,
                'View bet: https://stake.com/?betId=' + diceRoll.id + '&modal=bet'
            ].join(' | ')
        );

        await doBet();

        previousBet = nextBet;
        if (currentStreak < 0) {
            highestLosingStreak = Math.max(highestLosingStreak, Math.abs(currentStreak));
        }

        await writeStatsFile();
        await new Promise(r => setTimeout(r, betDelay));
    } catch (e) {
        console.error('[ERROR]', e);

        if (!simulation) {
            config.funds = await apiClient.getFunds(config.currency);
            balance = config.funds.available;
        }
    }
}