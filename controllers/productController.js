import { getDatabase } from '../config/database.js'
import { analyzeProductWithAI } from '../services/productAnalysis.js'
import { searchTrendingProducts } from '../services/trendingProducts.js'

export const getProducts = async (req, res) => {
  try {
    const supabase = getDatabase()
    const { 
      page = 1, 
      limit = 12, 
      category, 
      search, 
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = req.query

    const offset = (page - 1) * limit

    let query = supabase
      .from('products')
      .select('*', { count: 'exact' })
      .eq('is_active', true)

    // Apply filters
    if (category) {
      query = query.eq('category', category)
    }
    
    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`)
    }

    // Apply sorting
    query = query.order(sortBy, { ascending: sortOrder === 'asc' })

    // Apply pagination
    query = query.range(offset, offset + limit - 1)

    const { data: products, error, count } = await query

    if (error) throw error

    res.json({
      success: true,
      data: {
        products,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count || 0,
          pages: Math.ceil((count || 0) / limit)
        }
      }
    })
  } catch (error) {
    console.error('Error fetching products:', error)
    res.status(500).json({
      success: false,
      error: {
        message: 'Error al obtener productos'
      }
    })
  }
}

export const getProduct = async (req, res) => {
  try {
    const supabase = getDatabase()
    const { id } = req.params

    const { data: product, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .eq('is_active', true)
      .single()

    if (error) throw error

    if (!product) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Producto no encontrado'
        }
      })
    }

    res.json({
      success: true,
      data: product
    })
  } catch (error) {
    console.error('Error fetching product:', error)
    res.status(500).json({
      success: false,
      error: {
        message: 'Error al obtener producto'
      }
    })
  }
}

export const createProduct = async (req, res) => {
  try {
    const supabase = getDatabase()
    const {
      title,
      description,
      price,
      original_price,
      image_url,
      category,
      supplier,
      sku,
      stock_quantity = 0,
      margin_percentage
    } = req.body

    // Analyze product with AI if requested
    let analysisResult = null
    if (req.body.analyze) {
      analysisResult = await analyzeProductWithAI({
        title,
        price,
        category,
        supplier
      })
    }

    const { data: product, error } = await supabase
      .from('products')
      .insert({
        title,
        description,
        price,
        original_price,
        image_url,
        category,
        supplier,
        sku,
        stock_quantity,
        score: analysisResult?.score || 0,
        demand_score: analysisResult?.demand || 0,
        competition_score: analysisResult?.competition || 0,
        margin_percentage
      })
      .select()
      .single()

    if (error) throw error

    res.status(201).json({
      success: true,
      data: product
    })
  } catch (error) {
    console.error('Error creating product:', error)
    res.status(500).json({
      success: false,
      error: {
        message: 'Error al crear producto'
      }
    })
  }
}

export const updateProduct = async (req, res) => {
  try {
    const supabase = getDatabase()
    const { id } = req.params
    const updates = req.body

    // Re-analyze if product data changed significantly
    if (updates.title || updates.price || updates.category) {
      const analysisResult = await analyzeProductWithAI({
        title: updates.title,
        price: updates.price,
        category: updates.category
      })
      
      updates.score = analysisResult.score
      updates.demand_score = analysisResult.demand
      updates.competition_score = analysisResult.competition
    }

    updates.updated_at = new Date().toISOString()

    const { data: product, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    res.json({
      success: true,
      data: product
    })
  } catch (error) {
    console.error('Error updating product:', error)
    res.status(500).json({
      success: false,
      error: {
        message: 'Error al actualizar producto'
      }
    })
  }
}

export const deleteProduct = async (req, res) => {
  try {
    const supabase = getDatabase()
    const { id } = req.params

    const { error } = await supabase
      .from('products')
      .update({ 
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)

    if (error) throw error

    res.json({
      success: true,
      message: 'Producto eliminado correctamente'
    })
  } catch (error) {
    console.error('Error deleting product:', error)
    res.status(500).json({
      success: false,
      error: {
        message: 'Error al eliminar producto'
      }
    })
  }
}

export const analyzeProduct = async (req, res) => {
  try {
    const { url, title, price, category, supplier } = req.body

    if (!url && (!title || !price)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Se requiere URL o título y precio del producto'
        }
      })
    }

    const analysisResult = await analyzeProductWithAI({
      url,
      title,
      price,
      category,
      supplier
    })

    res.json({
      success: true,
      data: analysisResult
    })
  } catch (error) {
    console.error('Error analyzing product:', error)
    res.status(500).json({
      success: false,
      error: {
        message: 'Error al analizar producto'
      }
    })
  }
}

export const getTrendingProducts = async (req, res) => {
  try {
    const { category, limit = 20 } = req.query
    
    const trendingProducts = await searchTrendingProducts({
      category,
      limit: parseInt(limit)
    })

    res.json({
      success: true,
      data: trendingProducts
    })
  } catch (error) {
    console.error('Error fetching trending products:', error)
    res.status(500).json({
      success: false,
      error: {
        message: 'Error al obtener productos trending'
      }
    })
  }
}

export const bulkImportProducts = async (req, res) => {
  try {
    const { products } = req.body

    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Se requiere un array de productos'
        }
      })
    }

    const supabase = getDatabase()
    const results = []

    // Process products in batches to avoid overwhelming the system
    const batchSize = 10
    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize)
      
      // Analyze each product in the batch
      const analyzedBatch = await Promise.all(
        batch.map(async (product) => {
          try {
            const analysisResult = await analyzeProductWithAI({
              title: product.title,
              price: product.price,
              category: product.category,
              supplier: product.supplier
            })
            
            return {
              ...product,
              score: analysisResult.score,
              demand_score: analysisResult.demand,
              competition_score: analysisResult.competition,
              margin_percentage: analysisResult.recommended_margin
            }
          } catch (error) {
            console.error('Error analyzing product:', product.title, error)
            return product
          }
        })
      )

      // Insert batch into database
      const { data, error } = await supabase
        .from('products')
        .insert(analyzedBatch)
        .select()

      if (error) {
        console.error('Error inserting batch:', error)
        results.push({ error: error.message, products: batch })
      } else {
        results.push({ success: true, count: data.length, products: data })
      }
    }

    res.json({
      success: true,
      data: {
        processed: products.length,
        results
      }
    })
  } catch (error) {
    console.error('Error bulk importing products:', error)
    res.status(500).json({
      success: false,
      error: {
        message: 'Error al importar productos en lote'
      }
    })
  }
}