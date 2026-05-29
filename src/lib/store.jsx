import { createContext, useContext, useReducer, useEffect } from 'react'
import { supabase } from './supabase'

const AppContext = createContext(null)

const initialState = {
  authed: false,
  tables: [],
  customers: [],
  activeSessions: {}, // tableId -> session object
  loading: true,
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_AUTHED': return { ...state, authed: action.value }
    case 'SET_TABLES': return { ...state, tables: action.value }
    case 'SET_CUSTOMERS': return { ...state, customers: action.value }
    case 'SET_ACTIVE_SESSIONS': return { ...state, activeSessions: action.value }
    case 'UPSERT_SESSION': return {
      ...state,
      activeSessions: { ...state.activeSessions, [action.tableId]: action.session }
    }
    case 'REMOVE_SESSION': {
      const s = { ...state.activeSessions }
      delete s[action.tableId]
      return { ...state, activeSessions: s }
    }
    case 'SET_TABLE_STATUS': return {
      ...state,
      tables: state.tables.map(t =>
        t.id === action.tableId ? { ...t, status: action.status, session_id: action.sessionId ?? null } : t
      )
    }
    case 'UPDATE_TABLE': return {
      ...state,
      tables: state.tables.map(t => t.id === action.table.id ? { ...t, ...action.table } : t)
    }
    case 'UPSERT_CUSTOMER': {
      const exists = state.customers.find(c => c.id === action.customer.id)
      return {
        ...state,
        customers: exists
          ? state.customers.map(c => c.id === action.customer.id ? { ...c, ...action.customer } : c)
          : [action.customer, ...state.customers]
      }
    }
    case 'SET_LOADING': return { ...state, loading: action.value }
    default: return state
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  useEffect(() => {
    loadInitialData()
    const unsub = subscribeRealtime()
    return () => unsub()
  }, [])

  async function loadInitialData() {
    dispatch({ type: 'SET_LOADING', value: true })
    const [tablesRes, customersRes, sessionsRes] = await Promise.all([
      supabase.from('tables').select('*').order('sort_order'),
      supabase.from('customers').select('*').order('total_hours', { ascending: false }),
      supabase.from('sessions').select('*, session_players(*)').eq('status', 'active'),
    ])
    if (tablesRes.data) dispatch({ type: 'SET_TABLES', value: tablesRes.data })
    if (customersRes.data) dispatch({ type: 'SET_CUSTOMERS', value: customersRes.data })
    if (sessionsRes.data) {
      const map = {}
      sessionsRes.data.forEach(s => { map[s.table_id] = s })
      dispatch({ type: 'SET_ACTIVE_SESSIONS', value: map })
    }
    dispatch({ type: 'SET_LOADING', value: false })
  }

  function subscribeRealtime() {
    const channel = supabase.channel('realtime-all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables' }, payload => {
        if (payload.new) dispatch({ type: 'UPDATE_TABLE', table: payload.new })
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }

  async function refreshCustomers() {
    const { data } = await supabase.from('customers').select('*').order('total_hours', { ascending: false })
    if (data) dispatch({ type: 'SET_CUSTOMERS', value: data })
  }

  return (
    <AppContext.Provider value={{ state, dispatch, refreshCustomers, loadInitialData }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  return useContext(AppContext)
}
