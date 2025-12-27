# ZenBot

A Discord bot that automates competitive ladder rankings for Roblox games. Players challenge each other for ranked positions, submit scores via modals, and the bot handles rank swaps, cooldowns, stats tracking, and logging automatically.

## Features

### Core System
- **Easy Setup** - Configure all channels via `/setup` command with an interactive button interface
- **Live Leaderboard** - Top 10 rankings with form guide (last 5 matches), days at rank, and cooldown status
- **Challenge System** - Button-based challenges with automatic rule validation
- **Score Submission** - Discord modals for entering match scores (Challenger submits, Defender confirms)
- **Automatic Rank Swaps** - Winner takes the rank when challenger beats defender
- **Cooldowns** - Configurable cooldown period after matches (default 8 hours)

### Challenge Rules
- **Open Ranks (8-10):** Unranked players can challenge ranks 8, 9, or 10
- **Rank 10:** Can challenge rank 8 or 9
- **Rank 9:** Can only challenge rank 8
- **Ranks 1-8:** Can challenge exactly 1 rank above
- **Unranked vs Unranked:** Unranked players can challenge other unranked players

### Match Format
- Best of 3 sets
- First to 10 points per set
- Challenger wins = takes defender's rank
- Defender wins = keeps position

### Stats & Tracking
- Win/loss records and streaks
- Title defenses and title takes
- Perfect matches (2-0 wins)
- Comeback wins (won after losing Set 1)
- Head-to-head records between players
- Hidden ELO rating system
- Full match history

### Additional Features
- **DM Notifications** - Opt-in notifications when challenged
- **Match Predictions** - Spectators can predict match outcomes
- **Score Corrections** - Request corrections for misreported scores
- **Dispute Resolution** - Disputed results go to admin channel for review
- **Self-Remove Cooldown** - Players can remove their own cooldown
- **Automatic Reminders** - Pings for pending challenges and score confirmations
- **Match Threads** - Discussions organized in threads per match

### Admin Controls
- Set/remove player ranks
- Clear cooldowns
- Force match results
- Cancel challenges
- View all pending actions
- Adjust cooldown and response window settings

## Tech Stack

- **Runtime:** Node.js
- **Library:** discord.js v14
- **Database:** SQLite (better-sqlite3)

## Installation

### Prerequisites
- Node.js 18+ 
- A Discord bot application with token

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/r3xsean/zenbot.git
   cd zenbot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create environment file**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your Discord bot token:
   ```env
   DISCORD_TOKEN=your_bot_token_here
   
   # Optional settings (these are defaults)
   COOLDOWN_HOURS=8
   RESPONSE_WINDOW_HOURS=12
   REMINDER_INTERVAL_MINUTES=30
   ```

4. **Start the bot**
   ```bash
   npm start
   ```
   
   For development with auto-reload:
   ```bash
   npm run dev
   ```

5. **Configure in Discord**
   - Invite the bot to your server with these permissions:
     - Send Messages
     - Embed Links
     - Use Slash Commands
     - Manage Threads
     - Read Message History
   - Run `/setup` in your server
   - Click each button to select the appropriate channel:
     - **Leaderboard** - Where the live rankings are displayed
     - **Challenge Panel** - Where the "Challenge Someone" button lives
     - **Requests** - Where active challenge messages appear
     - **Logs** - Where completed match results are logged
     - **Admin** - Where the admin control panel is displayed
     - **Disputes** - Where disputed matches go for admin review
   - Click "Finish Setup" to initialize the bot

## Commands

| Command | Description | Permission |
|---------|-------------|------------|
| `/setup` | Configure bot channels | Administrator |
| `/profile [@user]` | View player stats and match history | Everyone |
| `/h2h @player1 @player2` | View head-to-head record between two players | Everyone |
| `/history [@user]` | View recent match history | Everyone |
| `/playerinfo @user` | View detailed player info | Administrator |

## Project Structure

```
zenbot/
├── src/
│   ├── index.js              # Bot entry point
│   ├── config.js             # Configuration loader
│   ├── commands/             # Slash commands
│   ├── components/
│   │   ├── buttons/          # Button interaction handlers
│   │   ├── modals/           # Modal submission handlers
│   │   └── selects/          # Select menu handlers
│   ├── services/             # Core services
│   ├── database/             # Database initialization and queries
│   ├── embeds/               # Discord embed builders
│   └── handlers/             # Interaction routing
├── data/                     # SQLite database (created automatically)
├── .env                      # Environment variables (create from .env.example)
└── package.json
```

## Database Scripts

```bash
# Reset database (clears all data)
npm run db:reset

# Seed with sample data
npm run db:seed
```

## License

ISC

## Author

Created by **r3xsean**
