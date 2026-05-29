import { useState } from 'react'
import { AppProvider } from './lib/store'
import { ToastProvider } from './lib/toast'
import PinScreen from './screens/PinScreen'
import DashboardScreen from './screens/DashboardScreen'
import PlayersScreen from './screens/PlayersScreen'
import BalancesScreen from './screens/BalancesScreen'
import SettingsScreen from './screens/SettingsScreen'
import LeaderboardScreen from './screens/LeaderboardScreen'
import './index.css'
import AnalyticsScreen from './screens/AnalyticsScreen'

const NAV = [
  {
    id: 'dashboard',
    label: 'Tables',
    icon: (
      <svg viewBox="0 0 24 24">
        <rect x="3" y="3" width="7" height="7" rx="1.5"/>
        <rect x="14" y="3" width="7" height="7" rx="1.5"/>
        <rect x="3" y="14" width="7" height="7" rx="1.5"/>
        <rect x="14" y="14" width="7" height="7" rx="1.5"/>
      </svg>
    ),
  },
  {
    id: 'balances',
    label: 'Balances',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: 'players',
    label: 'Players',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: 'analytics',
    label: 'Stats',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M18 20V10M12 20V4M6 20v-6" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: (
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
]

function AppShell() {
  const [authed, setAuthed] = useState(() => {
    const expiry = localStorage.getItem('authExpiry')
    return expiry && parseInt(expiry) > Date.now()
  })
  const [tab, setTab] = useState('dashboard')

  function handleAuthSuccess() {
    const twoHours = Date.now() + (2 * 60 * 60 * 1000)
    localStorage.setItem('authExpiry', twoHours.toString())
    setAuthed(true)
  }

  if (!authed) return <PinScreen onAuth={handleAuthSuccess} />

  return (
    <div className="app-shell">
      {tab === 'dashboard' && <DashboardScreen />}
      {tab === 'balances'  && <BalancesScreen />}
      {tab === 'players'   && <PlayersScreen />}
      {tab === 'analytics' && <AnalyticsScreen />}
      {tab === 'settings'  && <SettingsScreen />}

      <nav className="bottom-nav">
        {NAV.map(n => (
          <button
            key={n.id}
            className={`nav-item${tab === n.id ? ' active' : ''}`}
            onClick={() => setTab(n.id)}
          >
            {n.icon}
            {n.label}
          </button>
        ))}
      </nav>
    </div>
  )
}

export default function App() {

  if (window.location.pathname === '/leaderboard') {
    return <LeaderboardScreen />
  }
  
  return (
    <ToastProvider>
      <AppProvider>
        <AppShell />
      </AppProvider>
    </ToastProvider>

  )
}