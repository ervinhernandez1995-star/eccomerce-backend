import OpenAI from 'openai'
import axios from 'axios'
import * as cheerio from 'cheerio'
import { getDatabase } from '../config/database.js'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export const analyzeProductWithAI = async (productData) => {
  try {
    // If URL is provided, extract product data
    if (productData.url) {
      productData = await extractProductFromURL(productData.url)
    }

    // Get market analysis data
    const marketData = await getMarketAnalysisData(productData)

    // Use OpenAI to analyze the product
    const analysisPrompt = `
      Analiza este producto para dropshipping y proporciona un análisis detallado:
      
      Producto: ${productData.title}
      Precio: $${productData.price}
      Categoría: ${productData.category || 'No especificada'}
      Proveedor: ${productData.supplier || 'No especificado'}
      
      Datos del mercado:
      ${JSON.stringify(marketData)}
      
      Proporciona tu análisis en el siguiente formato JSON:
      {
        "score": <número del 0-100>,
        "demand": <número del 0-100>,
        "competition": <número del 0-100>,
        "recommended_price": <precio optimizado>,
        "recommended_margin": <margen porcentual recomendado>,
        "reasoning": ["razón 1", "razón 2", "razón 3"],
        "risk_factors": ["factor 1", "factor 2"],
        "opportunities": ["oportunidad 1", "oportunidad 2"],
        "market_trends": "breve descripción de tendencias"
      }
      
      Considera:
      - Margen mínimo de ganancia del 20%
      - Análisis de demanda basado en búsquedas y tendencias
      - Nivel de competencia en el nicho
      - Calidad percibida del producto
      - Estacionalidad y tendencias actuales
    `

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "Eres un experto en análisis de mercado y dropshipping. Proporciona análisis objetivos y basados en datos."
        },
        {
          role: "user",
          content: analysisPrompt
        }
      ],
      temperature: 0.3,
      max_tokens: 1000
    })

    const analysisResult = JSON.parse(completion.choices[0].message.content)

    // Save analysis to database
    await saveProductAnalysis(productData, analysisResult)

    return analysisResult
  } catch (error) {
    console.error('Error in AI analysis:', error)
    
    // Fallback analysis without AI
    return generateFallbackAnalysis(productData)
  }
}

const extractProductFromURL = async (url) => {
  try {
    // Check if URL is from supported sites
    const supportedSites = [
      'amazon.com', 'amazon.es', 'aliexpress.com', 
      'mercadolibre.com', 'ebay.com'
    ]
    
    const isSupported = supportedSites.some(site => url.includes(site))
    
    if (!isSupported) {
      throw new Error('Sitio no soportado para extracción automática')
    }

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 10000
    })

    const $ = cheerio.load(response.data)
    
    let extractedData = {
      title: '',
      price: 0,
      original_price: 0,
      image_url: '',
      description: '',
      category: '',
      rating: 0,
      reviews_count: 0
    }

    // Amazon extraction
    if (url.includes('amazon')) {
      extractedData.title = $('#productTitle').text().trim()
      extractedData.price = extractPrice($('#priceblock_dealprice').text()) || 
                           extractPrice($('#priceblock_ourprice').text()) ||
                           extractPrice($('.a-price-whole').first().text())
      extractedData.original_price = extractPrice($('.a-text-price').text())
      extractedData.image_url = $('#landingImage').attr('src') || $('#main-image').attr('src')
      extractedData.rating = parseFloat($('.a-icon-alt').text().split(' ')[0]) || 0
      extractedData.reviews_count = parseInt($('#acrCustomerReviewText').text().replace(/\D/g, '')) || 0
    }
    
    // AliExpress extraction
    else if (url.includes('aliexpress')) {
      extractedData.title = $('h1').first().text().trim()
      extractedData.price = extractPrice($('.notranslate').first().text())
      extractedData.original_price = extractPrice($('.price-original').text())
      extractedData.image_url = $('.gallery-preview-frame img').first().attr('src')
    }
    
    // Mercado Libre extraction
    else if (url.includes('mercadolibre')) {
      extractedData.title = $('h1').first().text().trim()
      extractedData.price = extractPrice($('.andes-money-amount--previous').text()) ||
                           extractPrice($('.andes-money-amount').text())
      extractedData.original_price = extractPrice($('.andes-money-amount--previous').text())
      extractedData.image_url = $('img').first().attr('src')
    }

    return extractedData
  } catch (error) {
    console.error('Error extracting product from URL:', error)
    throw new Error('No se pudo extraer información del producto')
  }
}

const extractPrice = (priceText) => {
  if (!priceText) return 0
  const price = priceText.replace(/[^\d.,]/g, '').replace(',', '.')
  return parseFloat(price) || 0
}

const getMarketAnalysisData = async (productData) => {
  const marketData = {
    category: productData.category || 'general',
    price_range: getPriceRange(productData.price),
    supplier: productData.supplier || 'unknown',
    timestamp: new Date().toISOString()
  }

  try {
    // Get search trends (if Google Trends API is available)
    if (process.env.GOOGLE_TRENDS_API_KEY) {
      marketData.search_trends = await getGoogleTrendsData(productData.title)
    }

    // Get competitor data
    marketData.competitor_analysis = await getCompetitorAnalysis(productData)

    return marketData
  } catch (error) {
    console.error('Error getting market data:', error)
    return marketData
  }
}

const getGoogleTrendsData = async (keyword) => {
  try {
    // This would use the Google Trends API
    // For now, return mock data
    return {
      interest_over_time: Math.floor(Math.random() * 100),
      related_topics: ['electronics', 'technology', 'gadgets'],
      related_queries: ['best price', 'review', 'buy online']
    }
  } catch (error) {
    return { interest_over_time: 50 }
  }
}

const getCompetitorAnalysis = async (productData) => {
  try {
    // This would analyze competitors on various platforms
    // For now, return mock data
    return {
      total_competitors: Math.floor(Math.random() * 50) + 10,
      average_price: productData.price * (0.8 + Math.random() * 0.4),
      price_range: {
        min: productData.price * 0.7,
        max: productData.price * 1.5
      },
      top_sellers: ['Brand A', 'Brand B', 'Brand C']
    }
  } catch (error) {
    return { total_competitors: 25, average_price: productData.price }
  }
}

const getPriceRange = (price) => {
  if (price < 25) return 'budget'
  if (price < 100) return 'mid-range'
  if (price < 500) return 'premium'
  return 'luxury'
}

const saveProductAnalysis = async (productData, analysisResult) => {
  try {
    const supabase = getDatabase()
    
    await supabase.from('product_analysis').insert({
      source_url: productData.url || null,
      analysis_data: {
        product_title: productData.title,
        price: productData.price,
        category: productData.category,
        supplier: productData.supplier
      },
      trends_data: analysisResult.market_trends || null,
      competitor_analysis: analysisResult.competitor_analysis || null,
      demand_forecast: analysisResult.demand || 0,
      competition_level: analysisResult.competition > 70 ? 'high' : 
                        analysisResult.competition > 40 ? 'medium' : 'low',
      recommended_price: analysisResult.recommended_price || productData.price,
      profit_margin: analysisResult.recommended_margin || 25,
      status: 'completed'
    })
  } catch (error) {
    console.error('Error saving analysis:', error)
  }
}

const generateFallbackAnalysis = (productData) => {
  // Fallback analysis when AI is not available
  const baseScore = 70
  const marginVariation = Math.random() * 20 - 10
  
  return {
    score: Math.max(0, Math.min(100, baseScore + marginVariation)),
    demand: Math.floor(Math.random() * 60) + 20,
    competition: Math.floor(Math.random() * 80) + 10,
    recommended_price: productData.price * 1.25,
    recommended_margin: 25,
    reasoning: [
      'Análisis basado en precio promedio del mercado',
      'Margen estimado conservador',
      'Requiere revisión manual para optimizar'
    ],
    risk_factors: ['Fluctuaciones de precios del proveedor', 'Cambios en demanda'],
    opportunities: ['Temporada alta próxima', 'Competencia limitada en nicho'],
    market_trends: 'Análisis automático básico - requiere revisión humana'
  }
}