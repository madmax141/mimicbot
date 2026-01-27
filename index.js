import express from 'express';
import { query, initDb } from './db.js';
import { Chain } from 'markov-chainer';

const app = express();
const PORT = process.env.PORT || 3000;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || '';

// Middleware to parse JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Helper: Store a message for a user
async function storeMessage(user_id, message) {
  await query(
    'INSERT INTO botbslack (user_id, message) VALUES ($1, $2)',
    [user_id, message]
  );
  return { success: true, message: 'Message stored' };
}

// Helper: Generate a Markov chain message for a user
async function generateMessage(user_id, textBetweenMentions) {
  const result = await query(
    'SELECT message FROM botbslack WHERE user_id = $1',
    [user_id]
  );
  const rows = result.rows;

  if (rows.length === 0) {
    throw { status: 404, message: 'No messages found for this user' };
  }

  // Create corpus - each message split into words
  const corpus = rows.map(row => row.message.split(/\s+/));

  // Create Markov chain
  const chain = new Chain({ corpus });

  // Check if there's text between the bot mention and user mention
  const trimmedText = textBetweenMentions.trim();
  
  let chainResult;
  let data;

  if (trimmedText.length === 0) {
    // No text between mentions - standard chain response
    chainResult = chain.run();
    data = chainResult[2].join(' ');
  } else {
    // Text exists between mentions - use as tokens
    const tokens = trimmedText.split(/\s+/);
    chainResult = chain.run({ tokens });
    data = chainResult[1].join(' ') + ' ' + chainResult[2].join(' ');
  }

  return {
    success: true,
    targetUser: user_id,
    rawdata: chainResult,
    data: data.trim()
  };
}

// Extract all user mentions from message text
// Slack formats mentions as <@USER_ID>
function extractMentions(text) {
  const mentionRegex = /<@([A-Z0-9]+)>/g;
  return [...text.matchAll(mentionRegex)].map(match => ({
    userId: match[1],
    index: match.index
  }));
}

// Get bot user ID from authorizations
function getBotUserId(authorizations) {
  if (!authorizations || authorizations.length === 0) {
    return null;
  }
  // Find the bot authorization
  const botAuth = authorizations.find(auth => auth.is_bot);
  return botAuth ? botAuth.user_id : null;
}

// Post a message to Slack using chat.postMessage
async function postToSlack(channel, text) {
  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SLACK_BOT_TOKEN}`
    },
    body: JSON.stringify({
      channel,
      text
    })
  });

  const data = await response.json();
  
  if (!data.ok) {
    console.error('Slack API error:', data.error);
    throw new Error(`Slack API error: ${data.error}`);
  }
  
  return data;
}

app.post('/message', async (req, res) => {
  try {
    const body = req.body;

    if (body.type === 'url_verification') {
      return res.send(body.challenge);
    }

    // Handle Slack event callbacks (message.channels events)
    if (body.type === 'event_callback' && body.event?.type === 'message') {
      const event = body.event;

      // Skip bot messages - don't process or store them
      if (event.bot_id || event.subtype === 'bot_message') {
        return res.status(200).send();
      }

      const messageText = event.text || '';
      const messageUserId = event.user; // User who sent the message

      // Get bot's user ID from authorizations
      const botUserId = getBotUserId(body.authorizations);

      // Extract all mentions from the message
      const mentions = extractMentions(messageText);

      // Check if bot was mentioned
      const botMentionIndex = mentions.findIndex(m => m.userId === botUserId);
      const botWasMentioned = botMentionIndex !== -1;

      if (!botWasMentioned) {
        // Bot was NOT mentioned - store the message
        await storeMessage(messageUserId, messageText);
        console.log(`Stored message from user ${messageUserId}`);
      } else {
        // Bot WAS mentioned - find the next @mention after the bot mention
        const nextMention = mentions[botMentionIndex + 1];

        if (nextMention) {
          // Extract text between bot mention and user mention
          const botMention = mentions[botMentionIndex];
          const botMentionEnd = botMention.index + `<@${botMention.userId}>`.length;
          const textBetweenMentions = messageText.slice(botMentionEnd, nextMention.index);

          // Generate markov chain for the mentioned user
          const targetUserId = nextMention.userId;
          const result = await generateMessage(targetUserId, textBetweenMentions);
          console.log(`Generated message for user ${targetUserId}:`, result.data);
          
          // Post the generated message back to Slack
          const channel = event.channel;
          await postToSlack(channel, result.data);
        } else {
          console.log('Bot was mentioned but no target user specified');
        }
      }

      // Respond quickly to Slack (within 3 seconds)
      return res.status(200).send();
    }

    // Unknown event type
    return res.status(200).send();

  } catch (error) {
    console.error('Error handling message:', error);
    // Still respond 200 to Slack to prevent retries for app errors
    return res.status(200).send();
  }
});

// Initialize database and start server
initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
