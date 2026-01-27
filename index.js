import express from 'express';
import { query, initDb } from './db.js';
import { Chain } from 'markov-chainer';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Store a message for a user
app.post('/api/message', async (req, res) => {
  try {
    const { user_id, message } = req.body;
    
    await query(
      'INSERT INTO botbslack (user_id, message) VALUES ($1, $2)',
      [user_id, message]
    );
    
    res.json({
      success: true,
      message: 'Message stored'
    });
  } catch (error) {
    console.error('Error storing message:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Generate a Markov chain message for a user
app.get('/api/messages', async (req, res) => {
  try {
    const { user_id } = req.query;
    
    if (!user_id) {
      return res.status(400).json({
        success: false,
        error: 'user_id is required'
      });
    }
    
    // Retrieve all messages for this user
    const result = await query(
      'SELECT message FROM botbslack WHERE user_id = $1',
      [user_id]
    );
    const rows = result.rows;
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No messages found for this user'
      });
    }
    
    // Create corpus - each message split into words
    const corpus = rows.map(row => row.message.split(/\s+/));
    
    // Create Markov chain
    const chain = new Chain({ corpus });
    
    // Generate a response
    const chainResult = chain.run();
    
    res.json({
      success: true,
      rawdata: chainResult,
      data: chainResult.reduce((acc, line) => acc + line.join(' '), '')
    });
  } catch (error) {
    console.error('Error generating message:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
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
