# 🍳 Kitchen MCP

Your digital kitchen, powered by AI. Track what you have, discover what you can cook, and get guided through every recipe — step by step, timer by timer.

Whether you're a home cook managing a busy kitchen or a developer building AI-powered cooking assistants, Kitchen MCP gives you the structured foundation to make it real.

---

## 🔍 What is this?

Kitchen MCP is a **local-first Model Context Protocol server** that connects an AI assistant to your kitchen. It knows your inventory, your recipes, your equipment, your restrictions, and your preferences — and it helps you cook better with all of it.

The AI never guesses. The server is always the source of truth.

---

## ✨ Features

| Feature | Status | Description |
|---------|--------|-------------|
| 📦 Inventory Management | ✅ | Track food by lot, location, expiry, and state (sealed, opened, cooked, frozen) |
| 📖 Recipe Engine | ✅ | Create, version, scale, and validate recipes with ingredients, steps, and equipment |
| 🎯 Smart Matching | ✅ | Find the best recipes based on what you have, your restrictions, and your taste |
| 👨‍🍳 Cooking Sessions | ✅ | Start a session, follow guided steps, track ingredient usage, get help when things go wrong |
| ⏱️ Kitchen Timers | ✅ | Create, pause, resume, and extend timers tied to cooking steps |
| 🚫 Dietary Restrictions | ✅ | Set allergies, intolerances, religious and ethical restrictions; server blocks unsafe recipes |
| 🌶️ Taste Preferences | ✅ | Set spice heat, saltiness, sweetness on a 0-10 scale; recipes scored to match |
| 🍞 Equipment Catalog | ✅ | Register stoves, pressure cookers, mixers, refrigerators; server checks compatibility |
| ⚖️ Unit Conversion | ✅ | Convert between grams, kilograms, milliliters, teaspoons, tablespoons, cups, and more |
| 🛒 Shopping Lists | 🔜 | Generate shopping needs from recipes and current inventory |
| 📅 Meal Planning | 🔜 | Plan meals for the week based on preferences, expiry, and inventory |
| ⏰ Expiry Tracking | 🔜 | Get notified before food goes bad, use expiring items first |

---

## 🚀 Quick Start

### 📋 Prerequisites

- Node.js >= 20
- npm

### ⬇️ Install

```bash
git clone https://github.com/craftpip/kitchen-mcp.git
cd kitchen-mcp
npm install
```

### ▶️ Run (stdio)

```bash
npm start
```

### 🌐 Run (HTTP)

```bash
npm run dev -- --http
```

Server listens on `http://0.0.0.0:3100/mcp`.

### 🐳 Docker

```bash
docker compose build && docker compose up -d
```

Data persists in the `kitchen-mcp_kitchen-data` volume.

---

## 🤖 Usage with AI Assistants

Add to your MCP client (like OpenCode, Claude Desktop, etc.):

```json
{
  "mcp": {
    "kitchen": {
      "type": "remote",
      "url": "http://localhost:3100/mcp"
    }
  }
}
```

Once connected, the AI can:

| | Ask | What happens |
|---|-----|--------------|
| 🗄️ | "What do I have?" | Checks inventory, shows what's in stock |
| 🍽️ | "What can I cook for lunch?" | Matches recipes to your inventory and preferences |
| 👨‍🍳 | "Start cooking the egg curry" | Creates session, guides through each step |
| ⏱️ | "Set a 10-minute timer" | Creates kitchen timer, tracks it |
| 📦 | "Add 1kg of rice to the pantry" | Adds inventory lot with full tracking |
| 🚫 | "I'm allergic to peanuts" | Blocks all peanut-containing recipes |

---

## 🛠️ 66 Tools

| Category | 🔧 | What it does |
|----------|-----|--------------|
| 💚 System | 2 | Health check, capabilities |
| 🗺️ Locations | 3 | Rooms, shelves, cabinets, drawers |
| 🥕 Ingredients | 4 | Catalog, aliases, search |
| 📦 Inventory | 7 | Lots, transactions, expiry tracking |
| 🍞 Equipment | 6 | Appliances, calibration, availability |
| ⚖️ Measurements | 3 | Unit conversion, household containers |
| 📖 Recipes | 9 | CRUD, versioning, scaling, availability |
| 🚫 Restrictions | 3 | Allergies, intolerances, dietary rules |
| 🌶️ Preferences | 3 | Spice heat, saltiness, sweetness |
| 🎯 Matching | 1 | Recipe scoring engine |
| 👨‍🍳 Sessions | 16 | Cooking lifecycle, step tracking |
| ⏱️ Timers | 9 | Kitchen timers with full control |

---

## 🏗️ Architecture

Kitchen MCP follows a strict principle: **the server is the authority**.

- 🗄️ SQLite with WAL mode for reliability
- 🔒 All state changes go through structured tools
- 📖 Recipe versions are immutable once used in sessions
- 📦 Inventory deductions happen via transactions, never direct overwrites
- 📝 Every action is audit-logged

The AI interprets natural language, picks the right tools, and explains results. The server stores facts, validates requests, and enforces rules. Neither side does the other's job.

---

## 🧑‍💻 Development

```bash
# Typecheck
npx tsc --noEmit

# Build
npm run build

# Test
npm test

# Dev (HTTP mode)
npm run dev -- --http
```

---

## 📁 Project Structure

```
src/
├── 🛠️ server/tools/      # 13 tool files, 66 tools
├── 🏗️ domain/            # Services and types per domain
├── ⚙️ infrastructure/    # Database, audit, idempotency, logging
└── 📦 shared/            # Response envelope, errors, IDs, time
```

---

## 📄 License

MIT
