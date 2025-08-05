--[[
    Blox Battles Co-Host Bot Script Template (Task-Pulling Version)
    Version: 25.3.4 (Enhanced Success Logging)
    
    This script merges the robust, feature-rich logic from the v4 official bot script
    with the dynamic, task-pulling architecture of the co-hosting system.
]]

return function()
    --// Dynamic Configuration - These values are injected by the backend \\--
    local authToken = "%%TEMP_AUTH_TOKEN%%"
    local serverId = "%%CONTRACT_ID%%"
    local MANUAL_PRIVATE_SERVER_LINK = "%%PRIVATE_SERVER_LINK%%"

    --// Initial Validation \\--
    if not authToken or authToken == "%%TEMP_AUTH_TOKEN%%" or not serverId or serverId == "%%CONTRACT_ID%%" then
        warn("Blox Battles Co-Host: Script is not configured correctly. Critical data is missing.")
        return
    end

    print("Blox Battles Co-Host: Script started. Version 25.3.4 (Enhanced Success Logging)")

    --// Services & Static Configuration \\--
    local Players = game:GetService("Players")
    local HttpService = game:GetService("HttpService")

    local BOT_API_KEY = "co-host-key"
    local BACKEND_API_BASE_URL = "https://blox-battles-backend.onrender.com/api"
    local HEARTBEAT_URL = BACKEND_API_BASE_URL .. "/cohost/heartbeat"
    local LOG_URL = BACKEND_API_BASE_URL .. "/log"
    local TASK_URL = BACKEND_API_BASE_URL .. "/cohost/tasks"

    local EVENT_BATCH_SIZE = 10
    local EVENT_BATCH_TIMEOUT = 5
    local HEARTBEAT_INTERVAL = 20
    local TASK_FETCH_INTERVAL = 5
    local MODULE_WAIT_TIMEOUT = 30
    local GHOST_SPECTATE_CYCLE_DELAY = 1

    --// Enable Localhost Requests \\--
    pcall(function()
        if syn and syn.request and getgenv then getgenv().syn.request = syn.request; print("Co-Host Bot: Synapse request function override enabled.")
        elseif http_request and getgenv then getgenv().http_request = http_request; print("Co-Host Bot: Generic http_request function override enabled.") end
    end)

    --// Script State \\--
    local DuelController, SpectateController
    local trackedDuels = {}
    local eventBuffer = {}
    local lastSendTime = tick()
    local activeTasks = {}
    local isRunning = true
    local lastTaxCheck = {}

    --// Web Request & Event Buffering System \\--
    local function sendRequest(requestData)
        local success, response = pcall(function()
            if syn and syn.request then return syn.request(requestData)
            elseif http_request then return http_request(requestData)
            else return request(requestData) end
        end)
        return success, response
    end
    
    local function sendBatch()
        if not isRunning or #eventBuffer == 0 then return end
        local batchToSend = table.clone(eventBuffer)
        eventBuffer = {}
        lastSendTime = tick()
        local payload = HttpService:JSONEncode(batchToSend)
        local req = { Url = LOG_URL, Method = "POST", Headers = { ["Content-Type"]="application/json", ["X-API-Key"]=BOT_API_KEY }, Body = payload }
        sendRequest(req)
    end

    local function sendEvent(duelId, eventType, data)
        if not isRunning then return end
        table.insert(eventBuffer, { duelId = duelId, timestamp = os.date("!%Y-%m-%dT%H:%M:%SZ"), eventType = eventType, data = data or {} })
        if #eventBuffer >= EVENT_BATCH_SIZE then sendBatch() end
    end
    
    local function sendHeartbeat()
        if not isRunning then return end
        local totalTaxCollectedSinceLast = 0
        for duel, state in pairs(trackedDuels) do
            local currentTotalTax = duel:Get("TotalTax") or 0
            local lastKnownTax = lastTaxCheck[duel] or 0
            if currentTotalTax > lastKnownTax then
                totalTaxCollectedSinceLast = totalTaxCollectedSinceLast + (currentTotalTax - lastKnownTax)
                lastTaxCheck[duel] = currentTotalTax
            end
        end

        local payload = HttpService:JSONEncode({ gems_collected_since_last = totalTaxCollectedSinceLast })
        local req = { Url = HEARTBEAT_URL, Method = "POST", Headers = { ["Content-Type"]="application/json", ["X-Cohost-Token"]=authToken }, Body = payload }
        
        local success, response = sendRequest(req)
        if success and response and response.StatusCode == 200 then
            -- [NEW] Added success log for heartbeat
            print("Co-Host Bot: Heartbeat sent successfully.")
            local successBody, responseBody = pcall(function() return HttpService:JSONDecode(response.Body) end)
            if not successBody then print("Co-Host Bot: Heartbeat response was invalid JSON. Stopping."); isRunning = false; return end
            if responseBody.newAuthToken then print("Co-Host Bot: SUCCESS! Contract secured. Switching to permanent auth token."); authToken = responseBody.newAuthToken end
            if responseBody.command == "shutdown" then print("Co-Host Bot: Shutdown command received from backend."); isRunning = false end
        else
            warn("Co-Host Bot: Heartbeat failed. Stopping script. Status: " .. tostring(response and response.StatusCode))
            isRunning = false
        end
    end
    
    local function fetchAndProcessTasks()
        if not isRunning then return end
        local req = { Url = TASK_URL, Method = "GET", Headers = { ["X-Cohost-Token"] = authToken } }
        local success, response = sendRequest(req)
        if success and response and response.StatusCode == 200 then
            local successBody, tasks = pcall(function() return HttpService:JSONDecode(response.Body) end)
            if successBody and typeof(tasks) == "table" then
                for _, task in ipairs(tasks) do
                    if task.task_type == "REFEREE_DUEL" and task.payload and task.payload.websiteDuelId then
                        print("Co-Host Bot: Received task for websiteDuelId:", task.payload.websiteDuelId)
                        activeTasks[task.payload.websiteDuelId] = task
                    end
                end
            end
        else
            warn("Co-Host Bot: Failed to fetch tasks for contract " .. serverId)
        end
    end

    local function markTaskComplete(taskId)
        if not taskId then return end
        local req = { Url = BACKEND_API_BASE_URL .. "/tasks/" .. tostring(taskId) .. "/complete", Method = "POST", Headers = { ["X-API-Key"] = BOT_API_KEY } }
        sendRequest(req)
        print("Co-Host Bot: Marked task", taskId, "as complete.")
    end

    local function __hook(obj, method, func) local old = getmetatable(obj).__index[method]; getmetatable(obj).__index[method] = function(...) local args = {...}; pcall(func, ...); return old(table.unpack(args)) end end

    --// Core Duel Tracking & Hooking Logic \\--
    local function untrackDuel(duel)
        local state = trackedDuels[duel]
        if not state then return end
        for _, conn in ipairs(state.connections) do conn:Disconnect() end
        lastTaxCheck[duel] = nil
        trackedDuels[duel] = nil
    end
    
    local function hookDueler(dueler, duelState)
        if not (dueler and duelState) then return end
        __hook(dueler, "ReplicateFromServer", function(self, event, ...) if event == "EliminationEffect" then local args = {...}; sendEvent(duelState.id, "PARSED_ELIMINATION", { victim = self.Player.Name, killer = args[1] and args[1].Name or "Environment", weapon = args[3] or "Unknown" }) end end)
        local fighter = dueler.ClientFighter
        if fighter then
            __hook(fighter, "ReplicateFromServer", function(self, event, ...)
                if event == "DataValueChanged" then
                    local args = {...}
                    if args[1] == "_" and typeof(args[2]) == "table" then
                        local currentLoadout = args[2]
                        sendEvent(duelState.id, "PARSED_LOADOUT_UPDATE", { playerName = self.Player.Name, loadout = currentLoadout })
                        if duelState.bannedWeapons and #duelState.bannedWeapons > 0 then
                            for _, bannedWeaponName in ipairs(duelState.bannedWeapons) do
                                if table.find(currentLoadout, bannedWeaponName) then
                                    warn("Banned item detected! Player:", self.Player.Name, "equipped:", bannedWeaponName)
                                    local innocentPlayerName = nil
                                    for _, d in ipairs(duelState.duel.Duelers) do if d.Player.Name ~= self.Player.Name then innocentPlayerName = d.Player.Name; break end end
                                    sendEvent(duelState.id, "PARSED_DUEL_ENDED", { winner_username = innocentPlayerName, forfeit_reason = "Banned item equipped: " .. bannedWeaponName })
                                    markTaskComplete(duelState.taskId)
                                    untrackDuel(duelState.duel)
                                    break
                                end
                            end
                        end
                    end
                end
            end)
        end
    end
    
    local function trackDuel(duel)
        if not isRunning or trackedDuels[duel] then return end
        local matchedWebsiteDuelId, matchedTaskId, matchedBannedWeapons = nil, nil, nil
        for websiteId, taskObject in pairs(activeTasks) do 
            local taskPayload = taskObject.payload
            local duelerNamesLower = {}
            for _, dueler in ipairs(duel.Duelers) do table.insert(duelerNamesLower, dueler.Player.Name:lower()) end
            
            if (table.find(duelerNamesLower, taskPayload.challenger:lower()) and table.find(duelerNamesLower, taskPayload.opponent:lower())) then
                matchedWebsiteDuelId = websiteId
                matchedTaskId = taskObject.id
                matchedBannedWeapons = taskPayload.bannedWeapons
                activeTasks[websiteId] = nil 
                print("Co-Host Bot: Matched in-game duel with websiteDuelId:", matchedWebsiteDuelId)
                break
            end
        end
        if not matchedWebsiteDuelId then return end

        local state = { id = matchedWebsiteDuelId, taskId = matchedTaskId, bannedWeapons = matchedBannedWeapons or {}, duel = duel, connections = {}, isInitialized = false }
        trackedDuels[duel] = state
        lastTaxCheck[duel] = duel:Get("TotalTax") or 0

        table.insert(state.connections, duel.DuelerAdded:Connect(function(dueler) if state.isInitialized then pcall(hookDueler, dueler, state) end end))
        table.insert(state.connections, duel.MapAdded:Connect(function(map)
            if state.isInitialized then return end
            state.isInitialized = true
            local confirmUrl = BACKEND_API_BASE_URL .. "/duels/" .. tostring(state.id) .. "/bot-confirm"; local req = { Url = confirmUrl, Method = "POST", Headers = { ["X-API-Key"] = BOT_API_KEY } }; sendRequest(req)
            sendEvent(state.id, "DUEL_STARTED", { map = map.Name })
            for _, dueler in ipairs(duel.Duelers) do pcall(hookDueler, dueler, state) end
        end))
        table.insert(state.connections, duel:GetDataChangedSignal("Scores"):Connect(function() sendEvent(state.id, "SCORE_UPDATE", { scores = duel:Get("Scores") }) end))
        table.insert(state.connections, duel:GetDataChangedSignal("Status"):Connect(function() 
            if duel:Get("Status") == "GameOver" then
                local winnerUsername = nil; local scores = duel:Get("Scores")
                if scores then for teamId, score in pairs(scores) do if score >= 5 then for _, dueler in ipairs(duel.Duelers) do if dueler:Get("TeamID") == teamId then winnerUsername = dueler.Player.Name; break end end; break end end end
                sendEvent(state.id, "PARSED_DUEL_ENDED", { winner_username = winnerUsername, finalScores = scores })
                markTaskComplete(state.taskId)
                untrackDuel(duel)
            end
        end))
    end
    
    --// Initialization & Main Loops \\--
    local function main()
        local startTime = tick()
        print("Co-Host Bot: Waiting for game modules...")
        repeat
            pcall(function()
                local controllers = Players.LocalPlayer:WaitForChild("PlayerScripts", 5):FindFirstChild("Controllers")
                if controllers then
                    if not DuelController then DuelController = require(controllers.DuelController) end
                    if not SpectateController then SpectateController = require(controllers.SpectateController) end
                end
            end)
            if DuelController and SpectateController then break end
            task.wait(1)
        until (tick() - startTime > MODULE_WAIT_TIMEOUT)

        if not (DuelController and SpectateController) then
            warn("Co-Host Bot: FAILED to find required game modules after " .. MODULE_WAIT_TIMEOUT .. " seconds. The script will not run.")
            return
        end
        
        -- [NEW] Added explicit success log for initialization.
        print("Co-Host Bot: SUCCESS! Modules loaded. Initializing for contract " .. serverId)
        
        DuelController.ObjectAdded:Connect(trackDuel)
        DuelController.ObjectRemoved:Connect(untrackDuel)
        Players.PlayerRemoving:Connect(function(player) for duel, state in pairs(trackedDuels) do for _, dueler in ipairs(duel.Duelers) do if dueler.Player == player then sendEvent(state.id, "DUEL_PLAYER_DISCONNECTED", { playerName = player.Name }); return end end end end)

        task.spawn(function() while isRunning do task.wait(EVENT_BATCH_TIMEOUT); sendBatch() end end)
        task.spawn(function() while isRunning do task.wait(HEARTBEAT_INTERVAL); sendHeartbeat() end end)
        task.spawn(function() while isRunning do task.wait(TASK_FETCH_INTERVAL); fetchAndProcessTasks() end end)
        task.spawn(function() local idx=1; while isRunning do task.wait(GHOST_SPECTATE_CYCLE_DELAY); local l={}; for d in pairs(trackedDuels) do table.insert(l,d) end; if #l>0 then idx=(idx%#l)+1; local t=l[idx]; if t and trackedDuels[t] and t.Duelers[1] and t.Duelers[1].ClientFighter then pcall(SpectateController.SetCurrentSubject,SpectateController,t.Duelers[1].ClientFighter,true) end end end end)
        
        -- [NEW] Added explicit success log for starting main loops.
        print("Co-Host Bot: SUCCESS! Main loops started. Sending initial heartbeat to claim contract...")
        sendHeartbeat()

        while isRunning do task.wait(1) end

        print("Co-Host Bot: Initiating graceful shutdown...")
        sendBatch()
        sendHeartbeat()
        print("Co-Host Bot: Shutdown complete. Client will now close.")
        game:Shutdown()
    end

    pcall(main)
end
