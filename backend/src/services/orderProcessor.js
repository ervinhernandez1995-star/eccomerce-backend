import Stripe from 'stripe'
import axios from 'axios'
import { getDatabase } from '../config/database.js'

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null

export const processOrders = async () => {
  try {
    const supabase = getDatabase()
    
    // Get pending orders that need processing
    const { data: pendingOrders, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (*)
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(10) // Process up to 10 orders at a time

    if (error) throw error

    console.log(`📦 Processing ${pendingOrders.length} pending orders...`)

    for (const order of pendingOrders) {
      try {
        await processSingleOrder(order)
      } catch (error) {
        console.error(`Error processing order ${order.id}:`, error)
        
        // Mark order as failed
        await supabase
          .from('orders')
          .update({ 
            status: 'failed',
            error_message: error.message,
            updated_at: new Date().toISOString()
          })
          .eq('id', order.id)
      }
    }

    console.log('✅ Order processing completed')
  } catch (error) {
    console.error('❌ Error in order processing:', error)
  }
}

const processSingleOrder = async (order) => {
  const supabase = getDatabase()
  
  console.log(`Processing order ${order.order_number}...`)

  // Step 1: Process payment if not already processed
  if (order.payment_status === 'pending') {
    await processPayment(order)
  }

  // Step 2: Calculate profit margin
  const profitAmount = calculateProfit(order)
  
  // Update order with profit calculation
  await supabase
    .from('orders')
    .update({ 
      profit_amount: profitAmount,
      updated_at: new Date().toISOString()
    })
    .eq('id', order.id)

  // Step 3: Process supplier orders
  const supplierOrders = await processSupplierOrders(order.order_items)

  // Step 4: Handle profit transfer
  await handleProfitTransfer(order, profitAmount)

  // Step 5: Update order status
  await supabase
    .from('orders')
    .update({ 
      status: 'completed',
      updated_at: new Date().toISOString()
    })
    .eq('id', order.id)

  console.log(`✅ Order ${order.order_number} processed successfully`)
}

const processPayment = async (order) => {
  const supabase = getDatabase()
  
  try {
    if (order.payment_method === 'stripe' && stripe) {
      // Process Stripe payment
      const paymentIntent = await stripe.paymentIntents.retrieve(order.stripe_payment_id)
      
      if (paymentIntent.status === 'succeeded') {
        await supabase
          .from('orders')
          .update({ payment_status: 'paid' })
          .eq('id', order.id)
      } else {
        throw new Error(`Payment not completed: ${paymentIntent.status}`)
      }
    } else if (order.payment_method === 'paypal') {
      // Process PayPal payment (simplified)
      // In real implementation, verify PayPal payment
      await supabase
        .from('orders')
        .update({ payment_status: 'paid' })
        .eq('id', order.id)
    } else {
      throw new Error('Unsupported payment method')
    }

    console.log(`✅ Payment processed for order ${order.order_number}`)
  } catch (error) {
    console.error(`❌ Payment processing failed for order ${order.order_number}:`, error)
    throw error
  }
}

const calculateProfit = (order) => {
  const totalAmount = parseFloat(order.total_amount)
  
  // Default profit margin (can be customized per product)
  let profitMargin = 0.25 // 25% default
  
  // Check if order items have custom margins
  if (order.order_items && order.order_items.length > 0) {
    const totalProfit = order.order_items.reduce((sum, item) => {
      const itemProfit = parseFloat(item.total_price) * (item.profit_margin || 0.25)
      return sum + itemProfit
    }, 0)
    
    return totalProfit
  }
  
  return totalAmount * profitMargin
}

const processSupplierOrders = async (orderItems) => {
  const supplierOrders = []
  
  for (const item of orderItems) {
    try {
      const supplierOrder = await createSupplierOrder(item)
      supplierOrders.push(supplierOrder)
      
      // Update order item with supplier order ID
      const supabase = getDatabase()
      await supabase
        .from('order_items')
        .update({ 
          supplier_order_id: supplierOrder.id,
          supplier_status: 'ordered'
        })
        .eq('id', item.id)
        
    } catch (error) {
      console.error(`Error creating supplier order for item ${item.id}:`, error)
      throw error
    }
  }
  
  return supplierOrders
}

const createSupplierOrder = async (orderItem) => {
  // Simulate supplier order creation
  // In real implementation, this would interface with supplier APIs
  
  const supplierOrder = {
    id: generateSupplierOrderId(),
    supplier: orderItem.supplier,
    items: [{
      product_id: orderItem.product_id,
      quantity: orderItem.quantity,
      unit_price: orderItem.unit_price
    }],
    shipping_address: orderItem.shipping_address,
    total_amount: orderItem.total_price,
    status: 'ordered',
    estimated_delivery: getEstimatedDeliveryDate(orderItem.supplier),
    tracking_number: null
  }
  
  console.log(`📦 Created supplier order: ${supplierOrder.id} for ${orderItem.quantity} units`)
  
  return supplierOrder
}

const generateSupplierOrderId = () => {
  const suppliers = {
    'amazon': 'AMZ',
    'aliexpress': 'ALX',
    'mercadolibre': 'ML',
    'ebay': 'EBY'
  }
  
  const timestamp = Date.now().toString().slice(-8)
  const random = Math.random().toString(36).substring(2, 8).toUpperCase()
  
  return `${timestamp}${random}`
}

const getEstimatedDeliveryDate = (supplier) => {
  const deliveryDays = {
    'amazon': 2,
    'aliexpress': 7,
    'mercadolibre': 3,
    'ebay': 5
  }
  
  const days = deliveryDays[supplier.toLowerCase()] || 5
  const deliveryDate = new Date()
  deliveryDate.setDate(deliveryDate.getDate() + days)
  
  return deliveryDate.toISOString()
}

const handleProfitTransfer = async (order, profitAmount) => {
  try {
    if (profitAmount <= 0) {
      console.log('No profit to transfer')
      return
    }

    if (order.payment_method === 'stripe' && stripe) {
      // Transfer profit to bank account
      await transferToBankAccount(order, profitAmount)
    } else if (order.payment_method === 'paypal') {
      // Mark profit for PayPal transfer
      await markPayPalTransfer(order, profitAmount)
    }

    console.log(`💰 Profit transfer initiated: $${profitAmount} for order ${order.order_number}`)
  } catch (error) {
    console.error(`❌ Profit transfer failed for order ${order.order_number}:`, error)
    // Don't throw error here as order is already paid and processed
    // Just log for manual review
  }
}

const transferToBankAccount = async (order, profitAmount) => {
  try {
    // Create Stripe payout
    const payout = await stripe.payouts.create({
      amount: Math.round(profitAmount * 100), // Convert to cents
      currency: 'usd',
      metadata: {
        order_id: order.id,
        order_number: order.order_number,
        profit_amount: profitAmount.toString()
      }
    })

    console.log(`💳 Created Stripe payout: ${payout.id}`)

    // Record the transfer
    const supabase = getDatabase()
    await supabase.from('profit_transfers').insert({
      order_id: order.id,
      amount: profitAmount,
      method: 'stripe',
      transfer_id: payout.id,
      status: 'pending',
      created_at: new Date().toISOString()
    })

  } catch (error) {
    console.error('Stripe transfer error:', error)
    throw error
  }
}

const markPayPalTransfer = async (order, profitAmount) => {
  const supabase = getDatabase()
  
  await supabase.from('profit_transfers').insert({
    order_id: order.id,
    amount: profitAmount,
    method: 'paypal',
    transfer_id: `PP-${order.order_number}`,
    status: 'pending_manual',
    created_at: new Date().toISOString(),
    notes: 'Manual PayPal transfer required'
  })
}

export const getOrderStatus = async (orderId) => {
  try {
    const supabase = getDatabase()
    
    const { data: order, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (*)
      `)
      .eq('id', orderId)
      .single()

    if (error) throw error

    return {
      order,
      supplierOrders: order.order_items.map(item => ({
        supplier_order_id: item.supplier_order_id,
        supplier: item.supplier,
        status: item.supplier_status,
        tracking_number: item.tracking_number
      }))
    }
  } catch (error) {
    console.error('Error getting order status:', error)
    throw error
  }
}

export const trackSupplierOrder = async (supplierOrderId, supplier) => {
  try {
    // Simulate tracking API call
    // In real implementation, this would call supplier tracking APIs
    
    const trackingData = {
      status: 'in_transit',
      estimated_delivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      tracking_events: [
        {
          timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          status: 'order_processed',
          location: 'Supplier warehouse'
        },
        {
          timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
          status: 'shipped',
          location: 'Origin facility'
        }
      ]
    }

    // Update order item with tracking info
    const supabase = getDatabase()
    await supabase
      .from('order_items')
      .update({
        tracking_number: `TRK${supplierOrderId}`,
        supplier_status: 'in_transit',
        tracking_data: trackingData
      })
      .eq('supplier_order_id', supplierOrderId)

    return trackingData
  } catch (error) {
    console.error('Error tracking supplier order:', error)
    throw error
  }
}