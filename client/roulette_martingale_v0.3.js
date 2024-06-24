//********************************************************************************************
//** Roulette Martgingale based on this video: https://www.youtube.com/watch?v=mhB0khmuRkw  **
//** Version: 0.3                                                                           ** 
//** Date: 19/05/2024                                                                       **
//** Authour: MrBtcGambler                                                                  **
//** Start Balance: 40 TRX                                                                  **
//** Recovery Pot: 6500 TRX                                                                 **
//** Bust Threshold: 25 TRX                                                                 **
//********************************************************************************************

import { unlink, access, constants } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import StakeApi from "./StakeApi.mjs";
import { Console } from 'console';

const clientConfig = JSON.parse(await readFile(new URL('../client_config.json', import.meta.url)));
const serverConfig = JSON.parse(await readFile(new URL('../server_config.json', import.meta.url)));
let config = {
    apiKey: process.env.CLIENT_API_KEY || clientConfig.apiKey,
    password: process.env.CLIENT_PASSWORD || clientConfig.password,
    twoFaSecret: process.env.CLIENT_2FA_SECRET || clientConfig.twoFaSecret || null,
    currency: process.env.CLIENT_CURRENCY || clientConfig.currency,
    recoverAmount: process.env.SERVER_RECOVER_AMOUNT || serverConfig.recoverAmount,
    recoverThreshold: process.env.CLIENT_RECOVER_THRESHOLD || clientConfig.recoverThreshold,
    funds: null
};

const apiClient = new StakeApi(config.apiKey);
config.funds = await apiClient.getFunds(config.currency);

let balance = config.funds.available;

let win = false,
    betDelay = 40, // delay in milliseconds
    baseBet = (balance / 266666.66666667), //based on start balance of 40 TRX for minimum bet off 0.00015 per bet so 0.00003 totoal bet
    startBalance = balance,
    currentRanges = [{ value: "range0112", amount: baseBet }, { value: "range1324", amount: baseBet }],
    increaseOnLoss = 3,
    currentStreak = 0,
    profit = 0,
    vaulted = 0,
    wager = 0,
    bets = 0,
    stage = 0.3,
    previousBet = 0,
    nextBet = baseBet,
    vaultThreshold = balance * 0.1,
    lastHourBets = [],
    paused = false,
    winCount = 0,
    highestLosingStreak = 0;

function resetStats() {
    profit = 0;
}

console.log ("**Bet Data**");
console.log ("Start Balalance:", startBalance);
console.log ("Base Bet", baseBet);
console.log ("Vault Threshold:", vaultThreshold);
console.log ("** END **");

function getBetsPerHour() {
    const now = +new Date();
    lastHourBets = lastHourBets.filter((timestamp) => now - timestamp <= 60 * 60 * 1000);
    return lastHourBets.length;
}

function getBetSize(ranges) {
    return ranges.reduce((accumulator, range) => accumulator + range.amount, 0);
}

async function doBet() {
    if (win) {
        winCount++;
        nextBet = baseBet;

        if (balance >= (startBalance + vaultThreshold)) {
            await apiClient.depositToVault(config.currency, (balance - clientConfig.recoverThreshold));
        }
    } else {
        nextBet *= increaseOnLoss;
    }

    currentRanges.forEach(range => range.amount = nextBet);
}
//Switches the range to exclude the last winning range
function updateRanges(lastWinningRange) {
    if (lastWinningRange === "range0112") {
        currentRanges = [{ value: "range1324", amount: baseBet }, { value: "range2536", amount: baseBet }];
    } else if (lastWinningRange === "range1324") {
        currentRanges = [{ value: "range0112", amount: baseBet }, { value: "range2536", amount: baseBet }];
    } else if (lastWinningRange === "range2536") {
        currentRanges = [{ value: "range0112", amount: baseBet }, { value: "range1324", amount: baseBet }];
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
        betSize: (nextBet * 2),
        currentStreak: currentStreak,
        highestLosingStreak: highestLosingStreak,
        betsPerHour: getBetsPerHour(),
        lastBet: (new Date()).toISOString(),
        wins: winCount,
        losses: (bets - winCount),
        paused: paused
    }));
}

let rouletteBet = null,
    newBalance = null,
    allBetSize = 0,
    roundProfit = 0,
    lastWinningRange = null,
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
        rouletteBet = await apiClient.rouletteBet([], [], [], currentRanges, [], config.currency)
            .then(async (result) => {
                try {
                    const data = JSON.parse(result);
                    if (data.errors) {
                        console.error('[ERROR] rouletteBet response:', data);
                        config.funds = await apiClient.getFunds(config.currency);
                        balance = config.funds.available;
                        return null;
                    }

                    const winningNumber = data.data.rouletteBet.state.result; // Correctly access the nested field

                    if (winningNumber >= 0 && winningNumber <= 12) {
                        lastWinningRange = "range0112";
                    } else if (winningNumber >= 13 && winningNumber <= 24) {
                        lastWinningRange = "range1324";
                    } else if (winningNumber >= 25 && winningNumber <= 36) {
                        lastWinningRange = "range2536";
                    }

                    return data.data.rouletteBet;
                } catch (e) {
                    console.error('[ERROR]', e, result);
                    config.funds = await apiClient.getFunds(config.currency);
                    balance = config.funds.available;
                    return null;
                }
            })
            .catch(error => console.error(error));

        if (!rouletteBet || !rouletteBet.state) {
            console.log('[ERROR] Pausing for 5 seconds...', rouletteBet);
            await new Promise(r => setTimeout(r, 5000));
            continue;
        }

        newBalance = rouletteBet.user.balances.filter((balance) => balance.available.currency === config.currency)[0];
        config.funds = {
            available: newBalance.available.amount,
            vault: newBalance.vault.amount,
            currency: config.currency
        };

        balance = config.funds.available;

        allBetSize = getBetSize(currentRanges);
        wager += allBetSize;
        profit -= allBetSize;
        bets++;
        lastHourBets.push(+new Date());

        win = rouletteBet.payoutMultiplier >= 1;

        if (win) {
            nextBet = baseBet;
            roundProfit = rouletteBet.payout;
            profit += roundProfit;
            updateRanges(lastWinningRange);

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

        console.log(
            win ? '\x1b[32m%s\x1b[0m' : '\x1b[37m%s\x1b[0m',
            [
                'Stage: ' + stage,
                'Balance: ' + balance.toFixed(8) + ' ' + config.currency.toUpperCase(),
                'Wager: ' + wager.toFixed(8) + ' ' + config.currency.toUpperCase(),
                'Profit: ' + profit.toFixed(8) + ' ' + config.currency.toUpperCase(),
                'Bet size: ' + allBetSize.toFixed(8) + ' ' + config.currency.toUpperCase(),
                'Current streak: ' + currentStreak,
                'View bet: https://stake.com/?betId=' + rouletteBet.id + '&modal=bet'
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
        config.funds = await apiClient.getFunds(config.currency);
        balance = config.funds.available;
    }
}
