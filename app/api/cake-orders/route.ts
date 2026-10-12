import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { logAction } from '@/lib/activity-logger'

/* =========================================================
   GET /api/cake-orders
========================================================= */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const dueToday = searchParams.get('due_today') === 'true'

    let query = supabase
      .from('cake_orders')
      .select('*')
      .order('delivery_date', { ascending: true })

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    if (dueToday) {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date()
      todayEnd.setHours(23, 59, 59, 999)

      query = query
        .gte('delivery_date', todayStart.toISOString())
        .lte('delivery_date', todayEnd.toISOString())
    }

    const { data, error } = await query

    if (error) {
      // If table doesn't exist yet in Supabase, return friendly payload
      if (error.code === 'PGRST205' || error.message?.includes('does not exist') || error.message?.includes('schema cache')) {
        return NextResponse.json({
          success: true,
          data: [],
          tableMissing: true,
          message: 'Table public.cake_orders not found. Please run the provided SQL setup script.',
        })
      }

      console.error('Failed to query cake_orders:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: data || [],
    })
  } catch (error) {
    console.error('GET cake_orders error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

/* =========================================================
   POST /api/cake-orders
========================================================= */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      customer_name,
      customer_phone,
      order_date,
      delivery_date,
      weight_kg = 1.0,
      cake_text,
      flavor,
      description,
      price = 0,
      advance_payment = 0,
      payment_status = 'unpaid',
      status = 'pending',
      created_by,
    } = body

    if (!customer_name || !String(customer_name).trim()) {
      return NextResponse.json(
        { success: false, error: 'Customer name is required' },
        { status: 400 }
      )
    }

    if (!delivery_date) {
      return NextResponse.json(
        { success: false, error: 'Delivery / required date is required' },
        { status: 400 }
      )
    }

    const orderDateIso = order_date ? new Date(order_date).toISOString() : new Date().toISOString()
    const deliveryDateIso = new Date(delivery_date).toISOString()

    const { data, error } = await supabase
      .from('cake_orders')
      .insert({
        customer_name: String(customer_name).trim(),
        customer_phone: customer_phone ? String(customer_phone).trim() : null,
        order_date: orderDateIso,
        delivery_date: deliveryDateIso,
        weight_kg: Number(weight_kg) || 1.0,
        cake_text: cake_text ? String(cake_text).trim() : null,
        flavor: flavor ? String(flavor).trim() : null,
        description: description ? String(description).trim() : null,
        price: Number(price) || 0,
        advance_payment: Number(advance_payment) || 0,
        payment_status: ['unpaid', 'partial', 'paid'].includes(payment_status) ? payment_status : 'unpaid',
        status: ['pending', 'preparing', 'ready', 'completed', 'cancelled'].includes(status) ? status : 'pending',
        created_by: created_by ? String(created_by).trim() : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to insert cake_order:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    await logAction({
      action_type: 'GENERAL',
      description: `Created cake order for "${customer_name}" (${weight_kg} KG, Due: ${new Date(delivery_date).toLocaleDateString()})`,
      role: created_by || 'staff',
      metadata: {
        cake_order_id: data.id,
        customer_name,
        weight_kg,
        delivery_date,
        price,
      },
    })

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('POST cake_orders error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

/* =========================================================
   PUT /api/cake-orders
========================================================= */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, action, updated_by, ...fields } = body

    if (!id) {
      return NextResponse.json({ success: false, error: 'Cake order ID is required' }, { status: 400 })
    }

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    if (action === 'update_status' && fields.status) {
      updates.status = fields.status
    } else if (action === 'mark_ready') {
      updates.status = 'ready'
    } else if (action === 'mark_completed') {
      updates.status = 'completed'
      if (fields.payment_status) {
        updates.payment_status = fields.payment_status
      }
    } else {
      // General field updates
      if (fields.customer_name !== undefined) updates.customer_name = String(fields.customer_name).trim()
      if (fields.customer_phone !== undefined) updates.customer_phone = fields.customer_phone ? String(fields.customer_phone).trim() : null
      if (fields.delivery_date !== undefined) updates.delivery_date = new Date(fields.delivery_date).toISOString()
      if (fields.weight_kg !== undefined) updates.weight_kg = Number(fields.weight_kg) || 1.0
      if (fields.cake_text !== undefined) updates.cake_text = fields.cake_text ? String(fields.cake_text).trim() : null
      if (fields.flavor !== undefined) updates.flavor = fields.flavor ? String(fields.flavor).trim() : null
      if (fields.description !== undefined) updates.description = fields.description ? String(fields.description).trim() : null
      if (fields.price !== undefined) updates.price = Number(fields.price) || 0
      if (fields.advance_payment !== undefined) updates.advance_payment = Number(fields.advance_payment) || 0
      if (fields.payment_status !== undefined) updates.payment_status = fields.payment_status
      if (fields.status !== undefined) updates.status = fields.status
    }

    const { data, error } = await supabase
      .from('cake_orders')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Failed to update cake_order:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    await logAction({
      action_type: 'ORDER_UPDATED',
      description: `Updated cake order #${id.slice(0, 8)} (${data.customer_name}, Status: ${data.status})`,
      role: updated_by || 'staff',
      metadata: { cake_order_id: id, updates },
    })

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('PUT cake_orders error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

/* =========================================================
   DELETE /api/cake-orders
========================================================= */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ success: false, error: 'Cake order ID is required' }, { status: 400 })
    }

    // Fetch existing order for log info
    const { data: existing } = await supabase
      .from('cake_orders')
      .select('customer_name')
      .eq('id', id)
      .single()

    const { error } = await supabase
      .from('cake_orders')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Failed to delete cake_order:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    await logAction({
      action_type: 'ORDER_CANCELLED',
      description: `Deleted cake order for ${existing?.customer_name || id}`,
      role: 'admin',
      metadata: { cake_order_id: id },
    })

    return NextResponse.json({
      success: true,
      message: 'Cake order deleted successfully',
    })
  } catch (error) {
    console.error('DELETE cake_orders error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
