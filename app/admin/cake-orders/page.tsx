'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { useAdminLanguage } from '@/lib/i18n/AdminLanguageContext'
import { supabase } from '@/lib/supabase'
import { getAdminAuth } from '@/lib/admin-auth'
import {
  Cake,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  RefreshCw,
  X,
  AlertTriangle,
  Phone,
  Trash2,
  Check,
  Edit2,
  Printer,
  Sparkles,
  AlertCircle,
  Copy,
} from 'lucide-react'

type CakeOrder = {
  id: string
  customer_name: string
  customer_phone?: string | null
  order_date: string
  delivery_date: string
  weight_kg: number
  cake_text?: string | null
  flavor?: string | null
  description?: string | null
  price: number
  advance_payment: number
  payment_status: 'unpaid' | 'partial' | 'paid'
  status: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled'
  created_by?: string | null
  created_at: string
  updated_at: string
}

export default function CakeOrdersPage() {
  const { isAmharic } = useAdminLanguage()
  const [orders, setOrders] = useState<CakeOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [search, setSearch] = useState('')
  const [filterTab, setFilterTab] = useState<string>('all')
  const [tableMissing, setTableMissing] = useState(false)
  const [copiedSql, setCopiedSql] = useState(false)

  // Modals
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingOrder, setEditingOrder] = useState<CakeOrder | null>(null)
  const [printingOrder, setPrintingOrder] = useState<CakeOrder | null>(null)
  const [orderToDelete, setOrderToDelete] = useState<CakeOrder | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [processingId, setProcessingId] = useState<string | null>(null)

  // Current user role/name
  const [currentUser, setCurrentUser] = useState<string>('staff')

  // Form State
  const [formData, setFormData] = useState({
    customer_name: '',
    customer_phone: '',
    order_date: new Date().toISOString().slice(0, 10),
    delivery_date: '',
    delivery_time: '14:00',
    weight_kg: 1.5,
    cake_text: '',
    flavor: 'Chocolate',
    description: '',
    price: 1200,
    advance_payment: 500,
    payment_status: 'partial' as 'unpaid' | 'partial' | 'paid',
  })

  useEffect(() => {
    async function loadUser() {
      try {
        const auth = await getAdminAuth()
        if (auth?.adminUser?.name) {
          setCurrentUser(auth.adminUser.name)
        }
      } catch (e) {}
    }
    loadUser()
  }, [])

  const loadData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      else setRefreshing(true)
      setError('')

      const res = await fetch('/api/cake-orders', { cache: 'no-store' })
      const json = await res.json()

      if (json.tableMissing) {
        setTableMissing(true)
        setOrders([])
        return
      }

      if (json.success && Array.isArray(json.data)) {
        setTableMissing(false)
        setOrders(json.data)
      } else {
        throw new Error(json.error || 'Failed to load cake orders')
      }
    } catch (err: any) {
      if (!silent) {
        setError(
          isAmharic
            ? 'የኬክ ትዕዛዞችን መጫን አልተቻለም።'
            : err.message || 'Failed to load cake orders records.'
        )
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [isAmharic])

  useEffect(() => {
    loadData()

    const channel = supabase
      .channel(`cake-orders-live-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cake_orders' }, () => {
        loadData(true)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadData])

  // Auto clear notifications
  useEffect(() => {
    if (!successMsg) return
    const timer = setTimeout(() => setSuccessMsg(''), 4000)
    return () => clearTimeout(timer)
  }, [successMsg])

  function resetForm() {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = tomorrow.toISOString().slice(0, 10)

    setFormData({
      customer_name: '',
      customer_phone: '',
      order_date: new Date().toISOString().slice(0, 10),
      delivery_date: tomorrowStr,
      delivery_time: '14:00',
      weight_kg: 1.5,
      cake_text: '',
      flavor: 'Chocolate',
      description: '',
      price: 1200,
      advance_payment: 500,
      payment_status: 'partial',
    })
  }

  function openCreateModal() {
    resetForm()
    setShowAddModal(true)
  }

  function openEditModal(order: CakeOrder) {
    const delivery = new Date(order.delivery_date)
    const dateStr = delivery.toISOString().slice(0, 10)
    const hours = String(delivery.getHours()).padStart(2, '0')
    const mins = String(delivery.getMinutes()).padStart(2, '0')

    setFormData({
      customer_name: order.customer_name,
      customer_phone: order.customer_phone || '',
      order_date: new Date(order.order_date).toISOString().slice(0, 10),
      delivery_date: dateStr,
      delivery_time: `${hours}:${mins}`,
      weight_kg: Number(order.weight_kg) || 1.5,
      cake_text: order.cake_text || '',
      flavor: order.flavor || 'Chocolate',
      description: order.description || '',
      price: Number(order.price) || 0,
      advance_payment: Number(order.advance_payment) || 0,
      payment_status: order.payment_status || 'unpaid',
    })
    setEditingOrder(order)
  }

  async function handleSaveOrder(e: React.FormEvent) {
    e.preventDefault()

    if (!formData.customer_name.trim()) {
      alert(isAmharic ? 'እባክዎ የደንበኛውን ስም ያስገቡ።' : 'Please enter the customer name.')
      return
    }

    if (!formData.delivery_date) {
      alert(isAmharic ? 'እባክዎ ኬኩ የሚፈለግበትን ቀን ያስገቡ።' : 'Please select delivery date.')
      return
    }

    try {
      setSubmitting(true)
      setError('')

      const combinedDeliveryDate = new Date(`${formData.delivery_date}T${formData.delivery_time || '12:00'}:00`).toISOString()

      if (editingOrder) {
        // UPDATE
        const res = await fetch('/api/cake-orders', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingOrder.id,
            customer_name: formData.customer_name,
            customer_phone: formData.customer_phone,
            delivery_date: combinedDeliveryDate,
            weight_kg: formData.weight_kg,
            cake_text: formData.cake_text,
            flavor: formData.flavor,
            description: formData.description,
            price: formData.price,
            advance_payment: formData.advance_payment,
            payment_status: formData.payment_status,
            updated_by: currentUser,
          }),
        })

        const json = await res.json()
        if (json.success) {
          setSuccessMsg(isAmharic ? 'የኬክ ትዕዛዝ ተስተካክሏል' : 'Cake order updated successfully')
          setEditingOrder(null)
          loadData(true)
        } else {
          throw new Error(json.error || 'Failed to update order')
        }
      } else {
        // CREATE
        const res = await fetch('/api/cake-orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_name: formData.customer_name,
            customer_phone: formData.customer_phone,
            order_date: formData.order_date,
            delivery_date: combinedDeliveryDate,
            weight_kg: formData.weight_kg,
            cake_text: formData.cake_text,
            flavor: formData.flavor,
            description: formData.description,
            price: formData.price,
            advance_payment: formData.advance_payment,
            payment_status: formData.payment_status,
            status: 'pending',
            created_by: currentUser,
          }),
        })

        const json = await res.json()
        if (json.success) {
          setSuccessMsg(isAmharic ? 'አዲስ የኬክ ትዕዛዝ ተመዝግቧል!' : 'Cake order created successfully!')
          setShowAddModal(false)
          resetForm()
          loadData(true)
        } else {
          throw new Error(json.error || 'Failed to create cake order')
        }
      }
    } catch (err: any) {
      setError(err.message || 'Operation failed')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleUpdateStatus(orderId: string, newStatus: string) {
    try {
      setProcessingId(orderId)
      const res = await fetch('/api/cake-orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: orderId,
          action: 'update_status',
          status: newStatus,
          updated_by: currentUser,
        }),
      })

      const json = await res.json()
      if (json.success) {
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, status: newStatus as any } : o))
        )
        setSuccessMsg(isAmharic ? 'ሁኔታው ተቀይሯል' : `Status updated to ${newStatus}`)
      } else {
        throw new Error(json.error || 'Failed to update status')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update status')
    } finally {
      setProcessingId(null)
    }
  }

  async function handleDeleteOrder() {
    if (!orderToDelete) return
    try {
      setSubmitting(true)
      const res = await fetch(`/api/cake-orders?id=${orderToDelete.id}`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (json.success) {
        setOrders((prev) => prev.filter((o) => o.id !== orderToDelete.id))
        setSuccessMsg(isAmharic ? 'የትዕዛዝ መዝገብ ተሰርዟል' : 'Cake order deleted successfully')
        setOrderToDelete(null)
      } else {
        throw new Error(json.error || 'Failed to delete')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete order')
    } finally {
      setSubmitting(false)
    }
  }

  // Filter & Search Logic
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // Tab filter
      if (filterTab === 'due_today') {
        const orderDateStr = new Date(order.delivery_date).toDateString()
        const todayStr = new Date().toDateString()
        if (orderDateStr !== todayStr) return false
      } else if (filterTab !== 'all') {
        if (order.status !== filterTab) return false
      }

      // Search query
      if (search.trim()) {
        const q = search.toLowerCase()
        const matchName = order.customer_name.toLowerCase().includes(q)
        const matchPhone = (order.customer_phone || '').toLowerCase().includes(q)
        const matchText = (order.cake_text || '').toLowerCase().includes(q)
        const matchFlavor = (order.flavor || '').toLowerCase().includes(q)
        if (!matchName && !matchPhone && !matchText && !matchFlavor) return false
      }

      return true
    })
  }, [orders, filterTab, search])

  // Summary Metrics
  const metrics = useMemo(() => {
    const todayStr = new Date().toDateString()
    const dueToday = orders.filter((o) => new Date(o.delivery_date).toDateString() === todayStr && o.status !== 'completed' && o.status !== 'cancelled')
    const pending = orders.filter((o) => o.status === 'pending')
    const preparing = orders.filter((o) => o.status === 'preparing')
    const ready = orders.filter((o) => o.status === 'ready')
    const completed = orders.filter((o) => o.status === 'completed')

    return {
      total: orders.length,
      dueTodayCount: dueToday.length,
      pendingCount: pending.length,
      preparingCount: preparing.length,
      readyCount: ready.length,
      completedCount: completed.length,
    }
  }, [orders])

  const sqlSetupCode = `-- Create cake_orders table in Supabase
CREATE TABLE IF NOT EXISTS public.cake_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    order_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    delivery_date TIMESTAMPTZ NOT NULL,
    weight_kg NUMERIC(6,2) NOT NULL DEFAULT 1.00,
    cake_text TEXT,
    flavor TEXT,
    description TEXT,
    price NUMERIC(10,2) DEFAULT 0.00,
    advance_payment NUMERIC(10,2) DEFAULT 0.00,
    payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'preparing', 'ready', 'completed', 'cancelled')),
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS & Realtime
ALTER TABLE public.cake_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for cake_orders" ON public.cake_orders FOR ALL USING (true) WITH CHECK (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.cake_orders;`

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* HEADER SECTION */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-pink-100 text-pink-600 dark:bg-pink-950/50 dark:text-pink-400 shadow-xs">
              <Cake size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-serif font-bold text-restaurant-text dark:text-white flex items-center gap-2">
                {isAmharic ? 'የኬክ ትዕዛዞች' : 'Cake Orders'}
                {metrics.dueTodayCount > 0 && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500 text-white font-bold animate-pulse">
                    {metrics.dueTodayCount} {isAmharic ? 'የዛሬ ቀጠሮ' : 'Due Today'}
                  </span>
                )}
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {isAmharic
                  ? 'የኬክ ክብደት፣ ጽሑፍ፣ ጣዕም እና የርክክብ ቀጠሮዎችን ያስተዳድሩ'
                  : 'Manage cake weight (KG), messages, delivery dates & production status.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={() => loadData(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cream-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-cream-50 dark:hover:bg-slate-800 transition shadow-xs"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              <span>{refreshing ? (isAmharic ? 'በማደስ ላይ...' : 'Syncing...') : (isAmharic ? 'አድስ' : 'Sync')}</span>
            </button>

            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 rounded-lg bg-pink-600 hover:bg-pink-700 px-4 py-2 text-xs font-bold text-white shadow-sm transition"
            >
              <Plus size={16} />
              <span>{isAmharic ? 'አዲስ የኬክ ትዕዛዝ ውሰድ' : 'Take Cake Order'}</span>
            </button>
          </div>
        </div>

        {/* SQL NOTICE BANNER (if table not created yet) */}
        {tableMissing && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/40">
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={20} />
              <div className="flex-1 space-y-2">
                <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                  {isAmharic ? 'የኬክ ትዕዛዝ ቴብል በዳታቤዝ ውስጥ አልተፈጠረም' : 'Database Table `cake_orders` Not Yet Created'}
                </h3>
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  {isAmharic
                    ? 'የኬክ ትዕዛዝ መረጃዎችን ለማስቀመጥ ይህንን የSQL ኮድ በSupabase SQL Editor ውስጥ ያሂዱት:'
                    : 'To start saving cake orders, run this SQL script in your Supabase SQL Editor:'}
                </p>
                <div className="relative rounded-lg bg-slate-900 p-3 text-[11px] font-mono text-slate-100 overflow-x-auto">
                  <pre>{sqlSetupCode}</pre>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(sqlSetupCode)
                      setCopiedSql(true)
                      setTimeout(() => setCopiedSql(false), 3000)
                    }}
                    className="absolute top-2 right-2 inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-sans font-bold transition"
                  >
                    {copiedSql ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                    <span>{copiedSql ? 'Copied!' : 'Copy SQL'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ALERTS */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-700 dark:border-green-900/60 dark:bg-green-950/40 dark:text-green-300">
            <Check size={16} className="shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* METRICS CARDS */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <div className="rounded-xl border border-cream-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
            <span className="text-[11px] font-medium text-gray-500">{isAmharic ? 'ጠቅላላ ትዕዛዞች' : 'Total Orders'}</span>
            <div className="text-xl font-bold text-restaurant-text dark:text-white mt-0.5">{metrics.total}</div>
          </div>

          <div className={`rounded-xl border p-3.5 shadow-xs transition ${
            metrics.dueTodayCount > 0
              ? 'border-amber-300 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/30'
              : 'border-cream-200 bg-white dark:border-slate-800 dark:bg-slate-900'
          }`}>
            <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1">
              <Clock size={12} />
              {isAmharic ? 'የዛሬ ርክክብ' : 'Due Today'}
            </span>
            <div className="text-xl font-bold text-amber-700 dark:text-amber-300 mt-0.5">{metrics.dueTodayCount}</div>
          </div>

          <div className="rounded-xl border border-cream-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
            <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">{isAmharic ? 'በመጠባበቅ ላይ' : 'Pending'}</span>
            <div className="text-xl font-bold text-blue-600 dark:text-blue-300 mt-0.5">{metrics.pendingCount}</div>
          </div>

          <div className="rounded-xl border border-cream-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
            <span className="text-[11px] font-medium text-purple-600 dark:text-purple-400">{isAmharic ? 'በዝግጅት ላይ' : 'Preparing'}</span>
            <div className="text-xl font-bold text-purple-600 dark:text-purple-300 mt-0.5">{metrics.preparingCount}</div>
          </div>

          <div className="rounded-xl border border-cream-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
            <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">{isAmharic ? 'ተዘጋጅቷል (ለመውሰድ)' : 'Ready'}</span>
            <div className="text-xl font-bold text-emerald-600 dark:text-emerald-300 mt-0.5">{metrics.readyCount}</div>
          </div>

          <div className="rounded-xl border border-cream-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
            <span className="text-[11px] font-medium text-gray-500">{isAmharic ? 'ተጠናቅቋል' : 'Completed'}</span>
            <div className="text-xl font-bold text-gray-600 dark:text-gray-300 mt-0.5">{metrics.completedCount}</div>
          </div>
        </div>

        {/* CONTROLS: SEARCH & STATUS TABS */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-cream-200 dark:border-slate-800 shadow-xs">
          <div className="relative w-full sm:w-80">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isAmharic ? 'ስም፣ ስልክ፣ ጽሑፍ ወይም ጣዕም ፈልግ...' : 'Search customer, phone, message, flavor...'}
              className="w-full rounded-lg border border-cream-200 dark:border-slate-800 bg-cream-50/50 dark:bg-slate-800/50 pl-9 pr-4 py-1.5 text-xs outline-none focus:border-pink-500 transition"
            />
          </div>

          {/* TABS */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {[
              { id: 'all', label: isAmharic ? 'ሁሉም' : 'All' },
              { id: 'due_today', label: isAmharic ? 'የዛሬ ቀጠሮ' : 'Due Today', badge: metrics.dueTodayCount },
              { id: 'pending', label: isAmharic ? 'በመጠባበቅ ላይ' : 'Pending' },
              { id: 'preparing', label: isAmharic ? 'በዝግጅት ላይ' : 'Preparing' },
              { id: 'ready', label: isAmharic ? 'ተዘጋጅቷል' : 'Ready' },
              { id: 'completed', label: isAmharic ? 'የተጠናቀቀ' : 'Completed' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterTab(tab.id)}
                className={`relative px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition flex items-center gap-1.5 ${
                  filterTab === tab.id
                    ? 'bg-pink-600 text-white shadow-xs'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800'
                }`}
              >
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    filterTab === tab.id ? 'bg-white text-pink-700' : 'bg-amber-500 text-white'
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* LOADING & EMPTY STATES */}
        {loading && (
          <div className="rounded-xl border border-cream-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
            <Cake size={36} className="mx-auto mb-2 text-pink-600 animate-pulse" />
            <p className="text-xs text-gray-500">
              {isAmharic ? 'የኬክ ትዕዛዞችን በመጫን ላይ...' : 'Loading cake orders...'}
            </p>
          </div>
        )}

        {!loading && filteredOrders.length === 0 && (
          <div className="rounded-xl border border-dashed border-cream-300 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
            <Cake size={40} className="mx-auto mb-3 text-gray-300" />
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              {isAmharic ? 'ምንም የኬክ ትዕዛዝ አልተገኘም' : 'No Cake Orders Found'}
            </h3>
            <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
              {search
                ? isAmharic
                  ? 'ከፍለጋዎ ጋር የሚዛመድ ትዕዛዝ የለም።'
                  : 'No orders match your search keyword.'
                : isAmharic
                ? 'አዲስ የኬክ ትዕዛዝ ለመመዝገብ "አዲስ የኬክ ትዕዛዝ ውሰድ" የሚለውን ይጫኑ።'
                : 'Click "Take Cake Order" to register custom cake orders.'}
            </p>
            {!search && (
              <button
                onClick={openCreateModal}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-pink-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-pink-700 transition"
              >
                <Plus size={15} />
                <span>{isAmharic ? 'የመጀመሪያውን የኬክ ትዕዛዝ ውሰድ' : 'Take First Cake Order'}</span>
              </button>
            )}
          </div>
        )}

        {/* CAKE ORDERS GRID */}
        {!loading && filteredOrders.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredOrders.map((order) => {
              const deliveryDate = new Date(order.delivery_date)
              const today = new Date()
              const isToday = deliveryDate.toDateString() === today.toDateString()
              const isOverdue = deliveryDate < today && order.status !== 'completed' && order.status !== 'cancelled'
              const balanceRemaining = Math.max(0, Number(order.price || 0) - Number(order.advance_payment || 0))

              return (
                <div
                  key={order.id}
                  className={`relative flex flex-col justify-between rounded-xl border bg-white p-4.5 shadow-xs transition-all dark:bg-slate-900 ${
                    isOverdue
                      ? 'border-red-300 dark:border-red-900/60 ring-1 ring-red-400/20'
                      : isToday
                      ? 'border-amber-300 dark:border-amber-900/60 ring-1 ring-amber-400/20'
                      : order.status === 'ready'
                      ? 'border-emerald-300 dark:border-emerald-900/60'
                      : 'border-cream-200 dark:border-slate-800 hover:border-pink-300'
                  }`}
                >
                  <div>
                    {/* TOP HEADER: CUSTOMER & STATUS */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-base text-restaurant-text dark:text-white">
                            {order.customer_name}
                          </h3>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300 border border-pink-200/50">
                            {order.weight_kg} KG
                          </span>
                        </div>
                        {order.customer_phone && (
                          <a
                            href={`tel:${order.customer_phone}`}
                            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-pink-600 transition mt-0.5"
                          >
                            <Phone size={12} />
                            <span>{order.customer_phone}</span>
                          </a>
                        )}
                      </div>

                      {/* STATUS BADGE */}
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        order.status === 'ready'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                          : order.status === 'preparing'
                          ? 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
                          : order.status === 'completed'
                          ? 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-gray-400'
                          : order.status === 'cancelled'
                          ? 'bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-300'
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                      }`}>
                        {order.status}
                      </span>
                    </div>

                    {/* DELIVERY DATE / TIME ALERT */}
                    <div className={`mt-3 flex items-center justify-between p-2 rounded-lg text-xs font-semibold ${
                      isOverdue
                        ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-900/50'
                        : isToday
                        ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50'
                        : 'bg-cream-50 text-gray-600 dark:bg-slate-800/60 dark:text-gray-300'
                    }`}>
                      <div className="flex items-center gap-1.5">
                        <Clock size={13} className={isToday || isOverdue ? 'animate-pulse' : ''} />
                        <span>
                          {isOverdue
                            ? (isAmharic ? '🚨 ጊዜው አልፏል: ' : '🚨 Overdue: ')
                            : isToday
                            ? (isAmharic ? '⚠️ የዛሬ ርክክብ: ' : '⚠️ Due Today: ')
                            : (isAmharic ? 'የሚረከብበት ቀን: ' : 'Due: ')}
                          {deliveryDate.toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}{' '}
                          · {deliveryDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {order.flavor && (
                        <span className="text-[10px] bg-white/80 dark:bg-slate-900/80 px-2 py-0.5 rounded border">
                          {order.flavor}
                        </span>
                      )}
                    </div>

                    {/* CAKE INSCRIPTION TEXT */}
                    {order.cake_text ? (
                      <div className="mt-3 rounded-lg border border-pink-200/80 bg-pink-50/50 dark:border-pink-900/40 dark:bg-pink-950/20 p-2.5">
                        <div className="text-[10px] font-bold text-pink-700 dark:text-pink-300 flex items-center gap-1">
                          <Sparkles size={11} />
                          <span>{isAmharic ? 'በኬኩ ላይ የሚጻፍ ጽሑፍ:' : 'Inscription on Cake:'}</span>
                        </div>
                        <p className="text-xs font-serif font-bold text-restaurant-text dark:text-white mt-1 italic">
                          &ldquo;{order.cake_text}&rdquo;
                        </p>
                      </div>
                    ) : (
                      <div className="mt-2.5 text-[11px] text-gray-400 italic">
                        {isAmharic ? 'በኬኩ ላይ ጽሑፍ የለም' : 'No inscription requested'}
                      </div>
                    )}

                    {/* DESCRIPTION / NOTES */}
                    {order.description && (
                      <p className="mt-2 text-xs text-gray-600 dark:text-gray-300 line-clamp-2">
                        {order.description}
                      </p>
                    )}

                    {/* PRICING & PAYMENT */}
                    <div className="mt-3.5 pt-2.5 border-t border-cream-100 dark:border-slate-800 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-[10px] text-gray-400">{isAmharic ? 'ጠቅላላ ዋጋ' : 'Total Price'}:</span>
                        <div className="font-bold text-restaurant-text dark:text-white">
                          ${Number(order.price || 0).toFixed(2)}
                        </div>
                      </div>

                      <div className="text-center">
                        <span className="text-[10px] text-gray-400">{isAmharic ? 'ቅድመ ክፍያ' : 'Deposit'}:</span>
                        <div className="font-bold text-emerald-600 dark:text-emerald-400">
                          ${Number(order.advance_payment || 0).toFixed(2)}
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-gray-400">{isAmharic ? 'ቀሪ ሂሳብ' : 'Balance'}:</span>
                        <div className={`font-bold ${balanceRemaining > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'}`}>
                          ${balanceRemaining.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* BOTTOM ACTIONS BAR */}
                  <div className="mt-4 pt-3 border-t border-cream-100 dark:border-slate-800/80 flex items-center gap-2">
                    {/* QUICK STATUS ADVANCE BUTTONS */}
                    {order.status === 'pending' && (
                      <button
                        onClick={() => handleUpdateStatus(order.id, 'preparing')}
                        disabled={processingId === order.id}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 py-1.5 text-xs font-bold transition"
                      >
                        <Clock size={13} />
                        <span>{isAmharic ? 'ማዘጋጀት ጀምር' : 'Start Baking'}</span>
                      </button>
                    )}

                    {order.status === 'preparing' && (
                      <button
                        onClick={() => handleUpdateStatus(order.id, 'ready')}
                        disabled={processingId === order.id}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 py-1.5 text-xs font-bold transition"
                      >
                        <CheckCircle2 size={13} />
                        <span>{isAmharic ? 'ተዘጋጅቷል' : 'Mark Ready'}</span>
                      </button>
                    )}

                    {order.status === 'ready' && (
                      <button
                        onClick={() => handleUpdateStatus(order.id, 'completed')}
                        disabled={processingId === order.id}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white py-1.5 text-xs font-bold transition"
                      >
                        <Check size={13} />
                        <span>{isAmharic ? 'አስረክብ (አጠናቅቅ)' : 'Deliver & Complete'}</span>
                      </button>
                    )}

                    {order.status === 'completed' && (
                      <span className="flex-1 inline-flex items-center justify-center gap-1 text-xs text-gray-400">
                        <CheckCircle2 size={14} className="text-emerald-500" />
                        <span>{isAmharic ? 'ተጠናቋል' : 'Delivered'}</span>
                      </span>
                    )}

                    {/* PRINT SLIP */}
                    <button
                      onClick={() => setPrintingOrder(order)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-cream-100 dark:hover:bg-slate-800 transition"
                      title={isAmharic ? 'የኬክ ትዕዛዝ ወረቀት አትም' : 'Print Cake Order Ticket'}
                    >
                      <Printer size={15} />
                    </button>

                    {/* EDIT */}
                    <button
                      onClick={() => openEditModal(order)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-cream-100 dark:hover:bg-slate-800 transition"
                      title={isAmharic ? 'ትዕዛዝ አሻሽል' : 'Edit Order'}
                    >
                      <Edit2 size={15} />
                    </button>

                    {/* DELETE */}
                    <button
                      onClick={() => setOrderToDelete(order)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition"
                      title={isAmharic ? 'ትዕዛዝ ሰርዝ' : 'Delete Order'}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ========================================================= */}
        {/* MODAL: TAKE / EDIT CAKE ORDER                             */}
        {/* ========================================================= */}
        {(showAddModal || editingOrder) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-cream-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-cream-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Cake className="text-pink-600" size={22} />
                  <h3 className="text-lg font-bold text-restaurant-text dark:text-white">
                    {editingOrder
                      ? (isAmharic ? 'የኬክ ትዕዛዝ አሻሽል' : 'Edit Cake Order')
                      : (isAmharic ? 'አዲስ የኬክ ትዕዛዝ መውሰጃ' : 'Take Custom Cake Order')}
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setShowAddModal(false)
                    setEditingOrder(null)
                  }}
                  className="rounded-lg p-1 text-gray-400 hover:text-gray-600 dark:hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveOrder} className="mt-4 space-y-4">
                {/* CUSTOMER NAME & PHONE */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                      {isAmharic ? 'የደንበኛ ስም *' : 'Customer Name *'}
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.customer_name}
                      onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                      placeholder={isAmharic ? 'ምሳሌ፡ አበበ ከበደ' : 'e.g. John Doe'}
                      className="w-full rounded-xl border border-cream-200 dark:border-slate-800 bg-cream-50/40 dark:bg-slate-800/40 p-2.5 text-xs outline-none focus:border-pink-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                      {isAmharic ? 'ስልክ ቁጥር' : 'Phone Number'}
                    </label>
                    <input
                      type="tel"
                      value={formData.customer_phone}
                      onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                      placeholder="0911223344"
                      className="w-full rounded-xl border border-cream-200 dark:border-slate-800 bg-cream-50/40 dark:bg-slate-800/40 p-2.5 text-xs outline-none focus:border-pink-500"
                    />
                  </div>
                </div>

                {/* DATES: ORDER DATE & REQUIRED DELIVERY DATE/TIME */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                      {isAmharic ? 'የታዘዘበት ቀን' : 'Order Date'}
                    </label>
                    <input
                      type="date"
                      required
                      value={formData.order_date}
                      onChange={(e) => setFormData({ ...formData, order_date: e.target.value })}
                      className="w-full rounded-xl border border-cream-200 dark:border-slate-800 bg-cream-50/40 dark:bg-slate-800/40 p-2 text-xs outline-none focus:border-pink-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                      {isAmharic ? 'የሚረከብበት ቀን *' : 'Delivery Date *'}
                    </label>
                    <input
                      type="date"
                      required
                      value={formData.delivery_date}
                      onChange={(e) => setFormData({ ...formData, delivery_date: e.target.value })}
                      className="w-full rounded-xl border border-cream-200 dark:border-slate-800 bg-cream-50/40 dark:bg-slate-800/40 p-2 text-xs outline-none focus:border-pink-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                      {isAmharic ? 'የሚረከብበት ሰዓት' : 'Delivery Time'}
                    </label>
                    <input
                      type="time"
                      value={formData.delivery_time}
                      onChange={(e) => setFormData({ ...formData, delivery_time: e.target.value })}
                      className="w-full rounded-xl border border-cream-200 dark:border-slate-800 bg-cream-50/40 dark:bg-slate-800/40 p-2 text-xs outline-none focus:border-pink-500"
                    />
                  </div>
                </div>

                {/* CAKE WEIGHT & FLAVOR */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                      {isAmharic ? 'የኬክ ክብደት (በኪሎ ግራም) *' : 'Weight in KG *'}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.5"
                        min="0.5"
                        required
                        value={formData.weight_kg}
                        onChange={(e) => setFormData({ ...formData, weight_kg: Number(e.target.value) || 1 })}
                        className="w-24 rounded-xl border border-cream-200 dark:border-slate-800 bg-cream-50/40 dark:bg-slate-800/40 p-2.5 text-xs outline-none font-bold"
                      />
                      {/* PRESET CHIPS */}
                      <div className="flex items-center gap-1">
                        {[1, 1.5, 2, 3, 5].map((kg) => (
                          <button
                            key={kg}
                            type="button"
                            onClick={() => setFormData({ ...formData, weight_kg: kg })}
                            className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition ${
                              formData.weight_kg === kg
                                ? 'bg-pink-600 text-white border-pink-600'
                                : 'bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-slate-700'
                            }`}
                          >
                            {kg}k
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                      {isAmharic ? 'የኬክ ጣዕም (Flavor)' : 'Cake Flavor'}
                    </label>
                    <select
                      value={formData.flavor}
                      onChange={(e) => setFormData({ ...formData, flavor: e.target.value })}
                      className="w-full rounded-xl border border-cream-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 text-xs outline-none focus:border-pink-500 font-semibold"
                    >
                      <option value="Chocolate">Chocolate / ቸኮሌት</option>
                      <option value="Vanilla">Vanilla / ቫኒላ</option>
                      <option value="Black Forest">Black Forest</option>
                      <option value="White Forest">White Forest</option>
                      <option value="Red Velvet">Red Velvet</option>
                      <option value="Strawberry">Strawberry / እንጆሪ</option>
                      <option value="Caramel">Caramel</option>
                      <option value="Coffee Mocha">Coffee Mocha</option>
                      <option value="Fruit Cake">Fruit Cake / ፍራፍሬ</option>
                      <option value="Other">Other / ልዩ</option>
                    </select>
                  </div>
                </div>

                {/* WHAT TO WRITE ON THE CAKE */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 flex items-center justify-between">
                    <span>{isAmharic ? 'በኬኩ ላይ የሚጻፍ ጽሑፍ (Inscription)' : 'What to Write on the Cake'}</span>
                    <span className="text-[10px] text-gray-400 font-normal">e.g. Happy Birthday Sarah</span>
                  </label>
                  <input
                    type="text"
                    value={formData.cake_text}
                    onChange={(e) => setFormData({ ...formData, cake_text: e.target.value })}
                    placeholder={isAmharic ? 'ምሳሌ፡ መልካም ልደት ቤተል!' : 'e.g. Happy 21st Birthday Alex!'}
                    className="w-full rounded-xl border border-pink-200 dark:border-pink-900/40 bg-pink-50/40 dark:bg-pink-950/20 p-2.5 text-xs font-bold outline-none focus:border-pink-500"
                  />
                </div>

                {/* DESCRIPTION / SPECIAL INSTRUCTIONS */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    {isAmharic ? 'ተጨማሪ መግለጫ / ዲዛይን' : 'Description / Design Instructions'}
                  </label>
                  <textarea
                    rows={2}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder={isAmharic ? 'የቀለም ምርጫ፣ ማስዋቢያዎች፣ ልዩ ጥያቄዎች...' : 'Colors, decorations, theme, eggless/allergy notes...'}
                    className="w-full rounded-xl border border-cream-200 dark:border-slate-800 bg-cream-50/40 dark:bg-slate-800/40 p-2.5 text-xs outline-none focus:border-pink-500"
                  />
                </div>

                {/* PRICE & ADVANCE PAYMENT */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-cream-50/60 dark:bg-slate-800/40 p-3 rounded-xl border border-cream-200 dark:border-slate-800">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 mb-1">
                      {isAmharic ? 'ጠቅላላ ዋጋ ($)' : 'Total Price ($)'}
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) || 0 })}
                      className="w-full rounded-lg border border-cream-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-xs font-bold outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 mb-1">
                      {isAmharic ? 'ቅድመ ክፍያ ($)' : 'Deposit ($)'}
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={formData.advance_payment}
                      onChange={(e) => setFormData({ ...formData, advance_payment: Number(e.target.value) || 0 })}
                      className="w-full rounded-lg border border-cream-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-xs font-bold outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 mb-1">
                      {isAmharic ? 'የክፍያ ሁኔታ' : 'Payment Status'}
                    </label>
                    <select
                      value={formData.payment_status}
                      onChange={(e) => setFormData({ ...formData, payment_status: e.target.value as any })}
                      className="w-full rounded-lg border border-cream-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-xs font-semibold outline-none"
                    >
                      <option value="unpaid">{isAmharic ? 'ያልተከፈለ' : 'Unpaid'}</option>
                      <option value="partial">{isAmharic ? 'ከፊል የተከፈለ' : 'Partial'}</option>
                      <option value="paid">{isAmharic ? 'ሙሉ የተከፈለ' : 'Paid in Full'}</option>
                    </select>
                  </div>
                </div>

                {/* MODAL ACTIONS */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddModal(false)
                      setEditingOrder(null)
                    }}
                    className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 dark:border-slate-800 dark:text-gray-300"
                  >
                    {isAmharic ? 'ይቅር' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 rounded-xl bg-pink-600 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-pink-700 disabled:opacity-50 transition"
                  >
                    {submitting
                      ? isAmharic
                        ? 'በማስቀመጥ ላይ...'
                        : 'Saving...'
                      : editingOrder
                      ? (isAmharic ? 'ለውጦችን መዝግብ' : 'Update Cake Order')
                      : (isAmharic ? 'ትዕዛዝ አስመዝግብ' : 'Save Cake Order')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* MODAL: PRINT ORDER TICKET / SLIP                          */}
        {/* ========================================================= */}
        {printingOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-cream-200 dark:border-slate-800">
              <div className="flex items-center justify-between pb-3 border-b border-cream-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Printer className="text-pink-600" size={20} />
                  <h3 className="text-base font-bold text-restaurant-text dark:text-white">
                    {isAmharic ? 'የኬክ ማዘዣ ወረቀት' : 'Cake Production Slip'}
                  </h3>
                </div>
                <button
                  onClick={() => setPrintingOrder(null)}
                  className="rounded-lg p-1 text-gray-400 hover:text-gray-600 dark:hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Printable Ticket Area */}
              <div id="cake-ticket-print" className="mt-4 p-4 rounded-xl border border-dashed border-gray-300 dark:border-slate-700 bg-cream-50/50 dark:bg-slate-800/40 space-y-3 font-mono text-xs">
                <div className="text-center pb-2 border-b border-dashed border-gray-300">
                  <h4 className="font-bold text-sm tracking-wide">A&apos;ERKT RESTAURANT & CAFE</h4>
                  <p className="text-[10px] text-gray-500">CUSTOM CAKE ORDER SLIP</p>
                  <p className="text-[10px] text-gray-400">Order #{printingOrder.id.slice(0, 8).toUpperCase()}</p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Customer:</span>
                    <span className="font-bold">{printingOrder.customer_name}</span>
                  </div>
                  {printingOrder.customer_phone && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Phone:</span>
                      <span>{printingOrder.customer_phone}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-500">Order Date:</span>
                    <span>{new Date(printingOrder.order_date).toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between text-pink-600 dark:text-pink-400 font-bold">
                    <span>DELIVERY TIME:</span>
                    <span>
                      {new Date(printingOrder.delivery_date).toLocaleDateString()} @{' '}
                      {new Date(printingOrder.delivery_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-dashed pt-1.5">
                    <span className="text-gray-500">Weight:</span>
                    <span className="font-bold">{printingOrder.weight_kg} KG</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Flavor:</span>
                    <span className="font-bold">{printingOrder.flavor || 'Standard'}</span>
                  </div>
                </div>

                {printingOrder.cake_text && (
                  <div className="p-2.5 rounded bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700">
                    <span className="text-[10px] font-bold text-gray-400 block mb-1">INSCRIPTION ON CAKE:</span>
                    <span className="font-bold text-sm italic">&ldquo;{printingOrder.cake_text}&rdquo;</span>
                  </div>
                )}

                {printingOrder.description && (
                  <div className="text-[11px] text-gray-600 dark:text-gray-300">
                    <span className="font-bold">Instructions: </span>
                    {printingOrder.description}
                  </div>
                )}

                <div className="border-t border-dashed pt-2 space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span>Total Price:</span>
                    <span>${Number(printingOrder.price || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-600">
                    <span>Deposit Paid:</span>
                    <span>${Number(printingOrder.advance_payment || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span>Balance Due:</span>
                    <span>${Math.max(0, Number(printingOrder.price || 0) - Number(printingOrder.advance_payment || 0)).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setPrintingOrder(null)}
                  className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 dark:border-slate-800 dark:text-gray-300"
                >
                  {isAmharic ? 'ዝጋ' : 'Close'}
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex-1 rounded-xl bg-pink-600 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-pink-700 transition flex items-center justify-center gap-1.5"
                >
                  <Printer size={15} />
                  <span>{isAmharic ? 'አትም' : 'Print Slip'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* MODAL: DELETE CONFIRMATION                                */}
        {/* ========================================================= */}
        {orderToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
            <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-cream-200 dark:border-slate-800">
              <div className="flex items-center gap-3 text-red-600 mb-3">
                <div className="p-2.5 rounded-full bg-red-100 dark:bg-red-950/50">
                  <Trash2 size={22} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-restaurant-text dark:text-white">
                    {isAmharic ? 'የኬክ ትዕዛዝ ይሰረዝ?' : 'Delete Cake Order?'}
                  </h3>
                  <p className="text-xs text-gray-500">{orderToDelete.customer_name} ({orderToDelete.weight_kg} KG)</p>
                </div>
              </div>

              <p className="text-xs text-gray-600 dark:text-gray-300 mb-4">
                {isAmharic
                  ? 'ይህን የኬክ ትዕዛዝ በእርግጥ መሰረዝ ይፈልጋሉ? ይህ ድርጊት ወደኋላ መመለስ አይችልም።'
                  : 'Are you sure you want to permanently delete this cake order? This action cannot be undone.'}
              </p>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setOrderToDelete(null)}
                  disabled={submitting}
                  className="flex-1 rounded-xl border border-gray-200 dark:border-slate-800 px-4 py-2.5 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800"
                >
                  {isAmharic ? 'ይቅር' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={handleDeleteOrder}
                  disabled={submitting}
                  className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-red-700 disabled:opacity-50 transition"
                >
                  {submitting
                    ? isAmharic
                      ? 'በመሰረዝ ላይ...'
                      : 'Deleting...'
                    : isAmharic
                    ? 'ትዕዛዝ ሰርዝ'
                    : 'Delete Order'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
