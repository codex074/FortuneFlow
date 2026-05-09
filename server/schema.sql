CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  asset_name TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK(asset_type IN ('stock','crypto','fund','gold','bond','savings','cash')),
  currency TEXT NOT NULL CHECK(currency IN ('THB','USD')),
  action TEXT NOT NULL CHECK(action IN ('buy','sell','dividend','interest','deposit','withdraw')),
  units REAL NOT NULL,
  price_per_unit REAL NOT NULL,
  total_cost REAL NOT NULL,
  fees REAL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('stock','crypto','fund','gold','bond','savings','cash')),
  currency TEXT NOT NULL CHECK(currency IN ('THB','USD')),
  current_price REAL,
  last_updated TEXT,
  UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS settings (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS price_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_name TEXT NOT NULL,
  currency TEXT NOT NULL CHECK(currency IN ('THB','USD')),
  price_date TEXT NOT NULL,
  price REAL NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, asset_name, currency, price_date)
);

CREATE TABLE IF NOT EXISTS trading_transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  asset_name TEXT NOT NULL,
  currency TEXT NOT NULL CHECK(currency IN ('THB','USD')),
  action TEXT NOT NULL CHECK(action IN ('buy','sell')),
  units REAL NOT NULL,
  price_per_unit REAL NOT NULL,
  total_cost REAL NOT NULL,
  fees REAL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tfex_trades (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_date TEXT NOT NULL,
  contract TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('long','short')),
  contracts INTEGER NOT NULL,
  multiplier REAL NOT NULL,
  entry_price REAL NOT NULL,
  exit_date TEXT,
  exit_price REAL,
  commission REAL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS forex_trades (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_date TEXT NOT NULL,
  pair TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('long','short')),
  lots REAL NOT NULL,
  lot_size REAL NOT NULL,
  entry_price REAL NOT NULL,
  exit_date TEXT,
  exit_price REAL,
  commission REAL DEFAULT 0,
  currency TEXT NOT NULL CHECK(currency IN ('THB','USD')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
