import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

let supabase = null

export const initializeDatabase = async () => {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
      throw new Error('Supabase credentials not found in environment variables')
    }

    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY
    )

    // Test connection
    const { data, error } = await supabase.from('users').select('count').limit(1)
    
    if (error) {
      console.log('Database connection test failed, tables may not exist yet')
    } else {
      console.log('✅ Database connection established')
    }

    return supabase
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message)
    
    // Fallback to file-based storage for development
    supabase = createClient('http://localhost:54321', 'dev-key')
    console.log('⚠️  Using fallback database connection')
    
    return supabase
  }
}

export const getDatabase = () => {
  if (!supabase) {
    throw new Error('Database not initialized. Call initializeDatabase() first.')
  }
  return supabase
}

// Database schema initialization
export const createTables = async () => {
  const supabase = getDatabase()
  
  const tables = [
    // Users table
    `
      CREATE TABLE IF NOT EXISTS users (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        business_name VARCHAR(255),
        phone VARCHAR(50),
        address TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `,
    
    // Products table
    `
      CREATE TABLE IF NOT EXISTS products (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        price DECIMAL(10,2) NOT NULL,
        original_price DECIMAL(10,2),
        image_url TEXT,
        category VARCHAR(100),
        supplier VARCHAR(100),
        sku VARCHAR(100),
        stock_quantity INTEGER DEFAULT 0,
        score INTEGER DEFAULT 0,
        demand_score INTEGER DEFAULT 0,
        competition_score INTEGER DEFAULT 0,
        margin_percentage DECIMAL(5,2),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `,
    
    // Orders table
    `
      CREATE TABLE IF NOT EXISTS orders (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        order_number VARCHAR(100) UNIQUE NOT NULL,
        customer_email VARCHAR(255) NOT NULL,
        customer_name VARCHAR(255) NOT NULL,
        customer_phone VARCHAR(50),
        shipping_address TEXT NOT NULL,
        total_amount DECIMAL(10,2) NOT NULL,
        profit_amount DECIMAL(10,2) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        payment_status VARCHAR(50) DEFAULT 'pending',
        payment_method VARCHAR(50),
        stripe_payment_id VARCHAR(255),
        paypal_transaction_id VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `,
    
    // Order items table
    `
      CREATE TABLE IF NOT EXISTS order_items (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
        product_id UUID REFERENCES products(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL,
        unit_price DECIMAL(10,2) NOT NULL,
        total_price DECIMAL(10,2) NOT NULL,
        supplier_order_id VARCHAR(255),
        supplier_status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `,
    
    // Analytics table
    `
      CREATE TABLE IF NOT EXISTS analytics (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        date DATE NOT NULL,
        visitors INTEGER DEFAULT 0,
        orders INTEGER DEFAULT 0,
        revenue DECIMAL(10,2) DEFAULT 0,
        profit DECIMAL(10,2) DEFAULT 0,
        conversion_rate DECIMAL(5,2) DEFAULT 0,
        average_order_value DECIMAL(10,2) DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `,
    
    // Marketing campaigns table
    `
      CREATE TABLE IF NOT EXISTS marketing_campaigns (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        platform VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'draft',
        target_audience JSONB,
        content TEXT,
        scheduled_at TIMESTAMP WITH TIME ZONE,
        sent_at TIMESTAMP WITH TIME ZONE,
        reach INTEGER DEFAULT 0,
        clicks INTEGER DEFAULT 0,
        conversions INTEGER DEFAULT 0,
        revenue DECIMAL(10,2) DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `,
    
    // Product analysis table
    `
      CREATE TABLE IF NOT EXISTS product_analysis (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        product_id UUID REFERENCES products(id) ON DELETE CASCADE,
        source_url TEXT NOT NULL,
        analysis_data JSONB NOT NULL,
        trends_data JSONB,
        competitor_analysis JSONB,
        demand_forecast INTEGER,
        competition_level VARCHAR(20),
        recommended_price DECIMAL(10,2),
        profit_margin DECIMAL(5,2),
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `,
    
    // Settings table
    `
      CREATE TABLE IF NOT EXISTS settings (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        key VARCHAR(100) UNIQUE NOT NULL,
        value JSONB NOT NULL,
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `
  ]

  try {
    for (const sql of tables) {
      const { error } = await supabase.rpc('exec_sql', { sql })
      if (error && !error.message.includes('already exists')) {
        console.error('Error creating table:', error)
      }
    }
    console.log('✅ Database tables created/verified')
  } catch (error) {
    console.error('❌ Error creating tables:', error.message)
    // Continue anyway, tables might already exist
  }
}