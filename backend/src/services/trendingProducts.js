import axios from 'axios'
import * as cheerio from 'cheerio'
import { getDatabase } from '../config/database.js'

export const searchTrendingProducts = async (options = {}) => {
  const { category, limit = 20, minScore = 60 } = options
  
  const trendingProducts = []
  const processedUrls = new Set()

  try {
    // Search different platforms for trending products
    const searchTasks = [
      () => searchAmazonBestsellers(category, limit),
      () => searchAliExpressTrending(category, limit),
      () => searchMercadoLibreTrending(category, limit),
      () => searchGoogleTrends(category, limit)
    ]

    const results = await Promise.allSettled(
      searchTasks.map(task => task())
    )

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        trendingProducts.push(...result.value)
      }
    }

    // Remove duplicates and sort by score
    const uniqueProducts = trendingProducts
      .filter(product => !processedUrls.has(product.url))
      .map(product => {
        processedUrls.add(product.url)
        return product
      })
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, limit)

    // Store trending products in database for analysis
    await storeTrendingProducts(uniqueProducts)

    return uniqueProducts
  } catch (error) {
    console.error('Error searching trending products:', error)
    return []
  }
}

const searchAmazonBestsellers = async (category, limit) => {
  try {
    const categoryMap = {
      'electronics': 'electronics',
      'clothing': 'fashion',
      'home': 'home',
      'sports': 'sport',
      'beauty': 'beauty'
    }

    const amazonCategory = categoryMap[category?.toLowerCase()] || 'electronics'
    const url = `https://www.amazon.com/gp/bestsellers/${amazonCategory}`
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    })

    const $ = cheerio.load(response.data)
    const products = []

    $('.zg-grid-relRef').each((index, element) => {
      if (index >= limit) return false

      const $item = $(element)
      const title = $item.find('.p13n-sc-truncate').text().trim()
      const priceText = $item.find('.p13n-sc-price').text()
      const price = extractPrice(priceText)
      const rating = $item.find('.a-icon-alt').text()
      const reviews = $item.find('.a-size-small .a-link-normal').text()
      const image = $item.find('img').attr('src')
      const link = 'https://www.amazon.com' + $item.find('.a-link-normal').attr('href')

      if (title && price > 0) {
        const product = {
          title,
          price,
          original_price: price * 1.2, // Estimate
          image_url: image,
          category: category || 'Electrónicos',
          supplier: 'Amazon',
          url: link,
          source: 'amazon_bestsellers',
          rating: parseFloat((rating || '0').split(' ')[0]) || 0,
          reviews_count: parseInt((reviews || '0').replace(/\D/g, '')) || 0,
          score: calculateProductScore({ title, price, rating, reviews_count }),
          source_data: {
            bestseller_rank: index + 1,
            category: amazonCategory
          }
        }

        products.push(product)
      }
    })

    return products
  } catch (error) {
    console.error('Error scraping Amazon bestsellers:', error)
    return []
  }
}

const searchAliExpressTrending = async (category, limit) => {
  try {
    // AliExpress doesn't have a public trending page, so we'll simulate
    // In a real implementation, you'd use their API or search for trending keywords
    
    const searchTerms = {
      'electronics': 'gadgets',
      'clothing': 'fashion',
      'home': 'home decor',
      'sports': 'fitness',
      'beauty': 'cosmetics'
    }

    const searchTerm = searchTerms[category?.toLowerCase()] || 'trending'
    const url = `https://es.aliexpress.com/wholesale?SearchText=${encodeURIComponent(searchTerm)}`
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
      },
      timeout: 10000
    })

    const $ = cheerio.load(response.data)
    const products = []

    $('.item').each((index, element) => {
      if (index >= limit) return false

      const $item = $(element)
      const title = $item.find('.item-title').text().trim()
      const priceText = $item.find('.notranslate').text()
      const price = extractPrice(priceText)
      const image = $item.find('img').attr('src')
      const link = 'https:' + $item.find('.item-title').attr('href')

      if (title && price > 0) {
        const product = {
          title,
          price,
          original_price: price * 1.5, // Estimate higher original price
          image_url: image,
          category: category || 'General',
          supplier: 'AliExpress',
          url: link,
          source: 'aliexpress_trending',
          rating: Math.random() * 2 + 3, // Random 3-5 rating
          reviews_count: Math.floor(Math.random() * 1000) + 50,
          score: calculateProductScore({ title, price }),
          source_data: {
            search_term: searchTerm
          }
        }

        products.push(product)
      }
    })

    return products
  } catch (error) {
    console.error('Error scraping AliExpress:', error)
    return []
  }
}

const searchMercadoLibreTrending = async (category, limit) => {
  try {
    const categoryMap = {
      'electronics': 'MLA1051',
      'clothing': 'MLA109027',
      'home': 'MLA1574',
      'sports': 'MLA109027',
      'beauty': 'MLA1246'
    }

    const categoryId = categoryMap[category?.toLowerCase()] || 'MLA1051'
    const url = `https://listado.mercadolibre.com.mx/_CustId_0#applied_filter_id%3DSHIPPING_COST%26applied_value_id%3Dfree%26applied_value_name%3Dgratis%26is_custom%3Dfalse`
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'es-MX,es;q=0.9'
      },
      timeout: 10000
    })

    const $ = cheerio.load(response.data)
    const products = []

    $('.ui-search-result').each((index, element) => {
      if (index >= limit) return false

      const $item = $(element)
      const title = $item.find('.ui-search-item__title').text().trim()
      const priceText = $item.find('.andes-money-amount').text()
      const price = extractPrice(priceText)
      const image = $item.find('img').attr('src')
      const link = $item.find('.ui-search-link').attr('href')

      if (title && price > 0) {
        const product = {
          title,
          price,
          original_price: price * 1.3, // Estimate
          image_url: image,
          category: category || 'General',
          supplier: 'MercadoLibre',
          url: link,
          source: 'mercadolibre_trending',
          rating: Math.random() * 2 + 3,
          reviews_count: Math.floor(Math.random() * 500) + 20,
          score: calculateProductScore({ title, price }),
          source_data: {
            category_id: categoryId
          }
        }

        products.push(product)
      }
    })

    return products
  } catch (error) {
    console.error('Error scraping MercadoLibre:', error)
    return []
  }
}

const searchGoogleTrends = async (category, limit) => {
  try {
    // Mock Google Trends data - in real implementation use Google Trends API
    const trendingTopics = {
      'electronics': ['smartphone', 'laptop', 'headphones', 'smartwatch', 'tablet'],
      'clothing': ['fashion', 'shoes', 'accessories', 'dress', 'jewelry'],
      'home': ['furniture', 'decor', 'kitchen', 'bathroom', 'organization'],
      'sports': ['fitness', 'outdoor', 'equipment', 'apparel', 'accessories'],
      'beauty': ['skincare', 'makeup', 'haircare', 'fragrance', 'tools']
    }

    const topics = trendingTopics[category?.toLowerCase()] || trendingTopics['electronics']
    const products = []

    for (let i = 0; i < Math.min(limit, topics.length); i++) {
      const topic = topics[i]
      
      // Create a mock trending product based on the topic
      const product = {
        title: `Trending ${topic.charAt(0).toUpperCase() + topic.slice(1)} Product`,
        price: Math.floor(Math.random() * 200) + 20,
        original_price: 0,
        image_url: `https://via.placeholder.com/300x300/2563eb/white?text=${topic}`,
        category: category || 'Trending',
        supplier: 'Google Trends',
        url: `https://trends.google.com/trends/explore?q=${encodeURIComponent(topic)}`,
        source: 'google_trends',
        rating: Math.random() * 1 + 4,
        reviews_count: Math.floor(Math.random() * 500) + 100,
        score: Math.floor(Math.random() * 30) + 70, // High scores for trending
        source_data: {
          trend_topic: topic,
          search_volume: Math.floor(Math.random() * 10000) + 1000
        }
      }

      products.push(product)
    }

    return products
  } catch (error) {
    console.error('Error getting Google Trends data:', error)
    return []
  }
}

const extractPrice = (priceText) => {
  if (!priceText) return 0
  // Remove currency symbols and extract number
  const price = priceText.replace(/[^\d.,]/g, '').replace(',', '.')
  return parseFloat(price) || 0
}

const calculateProductScore = (productData) => {
  let score = 50 // Base score

  // Price factor
  if (productData.price >= 20 && productData.price <= 200) {
    score += 15 // Good price range for dropshipping
  } else if (productData.price < 10 || productData.price > 500) {
    score -= 15 // Poor price range
  }

  // Rating factor
  if (productData.rating >= 4.5) {
    score += 15
  } else if (productData.rating >= 4.0) {
    score += 10
  } else if (productData.rating < 3.5) {
    score -= 10
  }

  // Reviews factor
  if (productData.reviews_count > 1000) {
    score += 10
  } else if (productData.reviews_count > 500) {
    score += 5
  }

  // Title keywords factor
  const positiveKeywords = ['bestseller', 'trending', 'popular', 'new', 'hot', 'sale']
  const title = productData.title.toLowerCase()
  const keywordBonus = positiveKeywords.filter(keyword => title.includes(keyword)).length * 3
  score += keywordBonus

  return Math.max(0, Math.min(100, score))
}

const storeTrendingProducts = async (products) => {
  try {
    const supabase = getDatabase()
    
    // Store in a temporary table for trending analysis
    for (const product of products) {
      await supabase.from('trending_products').upsert({
        source_url: product.url,
        source_type: product.source,
        product_data: product,
        discovered_at: new Date().toISOString(),
        analysis_status: 'pending'
      })
    }
  } catch (error) {
    console.error('Error storing trending products:', error)
  }
}

export const getTrendingProductsByCategory = async (category, limit = 10) => {
  try {
    const trendingProducts = await searchTrendingProducts({ category, limit })
    return trendingProducts.slice(0, limit)
  } catch (error) {
    console.error('Error getting trending products by category:', error)
    return []
  }
}