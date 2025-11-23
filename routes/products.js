import express from 'express'
import {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  analyzeProduct,
  getTrendingProducts,
  bulkImportProducts
} from '../controllers/productController.js'
import { authenticateToken } from '../middleware/auth.js'

const router = express.Router()

// Public routes
router.get('/', getProducts)
router.get('/trending', getTrendingProducts)
router.get('/:id', getProduct)
router.post('/analyze', analyzeProduct)

// Protected routes
router.post('/', authenticateToken, createProduct)
router.put('/:id', authenticateToken, updateProduct)
router.delete('/:id', authenticateToken, deleteProduct)
router.post('/bulk-import', authenticateToken, bulkImportProducts)

export default router