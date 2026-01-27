# Mimic

A Node.js web server with PostgreSQL storage and Markov chain text generation.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure database connection by creating a `.env` file (see `.env.example`):
```bash
cp .env.example .env
# Edit .env with your PostgreSQL credentials
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_NAME` | Database name | `mimic` |
| `DB_USER` | Database user | `postgres` |
| `DB_PASSWORD` | Database password | (empty) |
| `DB_SSL` | Enable SSL connection | `false` |
| `PORT` | Server port | `3000` |

## Running

Development (with auto-reload):
```bash
npm run dev
```

Production:
```bash
npm start
```

## Importing Data

To import messages from a Slack export:
```bash
npm run import
```

## API Endpoints

### POST /api/message
Store a message for a user.

**Request:**
```json
{
  "user_id": "U123ABC",
  "message": "Hello world"
}
```

### GET /api/messages?user_id=U123ABC
Generate a Markov chain message based on a user's stored messages.

**Response:**
```json
{
  "success": true,
  "rawdata": [[], [], ["generated", "text", "here"]],
  "data": "generated text here"
}
```

### GET /health
Health check endpoint.

## Database Schema

```sql
CREATE TABLE botbslack (
  id SERIAL PRIMARY KEY,
  user_id TEXT,
  message TEXT
);
```
