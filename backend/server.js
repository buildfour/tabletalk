import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { initDb, query, run, get } from './database.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files
app.use('/customer', express.static(join(__dirname, '../customer-frontend')));
app.use('/restaurant', express.static(join(__dirname, '../restaurant-frontend')));
app.get('/', (req, res) => res.redirect('/customer/index.html'));

const server = createServer(app);
const wss = new WebSocketServer({ server });

// WebSocket connections
const clients = new Set();
wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  clients.forEach((client) => {
    if (client.readyState === 1) client.send(msg);
  });
}

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Gemini AI Order Parser endpoint
app.post('/api/ai/parse-order', async (req, res) => {
  const { rachelResponse, currentCart, menu } = req.body;

  if (!rachelResponse) {
    return res.status(400).json({ action: 'none', items: [], confirmed: false, total: 0, error: 'Missing rachelResponse' });
  }

  const prompt = `You are an order parsing assistant for TableTalk restaurant.
Analyze what Rachel (the voice assistant) said and determine cart changes.

Rachel said: "${rachelResponse}"

Current cart: ${JSON.stringify(currentCart || [])}

Menu: ${JSON.stringify(menu || [])}

DETECT INTENT - Look for these patterns (Rachel may phrase differently):
- ADDING: "added", "got you", "putting in", "that's in", "coming right up", "on its way", mentions item + positive confirmation
- REMOVING: "removed", "taken off", "no problem taking that off", "cancelled", mentions removing/deleting item
- CONFIRMING ORDER: "everything to your tray", "order is ready", "all set", "here's your order", lists multiple items as final summary
- NO ACTION: questions, greetings, menu descriptions, asking what they want

RULES:
1. Match items using EXACT menu names only (e.g., "Hot Burger" not "burger")
2. Default quantity is 1 if not specified
3. Use exact IDs and prices from menu
4. If unsure, return action: "none"

Return ONLY valid JSON:
{
  "action": "add" | "remove" | "clear" | "confirm" | "none",
  "items": [{"id": number, "name": "string", "price": number, "quantity": number}],
  "confirmed": boolean,
  "total": number
}`;

  try {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_GEMINI_API_KEY not configured');
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 500
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!jsonText) {
      throw new Error('No response from Gemini');
    }

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const cartUpdate = JSON.parse(jsonMatch[0]);
    console.log('Gemini parsed order:', cartUpdate);
    res.json(cartUpdate);
  } catch (error) {
    console.error('Gemini parsing error:', error.message);
    res.status(500).json({
      action: 'none',
      items: [],
      confirmed: false,
      total: 0,
      error: error.message
    });
  }
});

// ElevenLabs signed URL endpoint
app.get('/api/voice/signed-url', async (req, res) => {
  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${process.env.ELEVENLABS_AGENT_ID}`,
      { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY } }
    );
    if (!response.ok) return res.status(500).json({ error: 'Failed to get signed URL' });
    const { signed_url } = await response.json();
    res.json({ signedUrl: signed_url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Configure ElevenLabs agent with Gemini and conversation flow
app.post('/api/voice/configure-agent', async (req, res) => {
  try {
    const agentConfig = {
      conversation_config: {
        agent: {
          prompt: {
            prompt: `You are Rachel, a friendly TableTalk AI voice ordering assistant. Follow this 4-step flow:

STEP 1 - WELCOME: Greet warmly, ask if they want to hear the menu or order

STEP 2 - MENU WALKTHROUGH: Present categories - Burgers, Shakes & Drinks, Sides, Desserts

STEP 3 - ORDER/QUESTIONS: Take orders enthusiastically, ask "anything else?"

STEP 4 - CONFIRMATION: List items with total, ask to confirm

MENU:
BURGERS: Hot Burger $10.50, Crunch Burger $8.50, Beef Burger $9.50, Deluxe Burger $12.00
SHAKES & DRINKS: Classic Shake $4.50, Berry Shake $4.50, Dash Coffee $2.50, Coconut Tea $3.50
SIDES: Cake Bites $3.50, Cheesy Cup $3.50, Chicken Strips $2.50, Cheesy Soup $3.50, Crispy Salads $3.50, Egg Shakes $5.00
DESSERTS: Fruit & Ice $7.95, Mango Sundae $6.95

RULES: Keep responses to 1-2 sentences, be friendly and efficient!`,
            llm: "gemini-1.5-flash",
            temperature: 0.7
          },
          first_message: "Hi there! Welcome to TableTalk! I'm Rachel, and I'll be helping you order today. Would you like to hear what's on our menu, or do you already know what you'd like?",
          language: "en"
        }
      }
    };

    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/agents/${process.env.ELEVENLABS_AGENT_ID}`,
      {
        method: 'PATCH',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(agentConfig)
      }
    );
    
    if (!response.ok) {
      const error = await response.text();
      return res.status(500).json({ error: 'Failed to configure agent', details: error });
    }
    
    res.json({ success: true, message: 'Agent configured with Gemini and conversation flow' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Access code validation endpoint
app.post('/api/auth/validate', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ valid: false, error: 'Code required' });
  
  const tableCode = await get('SELECT * FROM table_codes WHERE code = $1 AND active = true', [code.toUpperCase()]);
  if (tableCode) {
    res.json({ valid: true, tableNumber: tableCode.table_number, code: tableCode.code });
  } else {
    res.status(401).json({ valid: false, error: 'Invalid access code' });
  }
});

// Staff auth endpoint
app.post('/api/auth/staff', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ valid: false, error: 'Code required' });
  
  const staff = await get('SELECT * FROM staff_codes WHERE code = $1 AND active = true', [code.toUpperCase()]);
  if (staff) {
    res.json({ valid: true, name: staff.name, code: staff.code });
  } else {
    res.status(401).json({ valid: false, error: 'Invalid staff code' });
  }
});

// Menu endpoints
app.get('/api/menu', async (req, res) => {
  const items = await query('SELECT * FROM menu_items WHERE available = true');
  const grouped = items.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});
  res.json(grouped);
});

// Orders endpoints
app.get('/api/orders', async (req, res) => {
  const orders = await query('SELECT * FROM orders ORDER BY created_at DESC');
  for (const order of orders) {
    order.items = await query(`
      SELECT oi.*, m.name, m.price 
      FROM order_items oi 
      JOIN menu_items m ON oi.menu_item_id = m.id 
      WHERE oi.order_id = $1
    `, [order.id]);
  }
  res.json(orders);
});

app.post('/api/orders', async (req, res) => {
  try {
    const { table_code, items } = req.body;
    const result = await run('INSERT INTO orders (table_code) VALUES ($1) RETURNING id', [table_code]);
    const orderId = result.rows[0].id;
    
    for (const item of items) {
      await run('INSERT INTO order_items (order_id, menu_item_id, quantity, notes) VALUES ($1, $2, $3, $4)',
        [orderId, item.menu_item_id, item.quantity, item.notes || null]);
    }
    
    const order = await get('SELECT * FROM orders WHERE id = $1', [orderId]);
    order.items = await query(`
      SELECT oi.*, m.name, m.price 
      FROM order_items oi 
      JOIN menu_items m ON oi.menu_item_id = m.id 
      WHERE oi.order_id = $1
    `, [orderId]);
    
    broadcast({ type: 'new_order', order });
    res.status(201).json(order);
  } catch (err) {
    console.error('Order creation error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/orders/:id', async (req, res) => {
  const { id } = req.params;
  const { status, queue_number, wait_time, notification } = req.body;
  
  const updates = [];
  const values = [];
  let paramIndex = 1;
  if (status !== undefined) { updates.push(`status = $${paramIndex++}`); values.push(status); }
  if (queue_number !== undefined) { updates.push(`queue_number = $${paramIndex++}`); values.push(queue_number); }
  if (wait_time !== undefined) { updates.push(`wait_time = $${paramIndex++}`); values.push(wait_time); }
  if (notification !== undefined) { updates.push(`notification = $${paramIndex++}`); values.push(notification); }
  updates.push('updated_at = CURRENT_TIMESTAMP');
  
  if (values.length > 0) {
    await run(`UPDATE orders SET ${updates.join(', ')} WHERE id = $${paramIndex}`, [...values, id]);
  }
  
  const order = await get('SELECT * FROM orders WHERE id = $1', [id]);
  order.items = await query(`
    SELECT oi.*, m.name, m.price 
    FROM order_items oi 
    JOIN menu_items m ON oi.menu_item_id = m.id 
    WHERE oi.order_id = $1
  `, [id]);
  
  broadcast({ type: 'order_updated', order });
  res.json(order);
});

app.get('/api/orders/:id', async (req, res) => {
  const order = await get('SELECT * FROM orders WHERE id = $1', [req.params.id]);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  order.items = await query(`
    SELECT oi.*, m.name, m.price 
    FROM order_items oi 
    JOIN menu_items m ON oi.menu_item_id = m.id 
    WHERE oi.order_id = $1
  `, [order.id]);
  res.json(order);
});

// Initialize database and start server
const PORT = process.env.PORT || 3000;
initDb().then(() => {
  server.listen(PORT, '0.0.0.0', () => console.log(`Server running on http://0.0.0.0:${PORT}`));
});
