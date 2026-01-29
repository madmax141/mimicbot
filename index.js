import express from 'express';
import { query, initDb } from './db.js';
import { Chain } from 'markov-chainer';
import { syllable } from 'syllable';

const app = express();
const PORT = process.env.PORT || 3000;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || '';

const processedEvents = new Set();
const MAX_PROCESSED_EVENTS = 1000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

async function storeMessage(user_id, message, ts) {
  await query(
    'INSERT INTO botbslack (user_id, message, ts) VALUES ($1, $2, $3)',
    [user_id, message, ts]
  );
  return { success: true, message: 'Message stored' };
}

async function generateMessage(user_id, textBefore, textAfter) {
  const chain = await getChainForUser(user_id);

  const hasTextBefore = textBefore.trim().length > 0;
  const hasTextAfter = textAfter.trim().length > 0;
  
  let chainResult;
  let data;

  if ((hasTextBefore && hasTextAfter) || (!hasTextBefore && !hasTextAfter)) {
    chainResult = chain.run();
    data = chainResult[2].join(' ');
  } else if (hasTextBefore) {
    const tokens = textBefore.trim().split(/\s+/);
    chainResult = chain.run({ tokens });
    data = chainResult[1].join(' ') + ' ' + chainResult[2].join(' ');
  } else if (hasTextAfter) {
    const tokens = textAfter.trim().split(/\s+/);
    chainResult = chain.run({ tokens });
    data = chainResult[0].join(' ') + ' ' + chainResult[1].join(' ');
  }

  return {
    success: true,
    targetUser: user_id,
    data: data.trim()
  };
}

function countSyllables(word) {
  const count = syllable(word);
  return count > 0 ? count : 1;
}

async function getChainForUser(user_id) {
  const result = await query(
    'SELECT message FROM botbslack WHERE user_id = $1',
    [user_id]
  );
  const rows = result.rows;

  if (rows.length === 0) {
    throw { status: 404, message: 'No messages found for this user' };
  }

  const corpus = rows.map(row => row.message.split(/\s+/));
  const chain = new Chain({ corpus, order: 1 });
  console.log(`Built chain for user ${user_id} (${corpus.length} messages)`);
  
  return chain;
}

async function getChainForAllUsers() {
  const ALL_USERS_KEY = '__ALL_USERS__';
  
  if (cachedChains.has(ALL_USERS_KEY)) {
    return cachedChains.get(ALL_USERS_KEY);
  }
  
  const result = await query('SELECT message FROM botbslack');
  const rows = result.rows;

  if (rows.length === 0) {
    throw { status: 404, message: 'No messages found in database' };
  }

  const corpus = rows.map(row => row.message.split(/\s+/));
  const chain = new Chain({ corpus, order: 1 });
  cachedChains.set(ALL_USERS_KEY, chain);
  console.log(`Cached chain for ALL USERS (${corpus.length} messages)`);
  
  return chain;
}

function checkForHaiku(text) {
  const words = text.trim().split(/\s+/);
  if (words.length < 3) return { isHaiku: false, text };
  
  const targetSyllables = [5, 7, 5];
  const lines = [[], [], []];
  let lineIndex = 0;
  let syllableCount = 0;
  
  for (const word of words) {
    if (lineIndex > 2) break;
    
    const wordSyllables = countSyllables(word);
    
    if (syllableCount + wordSyllables <= targetSyllables[lineIndex]) {
      lines[lineIndex].push(word);
      syllableCount += wordSyllables;
    } else if (syllableCount === targetSyllables[lineIndex]) {
      lineIndex++;
      if (lineIndex <= 2) {
        lines[lineIndex].push(word);
        syllableCount = wordSyllables;
      }
    } else {
      return { isHaiku: false, text };
    }
  }
  
  const lineSyllables = lines.map(line => 
    line.reduce((sum, word) => sum + countSyllables(word), 0)
  );
  
  if (lineSyllables[0] === 5 && lineSyllables[1] === 7 && lineSyllables[2] === 5) {
    return { isHaiku: true, lines };
  }
  
  return { isHaiku: false, text };
}

function extractMentions(text) {
  const mentionRegex = /<@([A-Z0-9]+)>/g;
  return [...text.matchAll(mentionRegex)].map(match => ({
    userId: match[1],
    index: match.index
  }));
}

function getBotUserId(authorizations) {
  if (!authorizations || authorizations.length === 0) {
    return null;
  }
  const botAuth = authorizations.find(auth => auth.is_bot);
  return botAuth ? botAuth.user_id : null;
}

async function getUserDisplayName(userId) {
  const response = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
    headers: {
      'Authorization': `Bearer ${SLACK_BOT_TOKEN}`
    }
  });
  const data = await response.json();
  if (data.ok && data.user) {
    return data.user.profile?.display_name || data.user.profile?.real_name || data.user.name;
  }
  return userId;
}

function formatHaiku(lines, displayName) {
  const randomYear = Math.floor(Math.random() * (1900 - 1600 + 1)) + 1600;
  return `*HAIKU BONUS* :tada:\n\`\`\`${lines[0].join(' ')}\n${lines[1].join(' ')}\n${lines[2].join(' ')}\n   -- ${displayName}, ${randomYear}\`\`\``;
}

async function postToSlack(channel, text) {
  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SLACK_BOT_TOKEN}`
    },
    body: JSON.stringify({ channel, text })
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

    if (body.type === 'event_callback' && body.event?.type === 'message') {
      const event = body.event;
      const eventId = body.event_id;

      if (eventId && processedEvents.has(eventId)) {
        console.log(`Skipping duplicate event: ${eventId}`);
        return res.status(200).send();
      }

      if (eventId) {
        processedEvents.add(eventId);
        if (processedEvents.size > MAX_PROCESSED_EVENTS) {
          const firstEvent = processedEvents.values().next().value;
          processedEvents.delete(firstEvent);
        }
      }

      if (event.bot_id || event.subtype === 'bot_message') {
        return res.status(200).send();
      }

      const messageText = event.text || '';
      const messageUserId = event.user;

      const botUserId = getBotUserId(body.authorizations);
      const mentions = extractMentions(messageText);
      const botMentionIndex = mentions.findIndex(m => m.userId === botUserId);
      const botWasMentioned = botMentionIndex !== -1;

      if (!botWasMentioned) {
        await storeMessage(messageUserId, messageText, event.ts);
        console.log(`Stored message from user ${messageUserId}`);
      } else {
        const nextMention = mentions[botMentionIndex + 1];

        if (nextMention) {
          const botMention = mentions[botMentionIndex];
          const botMentionEnd = botMention.index + `<@${botMention.userId}>`.length;
          const textBefore = messageText.slice(botMentionEnd, nextMention.index);
          
          const userMentionEnd = nextMention.index + `<@${nextMention.userId}>`.length;
          const textAfter = messageText.slice(userMentionEnd);

          const targetUserId = nextMention.userId;
          const result = await generateMessage(targetUserId, textBefore, textAfter);
          
          const haikuCheck = checkForHaiku(result.data);
          let finalMessage;
          
          if (haikuCheck.isHaiku) {
            const displayName = await getUserDisplayName(targetUserId);
            finalMessage = formatHaiku(haikuCheck.lines, displayName);
            console.log(`Generated haiku bonus for user ${targetUserId}:\n${finalMessage}`);
          } else {
            finalMessage = result.data;
            console.log(`Generated message for user ${targetUserId}:`, finalMessage);
          }
          
          if (SLACK_BOT_TOKEN) {
            await postToSlack(event.channel, finalMessage);
          }
        } else {
          const chain = await getChainForAllUsers();
          const chainResult = chain.run();
          const data = chainResult[2].join(' ');
          
          const haikuCheck = checkForHaiku(data);
          let finalMessage;
          
          if (haikuCheck.isHaiku) {
            finalMessage = formatHaiku(haikuCheck.lines, 'botb');
            console.log(`Generated haiku bonus for ALL USERS:\n${finalMessage}`);
          } else {
            finalMessage = data;
            console.log(`Generated message for ALL USERS:`, finalMessage);
          }
          
          if (SLACK_BOT_TOKEN) {
            await postToSlack(event.channel, finalMessage);
          }
        }
      }

      return res.status(200).send();
    }

    return res.status(200).send();

  } catch (error) {
    console.error('Error handling message:', error);
    return res.status(200).send();
  }
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize:', err);
    process.exit(1);
  });
