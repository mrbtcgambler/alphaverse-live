const axios = require('axios');
const path = require('path');
const fsp = require('fs').promises;
const fs = require('fs');
const pauseFileUrl = path.join(__dirname, 'pause');
const dicebotStateFilename = path.join('/mnt/ramdrive/dicebot_state.json');

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

// Simulation parameters
const startTime = Date.now();
const randomClientSeed = generateRandomClientSeed(10);
const randomServerSeed = generateRandomServerSeed(64);
let currency,
    baseBet = 0.0003, // Base bet amount
    nextBet = baseBet,
    vaultThreshold = 6,
    increaseOnLoss = 2.042, // Multiplier for the bet amount on a loss
    difficulty = 'hard', // Dragon Tower difficulty
    eggsAmount = 1, // Eggs to select, 9 eggs maximum
    eggs = randomEggs(difficulty, eggsAmount),
    win = false, // Win status
    profit = 0, // Total profit
    totalWagered = 0, // Total amount wagered
    startNonce = Math.floor(Math.random() * 1000000) + 1, // Random starting nonce position
    winCount = 0,
    winRatio = 0,
    betCount = 0,
    lastBet = 0,
    vaulted = 0,
    vaultBalance = 0,
    lastHourBets = [],
    paused = false,
    stage = 0.2,
    currentStreak = 0,
    maxStreak = 0,
    totalProfit = 0,
    balance = 0,
    totalBets = 0,
    startBalance = 0,
    nonce = startNonce,
    simulatedRecoveryPot = 0;

let apiServer;

function getBetsPerHour() {
    const now = +new Date();
    lastHourBets = lastHourBets.filter((timestamp) => now - timestamp <= 60 * 60 * 1000);
    return lastHourBets.length;
}

// Utility function to introduce a delay
function betDelay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Utility functions to generate random seeds
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
};

// Function to get a raw random float from your server
function getDragonTowerBetResult(serverSeed, clientSeed, nonce, betSize, currency, difficulty, eggs) {
    try {
        // Use the apiServer variable to construct the URL
        const url = `http://${apiServer}:3001/computeDragonTowerResult`;
        return axios.post(url, {
            serverSeed,
            clientSeed,
            nonce,
            betSize,
            currency,
            difficulty,
            eggs
        }).then(response => {
            return response.data;
        });
    } catch (error) {
        console.error('Error getting dragon tower result from server:', error);
        return null;
    }
}

// Rest of your utility functions...

async function loadConfigAndSetGlobals() {
    try {
        const configFile = await fsp.readFile(path.join(__dirname, '..', 'client_config.json'), 'utf8');
        const config = JSON.parse(configFile);
        apiServer = config.apiServer;
        currency = config.currency;
        // Set global variables based on the config
        if (config.simulationMode) { // Check against a boolean value, not a string
            balance = config.simulationStartBalance;
            totalBets = config.simulationTotalBets; // Set global variable
            simulatedRecoveryPot = config.simulatedRecoveryPot;
            startBalance = balance;
            // If you have a startNonce in your config, set it here
            // startNonce = config.someConfigStartNonce;
        } else {
            balance = 0; // Default starting balance
            totalBets = 999; // Default total number of bets
            startBalance = balance;
        }
        
        // ...rest of the function...
    } catch (err) {
        console.error('Error reading config file:', err);
        throw err; // Re-throw the error to handle it in the calling function
    }
}

// Rest of your utility functions...

async function writeStatsFile() {
    try {
        // Try writing the data. If the file doesn't exist, an error will be caught.
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
            // The file doesn't exist, so create it with initial empty content and then retry writing the actual data.
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
                wins: winCount,
                losses: (betCount - winCount),
                paused: paused
            }), 'utf8');
        } else {
            // If the error is not because of a non-existent file, log it.
            console.error('Error writing to file:', err);
        }
    }
}

// Main function to analyze bets based on the given parameters
async function doBet(serverSeed, clientSeed,) {
    while (betCount <= totalBets) {
        //use api server to get raw result
        const result = await getDragonTowerBetResult(serverSeed, clientSeed, nonce, nextBet, currency, difficulty, eggs);
	    // Record the timestamp of the bet
        lastHourBets.push(Date.now());

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
 
        
        progress = (betCount  / totalBets) * 100;  // update progress
        winRatio = (winCount / betCount) * 100;

        win = false; // Ensure 'win' is explicitly set to false before the bet evaluation starts

        // Inside your bet loop
        const payOut = result.payoutMultiplier;
        win = payOut > 0;

        console.log(
            win ? '\x1b[32m%s\x1b[0m' : '\x1b[37m%s\x1b[0m',
            [
                'Server Seed: ' + serverSeed,
                'Client Seed: ' + clientSeed,
                'Nonce: ' + nonce,
                'Progress %: ' + progress.toFixed(4),
                'Bet Count ' + betCount,
                'Difficulty: ' + difficulty,
                'Eggs: ' + eggs.toString(),
                'Result: ' + result.payoutMultiplier,
                'Next Bet Amount: ' + lastBet.toFixed(5),
                'Wagered: ' + totalWagered.toFixed(8),
                'profit: ' + totalProfit.toFixed(8),
                'Wins: ' + winCount.toFixed(2),
                'Balance: ' + balance.toFixed(2),
                'Win Ratio: ' + winRatio.toFixed(2),
                'Current Streak: ' + currentStreak,
                'Worst Streak: ' + maxStreak,

            ].join(' | ')
        );

        if (win) {
            lastBet = nextBet;
            nextBet = baseBet;
            winCount++
            profit = (profit + (((lastBet * payOut) - lastBet))); // Update profit
            totalProfit = (totalProfit + (((lastBet * payOut) - lastBet)));
            totalWagered = (totalWagered + lastBet);
            balance = (balance + ((lastBet * payOut) - lastBet)); // Update balance
            currentStreak = 0;
            // Reset current streak or update it as needed
            if (balance >= startBalance + vaultThreshold) {
                vaultBalance =(vaultBalance + (balance - startBalance));
                if (vaultBalance >= simulatedRecoveryPot) {
                    vaultBalance -= simulatedRecoveryPot;
                }
                balance = startBalance;
                profit = 0;
                vaulted++; 
            }
        } else {
            lastBet = nextBet;
            nextBet  = (lastBet * increaseOnLoss);
            profit = (profit - lastBet); // Update profit
            totalProfit = (totalProfit - lastBet);
            totalWagered = (totalWagered + lastBet);
            balance = (balance - lastBet); // Update balance
            currentStreak++;
            if (currentStreak > maxStreak) {
                maxStreak = currentStreak;
            }
        }

        // eggs = randomEggs(difficulty, 3);

        if (betCount === totalBets ){
            console.log("Finished!");
            console.log(
                win ? '\x1b[32m%s\x1b[0m' : '\x1b[37m%s\x1b[0m',
                [
                    'Server Seed: ' + serverSeed,
                    'Client Seed: ' + clientSeed,
                    'Nonce: ' + nonce,
                    'Progress %: ' + progress.toFixed(4),
                    'Bet Count ' + betCount,
                    'Difficulty: ' + difficulty,
                    'Eggs: ' + eggs.toString(),
                    'Result: ' + result.payoutMultiplier,
                    'Next Bet Amount: ' + lastBet.toFixed(5),
                    'Wagered: ' + totalWagered.toFixed(8),
                    'profit: ' + totalProfit.toFixed(8),
                    'Wins: ' + winCount.toFixed(2),
                    'Balance: ' + balance.toFixed(2),
                    'Win Ratio: ' + winRatio.toFixed(2),
                    'Current Streak: ' + currentStreak,
                    'Worst Streak: ' + maxStreak,
                ].join(' | ')
            );
            break; // Exit condition
        }

        if (nextBet > balance) {
            let bust = true;
            console.log('Not enough funds. Waiting for balance update...');
            console.log ('Server Seed: ', serverSeed, 'Client Seed: ', clientSeed, 'Nonce: ', nonce, 'Balance: ', balance, 'Next Bet: ',nextBet,'Loss Streak: ',currentStreak);

            while (bust) {
                console.log ('Not enough funds!....');
                if (nextBet <= balance) {
                    bust = false; // Exit the loop if the balance is now sufficient
                } else {
                    console.log('Still waiting for sufficient funds...');
                    await betDelay(1000); // Wait for 10ms before the next iteration
        await new Promise(resolve => setTimeout(resolve, 100));
                    console.log ('Calling fake recovery pot...', simulatedRecoveryPot);
                    await betDelay (5000);
                    balance = (balance + simulatedRecoveryPot);
                }
            }
        }

        await new Promise(resolve => setTimeout(resolve, 5));
        await writeStatsFile();
        betCount++
        nonce++;
    }
    console.log('Bet analysis finished.');
    return {
        totalBets: betCount,
        totalProfit,
        winCount,
        totalWagered
    };
}


console.log('Script is starting...');
loadConfigAndSetGlobals().then(() => {
    console.log('Configuration loaded, starting analysis...');
    doBet(randomServerSeed, randomClientSeed).then(result => {
        console.log('Simulation complete:', result);
        const runTimeSeconds = (Date.now() - startTime) / 1000;
        console.log(`Duration: ${runTimeSeconds} seconds`);
    });
}).catch(err => {
    console.error('Failed to load configuration:', err);
});

