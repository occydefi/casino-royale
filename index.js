require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const ai = require("./ai");

const app = express();
const PORT = 3025;

app.use(cors());
app.use(express.json());

// Storage
const tables = new Map();
const players = new Map();
const tournaments = new Map();
const spectatorBets = new Map();

app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    skill: "Agent-Casino-Royale",
    version: "1.0.0",
    chain: "Solana",
    description: "AI vs AI Poker - Agents bluff, bet and battle. Humans watch and wager.",
    stats: {
      activeTables: tables.size,
      registeredPlayers: players.size,
      ongoingTournaments: tournaments.size
    }
  });
});

// Register agent as player
app.post("/api/players/register", (req, res) => {
  const { agentId, name, wallet, buyIn } = req.body;
  
  if (!agentId || !wallet) {
    return res.status(400).json({ error: "agentId and wallet required" });
  }
  
  const player = {
    id: agentId,
    name: name || agentId,
    wallet,
    chips: buyIn || 1000,
    stats: {
      handsPlayed: 0,
      handsWon: 0,
      totalWinnings: 0,
      biggestPot: 0,
      bluffSuccess: 0,
      bluffAttempts: 0
    },
    style: "unknown", // tight, loose, aggressive, passive
    registeredAt: new Date().toISOString()
  };
  
  players.set(agentId, player);
  
  res.json({
    success: true,
    player,
    message: "Welcome to Casino Royale! May the best AI win. 🎰"
  });
});

// Create poker table
app.post("/api/tables/create", (req, res) => {
  const { name, maxPlayers, blinds, buyInMin, buyInMax } = req.body;
  
  const tableId = crypto.randomBytes(6).toString("hex");
  
  const table = {
    id: tableId,
    name: name || `Table ${tableId}`,
    maxPlayers: maxPlayers || 6,
    blinds: blinds || { small: 5, big: 10 },
    buyIn: { min: buyInMin || 100, max: buyInMax || 1000 },
    seats: [],
    pot: 0,
    communityCards: [],
    currentHand: null,
    status: "waiting", // waiting, playing, showdown
    spectators: 0,
    spectatorBets: [],
    createdAt: new Date().toISOString()
  };
  
  tables.set(tableId, table);
  
  res.json({
    success: true,
    table,
    message: "Table created! Waiting for players..."
  });
});

// Join table
app.post("/api/tables/:tableId/join", (req, res) => {
  const { tableId } = req.params;
  const { agentId, buyIn } = req.body;
  
  const table = tables.get(tableId);
  if (!table) return res.status(404).json({ error: "Table not found" });
  if (table.seats.length >= table.maxPlayers) return res.status(400).json({ error: "Table full" });
  
  const player = players.get(agentId);
  if (!player) return res.status(404).json({ error: "Player not registered" });
  
  const seatBuyIn = buyIn || table.buyIn.min;
  if (seatBuyIn < table.buyIn.min || seatBuyIn > table.buyIn.max) {
    return res.status(400).json({ error: `Buy-in must be between ${table.buyIn.min} and ${table.buyIn.max}` });
  }
  
  table.seats.push({
    agentId,
    name: player.name,
    chips: seatBuyIn,
    cards: [],
    bet: 0,
    folded: false,
    position: table.seats.length
  });
  
  tables.set(tableId, table);
  
  res.json({
    success: true,
    seat: table.seats[table.seats.length - 1],
    playersAtTable: table.seats.length,
    message: `${player.name} joined the table!`
  });
});

// Start hand
app.post("/api/tables/:tableId/deal", (req, res) => {
  const { tableId } = req.params;
  
  const table = tables.get(tableId);
  if (!table) return res.status(404).json({ error: "Table not found" });
  if (table.seats.length < 2) return res.status(400).json({ error: "Need at least 2 players" });
  
  // Reset for new hand
  table.pot = 0;
  table.communityCards = [];
  table.status = "playing";
  
  // Deal cards (simulated)
  const deck = generateDeck();
  shuffleDeck(deck);
  
  table.seats.forEach((seat, i) => {
    seat.cards = [deck.pop(), deck.pop()];
    seat.bet = 0;
    seat.folded = false;
  });
  
  // Post blinds
  const sbIndex = 0;
  const bbIndex = 1;
  table.seats[sbIndex].bet = table.blinds.small;
  table.seats[sbIndex].chips -= table.blinds.small;
  table.seats[bbIndex].bet = table.blinds.big;
  table.seats[bbIndex].chips -= table.blinds.big;
  table.pot = table.blinds.small + table.blinds.big;
  
  table.currentHand = {
    id: crypto.randomBytes(4).toString("hex"),
    deck: deck,
    stage: "preflop", // preflop, flop, turn, river, showdown
    currentPlayer: (bbIndex + 1) % table.seats.length,
    lastRaise: table.blinds.big,
    actions: []
  };
  
  tables.set(tableId, table);
  
  res.json({
    success: true,
    hand: {
      id: table.currentHand.id,
      stage: table.currentHand.stage,
      pot: table.pot,
      blinds: table.blinds
    },
    message: "Cards dealt! Let the games begin!"
  });
});

// Player action
app.post("/api/tables/:tableId/action", (req, res) => {
  const { tableId } = req.params;
  const { agentId, action, amount } = req.body;
  
  const table = tables.get(tableId);
  if (!table) return res.status(404).json({ error: "Table not found" });
  if (!table.currentHand) return res.status(400).json({ error: "No active hand" });
  
  const seatIndex = table.seats.findIndex(s => s.agentId === agentId);
  if (seatIndex === -1) return res.status(404).json({ error: "Not at this table" });
  if (seatIndex !== table.currentHand.currentPlayer) return res.status(400).json({ error: "Not your turn" });
  
  const seat = table.seats[seatIndex];
  const validActions = ["fold", "check", "call", "bet", "raise", "all-in"];
  
  if (!validActions.includes(action.toLowerCase())) {
    return res.status(400).json({ error: "Invalid action" });
  }
  
  const actionRecord = {
    agentId,
    action: action.toLowerCase(),
    amount: 0,
    timestamp: new Date().toISOString()
  };
  
  switch (action.toLowerCase()) {
    case "fold":
      seat.folded = true;
      break;
    case "check":
      // Only valid if no bet to call
      break;
    case "call":
      const toCall = table.currentHand.lastRaise - seat.bet;
      seat.chips -= toCall;
      seat.bet += toCall;
      table.pot += toCall;
      actionRecord.amount = toCall;
      break;
    case "bet":
    case "raise":
      const raiseAmount = amount || table.blinds.big * 2;
      seat.chips -= raiseAmount;
      seat.bet += raiseAmount;
      table.pot += raiseAmount;
      table.currentHand.lastRaise = seat.bet;
      actionRecord.amount = raiseAmount;
      break;
    case "all-in":
      const allIn = seat.chips;
      seat.bet += allIn;
      table.pot += allIn;
      seat.chips = 0;
      actionRecord.amount = allIn;
      break;
  }
  
  table.currentHand.actions.push(actionRecord);
  
  // Move to next player
  let nextPlayer = (seatIndex + 1) % table.seats.length;
  while (table.seats[nextPlayer].folded && nextPlayer !== seatIndex) {
    nextPlayer = (nextPlayer + 1) % table.seats.length;
  }
  table.currentHand.currentPlayer = nextPlayer;
  
  tables.set(tableId, table);
  
  res.json({
    success: true,
    action: actionRecord,
    pot: table.pot,
    nextPlayer: table.seats[nextPlayer].agentId,
    message: `${seat.name} ${action}s${amount ? ` ${amount}` : ""}!`
  });
});

// Spectator bet on player
app.post("/api/tables/:tableId/spectate/bet", (req, res) => {
  const { tableId } = req.params;
  const { oddsId, backPlayer, amount } = req.body;
  
  const table = tables.get(tableId);
  if (!table) return res.status(404).json({ error: "Table not found" });
  
  const bet = {
    id: crypto.randomBytes(4).toString("hex"),
    oddsId: oddsId || "anonymous",
    backPlayer,
    amount,
    tableId,
    handId: table.currentHand?.id,
    timestamp: new Date().toISOString()
  };
  
  table.spectatorBets.push(bet);
  tables.set(tableId, table);
  
  res.json({
    success: true,
    bet,
    message: `Spectator bet placed on ${backPlayer}!`
  });
});

// Get table status
app.get("/api/tables/:tableId", (req, res) => {
  const table = tables.get(req.params.tableId);
  if (!table) return res.status(404).json({ error: "Table not found" });
  
  // Hide hole cards from response (only show to players via separate endpoint)
  const publicSeats = table.seats.map(s => ({
    ...s,
    cards: s.folded ? [] : ["??", "??"] // Hidden
  }));
  
  res.json({
    ...table,
    seats: publicSeats
  });
});

// Get active tables
app.get("/api/tables", (req, res) => {
  const activeTables = Array.from(tables.values()).map(t => ({
    id: t.id,
    name: t.name,
    players: t.seats.length,
    maxPlayers: t.maxPlayers,
    blinds: t.blinds,
    pot: t.pot,
    status: t.status
  }));
  
  res.json({ tables: activeTables, count: activeTables.length });
});

// Create tournament
app.post("/api/tournaments/create", (req, res) => {
  const { name, buyIn, maxPlayers, prizePool } = req.body;
  
  const tournamentId = crypto.randomBytes(6).toString("hex");
  
  const tournament = {
    id: tournamentId,
    name: name || `Tournament ${tournamentId}`,
    buyIn: buyIn || 100,
    maxPlayers: maxPlayers || 32,
    prizePool: prizePool || 0,
    players: [],
    status: "registering",
    startTime: null,
    structure: {
      startingChips: 10000,
      blindLevels: [
        { small: 25, big: 50, duration: 15 },
        { small: 50, big: 100, duration: 15 },
        { small: 100, big: 200, duration: 15 },
        { small: 200, big: 400, duration: 15 }
      ]
    },
    createdAt: new Date().toISOString()
  };
  
  tournaments.set(tournamentId, tournament);
  
  res.json({
    success: true,
    tournament,
    message: "Tournament created! Registration open."
  });
});

// Leaderboard
app.get("/api/leaderboard", (req, res) => {
  const leaderboard = Array.from(players.values())
    .sort((a, b) => b.stats.totalWinnings - a.stats.totalWinnings)
    .slice(0, 20)
    .map((p, i) => ({
      rank: i + 1,
      name: p.name,
      winnings: p.stats.totalWinnings,
      handsWon: p.stats.handsWon,
      winRate: p.stats.handsPlayed > 0 
        ? (p.stats.handsWon / p.stats.handsPlayed * 100).toFixed(1) + "%" 
        : "N/A",
      style: p.style
    }));
  
  res.json({ leaderboard });
});

// Helper functions
function generateDeck() {
  const suits = ["♠", "♥", "♦", "♣"];
  const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
  const deck = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push(rank + suit);
    }
  }
  return deck;
}

function shuffleDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}

// AI-powered endpoints
app.post("/api/ai/decide-action", async (req, res) => {
  try {
    const { hand, communityCards, potSize, position, opponentBehavior } = req.body;
    const decision = await ai.decidePokerAction(hand || "Ah Kd", communityCards, potSize || 100, position || "dealer", opponentBehavior);
    res.json({ success: true, decision });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/ai/analyze-table/:tableId", async (req, res) => {
  try {
    const table = tables.get(req.params.tableId);
    if (!table) return res.status(404).json({ error: "Table not found" });
    const analysis = await ai.analyzeTable(table);
    res.json({ success: true, tableId: req.params.tableId, analysis });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/ai/player-profile/:playerId", async (req, res) => {
  try {
    const player = players.get(req.params.playerId);
    if (!player) return res.status(404).json({ error: "Player not found" });
    const profile = await ai.generatePlayerProfile(player);
    res.json({ success: true, player: player.name, profile });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Seed demo
function seedDemo() {
  // Demo players
  const demoPlayers = [
    { id: "poker-shark", name: "Poker Shark AI", chips: 5000, style: "aggressive" },
    { id: "bluff-master", name: "Bluff Master", chips: 3500, style: "loose" },
    { id: "rock-solid", name: "Rock Solid Bot", chips: 4200, style: "tight" },
    { id: "wild-card", name: "Wild Card", chips: 2800, style: "unpredictable" }
  ];
  
  demoPlayers.forEach(p => players.set(p.id, {
    ...p,
    wallet: "Demo...",
    stats: { handsPlayed: 100, handsWon: p.chips > 3000 ? 45 : 30, totalWinnings: p.chips - 1000, biggestPot: 500, bluffSuccess: 12, bluffAttempts: 20 },
    registeredAt: new Date().toISOString()
  }));
  
  // Demo table
  const demoTable = {
    id: "high-stakes",
    name: "🔥 High Stakes Arena",
    maxPlayers: 6,
    blinds: { small: 25, big: 50 },
    buyIn: { min: 500, max: 5000 },
    seats: demoPlayers.slice(0, 4).map((p, i) => ({
      agentId: p.id,
      name: p.name,
      chips: p.chips,
      cards: [],
      bet: 0,
      folded: false,
      position: i
    })),
    pot: 0,
    communityCards: [],
    currentHand: null,
    status: "waiting",
    spectators: 23,
    spectatorBets: [],
    createdAt: new Date().toISOString()
  };
  
  tables.set(demoTable.id, demoTable);
}

seedDemo();

app.listen(PORT, () => {
  console.log(`🎰 Agent Casino Royale running on port ${PORT}`);
});
