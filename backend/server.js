const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // In production, restrict this to your frontend's URL
    methods: ["GET", "POST"]
  }
});

const ADMIN_DISCORD_ID = "217998454197190656";

const DEFAULT_PROMPTS = {
    en: [
        "When you accidentally open the front camera",
        "That feeling when your code runs on the first try",
        "Waking up on a Monday morning",
        "When you find a surprise sale on your favorite item",
        "Trying to act normal when your crush walks by",
        "When the wifi goes down during an online game",
        "Seeing your friend in public and pretending you don't know them",
        "That one person who always has a crazy story",
        "When you realize you've been muted the whole meeting",
        "The look on your face when you get the perfect comeback... 5 hours later",
    ],
    ar: [
        "شكلك لما تفتح الكاميرا الأمامية بالغلط",
        "شعورك لما الكود يشتغل من أول مرة",
        "لما تصحى من النوم صباح يوم الاثنين",
        "لما تلاقي خصم مفاجئ على شي بخاطرك فيه",
        "لما تحاول تتصرف طبيعي والكراش يمر من جنبك",
        "لما يفصل النت وأنت بنص قيم أونلاين",
        "لما تشوف خويك بمكان عام وتسوي نفسك ما تعرفه",
        "هذاك الشخص اللي دايماً عنده سالفة شاطحة",
        "لما تكتشف إنك كنت مسوي ميوت طول الاجتماع",
        "شكلك لما تجيك الرد المثالي... بعد 5 ساعات",
    ]
};

let roomState = {
    phase: 'LOBBY', // LOBBY -> PROMPT_REVEAL -> GIF_SEARCH -> VOTING -> ROUND_RESULTS
    players: {}, // { socketId: { discordId, username, score, isReady } }
    promptDeck: 'DEFAULT', // DEFAULT, CUSTOM, MIXED
    customPrompts: { en: [], ar: [] },
    currentPrompt: { en: '', ar: '' },
    submissions: {}, // { socketId: gifUrl }
    votes: {}, // { socketId: votedForSocketId }
    roundWinner: null, // { socketId, gifUrl, username, votes }
    timer: null,
};

let gameLoopInterval;
const ROUND_TIMES = {
    PROMPT_REVEAL: 5, // seconds
    GIF_SEARCH: 45, // seconds
    VOTING: 30, // seconds
    ROUND_RESULTS: 10, // seconds
};

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // === Player & Room Management ===
    socket.on('join_room', ({ discordId, username }) => {
        const isAdmin = discordId === ADMIN_DISCORD_ID;
        roomState.players[socket.id] = { discordId, username, score: 0, isReady: false, isAdmin };
        console.log(`${username} (${discordId}) joined. Admin: ${isAdmin}`);
        io.emit('room_state_update', roomState);
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        delete roomState.players[socket.id];
        delete roomState.submissions[socket.id];
        delete roomState.votes[socket.id];
        // If the admin disconnects, maybe reset the game or assign a new admin? For now, just remove.
        io.emit('room_state_update', roomState);
    });

    // === Admin Controls ===
    socket.on('admin_set_deck', (deck) => {
        if (roomState.players[socket.id]?.isAdmin && roomState.phase === 'LOBBY') {
            roomState.promptDeck = deck;
            io.emit('room_state_update', roomState);
        }
    });

    socket.on('admin_add_custom_prompt', ({ en, ar }) => {
        if (roomState.players[socket.id]?.isAdmin && roomState.phase === 'LOBBY') {
            if (en && ar) {
                roomState.customPrompts.en.push(en);
                roomState.customPrompts.ar.push(ar);
                io.emit('room_state_update', roomState);
            }
        }
    });

    socket.on('start_game', () => {
        if (roomState.players[socket.id]?.isAdmin && roomState.phase === 'LOBBY') {
            console.log("Game start triggered by admin.");
            startGameLoop();
        }
    });
    
    // === Gameplay Events ===
    socket.on('player_submit_gif', (gifUrl) => {
        if (roomState.phase === 'GIF_SEARCH' && roomState.players[socket.id]) {
            roomState.submissions[socket.id] = gifUrl;
            // Maybe emit an update to show who has submitted?
            io.emit('room_state_update', roomState);
        }
    });
    
    socket.on('player_submit_vote', (votedForSocketId) => {
        if (roomState.phase === 'VOTING' && roomState.players[socket.id] && socket.id !== votedForSocketId) {
            roomState.votes[socket.id] = votedForSocketId;
            // Maybe emit an update to show who has voted?
            io.emit('room_state_update', roomState);
        }
    });
});

const selectNewPrompt = () => {
    let deckEn = [];
    let deckAr = [];

    switch (roomState.promptDeck) {
        case 'CUSTOM':
            deckEn = [...roomState.customPrompts.en];
            deckAr = [...roomState.customPrompts.ar];
            break;
        case 'MIXED':
            deckEn = [...DEFAULT_PROMPTS.en, ...roomState.customPrompts.en];
            deckAr = [...DEFAULT_PROMPTS.ar, ...roomState.customPrompts.ar];
            break;
        case 'DEFAULT':
        default:
            deckEn = [...DEFAULT_PROMPTS.en];
            deckAr = [...DEFAULT_PROMPTS.ar];
    }
    
    if (deckEn.length === 0) {
        roomState.currentPrompt = { en: "No prompts available!", ar: "لا توجد أسئلة!" };
        return;
    }

    const index = Math.floor(Math.random() * deckEn.length);
    roomState.currentPrompt = { en: deckEn[index], ar: deckAr[index] };
};

const tallyVotes = () => {
    const voteCounts = {};
    Object.values(roomState.votes).forEach(votedForId => {
        voteCounts[votedForId] = (voteCounts[votedForId] || 0) + 1;
    });

    let winnerId = null;
    let maxVotes = 0;
    for (const [socketId, count] of Object.entries(voteCounts)) {
        if (count > maxVotes) {
            maxVotes = count;
            winnerId = socketId;
        }
    }

    if (winnerId) {
        roomState.players[winnerId].score += 1; // Award point
        roomState.roundWinner = {
            socketId: winnerId,
            username: roomState.players[winnerId].username,
            gifUrl: roomState.submissions[winnerId],
            votes: maxVotes
        };
    } else {
        roomState.roundWinner = null; // No winner if no votes or a tie (future improvement: handle ties)
    }
};

const advancePhase = () => {
    switch (roomState.phase) {
        case 'LOBBY':
            roomState.phase = 'PROMPT_REVEAL';
            selectNewPrompt();
            roomState.submissions = {};
            roomState.votes = {};
            roomState.roundWinner = null;
            break;
        case 'PROMPT_REVEAL':
            roomState.phase = 'GIF_SEARCH';
            break;
        case 'GIF_SEARCH':
            roomState.phase = 'VOTING';
            break;
        case 'VOTING':
            tallyVotes();
            roomState.phase = 'ROUND_RESULTS';
            break;
        case 'ROUND_RESULTS':
            // Check for game end condition or loop back
            roomState.phase = 'PROMPT_REVEAL';
            selectNewPrompt();
            roomState.submissions = {};
            roomState.votes = {};
            roomState.roundWinner = null;
            break;
    }
    
    // Set timer for the new phase
    roomState.timer = ROUND_TIMES[roomState.phase] || null;
    io.emit('room_state_update', roomState);
};


const startGameLoop = () => {
    if (gameLoopInterval) clearInterval(gameLoopInterval);
    
    advancePhase(); // Move from LOBBY to PROMPT_REVEAL
    
    gameLoopInterval = setInterval(() => {
        if (roomState.timer !== null) {
            roomState.timer -= 1;
            if (roomState.timer <= 0) {
                advancePhase();
            }
        }
        io.emit('room_state_update', roomState);
    }, 1000);
};


const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Horoj Haniya server running on port ${PORT}`);
});
