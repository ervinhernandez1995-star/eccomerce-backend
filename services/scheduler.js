import cron from 'node-cron'
import { getDatabase } from '../config/database.js'
import { searchTrendingProducts } from './trendingProducts.js'
import { analyzeProductWithAI } from './productAnalysis.js'
import { processOrders } from './orderProcessor.js'
import { sendMarketingEmails } from './marketingService.js'
import { generateAnalyticsReport } from './analyticsService.js'

let schedulerStarted = false

export const initializeScheduler = () => {
  if (schedulerStarted) {
    console.log('⚠️ Scheduler already initialized')
    return
  }

  console.log('🕐 Initializing automated scheduler...')

  // Daily product analysis and trending search (2:00 AM)
  cron.schedule('0 2 * * *', async () => {
    console.log('🔄 Running daily product analysis and trending search...')
    await runDailyProductAnalysis()
  }, {
    timezone: "Europe/Madrid"
  })

  // Order processing (every 5 minutes during business hours)
  cron.schedule('*/5 8-22 * * *', async () => {
    console.log('📦 Processing pending orders...')
    await processPendingOrders()
  }, {
    timezone: "Europe/Madrid"
  })

  // Marketing campaign processing (hourly)
  cron.schedule('0 * * * *', async () => {
    console.log('📧 Processing marketing campaigns...')
    await processMarketingCampaigns()
  }, {
    timezone: "Europe/Madrid"
  })

  // Analytics report generation (daily at 6:00 AM)
  cron.schedule('0 6 * * *', async () => {
    console.log('📊 Generating daily analytics report...')
    await generateDailyAnalyticsReport()
  }, {
    timezone: "Europe/Madrid"
  })

  // Stock synchronization (every 30 minutes during business hours)
  cron.schedule('*/30 8-22 * * *', async () => {
    console.log('📋 Synchronizing stock levels...')
    await syncStockLevels()
  }, {
    timezone: "Europe/Madrid"
  })

  // Weekly trending analysis (Sundays at 3:00 AM)
  cron.schedule('0 3 * * 0', async () => {
    console.log('📈 Running weekly trending analysis...')
    await runWeeklyTrendingAnalysis()
  }, {
    timezone: "Europe/Madrid"
  })

  // Health check and cleanup (daily at 1:00 AM)
  cron.schedule('0 1 * * *', async () => {
    console.log('🧹 Running system health check and cleanup...')
    await runSystemHealthCheck()
  }, {
    timezone: "Europe/Madrid"
  })

  schedulerStarted = true
  console.log('✅ Automated scheduler initialized successfully')
}

const runDailyProductAnalysis = async () => {
  try {
    const supabase = getDatabase()
    
    // Get categories to analyze
    const categories = ['electronics', 'clothing', 'home', 'sports', 'beauty']
    
    for (const category of categories) {
      try {
        // Search for trending products in this category
        const trendingProducts = await searchTrendingProducts({
          category,
          limit: 50
        })

        // Analyze each product
        for (const product of trendingProducts) {
          try {
            // Check if product already exists
            const { data: existing } = await supabase
              .from('products')
              .select('id')
              .eq('title', product.title)
              .eq('supplier', product.supplier)
              .single()

            if (existing) continue // Skip if already exists

            // Analyze with AI
            const analysisResult = await analyzeProductWithAI(product)

            // Only add high-scoring products
            if (analysisResult.score >= 60) {
              await supabase.from('products').insert({
                title: product.title,
                description: `Producto trending en ${category}`,
                price: analysisResult.recommended_price || product.price,
                original_price: product.original_price,
                image_url: product.image_url,
                category: product.category,
                supplier: product.supplier,
                sku: generateSKU(product.title, product.supplier),
                score: analysisResult.score,
                demand_score: analysisResult.demand,
                competition_score: analysisResult.competition,
                margin_percentage: analysisResult.recommended_margin,
                stock_quantity: 100, // Default stock for dropshipping
                is_active: true
              })

              console.log(`✅ Added trending product: ${product.title} (Score: ${analysisResult.score})`)
            }
          } catch (error) {
            console.error(`Error analyzing product ${product.title}:`, error.message)
          }
        }

        // Small delay between categories to avoid overwhelming APIs
        await new Promise(resolve => setTimeout(resolve, 2000))
      } catch (error) {
        console.error(`Error processing category ${category}:`, error.message)
      }
    }

    console.log('✅ Daily product analysis completed')
  } catch (error) {
    console.error('❌ Error in daily product analysis:', error)
  }
}

const processPendingOrders = async () => {
  try {
    await processOrders()
  } catch (error) {
    console.error('❌ Error processing orders:', error)
  }
}

const processMarketingCampaigns = async () => {
  try {
    const supabase = getDatabase()
    
    // Get scheduled campaigns
    const { data: campaigns, error } = await supabase
      .from('marketing_campaigns')
      .select('*')
      .eq('status', 'scheduled')
      .lte('scheduled_at', new Date().toISOString())

    if (error) throw error

    for (const campaign of campaigns) {
      try {
        await sendMarketingEmails(campaign)
        
        // Update campaign status
        await supabase
          .from('marketing_campaigns')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString()
          })
          .eq('id', campaign.id)

        console.log(`✅ Sent campaign: ${campaign.name}`)
      } catch (error) {
        console.error(`Error sending campaign ${campaign.name}:`, error)
        
        // Mark as failed
        await supabase
          .from('marketing_campaigns')
          .update({ status: 'failed' })
          .eq('id', campaign.id)
      }
    }
  } catch (error) {
    console.error('❌ Error processing marketing campaigns:', error)
  }
}

const generateDailyAnalyticsReport = async () => {
  try {
    await generateAnalyticsReport()
  } catch (error) {
    console.error('❌ Error generating analytics report:', error)
  }
}

const syncStockLevels = async () => {
  try {
    const supabase = getDatabase()
    
    // Get all active products
    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true)

    if (error) throw error

    for (const product of products) {
      try {
        // Simulate stock check (in real implementation, check with supplier APIs)
        const currentStock = Math.max(0, product.stock_quantity + Math.floor(Math.random() * 20) - 10)
        
        // Update stock if changed
        if (currentStock !== product.stock_quantity) {
          await supabase
            .from('products')
            .update({ stock_quantity: currentStock })
            .eq('id', product.id)

          // Alert if stock is low
          if (currentStock <= 5) {
            console.log(`⚠️ Low stock alert: ${product.title} (${currentStock} remaining)`)
          }
        }
      } catch (error) {
        console.error(`Error syncing stock for ${product.title}:`, error)
      }
    }
  } catch (error) {
    console.error('❌ Error syncing stock levels:', error)
  }
}

const runWeeklyTrendingAnalysis = async () => {
  try {
    const supabase = getDatabase()
    
    // Get trending products from the week
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)

    const { data: trendingProducts, error } = await supabase
      .from('trending_products')
      .select('*')
      .gte('discovered_at', weekAgo.toISOString())

    if (error) throw error

    // Analyze trends and store insights
    const insights = analyzeTrendingInsights(trendingProducts)
    
    await supabase.from('trend_insights').insert({
      week_start: weekAgo.toISOString(),
      insights: insights,
      total_products: trendingProducts.length,
      generated_at: new Date().toISOString()
    })

    console.log('✅ Weekly trending analysis completed')
  } catch (error) {
    console.error('❌ Error in weekly trending analysis:', error)
  }
}

const analyzeTrendingInsights = (trendingProducts) => {
  const insights = {
    top_categories: {},
    top_suppliers: {},
    average_score: 0,
    price_ranges: {
      low: 0,    // < $50
      mid: 0,    // $50 - $200
      high: 0    // > $200
    }
  }

  let totalScore = 0

  trendingProducts.forEach(product => {
    const productData = product.product_data
    
    // Count categories
    insights.top_categories[productData.category] = 
      (insights.top_categories[productData.category] || 0) + 1
    
    // Count suppliers
    insights.top_suppliers[productData.supplier] = 
      (insights.top_suppliers[productData.supplier] || 0) + 1
    
    // Add to price ranges
    if (productData.price < 50) {
      insights.price_ranges.low++
    } else if (productData.price <= 200) {
      insights.price_ranges.mid++
    } else {
      insights.price_ranges.high++
    }
    
    totalScore += productData.score || 0
  })

  insights.average_score = trendingProducts.length > 0 ? 
    totalScore / trendingProducts.length : 0

  return insights
}

const runSystemHealthCheck = async () => {
  try {
    const supabase = getDatabase()
    
    // Clean up old analysis data
    const oneMonthAgo = new Date()
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)
    
    await supabase
      .from('product_analysis')
      .delete()
      .lt('created_at', oneMonthAgo.toISOString())

    // Clean up old trending products
    await supabase
      .from('trending_products')
      .delete()
      .lt('discovered_at', oneMonthAgo.toISOString())

    // Check for failed campaigns
    const { data: failedCampaigns } = await supabase
      .from('marketing_campaigns')
      .select('id')
      .eq('status', 'failed')

    if (failedCampaigns && failedCampaigns.length > 0) {
      console.log(`⚠️ Found ${failedCampaigns.length} failed campaigns to review`)
    }

    // Check for products with very low scores
    const { data: lowScoreProducts } = await supabase
      .from('products')
      .select('id, title, score')
      .lt('score', 30)
      .eq('is_active', true)

    if (lowScoreProducts && lowScoreProducts.length > 0) {
      console.log(`⚠️ Found ${lowScoreProducts.length} products with low scores`)
    }

    console.log('✅ System health check completed')
  } catch (error) {
    console.error('❌ Error in system health check:', error)
  }
}

const generateSKU = (title, supplier) => {
  const cleanTitle = title
    .replace(/[^a-zA-Z0-9]/g, '')
    .substring(0, 10)
    .toUpperCase()
  
  const supplierCode = supplier
    .replace(/[^a-zA-Z0-9]/g, '')
    .substring(0, 3)
    .toUpperCase()
  
  const timestamp = Date.now().toString().slice(-6)
  
  return `${supplierCode}-${cleanTitle}-${timestamp}`
}

// Manual triggers for testing
export const triggerDailyAnalysis = async () => {
  console.log('🔄 Manual trigger: Running daily product analysis...')
  await runDailyAnalysis()
}

export const triggerOrderProcessing = async () => {
  console.log('📦 Manual trigger: Processing pending orders...')
  await processPendingOrders()
}

export const triggerMarketingCampaigns = async () => {
  console.log('📧 Manual trigger: Processing marketing campaigns...')
  await processMarketingCampaigns()
}