require('dotenv').config({ path: require('path').resolve(__dirname, './.env') });
const db = require('./database/database');
const cohostService = require('./services/cohostService');

const DUEL_EXPIRATION_HOURS = 1;
const DUEL_FORFEIT_MINUTES = 10;
const RESULT_CONFIRMATION_MINUTES = 2;
const TOURNAMENT_DISPUTE_HOURS = 1;
const COHOST_HEARTBEAT_TIMEOUT_SECONDS = 90;

/**
 * [MODIFIED] Unified function to decrement player count for EITHER an official server or a co-host contract.
 * @param {object} client - An active node-postgres client.
 * @param {number} duelId - The ID of the duel that has ended.
 */
const decrementPlayerCount = async (client, duelId) => {
    try {
        const { rows: [duel] } = await client.query('SELECT assigned_server_id FROM duels WHERE id = $1', [duelId]);
        const serverId = duel?.assigned_server_id;
        if (!serverId) return;

        // Check if the serverId is a UUID (co-host) or a string (official bot)
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (isUUID.test(serverId)) {
            // It's a co-host contract
            await client.query('UPDATE host_contracts SET player_count = GREATEST(0, player_count - 2) WHERE id = $1', [serverId]);
            console.log(`[PlayerCount][CRON] Decremented player count for co-host contract ${serverId} from duel ${duelId}.`);
        } else {
            // It's an official game server
            await client.query('UPDATE game_servers SET player_count = GREATEST(0, player_count - 2) WHERE server_id = $1', [serverId]);
            console.log(`[PlayerCount][CRON] Decremented player count for official server ${serverId} from duel ${duelId}.`);
        }
    } catch (err) {
        console.error(`[PlayerCount][CRON] Failed to decrement player count for duel ${duelId}:`, err);
    }
};

async function runScheduledTasks() {
    console.log(`[CRON] Running scheduled tasks at ${new Date().toISOString()}`);
    const pool = db.getPool();

    // --- Task 1: Handle Tournament State Transitions ---
    const tournamentClient = await pool.connect();
    try {
        const openRegSql = `UPDATE tournaments SET status = 'registration_open' WHERE status = 'scheduled' AND registration_opens_at <= NOW() RETURNING id`;
        const { rows: openedTournaments } = await tournamentClient.query(openRegSql);
        if (openedTournaments.length > 0) {
            console.log(`[CRON][TOURNAMENT] Opened registration for tournaments: ${openedTournaments.map(t => t.id).join(', ')}`);
        }

        const startTourneySql = `SELECT * FROM tournaments WHERE status = 'registration_open' AND starts_at <= NOW()`;
        const { rows: tournamentsToStart } = await tournamentClient.query(startTourneySql);

        for (const tournament of tournamentsToStart) {
            const txClient = await pool.connect();
            try {
                await txClient.query('BEGIN');
                console.log(`[CRON][TOURNAMENT] Starting tournament ID: ${tournament.id}`);

                const { rows: participants } = await txClient.query("SELECT user_id FROM tournament_participants WHERE tournament_id = $1 ORDER BY registered_at ASC", [tournament.id]);
                if (participants.length < 2) {
                    await txClient.query("UPDATE tournaments SET status = 'canceled' WHERE id = $1", [tournament.id]);
                    await txClient.query('COMMIT');
                    continue;
                }
                
                let players = participants.map(p => p.user_id);
                if (players.length % 2 !== 0) { players.push(null); } 
                
                let matchInRound = 1;
                for (let i = 0; i < players.length; i += 2) {
                    await txClient.query(`INSERT INTO tournament_matches (tournament_id, round_number, match_in_round, player1_id, player2_id) VALUES ($1, 1, $2, $3, $4)`, [tournament.id, matchInRound, players[i], players[i+1]]);
                    matchInRound++;
                }
                
                const taskPayload = { tournamentId: tournament.id, round: 1, rules: tournament.rules, serverLink: tournament.private_server_link };
                await txClient.query("INSERT INTO tasks (task_type, payload) VALUES ('START_TOURNAMENT', $1)", [JSON.stringify(taskPayload)]);
                await txClient.query("UPDATE tournaments SET status = 'active' WHERE id = $1", [tournament.id]);
                await txClient.query('COMMIT');

            } catch (err) {
                await txClient.query('ROLLBACK');
                console.error(`[CRON][TOURNAMENT] Error starting tournament ${tournament.id}:`, err);
            } finally {
                txClient.release();
            }
        }
        
        const finalizeSql = `SELECT * FROM tournaments WHERE status = 'dispute_period' AND ends_at <= NOW() - INTERVAL '${TOURNAMENT_DISPUTE_HOURS} hours'`;
        const { rows: tournamentsToFinalize } = await tournamentClient.query(finalizeSql);
        
        for (const tournament of tournamentsToFinalize) {
             const txClient = await pool.connect();
             try {
                await txClient.query('BEGIN');
                console.log(`[CRON][TOURNAMENT] Finalizing tournament ${tournament.id}`);
                
                const { rows: placements } = await txClient.query("SELECT user_id, placement FROM tournament_participants WHERE tournament_id = $1 AND placement IS NOT NULL ORDER BY placement ASC", [tournament.id]);
                
                for(const player of placements) {
                    const prize = tournament.prize_distribution[player.placement.toString()];
                    if (prize && prize > 0) {
                        await txClient.query("UPDATE users SET gems = gems + $1 WHERE id = $2", [prize, player.user_id]);
                        await txClient.query("INSERT INTO transaction_history (user_id, type, amount_gems, description, reference_id) VALUES ($1, 'tournament_prize', $2, $3, $4)", [player.user_id, prize, `Prize for finishing #${player.placement} in ${tournament.name}`, tournament.id]);
                    }
                }
                
                await txClient.query("UPDATE tournaments SET status = 'finalized' WHERE id = $1", [tournament.id]);
                await txClient.query('COMMIT');

             } catch(err) {
                await txClient.query('ROLLBACK');
                console.error(`[CRON][TOURNAMENT] Error finalizing tournament ${tournament.id}:`, err);
             } finally {
                txClient.release();
             }
        }

    } catch (error) {
        console.error('[CRON][TOURNAMENT] Error processing tournament transitions:', error);
    } finally {
        tournamentClient.release();
    }
    
    // --- Task 2: Cancel old 'accepted' duels that were never started ---
    const expirationClient = await pool.connect();
    try {
        const acceptedSql = `
            SELECT id, challenger_id, opponent_id, wager 
            FROM duels 
            WHERE status = 'accepted' AND accepted_at <= NOW() - INTERVAL '${DUEL_EXPIRATION_HOURS} hours'
        `;
        const { rows: expiredAcceptedDuels } = await expirationClient.query(acceptedSql);

        for (const duel of expiredAcceptedDuels) {
            const txClient = await pool.connect();
            try {
                await txClient.query('BEGIN');
                const refundAmount = parseInt(duel.wager);
                await txClient.query('UPDATE users SET gems = gems + $1 WHERE id = $2', [refundAmount, duel.challenger_id]);
                await txClient.query('UPDATE users SET gems = gems + $1 WHERE id = $2', [refundAmount, duel.opponent_id]);
                await txClient.query("UPDATE duels SET status = 'canceled' WHERE id = $1", [duel.id]);
                
                await txClient.query('COMMIT');
                console.log(`[CRON] Canceled expired 'accepted' duel ID ${duel.id}. Wager of ${duel.wager} refunded to each player.`);
            } catch (txError) {
                await txClient.query('ROLLBACK');
                console.error(`[CRON] Rolled back transaction for expiration of duel ${duel.id}:`, txError);
            } finally {
                txClient.release();
            }
        }
    } catch (error) {
        console.error('[CRON] Error querying for old accepted duels:', error);
    } finally {
        expirationClient.release();
    }

    // --- Task 3: Handle 'started' duels that were never matched in-game (forfeit logic) ---
    const forfeitClient = await pool.connect();
    try {
        const startedSql = `
            SELECT id, challenger_id, opponent_id, pot, wager, transcript, tax_collected 
            FROM duels 
            WHERE status = 'started' AND started_at <= NOW() - INTERVAL '${DUEL_FORFEIT_MINUTES} minutes'
        `;
        const { rows: expiredStartedDuels } = await forfeitClient.query(startedSql);

        for (const duel of expiredStartedDuels) {
            const txClient = await pool.connect();
            try {
                await txClient.query('BEGIN');
                const { rows: [challenger] } = await txClient.query('SELECT id, linked_roblox_username FROM users WHERE id = $1', [duel.challenger_id]);
                const { rows: [opponent] } = await txClient.query('SELECT id, linked_roblox_username FROM users WHERE id = $1', [duel.opponent_id]);

                const transcript = duel.transcript || [];
                const joinedPlayers = new Set(
                    transcript
                        .filter(event => event.eventType === 'PLAYER_JOINED_DUEL' && event.data?.playerName)
                        .map(event => event.data.playerName)
                );

                const challengerJoined = joinedPlayers.has(challenger.linked_roblox_username);
                const opponentJoined = joinedPlayers.has(opponent.linked_roblox_username);

                if (!challengerJoined && !opponentJoined) {
                    let adjustedTax = parseInt(duel.tax_collected);
                    if (adjustedTax % 2 !== 0) {
                        adjustedTax++;
                    }
                    await txClient.query('UPDATE duels SET tax_collected = $1 WHERE id = $2', [adjustedTax, duel.id]);
                    const refundAmount = parseInt(duel.wager) - (adjustedTax / 2);
                    
                    await txClient.query('UPDATE users SET gems = gems + $1 WHERE id = $2', [refundAmount, duel.challenger_id]);
                    await txClient.query('UPDATE users SET gems = gems + $1 WHERE id = $2', [refundAmount, duel.opponent_id]);
                    await txClient.query("UPDATE duels SET status = 'canceled', winner_id = NULL WHERE id = $1", [duel.id]);
                    await decrementPlayerCount(txClient, duel.id);
                    console.log(`[CRON] Duel ID ${duel.id} canceled (no-show from both). Tax of ${adjustedTax} applied. Refunded ${refundAmount} to each player.`);
                } 
                else if (challengerJoined && !opponentJoined) {
                    await txClient.query('UPDATE users SET gems = gems + $1, wins = wins + 1 WHERE id = $2', [duel.pot, duel.challenger_id]);
                    await txClient.query('UPDATE users SET losses = losses + 1 WHERE id = $1', [duel.opponent_id]);
                    await txClient.query("UPDATE duels SET status = 'completed', winner_id = $1 WHERE id = $2", [duel.challenger_id, duel.id]);
                    await cohostService.creditCohostForDuel(duel.id, txClient);
                    await decrementPlayerCount(txClient, duel.id);
                    console.log(`[CRON] Duel ID ${duel.id} forfeited by ${opponent.linked_roblox_username}.`);
                } 
                else if (!challengerJoined && opponentJoined) {
                    await txClient.query('UPDATE users SET gems = gems + $1, wins = wins + 1 WHERE id = $2', [duel.pot, duel.opponent_id]);
                    await txClient.query('UPDATE users SET losses = losses + 1 WHERE id = $1', [duel.challenger_id]);
                    await txClient.query("UPDATE duels SET status = 'completed', winner_id = $1 WHERE id = $2", [duel.opponent_id, duel.id]);
                    await cohostService.creditCohostForDuel(duel.id, txClient);
                    await decrementPlayerCount(txClient, duel.id);
                    console.log(`[CRON] Duel ID ${duel.id} forfeited by ${challenger.linked_roblox_username}.`);
                }
                else {
                    let adjustedTax = parseInt(duel.tax_collected);
                    if (adjustedTax % 2 !== 0) {
                        adjustedTax++;
                    }
                    await txClient.query('UPDATE duels SET tax_collected = $1 WHERE id = $2', [adjustedTax, duel.id]);
                    const refundAmount = parseInt(duel.wager) - (adjustedTax / 2);
                    
                    await txClient.query('UPDATE users SET gems = gems + $1 WHERE id = $2', [refundAmount, duel.challenger_id]);
                    await txClient.query('UPDATE users SET gems = gems + $1 WHERE id = $2', [refundAmount, duel.opponent_id]);
                    await txClient.query("UPDATE duels SET status = 'canceled', winner_id = NULL WHERE id = $1", [duel.id]);
                    await decrementPlayerCount(txClient, duel.id);
                    console.log(`[CRON] Duel ID ${duel.id} timed out after both players joined but never started. Voiding with tax.`);
                }

                await txClient.query('COMMIT');
            } catch (err) {
                await txClient.query('ROLLBACK');
                console.error(`[CRON] Error processing forfeit for duel ID ${duel.id}:`, err);
            } finally {
                txClient.release();
            }
        }
    } catch (error) {
        console.error('[CRON] Error querying for timed-out started duels:', error);
    } finally {
        forfeitClient.release();
    }
    
    // --- Task 4: Finalize duels where the 2-minute confirmation timer has expired ---
    const confirmationClient = await pool.connect();
    try {
        const confirmationSql = `
            SELECT id, pot, winner_id, challenger_id, opponent_id
            FROM duels
            WHERE status = 'completed_unseen'
              AND result_posted_at <= NOW() - INTERVAL '${RESULT_CONFIRMATION_MINUTES} minutes'
        `;
        const { rows: expiredConfirmations } = await confirmationClient.query(confirmationSql);

        for (const duel of expiredConfirmations) {
            const txClient = await pool.connect();
            try {
                await txClient.query('BEGIN');

                console.log(`[CRON] Auto-confirming duel ID ${duel.id} after 2-minute timeout.`);
                
                const loserId = (duel.winner_id.toString() === duel.challenger_id.toString()) ? duel.opponent_id : duel.challenger_id;
                
                await txClient.query('UPDATE users SET gems = gems + $1, wins = wins + 1 WHERE id = $2', [duel.pot, duel.winner_id]);
                await txClient.query('UPDATE users SET losses = losses + 1 WHERE id = $1', [loserId]);
                await txClient.query("UPDATE duels SET status = 'completed' WHERE id = $1", [duel.id]);
                await cohostService.creditCohostForDuel(duel.id, txClient);

                await txClient.query('COMMIT');
                console.log(`[CRON] Duel ${duel.id} finalized and pot of ${duel.pot} paid out to winner ${duel.winner_id}.`);
            } catch (txError) {
                await txClient.query('ROLLBACK');
                console.error(`[CRON] Error auto-confirming duel ID ${duel.id}:`, txError);
            } finally {
                txClient.release();
            }
        }
    } catch (error) {
        console.error('[CRON] Error querying for expired confirmations:', error);
    } finally {
        confirmationClient.release();
    }

    // --- Task 5: Manage Co-Host Sessions (Penalties & Promotions) ---
    const cohostClient = await pool.connect();
    try {
        const crashedSql = `
            UPDATE host_contracts
            SET status = 'crashed', end_time = NOW()
            WHERE status = 'active'
            AND last_heartbeat < NOW() - INTERVAL '${COHOST_HEARTBEAT_TIMEOUT_SECONDS} seconds'
            RETURNING id;
        `;
        const { rows: crashedContracts } = await cohostClient.query(crashedSql);
        for (const contract of crashedContracts) {
            console.log(`[CRON][COHOST] Detected crashed contract ${contract.id}. Processing penalty.`);
            await cohostService.processPenalty(contract.id);
        }

        const completedSql = `
            UPDATE host_contracts
            SET status = 'completed', end_time = NOW()
            WHERE status = 'winding_down'
            AND last_heartbeat < NOW() - INTERVAL '${COHOST_HEARTBEAT_TIMEOUT_SECONDS} seconds'
            RETURNING id;
        `;
        const { rows: completedContracts } = await cohostClient.query(completedSql);
        for (const contract of completedContracts) {
            console.log(`[CRON][COHOST] Detected completed contract ${contract.id}. Processing for promotion.`);
            await cohostService.processCompletion(contract.id);
        }

    } catch (error) {
        console.error('[CRON][COHOST] Error managing co-host sessions:', error);
    } finally {
        cohostClient.release();
    }
}

runScheduledTasks()
    .then(() => {
        console.log("[CRON] Scheduled tasks finished successfully.");
        process.exit(0);
    })
    .catch(err => {
        console.error("[CRON] Scheduled tasks failed:", err);
        process.exit(1);
    });
