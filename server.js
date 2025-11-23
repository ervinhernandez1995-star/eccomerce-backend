import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import morgan from 'morgan'
import dotenv from 'dotenv'

// Routes
import authRoutes from './routes/auth.js'
import productRoutes from './routes/products.js'
import orderRoutes from './routes/orders.js'
import analyticsRoutes from './routes/analytics.js'
import automationRoutes from './routes/automation.js'
import settingsRoutes from './routes/settings.js'
import marketingRoutes from './routes/marketing.js'

// Services
import { initializeScheduler } from './services/scheduler.js'
import { initializeDatabase } from './config/database.js'

// Load environment variables
dotenv.config()

const app = express()
const PORT = process.env.PORT || 5000

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", "https:"],
    },
  },
}))

app.use(compression())
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}))
app.use(morgan('combined'))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  })
})

// API Routes
app.use('/api/auth', authRoutes)
app.use('/api/products', productRoutes)
app.use('/api/orders', orderRoutes)
app.use('/api/analytics', analyticsRoutes)
app.use('/api/automation', automationRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/marketing', marketingRoutes)

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err)
  
  const isDev = process.env.NODE_ENV === 'development'
  
  res.status(err.status || 500).json({
    success: false,
    error: {
      message: err.message,
      ...(isDev && { stack: err.stack })
    }
  })
})

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: 'Route not found'
    }
  })
})

// Initialize services and start server
async function startServer() {
  try {
    // Initialize database
    await initializeDatabase()
    console.log('✅ Database initialized')
    
    // Initialize scheduler for automated tasks
    initializeScheduler()
    console.log('✅ Scheduler initialized')
    
    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`)
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`)
      console.log(`📊 Health check: http://localhost:${PORT}/health`)
    })
  } catch (error) {
    console.error('❌ Failed to start server:', error)
    process.exit(1)
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully')
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully')
  process.exit(0)
})

// Start the server
startServer()

export default app