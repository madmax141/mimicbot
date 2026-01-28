# Mimic

A Slack bot that generates Markov chain responses mimicking users based on their message history.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables by creating a `.env` file:
```bash
cp .env.example .env
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string (e.g. `postgresql://user:pass@host:5432/dbname`) | Yes |
| `SLACK_BOT_TOKEN` | Slack Bot User OAuth Token (starts with `xoxb-`) | Yes |
| `PORT` | Server port | No (default: `3000`) |
| `SLACK_EXPORT_DIR` | Path to Slack export channel directory (for import script) | For import |
| `TABLE_NAME` | Database table name | No (default: `botbslack`) |

## Seeding the Database

Before using the bot, you need to populate the database with Slack message history. Export your Slack workspace data and use the import script:

1. Get a Slack export (Settings & Administration > Workspace settings > Import/Export Data)
2. Set the `SLACK_EXPORT_DIR` environment variable to point to the channel folder within your export:
```bash
export SLACK_EXPORT_DIR=/path/to/slack-export/channel-name
```
3. Run the import:
```bash
npm run import
```

This will load all user messages from the Slack JSON files into the database.

## Running

Development:
```bash
npm run dev
```

Production:
```bash
npm start
```

## Usage

In Slack, mention the bot followed by a target user to generate a message mimicking that user:

```
@mimic @steve
```

The bot will generate a Markov chain response based on Steve's message history. If the generated message happens to be a haiku (5-7-5 syllables), it will be formatted as a "HAIKU BONUS".

## Database Schema

```sql
CREATE TABLE botbslack (
  id SERIAL PRIMARY KEY,
  user_id TEXT,
  message TEXT,
  ts TEXT
);
```
