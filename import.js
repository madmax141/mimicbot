import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { query, getClient, initDb } from './db.js';

const SLACK_EXPORT_DIR = '/Users/max/Downloads/Back of the Bus Slack export Apr 22 2019 - Jan 27 2026/back-of-the-bus';

async function importMessages() {
  // Initialize the database table
  await initDb();
  
  // Get all JSON files in the directory
  const files = await readdir(SLACK_EXPORT_DIR);
  const jsonFiles = files.filter(f => f.endsWith('.json'));
  
  console.log(`Found ${jsonFiles.length} JSON files to process`);
  
  let totalMessages = 0;
  
  // Get a client for the transaction
  const client = await getClient();
  
  try {
    await client.query('BEGIN');
    
    for (const file of jsonFiles) {
      const filePath = join(SLACK_EXPORT_DIR, file);
      const content = await readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      
      // Filter for message types and extract user/text
      const messages = data
        .filter(obj => obj.type === 'message' && obj.user && obj.text)
        .map(obj => ({
          user_id: obj.user,
          message: obj.text
        }));
      
      // Insert messages in batches
      for (const msg of messages) {
        await client.query(
          'INSERT INTO botbslack (user_id, message) VALUES ($1, $2)',
          [msg.user_id, msg.message]
        );
      }
      
      if (messages.length > 0) {
        totalMessages += messages.length;
        console.log(`Imported ${messages.length} messages from ${file}`);
      }
    }
    
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  
  console.log(`\nDone! Imported ${totalMessages} total messages.`);
  process.exit(0);
}

importMessages().catch((err) => {
  console.error(err);
  process.exit(1);
});
