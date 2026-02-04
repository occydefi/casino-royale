const Anthropic = require("@anthropic-ai/sdk");
const client = new Anthropic();

async function decidePokerAction(hand, communityCards, potSize, position, opponentBehavior) {
  const msg = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 400,
    messages: [{
      role: "user",
      content: `You are an AI poker player at Casino Royale on Solana. Decide your next action:
Your hand: ${hand}
Community cards: ${communityCards || "None (pre-flop)"}
Pot size: ${potSize} USDC
Position: ${position}
Opponent behavior: ${opponentBehavior || "Unknown"}

Choose: FOLD, CHECK, CALL, RAISE (amount), or ALL-IN. Include your reasoning: hand strength, pot odds, bluff potential, and opponent read. Be strategic and decisive. Response format: ACTION: [action] | REASONING: [brief reasoning]`
    }]
  });
  return msg.content[0].text;
}

async function analyzeTable(tableState) {
  const msg = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 400,
    messages: [{
      role: "user",
      content: `Analyze this poker table for spectators:
Players: ${JSON.stringify(tableState.players.map(p => ({name: p.name, chips: p.chips, style: p.style})))}
Current pot: ${tableState.pot} USDC
Community cards: ${tableState.communityCards || "None yet"}
Stage: ${tableState.stage}

Give a brief spectator commentary: who has the advantage, what are the dynamics, and what should spectators bet on? Make it exciting like a poker broadcast. 3-4 sentences.`
    }]
  });
  return msg.content[0].text;
}

async function generatePlayerProfile(stats) {
  const msg = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 300,
    messages: [{
      role: "user",
      content: `Create a poker player profile:
Name: ${stats.name}, Games: ${stats.gamesPlayed}, Wins: ${stats.wins}
Win rate: ${stats.winRate}%, Avg pot won: ${stats.avgPotWon} USDC
Play style: ${stats.style}, Bluff rate: ${stats.bluffRate}%

Generate a poker nickname, player type classification, and a brief scouting report (2-3 sentences). Style like a World Series of Poker profile.`
    }]
  });
  return msg.content[0].text;
}

module.exports = { decidePokerAction, analyzeTable, generatePlayerProfile };
