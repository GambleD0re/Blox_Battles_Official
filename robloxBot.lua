-- Polyfill for environments missing table.pack/unpack
if not table.pack then
    function table.pack(...)
        return { n = select("#", ...), ... }
    end
end

if not table.unpack then
    table.unpack = unpack or function(t, i, j)
        i = i or 1
        j = j or t.n or #t
        return unpack(t, i, j)
    end
end

--[[
    Global Duel Logger (Batched JSON Event Stream)
    Version: 24.2.0 (New Referee Logic)
    Date: 2025-07-29
    CONFIGURED FOR RENDER PRODUCTION
]]

--// Services & Configuration \\--
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local HttpService = game:GetService("HttpService")

local BOT_LOCATION = "NA-East"
local SERVER_NUMBER = 1
local ROBLOX_PLACE_ID = 17625359962

local MANUAL_PRIVATE_SERVER_LINK = ""

local BOT_API_KEY = "YOUR_SECRET_BOT_API_KEY"
local BACKEND_API_BASE_URL = "https://blox-battles-backend.onrender.com/api"

local NODEJS_LOG_WEBHOOK_URL = BACKEND_API_BASE_URL .. "/log"
local GHOST_SPECTATE_CYCLE_DELAY = 1
local EVENT_BATCH_SIZE = 10
local EVENT_BATCH_TIMEOUT = 5
local TASK_FETCH_INTERVAL = 5
local HEARTBEAT_INTERVAL = 20

--// Enable Localhost Requests \\--
pcall(function()
    if syn and syn.request and getgenv then getgenv().syn.request = syn.request; print("Logger: Synapse request function override enabled.")
    elseif http_request and getgenv then getgenv().http_request = http_request; print("Logger: Generic http_request function override enabled.") end
end)

--// Script State \\--
local LocalPlayer = Players.LocalPlayer
local DuelController, SpectateController
local trackedDuels = {}
local eventBuffer = {}
local lastSendTime = tick()
local activeTasks = {}
local serverId = BOT_LOCATION .. "_" .. tostring(SERVER_NUMBER)

--// Webhook & Event Buffering System \\--
local function sendBatch()
    if #eventBuffer == 0 then return end
    local batchToSend = {}
    for i=1,#eventBuffer do table.insert(batchToSend, eventBuffer[i]) end
    eventBuffer = {}
    lastSendTime = tick()
    local payload = HttpService:JSONEncode(batchToSend)
    local req = { Url = NODEJS_LOG_WEBHOOK_URL, Method = "POST", Headers = { ["Content-Type"]="application/json", ["X-API-Key"]=BOT_API_KEY }, Body = payload }
    pcall(function() if syn and syn.request then syn.request(req) elseif http_request then http_request(req) else request(req) end end)
end

local function sendEvent(duelId, eventType, data)
    table.insert(eventBuffer, { duelId = duelId, timestamp = os.date("!%Y-%m-%dT%H:%M:%SZ"), eventType = eventType, data = data or {} })
    if #eventBuffer >= EVENT_BATCH_SIZE then
        sendBatch()
    end
end

local function sendHeartbeat()
    pcall(function()
        local joinLink
        if MANUAL_PRIVATE_SERVER_LINK and MANUAL_PRIVATE_SERVER_LINK ~= "" then
            joinLink = MANUAL_PRIVATE_SERVER_LINK
        else
            joinLink = "https://www.roblox.com/games/start?placeId=" .. tostring(ROBLOX_PLACE_ID) .. "&gameId=" .. game.JobId
        end
        local heartbeatUrl = BACKEND_API_BASE_URL .. "/status/heartbeat"
        local payload = HttpService:JSONEncode({ serverId = serverId, joinLink = joinLink })
        local req = { Url = heartbeatUrl, Method = "POST", Headers = { ["Content-Type"]="application/json", ["X-API-Key"]=BOT_API_KEY }, Body = payload }
        local success, response = pcall(function() if syn and syn.request then return syn.request(req) elseif http_request then return http_request(req) else return request(req) end end)
        if not success or not response or response.StatusCode ~= 200 then warn("Bot: Failed to send heartbeat for " .. serverId) end
    end)
end

local function __geminiLogger_HookMetatable_v3(o,m,f) if typeof(o)~="table" then return end; local t=getmetatable(o); if not t or not t.__index or typeof(t.__index[m])~="function" then return end; local g=t.__index[m]; t.__index[m]=function(e,...) local a=table.pack(...); pcall(function() f(e,table.unpack(a,1,a.n)) end); return g(e,table.unpack(a,1,a.n)) end end

--// Core Duel Tracking & Hooking Logic \\--
local function hookDueler(dueler, duelState)
    if not (dueler and duelState) then return end
    __geminiLogger_HookMetatable_v3(dueler, "ReplicateFromServer", function(self, event, ...) if event == "EliminationEffect" then local args = {...}; sendEvent(duelState.id, "PARSED_ELIMINATION", { victim = self.Player.Name, killer = args[1] and args[1].Name or "Environment", weapon = args[3] or "Unknown" }) end end)
    local fighter = dueler.ClientFighter
    if fighter then
        __geminiLogger_HookMetatable_v3(fighter, "ReplicateFromServer", function(self, event, ...)
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
                                if duelState.taskId then pcall(function() local req = { Url = BACKEND_API_BASE_URL .. "/tasks/" .. duelState.taskId .. "/complete", Method = "POST", Headers = { ["X-API-Key"] = BOT_API_KEY } }; pcall(function() if syn and syn.request then syn.request(req) else request(req) end end) end) end
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

function trackDuel(duel, websiteDuelId, taskId, bannedWeapons)
    if trackedDuels[duel] then return end
    local duelId = websiteDuelId or "random_duel_" .. HttpService:GenerateGUID(false):sub(1, 8)
    local state = { id = duelId, taskId = taskId, bannedWeapons = bannedWeapons or {}, duel = duel, connections = {}, isInitialized = false }
    trackedDuels[duel] = state

    table.insert(state.connections, duel.DuelerAdded:Connect(function(dueler) if state.isInitialized then pcall(hookDueler, dueler, state) end end))
    table.insert(state.connections, duel.MapAdded:Connect(function(map)
        if state.isInitialized then return end
        state.isInitialized = true
        
        -- [MODIFIED] When the map is added, the duel is officially matched. Confirm with the backend.
        if websiteDuelId then
            print("Bot: Duel", websiteDuelId, "matched in-game. Confirming with backend.")
            local confirmUrl = BACKEND_API_BASE_URL .. "/duels/" .. tostring(websiteDuelId) .. "/bot-confirm"
            local req = { Url = confirmUrl, Method = "POST", Headers = { ["X-API-Key"] = BOT_API_KEY } }
            pcall(function() if syn and syn.request then syn.request(req) elseif http_request then http_request(req) else request(req) end end)
        end

        sendEvent(duelId, "DUEL_STARTED", { map = map.Name })
        for _, dueler in ipairs(duel.Duelers) do pcall(hookDueler, dueler, state) end
    end))
    table.insert(state.connections, duel:GetDataChangedSignal("Scores"):Connect(function() sendEvent(duelId, "SCORE_UPDATE", { scores = duel:Get("Scores") }) end))
    table.insert(state.connections, duel:GetDataChangedSignal("Status"):Connect(function() 
        if duel:Get("Status") == "GameOver" then
            local winnerUsername = nil; local scores = duel:Get("Scores")
            if scores then for teamId, score in pairs(scores) do if score >= 5 then for _, dueler in ipairs(duel.Duelers) do if dueler:Get("TeamID") == teamId then winnerUsername = dueler.Player.Name; break end end; break end end end
            sendEvent(duelId, "PARSED_DUEL_ENDED", { winner_username = winnerUsername, finalScores = scores })
            if taskId then pcall(function() local req = { Url = BACKEND_API_BASE_URL .. "/tasks/" .. taskId .. "/complete", Method = "POST", Headers = { ["X-API-Key"] = BOT_API_KEY } }; pcall(function() if syn and syn.request then syn.request(req) else request(req) end end); print("Bot: Marked task", taskId, "as complete.") end) end
            untrackDuel(duel)
        end
    end))
end

function untrackDuel(duel)
    local state = trackedDuels[duel]
    if not state then return end
    for _, conn in ipairs(state.connections) do conn:Disconnect() end
    trackedDuels[duel] = nil
end

local function fetchAndProcessTasks() pcall(function() local r=BACKEND_API_BASE_URL.."/tasks/"..serverId; local e={Url=r,Method="GET",Headers={["X-API-Key"]=BOT_API_KEY}}; local s,t=pcall(function() if syn and syn.request then return syn.request(e) elseif http_request then return http_request(e) else return request(e) end end); if s and t and t.StatusCode==200 then local a=HttpService:JSONDecode(t.Body); if typeof(a)=="table" then for _,e in ipairs(a) do if e.task_type=="REFEREE_DUEL" then local p=e.payload; if p and p.websiteDuelId then print("Bot: Received task for websiteDuelId:",p.websiteDuelId); activeTasks[p.websiteDuelId]=e end end end end else warn("Bot: Failed to fetch tasks from backend for "..serverId) end end) end
local function loadControllersAndModules() local p=LocalPlayer:WaitForChild("PlayerScripts",15); if not p then warn("Logger Error: PlayerScripts not found."); return false end; while not(DuelController and SpectateController) do pcall(function() local c=p:FindFirstChild("Controllers"); if c then if not DuelController then DuelController=require(c.DuelController) end; if not SpectateController then SpectateController=require(c.SpectateController) end end end); if not(DuelController and SpectateController) then task.wait(1) end end; return true end

--// Initialization & Main Loops \\--
if loadControllersAndModules() then
    if DuelController._loggerInitialized then warn("Logger already initialized."); return end
    DuelController._loggerInitialized = true
    print("Global Duel Logger (v24.2.0) Initialized for server: " .. serverId)
    
    DuelController.ObjectAdded:Connect(function(duel) 
        local matchedWebsiteDuelId, matchedTaskId, matchedBannedWeapons = nil, nil, nil
        for websiteId, taskObject in pairs(activeTasks) do 
            local taskPayload = taskObject.payload
            local duelerNamesLower = {}; for _, dueler in ipairs(duel.Duelers) do table.insert(duelerNamesLower, dueler.Player.Name:lower()) end
            if (table.find(duelerNamesLower, taskPayload.challenger:lower()) and table.find(duelerNamesLower, taskPayload.opponent:lower())) then
                matchedWebsiteDuelId = websiteId; matchedTaskId = taskObject.id; matchedBannedWeapons = taskPayload.bannedWeapons; activeTasks[websiteId] = nil 
                print("Bot: Matched in-game duel with websiteDuelId:", matchedWebsiteDuelId); break
            end
        end
        trackDuel(duel, matchedWebsiteDuelId, matchedTaskId, matchedBannedWeapons) 
    end)
    
    DuelController.ObjectRemoved:Connect(untrackDuel)
    
    Players.PlayerRemoving:Connect(function(player)
        for duel, state in pairs(trackedDuels) do
            for _, dueler in ipairs(duel.Duelers) do
                if dueler.Player == player then
                    sendEvent(state.id, "DUEL_PLAYER_DISCONNECTED", { playerName = player.Name })
                    return 
                end
            end
        end
    end)

    task.spawn(function() while true do task.wait(EVENT_BATCH_TIMEOUT); sendBatch() end end)
    task.spawn(function() while true do task.wait(TASK_FETCH_INTERVAL); fetchAndProcessTasks() end end)
    task.spawn(function() while true do task.wait(HEARTBEAT_INTERVAL); sendHeartbeat() end end)
    task.spawn(function() local idx=1; while true do task.wait(GHOST_SPECTATE_CYCLE_DELAY); local l={}; for d in pairs(trackedDuels) do table.insert(l,d) end; if #l>0 then idx=(idx%#l)+1; local t=l[idx]; if t and trackedDuels[t] and t.Duelers[1] and t.Duelers[1].ClientFighter then pcall(SpectateController.SetCurrentSubject,SpectateController,t.Duelers[1].ClientFighter,true) end end end end)
else
    warn("Global Tracker failed to initialize.")
end
