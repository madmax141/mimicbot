import 'dotenv/config';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { getClient, initDb } from './db.js';

const SLACK_EXPORT_DIR = process.env.SLACK_EXPORT_DIR;
const TABLE_NAME = process.env.TABLE_NAME || 'botbslack';

if (!SLACK_EXPORT_DIR) {
  console.error('Error: SLACK_EXPORT_DIR environment variable is required');
  process.exit(1);
}

async function importMessages() {
  await initDb();
  
  const files = await readdir(SLACK_EXPORT_DIR);
  const jsonFiles = files.filter(f => f.endsWith('.json'));
  
  console.log(`Importing from: ${SLACK_EXPORT_DIR}`);
  console.log(`Target table: ${TABLE_NAME}`);
  console.log(`Found ${jsonFiles.length} JSON files to process`);
  
  let totalMessages = 0;
  
  const client = await getClient();
  
  try {
    await client.query('BEGIN');
    
    for (const file of jsonFiles) {
      const filePath = join(SLACK_EXPORT_DIR, file);
      const content = await readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      
      const messages = data
        .filter(obj => obj.type === 'message' && obj.user && obj.text)
        .map(obj => ({
          user_id: obj.user,
          message: obj.text,
          ts: obj.ts
        }));
      
      for (const msg of messages) {
        await client.query(
          `INSERT INTO ${TABLE_NAME} (user_id, message, ts) VALUES ($1, $2, $3)`,
          [msg.user_id, msg.message, msg.ts]
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
