require('dotenv').config({ path: require('path').resolve(__dirname, './.env') });
const db = require('./database/database');

const decrementPlayerCount = async (client, duelId) => {
    try {
        const { rows: [duel] } = await client.query('SELECT assigned_server_id FROM duels WHERE id = $1', [duelId]);
        if (duel && duel.assigned_server_id) {
            await client.query('UPDATE game_servers SET player_count = GREATEST(0, player_count - 2) WHERE server_id = $1', [duel.assigned_server_id]);
            console.log(`[PlayerCount][CRON] Decremented player count for server ${duel.assigned_server_id} from duel ${duelId}.`);
        }
    } catch (err) {
        console.error(`[PlayerCount][CRON] Failed to decrement player count for duel ${duelId}:`, err);
    }
};

async function runScheduledTasks() {
    console.log(`[CRON] Running scheduled tasks at ${new Date().toISOString()}`);
    const pool = db.getPool();

    const DUEL_EXPIRATION_HOURS = parseInt(process.env.DUEL_EXPIRATION_HOURS || '1', 10);
    const DUEL_FORFEIT_MINUTES_DIRECT = parseInt(process.env.DUEL_FORFEIT_MINUTES_DIRECT || '10', 10);
    const DUEL_FORFEIT_MINUTES_RANDOM = parseInt(process.env.DUEL_FORFEIT_MINUTES_RANDOM || '3', 10);
    const RESULT_CONFIRMATION_MINUTES = parseInt(process.env.RESULT_CONFIRMATION_MINUTES || '2', 10);
    const SERVER_CRASH_THRESHOLD_SECONDS = parseInt(process.env.SERVER_CRASH_THRESHOLD_SECONDS || '50', 10);
    const TOURNAMENT_DISPUTE_HOURS = 1;

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

    const forfeitClient = await pool.connect();
    try {
        const startedSql = `
            SELECT id, challenger_id, opponent_id, pot, wager, transcript, tax_collected, type
            FROM duels 
            WHERE status = 'started' AND (
                (type = 'direct' AND started_at <= NOW() - INTERVAL '${DUEL_FORFEIT_MINUTES_DIRECT} minutes') OR
                (type = 'random' AND started_at <= NOW() - INTERVAL '${DUEL_FORFEIT_MINUTES_RANDOM} minutes')
            )
        `;
        const { rows: expiredStartedDuels } = await forfeitClient.query(startedSql);
        for (const duel of expiredStartedDuels) {
            const txClient = await pool.connect();
            try {
                await txClient.query('BEGIN');
                const { rows: [challenger] } = await txClient.query('SELECT id, linked_roblox_username FROM users WHERE id = $1', [duel.challenger_id]);
                const { rows: [opponent] } = await txClient.query('SELECT id, linked_roblox_username FROM users WHERE id = $1', [duel.opponent_id]);
                const transcript = duel.transcript || [];
                const joinedPlayers = new Set(transcript.filter(event => event.eventType === 'PLAYER_JOINED_DUEL' && event.data?.playerName).map(event => event.data.playerName));
                const challengerJoined = joinedPlayers.has(challenger.linked_roblox_username);
                const opponentJoined = joinedPlayers.has(opponent.linked_roblox_username);

                if (!challengerJoined && !opponentJoined) {
                    let adjustedTax = parseInt(duel.tax_collected);
                    if (adjustedTax % 2 !== 0) { adjustedTax++; }
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
                    await decrementPlayerCount(txClient, duel.id);
                    console.log(`[CRON] Duel ID ${duel.id} forfeited by ${opponent.linked_roblox_username}.`);
                } 
                else if (!challengerJoined && opponentJoined) {
                    await txClient.query('UPDATE users SET gems = gems + $1, wins = wins + 1 WHERE id = $2', [duel.pot, duel.opponent_id]);
                    await txClient.query('UPDATE users SET losses = losses + 1 WHERE id = $1', [duel.challenger_id]);
                    await txClient.query("UPDATE duels SET status = 'completed', winner_id = $1 WHERE id = $2", [duel.opponent_id, duel.id]);
                    await decrementPlayerCount(txClient, duel.id);
                    console.log(`[CRON] Duel ID ${duel.id} forfeited by ${challenger.linked_roblox_username}.`);
                }
                else {
                    console.log(`[CRON] Standoff detected for duel ${duel.id}. Analyzing transcript for ready declarations...`);
                    
                    const readyEvents = transcript.filter(event => event.eventType === 'PLAYER_DECLARED_READY_ON_PAD');
                    const challengerReady = readyEvents.some(event => event.data?.playerName === challenger.linked_roblox_username);
                    const opponentReady = readyEvents.some(event => event.data?.playerName === opponent.linked_roblox_username);

                    if (challengerReady && !opponentReady) {
                        await txClient.query('UPDATE users SET gems = gems + $1, wins = wins + 1 WHERE id = $2', [duel.pot, duel.challenger_id]);
                        await txClient.query('UPDATE users SET losses = losses + 1 WHERE id = $1', [duel.opponent_id]);
                        await txClient.query("UPDATE duels SET status = 'completed', winner_id = $1 WHERE id = $2", [duel.challenger_id, duel.id]);
                        await decrementPlayerCount(txClient, duel.id);
                        console.log(`[CRON] Duel ID ${duel.id} forfeited by ${opponent.linked_roblox_username} (failed to ready up).`);
                    } else if (!challengerReady && opponentReady) {
                        await txClient.query('UPDATE users SET gems = gems + $1, wins = wins + 1 WHERE id = $2', [duel.pot, duel.opponent_id]);
                        await txClient.query('UPDATE users SET losses = losses + 1 WHERE id = $1', [duel.challenger_id]);
                        await txClient.query("UPDATE duels SET status = 'completed', winner_id = $1 WHERE id = $2", [duel.opponent_id, duel.id]);
                        await decrementPlayerCount(txClient, duel.id);
                        console.log(`[CRON] Duel ID ${duel.id} forfeited by ${challenger.linked_roblox_username} (failed to ready up).`);
                    } else {
                        let adjustedTax = parseInt(duel.tax_collected);
                        if (adjustedTax % 2 !== 0) { adjustedTax++; }
                        await txClient.query('UPDATE duels SET tax_collected = $1 WHERE id = $2', [adjustedTax, duel.id]);
                        const refundAmount = parseInt(duel.wager) - (adjustedTax / 2);
                        await txClient.query('UPDATE users SET gems = gems + $1 WHERE id = $2', [refundAmount, duel.challenger_id]);
                        await txClient.query('UPDATE users SET gems = gems + $1 WHERE id = $2', [refundAmount, duel.opponent_id]);
                        await txClient.query("UPDATE duels SET status = 'canceled', winner_id = NULL WHERE id = $1", [duel.id]);
                        await decrementPlayerCount(txClient, duel.id);
                        console.log(`[CRON] Duel ID ${duel.id} voided due to mutual inaction. Tax applied, wagers refunded.`);
                    }
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
    
    const confirmationClient = await pool.connect();
    try {
        const confirmationSql = `
            SELECT id, pot, winner_id, challenger_id, opponent_id
            FROM duels
            WHERE status = 'completed_unseen' AND result_posted_at <= NOW() - INTERVAL '${RESULT_CONFIRMATION_MINUTES} minutes'
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

    const crashClient = await pool.connect();
    try {
        const staleServerSql = `SELECT server_id FROM game_servers WHERE last_heartbeat < NOW() - INTERVAL '${SERVER_CRASH_THRESHOLD_SECONDS} seconds'`;
        const { rows: crashedServers } = await crashClient.query(staleServerSql);
        for (const server of crashedServers) {
            const txClient = await pool.connect();
            try {
                await txClient.query('BEGIN');
                console.log(`[CRON][CRASH] Processing crashed server: ${server.server_id}`);
                const duelsSql = `SELECT id, challenger_id, opponent_id, wager FROM duels WHERE assigned_server_id = $1 AND status IN ('started', 'in_progress') FOR UPDATE`;
                const { rows: affectedDuels } = await txClient.query(duelsSql, [server.server_id]);
                for (const duel of affectedDuels) {
                    const refundAmount = parseInt(duel.wager);
                    await txClient.query('UPDATE users SET gems = gems + $1 WHERE id = $2', [refundAmount, duel.challenger_id]);
                    await txClient.query('UPDATE users SET gems = gems + $1 WHERE id = $2', [refundAmount, duel.opponent_id]);
                    const refundDesc = `Refund for Duel #${duel.id} due to server issues.`;
                    await txClient.query("INSERT INTO transaction_history (user_id, type, amount_gems, description, reference_id) VALUES ($1, $2, $3, $4, $5)", [duel.challenger_id, 'server_crash_refund', refundAmount, refundDesc, duel.id]);
                    await txClient.query("INSERT INTO transaction_history (user_id, type, amount_gems, description, reference_id) VALUES ($1, $2, $3, $4, $5)", [duel.opponent_id, 'server_crash_refund', refundAmount, refundDesc, duel.id]);
                    const notificationTitle = "Duel Canceled: Server Issue";
                    const notificationMessage = `Your duel (#${duel.id}) was automatically canceled because the game server stopped responding. Your wager of ${refundAmount} gems has been refunded.`;
                    await txClient.query("INSERT INTO inbox_messages (user_id, type, title, message, reference_id) VALUES ($1, 'server_crash_refund', $2, $3, $4)", [duel.challenger_id, notificationTitle, notificationMessage, duel.id]);
                    await txClient.query("INSERT INTO inbox_messages (user_id, type, title, message, reference_id) VALUES ($1, 'server_crash_refund', $2, $3, $4)", [duel.opponent_id, notificationTitle, notificationMessage, duel.id]);
                    await txClient.query("UPDATE duels SET status = 'canceled' WHERE id = $1", [duel.id]);
                    console.log(`[CRON][CRASH] Voided duel ${duel.id} and refunded ${refundAmount} gems to each player.`);
                }
                await txClient.query('DELETE FROM game_servers WHERE server_id = $1', [server.server_id]);
                console.log(`[CRON][CRASH] Pruned crashed server ${server.server_id} from the database.`);
                await txClient.query('COMMIT');
            } catch (txError) {
                await txClient.query('ROLLBACK');
                console.error(`[CRON][CRASH] Rolled back transaction for crashed server ${server.server_id}:`, txError);
            } finally {
                txClient.release();
            }
        }
    } catch (error) {
        console.error('[CRON][CRASH] Error querying for crashed servers:', error);
    } finally {
        crashClient.release();
    }

    const disputeForfeitClient = await pool.connect();
    try {
        const disputeSql = `
            SELECT d.id, d.duel_id, d.reported_id, du.pot
            FROM disputes d
            JOIN duels du ON d.duel_id = du.id
            WHERE d.status = 'awaiting_user_discord_link' AND d.discord_forwarded_at < NOW() - INTERVAL '24 hours'
        `;
        const { rows: forfeitableDisputes } = await disputeForfeitClient.query(disputeSql);
        for (const dispute of forfeitableDisputes) {
            const txClient = await pool.connect();
            try {
                await txClient.query('BEGIN');
                console.log(`[CRON][DISPUTE] Forfeiting dispute ${dispute.id} due to user inaction.`);
                await txClient.query('UPDATE users SET gems = gems + $1 WHERE id = $2', [dispute.pot, dispute.reported_id]);
                await txClient.query("UPDATE duels SET status = 'completed' WHERE id = $1", [dispute.duel_id]);
                const resolutionText = "Forfeited by reporter due to inaction after 24 hours.";
                await txClient.query("UPDATE disputes SET status = 'resolved', resolution = $1, resolved_at = NOW() WHERE id = $2", [resolutionText, dispute.id]);
                await txClient.query("DELETE FROM inbox_messages WHERE type = 'dispute_discord_link_prompt' AND reference_id = $1", [dispute.id.toString()]);
                await txClient.query('COMMIT');
            } catch (txError) {
                await txClient.query('ROLLBACK');
                console.error(`[CRON][DISPUTE] Error forfeiting dispute ${dispute.id}:`, txError);
            } finally {
                txClient.release();
            }
        }
    } catch (error) {
        console.error('[CRON][DISPUTE] Error querying for expired dispute prompts:', error);
    } finally {
        disputeForfeitClient.release();
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
