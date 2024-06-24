//********************************************************************************************
//** Dual Game Martgingale based on this video: TBD                                         **
//** Version: 0.3                                                                           ** 
//** Date: 28/05/2024                                                                       **
//** Authour: MrBtcGambler & FenrisX                                                        **
//** Start Balance: 40 TRX                                                                  **
//** Recovery Pot: 0 TRX                                                                    **
//** Bust Threshold: -1 TRX                                                                 **
//**                                                                                        **
//** Modifcations:                                                                          **
//** 1.) it switches to Stage 2 on every loss in Dice game                                  **
//** 2.) Stage 2 hunts for 1 los with 12* base bet which provides profit but now with a     **
//** max loss limit of -7 martingale then takes takes the losses                            **
//** 3.) Basebet has been increased to minimum bet of 0.0051 of 1 TRX                       **
//********************************************************************************************

import axios from 'axios'; // Make sure to use import instead of require
import path from 'path';
import fs from 'fs';
import { promises as fsp } from 'fs';
import { fileURLToPath } from 'url';
import { Router } from 'express';
import { cursorTo } from 'readline';

// Define __dirname for ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pauseFileUrl = path.join(__dirname, 'pause');
const dicebotStateFilename = path.join('/mnt/ramdrive/dicebot_state.json');
const randomClientSeed = generateRandomClientSeed(10);
const randomServerSeed = generateRandomServerSeed(64);
const startNonce = Math.floor(Math.random() * 1000000) + 1;  // Generate random start nonce

let startTime = Date.now(); // Initialize startTime
let betDelay = 1;
let apiServer;
let Change = false;
let balance = 0;
let totalBets = 0;
let previousBet = 0;
let simulatedRecoveryPot = 0;
let startBalance = 0;
let baseBet = 0.0051;
let nextBet = 0;
let vaultThreshold = 6;
let houseEdge = 1;
let increaseOnLoss = 2.043;
let betHigh = false;
let win = false;
let profit = 0;
let totalWagered = 0;
let winCount = 0;
let lossCount = 0;
let winRatio = 0;
let betCount = 0;
let vaulted = 0;
let vaultBalance = 0;
let lastHourBets = [];
let paused = true;
let stage = 99;
let currentStreak = 0;
let maxStreak = 0;
let totalProfit = 0;
let nonce = startNonce;
let clientSeed = generateRandomClientSeed(10);
let game = "dice";
let chance = 99;
let diceBets = 0;
let DTBets = 0;
let highestLosingStreak = 0;
let simulation = false;
let difficulty;
let roundProfit = 0;
let Stage2loss = 0;
let eggsAmount;
let eggs = [1]; // Define eggs globally

let config; // Define config as a global variable

const DRAGON_TOWER_PAYOUT_MAPPING = {
    easy: {
        1: 1.31,
        2: 1.74,
        3: 2.32,
        4: 3.10,
        5: 4.13,
        6: 5.51,
        7: 7.34,
        8: 9.79,
        9: 13.05,
    },
    medium: {
        1: 1.47,
        2: 2.21,
        3: 3.31,
        4: 4.96,
        5: 7.44,
        6: 11.16,
        7: 16.74,
        8: 25.11,
        9: 37.67,
    },
    hard: {
        1: 1.96,
        2: 3.92,
        3: 7.84,
        4: 15.68,
        5: 31.36,
        6: 62.72,
        7: 125.44,
        8: 250.88,
        9: 501.76,
    },
    expert: {
        1: 2.94,
        2: 8.82,
        3: 26.46,
        4: 76.38,
        5: 238.14,
        6: 714.42,
        7: 2143.26,
        8: 6429.78,
        9: 19289.34,
    },
    master: {
        1: 3.92,
        2: 15.68,
        3: 62.72,
        4: 250.88,
        5: 1003.52,
        6: 4014.08,
        7: 16056.32,
        8: 64225.28,
        9: 256901.12,
    }
};

const DIFFICULTY_EGGS_MAPPING = {
    easy: 4,
    medium: 3,
    hard: 2,
    expert: 3,
    master: 4,
}

function randomEggs(difficulty, amount) {
    const eggs = [];
    for (let i = 0; i < amount; i++) {
        eggs.push(Math.floor(Math.random() * DIFFICULTY_EGGS_MAPPING[difficulty]));
    }
    return eggs;
}

function generateRandomClientSeed(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

function generateRandomServerSeed(length) {
    let result = [];
    const hexRef = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'];
    for (let n = 0; n < length; n++) {
        result.push(hexRef[Math.floor(Math.random() * 16)]);
    }
    return result.join('');
}

function getBetsPerHour() {
    const now = +new Date();
    lastHourBets = lastHourBets.filter((timestamp) => now - timestamp <= 60 * 60 * 1000);
    return lastHourBets.length;
}

async function loadConfigAndSetGlobals() {
    try {
        const configFile = await fsp.readFile(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'client_config.json'), 'utf8');
        config = JSON.parse(configFile); // Set the global config variable
        apiServer = config.apiServer;

        if (config.simulationMode === "true") { // Check against a boolean value, not a string
            balance = config.simulationStartBalance;
            totalBets = config.simulationTotalBets; // Set global variable
            simulatedRecoveryPot = config.simulatedRecoveryPot;
            startBalance = balance;
        } else {
            balance = 0; // Default starting balance
            totalBets = 999; // Default total number of bets
            startBalance = balance;
        }
    } catch (err) {
        console.error('Error reading config file:', err);
        throw err;
    }
}

async function analyseDiceBet(serverSeed, clientSeed, nonce, betHigh, chance, houseEdge) {
    try {
        diceBets++;
        const url = `http://${apiServer}:3001/computeRandomFloat`;
        const response = await axios.post(url, { serverSeed, clientSeed, nonce, cursor: 0 });
        const rawFloat = response.data.rawFloat;
        const roll = Math.floor(rawFloat * 10001) / 100; // Convert raw float to roll

        // Determine win based on betHigh and chance
        const win = betHigh ? roll >= (100 - chance) : roll <= chance;

        // Calculate payout multiplier based on house edge and chance
        const payOut = ((100 - houseEdge) / (chance / 100) / 100);

        return { win, roll, payoutMultiplier: win ? payOut : 0 };
    } catch (error) {
        console.error('Error getting dice bet result from server:', error);
        return null;
    }
}

async function getDragonTowerBetResult(serverSeed, clientSeed, nonce, betSize, currency, difficulty, eggs) {
    try {
        DTBets++;
        const url = `http://${apiServer}:3001/computeDragonTowerResult`;
        const response = await axios.post(url, { serverSeed, clientSeed, nonce, betSize, currency, difficulty, eggs });
        return response.data;
    } catch (error) {
        console.error('Error getting dragon tower result from server:', error);
        return null;
    }
}

async function writeStatsFile() {
    try {
        await fsp.writeFile(dicebotStateFilename, JSON.stringify({
            balance: balance,
            bets: betCount,
            stage: stage,
            wager: totalWagered,
            vaulted: vaultBalance,
            profit: totalProfit,
            betSize: nextBet,
            currentStreak: currentStreak,
            highestLosingStreak: maxStreak,
            betsPerHour: getBetsPerHour(),
            lastBet: (new Date()).toISOString(),
            wins: winCount,
            losses: (betCount - winCount),
            paused: paused
        }), 'utf8');
    } catch (err) {
        if (err.code === 'ENOENT') {
            await fsp.writeFile(dicebotStateFilename, '{}', 'utf8');
            await fsp.writeFile(dicebotStateFilename, JSON.stringify({
                balance: balance,
                bets: betCount,
                stage: stage,
                wager: totalWagered,
                vaulted: vaultBalance,
                profit: totalProfit,
                betSize: nextBet,
                currentStreak: currentStreak,
                highestLosingStreak: maxStreak,
                betsPerHour: getBetsPerHour(),
                lastBet: (new Date()).toISOString(),
                wins: (totalBets - lossCount),
                losses: (lossCount),
                paused: paused
            }), 'utf8');
        } else {
            console.error('Error writing to file:', err);
        }
    }
}

async function analyseDragonTowerBet(serverSeed, clientSeed, nonce, betSize, currency, difficulty, eggs) {
    const result = await getDragonTowerBetResult(serverSeed, clientSeed, nonce, betSize, currency, difficulty, eggs);
    if (!result) {
        console.error('Error analyzing Dragon Tower bet');
        return null;
    }

    const payoutMultiplier = result.payoutMultiplier;
    const win = payoutMultiplier > 0;

    return { win, payoutMultiplier, result };
}

async function doBet(serverSeed, clientSeed) {
    console.log('Betting Starting...');
    console.log('Total Bets :' + totalBets);
    console.log('Bet count :' + betCount);
    await new Promise(r => setTimeout(r, 3000)); // waits 3 seconds

    while (betCount <= totalBets) {
        // Check if the pause file exists
        paused = fs.existsSync(pauseFileUrl);
        if (paused) {
            console.log('[INFO] Paused...');
            await writeStatsFile();
            // Wait until the pause file is removed
            while (fs.existsSync(pauseFileUrl)) {
                await new Promise(r => setTimeout(r, 1000));
            }
            console.log('[INFO] Resuming...');
        }
        betCount++;
        nonce++;
        await new Promise(r => setTimeout(r, betDelay)); // Adding delay before each bet
    

        if (game === "dice") {
            nextBet = baseBet; // Ensure nextBet is set to baseBet at the start of each dice bet
            totalWagered += nextBet; // Update totalWagered with the current bet
            const result = await analyseDiceBet(serverSeed, clientSeed, nonce, betHigh, chance, houseEdge);
            const { win, roll, payoutMultiplier } = result;
            lastHourBets.push(Date.now());
                    
            if (balance >= startBalance + vaultThreshold) {
                vaultBalance += (balance - startBalance);
                balance = startBalance;
                vaulted++;
            }

            if (win) {
                winCount++;
                previousBet = nextBet;
                //balance += previousBet;
                currentStreak = Math.max(0, currentStreak) + 1;
            } else {
                lossCount++;
                previousBet = nextBet;
                totalProfit -= previousBet;
                balance -= previousBet;
                currentStreak = Math.min(0, currentStreak) - 1;
                if (currentStreak < maxStreak) {
                    maxStreak = currentStreak;
                }
                Change = true;
            }      

            if ([50, 100, 150, 200, 250].includes(currentStreak) || currentStreak >= 300) {
                betHigh = !betHigh;
            }

            if (currentStreak === 30){
                betDelay =1;
            }
        
            console.log(
                win ? '\x1b[32m%s\x1b[0m' : '\x1b[37m%s\x1b[0m',
                [
                    'Game:' + game,
                    'Bet Amount: ' + previousBet.toFixed(8) + ' ' + config.currency.toUpperCase(),
                    'Result: ' + roll.toFixed(2),
                    'Round Profit: ' + roundProfit.toFixed(8),
                    'Profit: ' + totalProfit.toFixed(8) + ' ' + config.currency.toUpperCase(),
                    'Wager: ' + totalWagered.toFixed(8) + ' ' + config.currency.toUpperCase(),
                    'Balance :' + balance.toFixed(8) + ' ' + config.currency.toUpperCase(),
                    'Bet High: ' + betHigh,
                    'DT Loss: ' + Stage2loss,
                    'Current streak: ' + currentStreak
                ].join(' | ')
            );

            if (Change) {
                Change = false;
                roundProfit =0;
                nextBet = 0;
                currentStreak = 0;
                difficulty = 'hard'; // Set the difficulty level
                eggs = [1]; // Ensure eggs is set properly
                game = "dragontower";
                continue;
            }  
        }       

        if (game === "dragontower") {
            totalWagered += nextBet; // Update totalWagered with the current bet
            const result = await analyseDragonTowerBet(serverSeed, clientSeed, nonce, nextBet, config.currency, difficulty, [1]); // Set egg position to 1

            const payOut = result.payoutMultiplier;
            win = payOut > 0;     
        
            if (win) {
                winCount++;
                previousBet = nextBet;
                roundProfit += previousBet * payOut;
                nextBet = 0;
                totalProfit += roundProfit;
                balance += roundProfit;
                currentStreak = Math.max(0, currentStreak) + 1;
                }else {
                    lossCount++;
                    previousBet = nextBet;
                    roundProfit -= previousBet;
                    totalProfit -= previousBet;
                    balance -= previousBet;
                    nextBet *= increaseOnLoss;
                    currentStreak = Math.min(0, currentStreak) - 1;
                    if (currentStreak === -1){
                        nextBet = baseBet * 12;
                    }
                    if (currentStreak < maxStreak) {
                        maxStreak = currentStreak;
                    }
                }

            if (currentStreak <= -7) {
                betDelay = 400;
                Stage2loss ++;
                Change = true;
            }

            console.log(
                win ? '\x1b[32m%s\x1b[0m' : '\x1b[37m%s\x1b[0m',
                [
                    'Game:' + game,
                    'Bet Amount: ' + previousBet.toFixed(8) + ' ' + config.currency.toUpperCase(),
                    'Result: ' + result.payoutMultiplier,
                    'Round Profit: ' + roundProfit.toFixed(8),
                    'Profit: ' + totalProfit.toFixed(8) + ' ' + config.currency.toUpperCase(),
                    'Wager: ' + totalWagered.toFixed(8) + ' ' + config.currency.toUpperCase(),
                    'Balance :' + balance.toFixed(8) + ' ' + config.currency.toUpperCase(),
                    'DT Loss: ' + Stage2loss,
                    'Current streak: ' + currentStreak
                ].join(' | ')
            );

            if (roundProfit > 0) {
                currentStreak = 0;
                nextBet = baseBet;
                roundProfit =0;
                chance = 99;
                game="dice";
                continue;
            }
            
            if (Change) {
                Change = false;
                currentStreak = 0;
                nextBet = baseBet;
                roundProfit =0;
                chance = 99;
                game="dice";
                continue;

            }
            await new Promise(r => setTimeout(r, betDelay));
        }
        await new Promise(resolve => setTimeout(resolve, 5));
        await writeStatsFile();
    }
}

console.log('Script is starting...');
loadConfigAndSetGlobals().then(() => {
    console.log('Configuration loaded, starting analysis...');
    doBet(randomServerSeed, randomClientSeed).then(result => {
        console.log('Simulation complete:', result);
        console.log('Start Nonce: ' + startNonce);
        console.log('End Nonce: ' + nonce);
        const runTimeSeconds = (Date.now() - startTime) / 1000;
        console.log(`Duration: ${runTimeSeconds} seconds`);
    }).catch(err => {
        console.error('Error during simulation:', err);
    });
}).catch(err => {
    console.error('Failed to load configuration:', err);
});
