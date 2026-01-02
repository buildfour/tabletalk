import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? true : false
});

export async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS menu_items (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        price DECIMAL(10,2) NOT NULL,
        category TEXT NOT NULL,
        available BOOLEAN DEFAULT true
      );

      CREATE TABLE IF NOT EXISTS table_codes (
        id SERIAL PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        table_number TEXT,
        active BOOLEAN DEFAULT true
      );

      CREATE TABLE IF NOT EXISTS staff_codes (
        id SERIAL PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        name TEXT,
        active BOOLEAN DEFAULT true
      );

      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        table_code TEXT NOT NULL,
        status TEXT DEFAULT 'received',
        queue_number INTEGER,
        wait_time INTEGER,
        notification TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id),
        menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
        quantity INTEGER DEFAULT 1,
        notes TEXT
      );
    `);

    // Seed menu if empty
    const menuCheck = await client.query('SELECT COUNT(*) FROM menu_items');
    if (parseInt(menuCheck.rows[0].count) === 0) {
      const items = [
        ['Hot Burger', 'Grilled burger with chicken, lettuce, tomato and special sauce', 10.50, 'Burgers'],
        ['Crunch Burger', 'Crispy fried patty with special crunchy coating and cheese', 8.50, 'Burgers'],
        ['Beef Burger', 'Premium beef patty with sesame bun and fresh vegetables', 9.50, 'Burgers'],
        ['Deluxe Burger', 'Premium burger with cheese, bacon, lettuce and special sauce', 12.00, 'Burgers'],
        ['Classic Shake', 'Creamy vanilla milkshake blend', 4.50, 'Shakes & Drinks'],
        ['Berry Shake', 'Mixed berry and cream shake', 4.50, 'Shakes & Drinks'],
        ['Dash Coffee', 'Espresso with steamed milk', 2.50, 'Shakes & Drinks'],
        ['Coconut Tea', 'Refreshing coconut iced tea', 3.50, 'Shakes & Drinks'],
        ['Cake Bites', 'Mini cake pastries', 3.50, 'Sides'],
        ['Cheesy Cup', 'Melted cheese dip cup', 3.50, 'Sides'],
        ['Chicken Strips', 'Crispy chicken tenders', 2.50, 'Sides'],
        ['Cheesy Soup', 'Creamy cheese soup', 3.50, 'Sides'],
        ['Crispy Salads', 'Fresh garden salad', 3.50, 'Sides'],
        ['Egg Shakes', 'Protein-rich egg shake', 5.00, 'Sides'],
        ['Fruit & Ice', 'Fresh fruits with ice cream', 7.95, 'Desserts'],
        ['Mango Sundae', 'Mango ice cream sundae', 6.95, 'Desserts'],
      ];
      for (const [name, desc, price, cat] of items) {
        await client.query('INSERT INTO menu_items (name, description, price, category) VALUES ($1, $2, $3, $4)', [name, desc, price, cat]);
      }
    }

    // Seed table codes if empty
    const codeCheck = await client.query('SELECT COUNT(*) FROM table_codes');
    if (parseInt(codeCheck.rows[0].count) === 0) {
      const codes = [['TABLE01', 'Table 1'], ['TABLE02', 'Table 2'], ['TABLE03', 'Table 3'], ['TABLE04', 'Table 4'], ['TABLE05', 'Table 5'], ['DEMO123', 'Demo Table']];
      for (const [code, table] of codes) {
        await client.query('INSERT INTO table_codes (code, table_number) VALUES ($1, $2)', [code, table]);
      }
    }

    // Seed staff codes if empty
    const staffCheck = await client.query('SELECT COUNT(*) FROM staff_codes');
    if (parseInt(staffCheck.rows[0].count) === 0) {
      const staffCodes = [['STAFF001', 'Staff 1'], ['STAFF002', 'Staff 2'], ['ADMIN123', 'Admin']];
      for (const [code, name] of staffCodes) {
        await client.query('INSERT INTO staff_codes (code, name) VALUES ($1, $2)', [code, name]);
      }
    }

    console.log('Database initialized');
  } finally {
    client.release();
  }
}

export async function query(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

export async function run(sql, params = []) {
  const result = await pool.query(sql, params);
  return result;
}

export async function get(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows[0] || null;
}

export default { initDb, query, run, get };
