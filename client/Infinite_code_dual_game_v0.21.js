//********************************************************************************************
//** Infinite Code Dual Game Edition based on this video: TBD                               **
//** Version: 21                                                                            ** 
//** Date: 07/06/2024                                                                       **
//** Authour: MrBtcGambler                                                                  **
//** Start Balance: 40 TRX                                                                  **
//** Recovery Pot: 2,300 TRX (x4)                                                           **
//** Bust Threshold: 25 TRX                                                                 **
//**                                                                                        **
//** Modifcations:                                                                          **
//** 1.) now switches to Stage 2 on every loss but added multitude of switch over unders    **
//** 2.) Stage 2 hunts for 1 win with 14* base net which provides profit but now with a     **
//** max loss limit of -9 then takes takes the losses and withdraws from the vault          **
//** 3.) Basebet has been increased to bet 0.0051 of 1 TRX on Stage 1                       **
//** 4.) Added back the max bets                                                            **
//** 5.) Addded Logs to count 9 losses                                                      **
//** 6.) Ammended Withdraw from vault to only take what is needed to keeep the balance      **
//** 7.) Vaults on 50% balance in profit                                                    **
//** 8.) Changed deposit to vault any amount above vault threshold to start balance         **
//** 9.) Switched to original Infinite code on Stage 1, 49.5% win chance, double dowwn      **
//** on wins up to max 3 wins then back to basebet.                                         **
//** 10.) Switches to Stage 2 when balance is below Start Balance                           **
//** 11.) Stage 2 does full martingales and needs a recovery pot                            **
//** 12.) Added a line to vault profits every 2,000 dicebets then switch to Stage 2         **
//** 14.) Fixed that vault Threshold and set it vault every 2,000 bets and removed          **
//** 14.) waiting for one loss on Stage 2                                                   **
//** 15.) Set Stage 1 to bet 1/4 balance on 99.99 win chance which produces a loss          **
//** then switches to stage 2 for recovery. Stage 2 exits when  profit > start balance      **
//** Stops when $2,000 Wagered                                                              **
//** Added version to be sure I am on the right code                                        **
//** changed switch to Stage 1 on a win only & changed pause                                **
//** changedprofit Taraget for Stage 2 to be an invert of the profit                        **
//** Changed Stahe 1 to 99^ win chance BasBet * 10 and switch Stage 2 on loss               **
//** 21.) same code as V11 but basbet set to lowest possible bet amount the prupose of this **
//is something safe to run after completing the wagering                                    **
//********************************************************************************************


import { unlink, access, constants } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { exec } from 'child_process'; // Add this line
import StakeApi from "./StakeApi.mjs";

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

await apiClient.depositToVault(config.currency, config.funds.available - clientConfig.recoverThreshold);
await new Promise(r => setTimeout(r, 2000));

const startBalance = config.recoverThreshold;

let balance = clientConfig.CLIENT_RECOVER_THRESHOLD;

let version = 21;
let game = "dice";
let betHigh = false;
let win = false;
let betDelay = 40; // delay in milliseconds
let currentStreak = 0;
let profit = 0;
let vaulted = 0;
let wager = 0;
let bets = 0;
let winCount = 0;
let previousBet = 0;
let stage = 3;
let baseBet = (startBalance / 133333);
let nextBet = (baseBet * 10);
let vaultThreshold = (startBalance * 0.1);
let chance = 99;
let diceBets = 0;
let DTBets = 0;
let highestLosingStreak = 0;
let lastHourBets = [];
let paused = false;
let Stage2loss = 0;
let switchOverUnderLoseStreak = 0;
let switchOverUnderWinStreak = 0;
let simulation = false;
let roundProfit = 0;
let newBalance = null;
let pauseFileUrl = new URL('pause', import.meta.url);
let pauseLogged = false;

function setStage(stageNumber) {
    console.log(`\n
#=========================================#
        Switching to stage ${stageNumber}
#=========================================#
\n`);

    stage = stageNumber;
}

function randomFloat(min, max) {
    return (Math.random() * (min - max) + max);
}

function setStage1() {
    setStage(1);
    game = "dice";
    chance = 49.5;
    switchOverUnderLoseStreak = randomFloat(2, 8) * -1;
    switchOverUnderWinStreak = randomFloat(4, 8);
    nextBet = (baseBet * 10);
    previousBet = baseBet;
}

function setStage2() {
    setStage(2);
    game = "dragontower";
    chance = 49.5;
    nextBet = 0;
    previousBet = 0;
    roundProfit = 0;
}

function setStage3() {
    setStage(3);
    game = "dice";
    chance = 99;
    nextBet = 0;
    roundProfit = 0;
}

if (stage === 1) {
    setStage1();
}

if (stage === 2) {
    setStage2();
}

if (stage === 3) {
    setStage3();
}

function getBetsPerHour() {
    const now = +new Date();
    lastHourBets = lastHourBets.filter((timestamp) => now - timestamp <= 60 * 60 * 1000);

    return lastHourBets.length;
}

console.log ("**Bet Data**");
console.log ("Start Balance:", startBalance);
console.log ("Base Bet", baseBet);
console.log ("Vault Threshold:", vaultThreshold);
console.log ("** END **");

await new Promise(r => setTimeout(r, 3000));

async function doBet() {

    if (stage === 1) {

        if (win && balance >= (startBalance + vaultThreshold)) {
            await apiClient.depositToVault(config.currency, config.funds.available - startBalance);
        }

        if (diceBets % 2000 === 0) {
            await apiClient.depositToVault(config.currency, config.funds.available - startBalance);
            setStage3();
            return;
        }   

        if (balance < startBalance) {
            setStage3();
            return;
        }

        if (win) {
            nextBet = previousBet * 2;
            winCount++
        } else {
            nextBet = (baseBet * 10);
        }

        if (currentStreak >= 3) {
            nextBet = (baseBet * 10);
        }

        if (currentStreak >= switchOverUnderWinStreak) {
            betHigh = !betHigh;
        }

        if (currentStreak <= switchOverUnderLoseStreak) {
            betHigh = !betHigh;
        }
         
    }

    if (stage === 2) {
        nextBet = 0;

        if (win && (roundProfit > 0)) {
            setStage1();
            return;
        }

        if (currentStreak === -1) {
            nextBet = (baseBet * 14);
        }

        if (currentStreak <= -2) {
            nextBet = previousBet * 2.042;
        }
    }

    if (stage === 3) {
        chance = 99;
        nextBet = 0;

        if (currentStreak >= 1) {
            setStage2();
        }
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
        version: version,
        paused: paused
    }));
}

let diceRoll = null;
    newBalance = null;
    roundProfit = 0;
    pauseFileUrl = new URL('pause', import.meta.url);
while (true) {
    let dragonTowerBet; 
    access(pauseFileUrl, constants.F_OK, (error) => {
        paused = !error;
    });

    if (paused) {
        if (!pauseLogged) {
            console.log('[INFO] Paused...');
            pauseLogged = true;
        }
        await writeStatsFile();
        await new Promise(r => setTimeout(r, 1000));
        continue;
    } else {
        pauseLogged = false; // Reset the flag when not paused
    }
    
    if (game === "dice") {
        diceBets++;
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

            console.log(
                win ? '\x1b[32m%s\x1b[0m' : '\x1b[37m%s\x1b[0m',
                [
                    'Game: ' + game,
                    'Chance: ' + chance,
                    'Bet High: ' + betHigh,
                    'Result: ' + diceRoll.state.result.toFixed(2),
                    'Balance: ' + balance.toFixed(8) + ' ' + config.currency.toUpperCase(),
                    'Wager: ' + wager.toFixed(8) + ' ' + config.currency.toUpperCase(),
                    'Profit: ' + profit.toFixed(8) + ' ' + config.currency.toUpperCase(),
                    'Bet size: ' + nextBet.toFixed(8) + ' ' + config.currency.toUpperCase(),
                    //'Dice Bets: ' +diceBets,
                    //'Dragon Tower Bets: ' + DTBets,
                    'DT Losses:' +  Stage2loss,
                    'Current streak: ' + currentStreak
                    //'View bet: https://stake.com/?betId=' + diceRoll.id + '&modal=bet'
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
    if (game === "dragontower"){
        DTBets++;
        try {
            dragonTowerBet = await apiClient.dragonTowerBet([0], 'hard', nextBet, config.currency).then(async (result) => {
                try {
                    const data = JSON.parse(result);
        
                    if (data.errors) {
                        console.error('[ERROR] dragonTowerBet response: ', data);
        
                        config.funds = await apiClient.getFunds(config.currency);
                        balance = config.funds.available;
        
                        return null;
                    }
        
                    return data.data.dragonTowerBet;
                } catch (e) {
                    console.error('[ERROR]', e, result);
        
                    config.funds = await apiClient.getFunds(config.currency);
                    balance = config.funds.available;
        
                    return null;
                }
            }).catch(error => console.error(error));
        
            if (!dragonTowerBet || !dragonTowerBet.state) {
                console.log('[ERROR] Pausing for 5 seconds...', dragonTowerBet);
                await new Promise(r => setTimeout(r, 5000));
        
                continue;
            }
        
            newBalance = dragonTowerBet.user.balances.filter((balance) => balance.available.currency === config.currency)[0];
            config.funds = {
                available: newBalance.available.amount,
                vault: newBalance.vault.amount,
                currency: config.currency
            };
        
            balance = config.funds.available;
        
            wager += nextBet;
            profit -= nextBet;
            bets++;
            lastHourBets.push(+new Date());
        
            win = dragonTowerBet.payoutMultiplier >= 1;
        
            if (win) {
                roundProfit = dragonTowerBet.payout;
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
        
            console.log(
                win ? '\x1b[32m%s\x1b[0m' : '\x1b[37m%s\x1b[0m',
                [
                    'Game: ' + game,
                    'Stage: ' + stage,
                    'Balance: ' + balance.toFixed(8) + ' ' + config.currency.toUpperCase(),
                    'Wager: ' + wager.toFixed(8) + ' ' + config.currency.toUpperCase(),
                    'Profit: ' + profit.toFixed(8) + ' ' + config.currency.toUpperCase(),
                    'Bet size: ' + nextBet.toFixed(8) + ' ' + config.currency.toUpperCase(),
                    'bet: [0]', // Updated to show hard-coded egg position
                    'Dice Bets: ' +diceBets,
                    'DT Losses:' +  Stage2loss,
                    //'Dragon Tower Bets: ' + DTBets,
                    'Current streak: ' + currentStreak
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
}
