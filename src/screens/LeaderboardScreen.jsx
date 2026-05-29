import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function LeaderboardScreen() {
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchLeaderboard() {
      // Fetch players with at least 1 game played, ordered by win rate
      const { data } = await supabase
        .from('customers')
        .select('name, total_wins, total_losses')
        .or('total_wins.gt.0,total_losses.gt.0')
        
      // Calculate win percentage and sort
      const ranked = data.map(p => {
        const totalGames = p.total_wins + p.total_losses;
        const winRate = totalGames > 0 ? ((p.total_wins / totalGames) * 100).toFixed(1) : 0;
        return { ...p, totalGames, winRate }
      }).sort((a, b) => b.winRate - a.winRate || b.total_wins - a.total_wins)

      setPlayers(ranked)
      setLoading(false)
    }
    fetchLeaderboard()
  }, [])

  if (loading) return <div className="screen"><div className="loading"><div className="spinner"/></div></div>

  return (
    <div className="screen" style={{ backgroundColor: '#000', minHeight: '100vh', color: '#fff', padding: 20 }}>
      <h1 style={{ textAlign: 'center', marginBottom: 30, color: 'var(--green)', fontFamily: 'var(--mono)' }}>
        🏆 THE EATERIES HALL OF FAME
      </h1>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#111', borderBottom: '1px solid #333' }}>
              <th style={{ padding: '16px', color: '#888' }}>Rank</th>
              <th style={{ padding: '16px', color: '#888' }}>Player</th>
              <th style={{ padding: '16px', color: '#888' }}>W - L</th>
              <th style={{ padding: '16px', color: '#888' }}>Win %</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, index) => (
              <tr key={index} style={{ borderBottom: '1px solid #222' }}>
                <td style={{ padding: '16px', fontWeight: 'bold', color: index < 3 ? 'var(--green)' : '#fff' }}>
                  #{index + 1}
                </td>
                <td style={{ padding: '16px', fontWeight: '600' }}>{p.name}</td>
                <td style={{ padding: '16px', fontFamily: 'var(--mono)' }}>
                  <span style={{ color: 'var(--green)' }}>{p.total_wins}</span> - <span style={{ color: 'var(--red)' }}>{p.total_losses}</span>
                </td>
                <td style={{ padding: '16px', fontFamily: 'var(--mono)' }}>{p.winRate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}