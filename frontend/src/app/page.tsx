"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { DiscordSDK } from '@discord/embedded-app-sdk';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';

// --- 1. CONFIGURATION ---
const TENOR_API_KEY = process.env.NEXT_PUBLIC_TENOR_API_KEY || "GET_YOUR_OWN_API_KEY"; // IMPORTANT: Use .env.local
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001"; // This will be mapped by Discord
const ADMIN_DISCORD_ID = "217998454197190656";

// --- 2. LOCALIZATION (i18n) ---
const translations = {
    en: {
        // UI
        language: "Language",
        lobby: "Lobby",
        promptDeck: "Prompt Deck",
        default: "Default",
        custom: "Custom",
        mixed: "Mixed",
        addPrompt: "Add Custom Prompt (EN/AR)",
        startGame: "Start Game",
        players: "Players",
        // Phases
        promptReveal: "Get Ready!",
        gifSearch: "Find a GIF for:",
        voting: "Vote for the Funniest GIF!",
        roundResults: "Round Winner!",
        // Other
        you: "You",
        waitingForPlayers: "Waiting for players...",
        searchTenor: "Search Tenor GIFs...",
        submitted: "Submitted!",
        voted: "Voted!",
    },
    ar: {
        // UI
        language: "اللغة",
        lobby: "اللوبي",
        promptDeck: "مجموعة الأسئلة",
        default: "الأساسية",
        custom: "المخصصة",
        mixed: "مختلط",
        addPrompt: "أضف سؤال مخصص (انجليزي/عربي)",
        startGame: "ابدأ اللعبة",
        players: "اللاعبين",
        // Phases
        promptReveal: "استعدوا!",
        gifSearch: "ابحث عن GIF مناسب لـ:",
        voting: "صوّت لأفضل GIF!",
        roundResults: "فائز الجولة!",
        // Other
        you: "أنت",
        waitingForPlayers: "في انتظار اللاعبين...",
        searchTenor: "ابحث في Tenor...",
        submitted: "تم الإرسال!",
        voted: "تم التصويت!",
    },
};

// --- 3. AUDIO HOOK PLACEHOLDER ---
const useGameAudio = (roomState) => {
    useEffect(() => {
        const phase = roomState?.phase;
        console.log(`AudioEngine: Phase changed to ${phase}`);
        // ** Placeholder Audio Triggers **
        // Make sure to have these files in your `public/sounds` directory
        switch (phase) {
            case 'LOBBY':
                // const lobbyMusic = new Audio('/sounds/lobby_music.mp3');
                // lobbyMusic.loop = true;
                // lobbyMusic.play();
                break;
            case 'PROMPT_REVEAL':
                // new Audio('/sounds/round_start.mp3').play();
                break;
            case 'GIF_SEARCH':
                // const searchMusic = new Audio('/sounds/search_phase_ticking.mp3');
                // searchMusic.loop = true;
                // searchMusic.play();
                break;
            case 'VOTING':
                // const votingMusic = new Audio('/sounds/voting_music.mp3');
                // votingMusic.loop = true;
                // votingMusic.play();
                break;
            case 'ROUND_RESULTS':
                // new Audio('/sounds/round_winner.mp3').play();
                break;
        }

        // Cleanup function to stop looping sounds
        return () => {
            // Here you would stop any looping audio
            // e.g., lobbyMusic.pause(); searchMusic.pause();
            console.log("AudioEngine: Cleaning up audio for previous phase.");
        };
    }, [roomState?.phase]);
};


// --- 4. DISCORD & SOCKET SETUP ---
let discordSdk;
if (typeof window !== 'undefined') {
    discordSdk = new DiscordSDK(process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID || "");
}

let socket;

// --- 5. MAIN GAME COMPONENT ---
export default function Home() {
    const [lang, setLang] = useState('en');
    const [auth, setAuth] = useState(null);
    const [roomState, setRoomState] = useState(null);
    const [socketId, setSocketId] = useState(null);

    const t = useMemo(() => translations[lang], [lang]);

    useGameAudio(roomState);

    const setupDiscordSdk = async () => {
        await discordSdk.ready();

        // Authorize with Discord Client
        const { code } = await discordSdk.commands.authorize({
            client_id: process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID,
            response_type: 'code',
            state: '',
            prompt: 'none',
            scope: ['identify', 'guilds.members.read'],
        });

        // Retrieve an access_token from your embedded app's server
        const response = await fetch('/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
        });
        const { access_token } = await response.json();

        // Authenticate with Discord client (using the access_token)
        const newAuth = await discordSdk.commands.authenticate({ access_token });
        setAuth(newAuth);

        // Get guild member's nickname
        const guildMember = await discordSdk.commands.getGuildMember({guild_id: discordSdk.guildId});
        
        // --- URL MAPPING FOR DEPLOYMENT ---
        // This is crucial for your backend calls to work once deployed
        await discordSdk.commands.patchUrlMappings([
            {
                frontend_domain: window.location.hostname,
                backend_domain: 'localhost', // The host of your backend server
                backend_port: 3001,
            },
        ]);

        // Connect to Socket.IO server
        socket = io(SOCKET_URL);
        socket.on('connect', () => {
            console.log("Socket connected!", socket.id);
            setSocketId(socket.id);
            socket.emit('join_room', {
                discordId: newAuth.user.id,
                username: guildMember?.nick || newAuth.user.username,
            });
        });

        socket.on('room_state_update', (newState) => {
            console.log('Received room state update:', newState);
            setRoomState(newState);
        });
    };

    useEffect(() => {
        if (typeof window !== 'undefined') {
            document.documentElement.lang = lang;
            document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
        }
        setupDiscordSdk().catch(console.error);

        return () => {
            socket?.disconnect();
        };
    }, [lang]);
    
    const isAdmin = auth?.user.id === ADMIN_DISCORD_ID;

    // --- RENDER FUNCTIONS FOR PHASES ---
    const renderLobby = () => (
        <div className="w-full max-w-4xl mx-auto p-8">
            <h1 className="text-5xl font-bold text-center mb-8 text-brand-pink tracking-wider animate-fade-in">{t.lobby}</h1>
            
            {isAdmin && <AdminDashboard />}

            <div className="mt-8 bg-dark-bg/50 p-6 rounded-lg shadow-lg">
                <h2 className="text-3xl font-semibold mb-4 text-brand-blue">{t.players}</h2>
                <ul className="space-y-2">
                    {roomState?.players && Object.values(roomState.players).map(p => (
                         <li key={p.discordId} className="flex items-center justify-between p-2 rounded bg-brand-purple/20">
                            <span className="font-medium">{p.username} {p.discordId === auth?.user.id ? `(${t.you})` : ''}</span>
                            <span className="text-sm font-bold text-green-400">{p.score} pts</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );

    const renderPromptReveal = () => (
         <div className="text-center animate-bounce-in">
            <h2 className="text-2xl text-brand-blue mb-4">{t.promptReveal}</h2>
            <p className="text-4xl font-bold p-4 bg-black/30 rounded-lg">{roomState.currentPrompt[lang]}</p>
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 text-6xl font-bold text-brand-pink animate-ticking">{roomState.timer}</div>
        </div>
    );
    
    const renderGifSearch = () => (
        <div className="w-full max-w-3xl mx-auto animate-fade-in">
            <p className="text-center text-xl mb-2 text-brand-blue">{t.gifSearch}</p>
            <h2 className="text-center text-3xl font-bold mb-6">{roomState.currentPrompt[lang]}</h2>
            <GifSearcher />
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 text-6xl font-bold text-brand-pink animate-ticking">{roomState.timer}</div>
        </div>
    );
    
    const renderVoting = () => (
        <div className="w-full max-w-6xl mx-auto animate-fade-in">
            <h2 className="text-center text-3xl font-bold mb-6 text-brand-blue">{t.voting}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {roomState?.submissions && Object.entries(roomState.submissions).map(([id, gifUrl]) => (
                    <div key={id} className="relative aspect-square">
                        <img src={gifUrl} alt="player submission" className="w-full h-full object-cover rounded-lg"/>
                        {id !== socketId && !roomState.votes[socketId] && (
                             <button 
                                onClick={() => socket.emit('player_submit_vote', id)}
                                className="absolute inset-0 bg-black/50 flex items-center justify-center text-2xl font-bold opacity-0 hover:opacity-100 transition-opacity">
                                Vote
                            </button>
                        )}
                        {roomState.votes[socketId] === id && <div className="absolute inset-0 bg-green-500/70 flex items-center justify-center text-3xl font-bold">{t.voted}</div>}
                    </div>
                ))}
            </div>
             <div className="absolute bottom-10 left-1/2 -translate-x-1/2 text-6xl font-bold text-brand-pink animate-ticking">{roomState.timer}</div>
        </div>
    );

    const renderRoundResults = () => (
        <div className="text-center animate-bounce-in">
            <h2 className="text-3xl font-bold text-brand-blue mb-4">{t.roundResults}</h2>
            {roomState.roundWinner ? (
                <div className="flex flex-col items-center">
                    <img src={roomState.roundWinner.gifUrl} alt="winning gif" className="max-w-sm w-full rounded-lg shadow-lg mb-4"/>
                    <p className="text-4xl font-bold text-brand-pink">{roomState.roundWinner.username}</p>
                    <p className="text-xl">{roomState.roundWinner.votes} votes</p>
                </div>
            ) : (
                <p className="text-2xl">No winner this round!</p>
            )}
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 text-6xl font-bold text-brand-pink">{roomState.timer}</div>
        </div>
    );


    const renderContent = () => {
        if (!auth || !roomState) {
            return <div className="text-center text-2xl">{t.waitingForPlayers}</div>;
        }
        switch (roomState.phase) {
            case 'LOBBY': return renderLobby();
            case 'PROMPT_REVEAL': return renderPromptReveal();
            case 'GIF_SEARCH': return renderGifSearch();
            case 'VOTING': return renderVoting();
            case 'ROUND_RESULTS': return renderRoundResults();
            default: return <div>Unknown phase: {roomState.phase}</div>;
        }
    };

    return (
        <main className="min-h-screen w-full flex flex-col items-center justify-center p-4 relative font-sans">
            {/* Language Toggle */}
            <div className="absolute top-4 end-4">
                <select onChange={(e) => setLang(e.target.value)} value={lang} className="bg-brand-purple/50 border-none rounded p-2">
                    <option value="en">English</option>
                    <option value="ar">العربية</option>
                </select>
            </div>
            
            <AnimatePresence mode="wait">
                 <motion.div
                    key={roomState?.phase || 'loading'}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.3 }}
                    className="w-full h-full flex items-center justify-center"
                >
                    {renderContent()}
                </motion.div>
            </AnimatePresence>
        </main>
    );
}


// --- 6. HELPER COMPONENTS ---

function AdminDashboard() {
    const [newPromptEn, setNewPromptEn] = useState('');
    const [newPromptAr, setNewPromptAr] = useState('');
    const t = useMemo(() => translations[document.documentElement.lang || 'en'], [document.documentElement.lang]);

    const handleSetDeck = (deck) => {
        socket?.emit('admin_set_deck', deck);
    };
    
    const handleAddPrompt = (e) => {
        e.preventDefault();
        if (newPromptEn && newPromptAr) {
            socket?.emit('admin_add_custom_prompt', { en: newPromptEn, ar: newPromptAr });
            setNewPromptEn('');
            setNewPromptAr('');
        }
    };

    return (
        <div className="bg-brand-purple/20 p-4 rounded-lg shadow-md mt-4">
            <h3 className="text-xl font-bold mb-3">{t.promptDeck}</h3>
            <div className="flex gap-2 mb-4">
                {['DEFAULT', 'CUSTOM', 'MIXED'].map(deck => (
                    <button key={deck} onClick={() => handleSetDeck(deck)} className="px-4 py-2 rounded bg-brand-blue/80 hover:bg-brand-blue transition-colors">
                        {t[deck.toLowerCase()]}
                    </button>
                ))}
            </div>

            <form onSubmit={handleAddPrompt}>
                <h3 className="text-xl font-bold mb-2">{t.addPrompt}</h3>
                <div className="flex gap-2 mb-2">
                    <input type="text" value={newPromptEn} onChange={e => setNewPromptEn(e.target.value)} placeholder="English Prompt" className="w-full p-2 rounded bg-dark-bg/80 border border-brand-purple"/>
                    <input type="text" value={newPromptAr} onChange={e => setNewPromptAr(e.target.value)} placeholder="Arabic Prompt" className="w-full p-2 rounded bg-dark-bg/80 border border-brand-purple"/>
                </div>
                <button type="submit" className="w-full px-4 py-2 rounded bg-green-500/80 hover:bg-green-500 transition-colors">Add</button>
            </form>
             <button onClick={() => socket?.emit('start_game')} className="w-full mt-6 py-3 text-2xl font-bold rounded bg-brand-pink hover:bg-fuchsia-600 transition-transform hover:scale-105">
                {t.startGame}
            </button>
        </div>
    );
}

function GifSearcher() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [submitted, setSubmitted] = useState(false);
    const t = useMemo(() => translations[document.documentElement.lang || 'en'], [document.documentElement.lang]);


    const searchGifs = async (e) => {
        e.preventDefault();
        if (!query) return;
        const url = `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=${TENOR_API_KEY}&limit=12`;
        const response = await fetch(url);
        const data = await response.json();
        setResults(data.results || []);
    };
    
    const selectGif = (gifUrl) => {
        socket.emit('player_submit_gif', gifUrl);
        setSubmitted(true);
    };

    if (submitted) {
        return <div className="text-center text-3xl font-bold text-green-400 animate-bounce-in">{t.submitted}</div>
    }

    return (
        <div>
            <form onSubmit={searchGifs}>
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t.searchTenor}
                    className="w-full p-3 text-xl rounded bg-dark-bg/80 border-2 border-brand-purple focus:border-brand-pink outline-none"
                />
            </form>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-4 max-h-[50vh] overflow-y-auto">
                {results.map(gif => (
                    <div key={gif.id} onClick={() => selectGif(gif.media_formats.gif.url)} className="aspect-square cursor-pointer hover:scale-105 transition-transform">
                        <img src={gif.media_formats.tinygif.url} alt={gif.content_description} className="w-full h-full object-cover rounded"/>
                    </div>
                ))}
            </div>
        </div>
    );
}
