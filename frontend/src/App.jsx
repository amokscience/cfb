import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Form, Button, Alert, Table } from 'react-bootstrap';

export default function App() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [games, setGames] = useState([]);
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Parse URL parameters on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlYear = params.get('year');
    const urlTeam = params.get('team');
    
    if (urlYear) {
      setYear(parseInt(urlYear, 10));
    }
    if (urlTeam) {
      setSelectedTeam(urlTeam);
    }
  }, []);

  // Load teams once on mount
  useEffect(() => {
    const loadTeams = async () => {
      try {
        const res = await fetch(`/api/teams?year=${year}`);
        if (!res.ok) throw new Error('Failed to load teams');
        const data = await res.json();
        setTeams(Array.isArray(data) ? data : []);
      } catch (e) {
        setError('Error loading teams: ' + e.message);
      }
    };
    loadTeams();
  }, []);

  const handleOpponentClick = async (opponentTeamName) => {
    // Normalize clicked name: remove leading '@', 'vs', 'vs.' and trim
    let cleanName = opponentTeamName.replace('@', '').trim();
    cleanName = cleanName.replace(/^vs\.?\s+/i, '');

    // Find the opponent team ID from teams array
    const opponentTeam = teams.find(t => {
      const teamName = (t.name || t.Name || t.school || t.Alias || '').toLowerCase();
      return teamName === cleanName.toLowerCase();
    });
    
    if (opponentTeam) {
      setSelectedTeam(opponentTeam.id || opponentTeam.ID);
      
      // Update URL bar with new team
      const params = new URLSearchParams();
      params.set('year', year);
      params.set('team', opponentTeam.id || opponentTeam.ID);
      window.history.replaceState({}, '', `?${params.toString()}`);
      
      // Load games for the new team
      setLoading(true);
      setError('');
      try {
        let url = `/api/games?year=${year}`;
        const newTeamName = opponentTeam.name || opponentTeam.Name || opponentTeam.school || opponentTeam.Alias;
        url += `&team=${encodeURIComponent(newTeamName.toLowerCase())}`;
        console.log('GET', url);
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to load games');
        const data = await res.json();
        const gamesList = Array.isArray(data) ? data : [];
        gamesList.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
        setGames(gamesList);
      } catch (e) {
        setError('Error loading games: ' + e.message);
      } finally {
        setLoading(false);
      }
    }
  };

  const loadSeason = async () => {
    setLoading(true);
    setError('');
    try {
      let url = `/api/games?year=${year}`;
      if (selectedTeam) {
        // Find the team name from teams array
        const team = teams.find(t => (t.id || t.ID) == selectedTeam);
        if (team) {
          const teamName = team.name || team.Name || team.school || team.Alias;
          url += `&team=${encodeURIComponent(teamName.toLowerCase())}`;
        }
      }
      console.log('GET', url);
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load games');
      const data = await res.json();
      const gamesList = Array.isArray(data) ? data : [];
      // Sort by startDate in ascending order
      gamesList.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
      setGames(gamesList);
      // Load rankings for the year
      try {
        const rres = await fetch(`/api/rankings?year=${year}`);
        if (rres.ok) {
          const rdata = await rres.json();
          setRankings(Array.isArray(rdata) ? rdata : []);
        } else {
          setRankings([]);
        }
      } catch (e) {
        setRankings([]);
      }
      
      // Update URL bar with parameters
      const params = new URLSearchParams();
      params.set('year', year);
      if (selectedTeam) {
        params.set('team', selectedTeam);
      }
      window.history.replaceState({}, '', `?${params.toString()}`);
    } catch (e) {
      setError('Error loading games: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const getRowStyle = (game) => {
    if (!selectedTeam) return {};
    
    const team = teams.find(t => (t.id || t.ID) == selectedTeam);
    if (!team) return {};
    
    const teamName = (team.name || team.Name || team.school || team.Alias || '').toLowerCase();
    const homeTeamName = (game.homeTeam || '').toLowerCase();
    const awayTeamName = (game.awayTeam || '').toLowerCase();
    
    let teamIsHome = homeTeamName.includes(teamName) || teamName.includes(homeTeamName);
    let teamIsAway = awayTeamName.includes(teamName) || teamName.includes(awayTeamName);
    
    if (!teamIsHome && !teamIsAway) return {};
    
    const homePoints = game.homePoints ?? 0;
    const awayPoints = game.awayPoints ?? 0;
    
    let won = false;
    if (teamIsHome && homePoints > awayPoints) won = true;
    if (teamIsAway && awayPoints > homePoints) won = true;
    
    return {
      backgroundColor: won ? '#d4edda' : '#f8d7da'
    };
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours() % 12 || 12);
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = date.getHours() >= 12 ? 'PM' : 'AM';
    return `${year}-${month}-${day} ${hours}:${minutes} ${ampm}`;
  };

  const getScoreCellColor = (teamScore, opponentScore) => {
    if (teamScore === '-' || opponentScore === '-') return {};
    
    const teamScoreNum = parseInt(teamScore, 10);
    const opponentScoreNum = parseInt(opponentScore, 10);
    
    if (teamScoreNum > opponentScoreNum) {
      return { backgroundColor: '#A8D8A8' }; // Muted green - win
    } else if (teamScoreNum < opponentScoreNum) {
      return { backgroundColor: '#F0A0A0' }; // Muted red - loss
    }
    return {};
  };

  const getGameTimeStats = () => {
    let yellow = 0, orange = 0, purple = 0;
    let totalFor = 0, totalAgainst = 0;
    let sumDelta = 0;
    
    games.forEach(game => {
      const date = new Date(game.startDate);
      const hours = date.getHours();
      
      if (hours < 12) {
        yellow++;
      } else if (hours < 18) {
        orange++;
      } else {
        purple++;
      }
      
      // Calculate scores for selected team
      if (selectedTeam) {
        const team = teams.find(t => (t.id || t.ID) == selectedTeam);
        if (team) {
          const teamName = (team.name || team.Name || team.school || team.Alias || '').toLowerCase();
          const homeTeamName = (game.homeTeam || '').toLowerCase();
          const awayTeamName = (game.awayTeam || '').toLowerCase();
          const teamIsHome = homeTeamName.includes(teamName) || teamName.includes(homeTeamName);
          const teamIsAway = awayTeamName.includes(teamName) || teamName.includes(awayTeamName);
          
          if (teamIsHome) {
            totalFor += game.homePoints ?? 0;
            totalAgainst += game.awayPoints ?? 0;
            sumDelta += (game.homePoints ?? 0) - (game.awayPoints ?? 0);
          } else if (teamIsAway) {
            totalFor += game.awayPoints ?? 0;
            totalAgainst += game.homePoints ?? 0;
            sumDelta += (game.awayPoints ?? 0) - (game.homePoints ?? 0);
          }
        }
      }
    });
    
    const avgDelta = games.length > 0 ? (sumDelta / games.length).toFixed(1) : 0;
    
    return { yellow, orange, purple, totalFor, totalAgainst, avgDelta };
  };

  const getDateCellColor = (game) => {
    const date = new Date(game.startDate);
    const hours = date.getHours();
    
    if (hours < 12) {
      return '#ffff99'; // Bright yellow
    } else if (hours < 18) {
      return '#ffc266'; // Darker orange
    } else {
      return '#e6d9f2'; // Light purple
    }
  };

  const normalizeName = (s) => (s || '').toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();

  const getRankForTeamWeek = (week, teamName) => {
    if (!rankings || rankings.length === 0 || !teamName) return '';
    const target = normalizeName(teamName);

    // Find rankings entry for the given week
    const rankEntry = rankings.find(r => {
      // some ranking objects use numeric week, some strings
      if (r.week == null) return false;
      return String(r.week) === String(week);
    });
    if (!rankEntry || !Array.isArray(rankEntry.polls)) return '';

    // Prefer AP Top 25 then Coaches Poll, otherwise first poll
    const preferred = ['AP Top 25', 'Coaches Poll'];
    let poll = null;
    for (const pName of preferred) {
      poll = rankEntry.polls.find(p => p.poll === pName);
      if (poll) break;
    }
    if (!poll) poll = rankEntry.polls[0];
    if (!poll || !Array.isArray(poll.ranks)) return '';

    // Search ranks for matching team
    for (let i = 0; i < poll.ranks.length; i++) {
      const r = poll.ranks[i];
      const candidate = normalizeName(r.school || r.team || r.name || r.school_name || r.schoolName || '');
      if (candidate && (candidate === target || candidate.includes(target) || target.includes(candidate))) {
        // prefer explicit rank field if present
        if (r.rank != null) return String(r.rank);
        if (r.position != null) return String(r.position);
        // fallback to index+1
        return String(i + 1);
      }
    }
    return '';
  };

  return (
    <Container className="mt-5">
      <Row className="mb-4">
        <Col md={8}>
          <h1>College Football Season</h1>
        </Col>
      </Row>

      {error && <Alert variant="danger">{error}</Alert>}

      <Row className="mb-3">
        <Col md={6}>
          <Form.Group>
            <Form.Label>Team</Form.Label>
            <Form.Select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
            >
              <option value="">-- Select a team --</option>
              {teams.map((t) => (
                <option key={t.id || t.ID} value={t.id || t.ID}>
                  {t.name || t.Name || t.school || t.Alias || JSON.stringify(t)}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
        </Col>
      </Row>

      <Row className="mb-3">
        <Col md={6}>
          <Form.Group>
            <Form.Label>Year</Form.Label>
            <Form.Control
              type="number"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value, 10))}
            />
          </Form.Group>
        </Col>
        <Col md={6} className="d-flex align-items-end">
          <Button
            variant="primary"
            onClick={loadSeason}
            disabled={loading}
            className="w-100"
          >
            {loading ? 'Loading...' : 'Load Season'}
          </Button>
        </Col>
      </Row>

      {games.length > 0 && (
        <Row>
          <Col>
            <h3>{(() => {
              let wins = 0, losses = 0;
              const team = teams.find(t => (t.id || t.ID) == selectedTeam);
              const teamName = team ? (team.name || team.Name || team.school || team.Alias || '') : 'Team';
              
              games.forEach(game => {
                if (team) {
                  const tName = (team.name || team.Name || team.school || team.Alias || '').toLowerCase();
                  const homeTeamName = (game.homeTeam || '').toLowerCase();
                  const awayTeamName = (game.awayTeam || '').toLowerCase();
                  const teamIsHome = homeTeamName.includes(tName) || tName.includes(homeTeamName);
                  const teamIsAway = awayTeamName.includes(tName) || tName.includes(awayTeamName);
                  
                  if (teamIsHome) {
                    if ((game.homePoints ?? 0) > (game.awayPoints ?? 0)) wins++;
                    else if ((game.homePoints ?? 0) < (game.awayPoints ?? 0)) losses++;
                  } else if (teamIsAway) {
                    if ((game.awayPoints ?? 0) > (game.homePoints ?? 0)) wins++;
                    else if ((game.awayPoints ?? 0) < (game.homePoints ?? 0)) losses++;
                  }
                }
              });
              return `${year} ${teamName} ${wins}-${losses}`;
            })()}</h3>
            <div className="table-responsive">
              <Table striped bordered hover>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Week</th>
                    <th>Rank</th>
                    <th>Opponent</th>
                    <th>Score</th>
                    <th>Delta</th>
                    <th>Pos</th>
                    <th>Venue</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const rows = [];
                    let prevWeekNum = null;
                    games.forEach((game, idx) => {
                      const team = teams.find(t => (t.id || t.ID) == selectedTeam);
                      const teamName = team ? (team.name || team.Name || team.school || team.Alias || '').toLowerCase() : '';
                      const homeTeamName = (game.homeTeam || '').toLowerCase();
                      const awayTeamName = (game.awayTeam || '').toLowerCase();
                      const teamIsHome = homeTeamName.includes(teamName) || teamName.includes(homeTeamName);
                      const teamIsAway = awayTeamName.includes(teamName) || teamName.includes(awayTeamName);

                      // Determine numeric week if available
                      const weekVal = game.week;
                      const weekNum = parseInt(weekVal, 10);

                      if (!isNaN(weekNum) && prevWeekNum !== null && weekNum > prevWeekNum + 1) {
                        // insert missing bye rows for gaps between prevWeekNum and weekNum
                        for (let w = prevWeekNum + 1; w < weekNum; w++) {
                          rows.push(
                            <tr key={`bye-${w}-${idx}`}>
                              <td></td>
                              <td className="text-center">{w}</td>
                              <td></td>
                              <td>bye</td>
                              <td className="text-center">-</td>
                              <td className="text-center">-</td>
                              <td className="text-center">-</td>
                              <td></td>
                            </tr>
                          );
                        }
                      }

                      // push actual game row
                      let opponentName = '';
                      let teamScore = '';
                      let opponentScore = '';

                      if (teamIsHome) {
                        const oppRaw = game.awayTeam || '';
                        const oppRank = getRankForTeamWeek(game.week, oppRaw);
                        const rankPart = oppRank ? `#${oppRank} ` : '';
                        if (game.neutralSite) {
                          opponentName = `vs ${rankPart}${oppRaw}`;
                        } else {
                          opponentName = `${rankPart}${oppRaw}`;
                        }
                        teamScore = game.homePoints ?? '-';
                        opponentScore = game.awayPoints ?? '-';
                      } else if (teamIsAway) {
                        const oppRaw = game.homeTeam || '';
                        const oppRank = getRankForTeamWeek(game.week, oppRaw);
                        const rankPart = oppRank ? `#${oppRank} ` : '';
                        if (game.neutralSite) {
                          opponentName = `vs ${rankPart}${oppRaw}`;
                        } else {
                          opponentName = `@ ${rankPart}${oppRaw}`;
                        }
                        teamScore = game.awayPoints ?? '-';
                        opponentScore = game.homePoints ?? '-';
                      } else {
                        const awayRaw = game.awayTeam || '';
                        const homeRaw = game.homeTeam || '';
                        const awayRank = getRankForTeamWeek(game.week, awayRaw);
                        const homeRank = getRankForTeamWeek(game.week, homeRaw);
                        const awayRankPart = awayRank ? `#${awayRank} ` : '';
                        const homeRankPart = homeRank ? `#${homeRank} ` : '';
                        opponentName = `${awayRankPart}${awayRaw} @ ${homeRankPart}${homeRaw}`;
                        teamScore = game.awayPoints ?? '-';
                        opponentScore = game.homePoints ?? '-';
                      }

                      // Cleaned name for click handler: remove '@', 'vs', and any leading #rank
                      let displayOpponentName = opponentName.replace(/@/g, '').trim();
                      displayOpponentName = displayOpponentName.replace(/^vs\.?\s*/i, '').trim();
                      displayOpponentName = displayOpponentName.replace(/^#\d+\s*/,'').trim();

                      const teamDisplayName = team ? (team.name || team.Name || team.school || team.Alias || '') : '';
                      const rankStr = getRankForTeamWeek(game.week, teamDisplayName);
                      const rankDisplay = rankStr ? `#${rankStr}` : '';

                      rows.push(
                        <tr key={game.id || `game-${idx}`} style={getRowStyle(game)}>
                          <td style={{ backgroundColor: getDateCellColor(game) }}>{formatDate(game.startDate)}</td>
                          <td className="text-center">{game.seasonType === 'postseason' ? 'Bowl' : game.week}</td>
                          <td className="text-center">{rankDisplay}</td>
                          <td>
                            <a
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                handleOpponentClick(displayOpponentName);
                              }}
                              style={{ textDecoration: 'none', color: 'inherit' }}
                            >
                              {opponentName}
                            </a>
                          </td>
                          <td className="text-center" style={getScoreCellColor(teamScore, opponentScore)}>{teamScore}-{opponentScore}</td>
                          <td className="text-center">{teamScore === '-' || opponentScore === '-' ? '-' : parseInt(teamScore, 10) - parseInt(opponentScore, 10)}</td>
                          <td className="text-center">{teamScore === '-' || opponentScore === '-' ? '-' : (() => {
                            const diff = Math.abs(parseInt(teamScore, 10) - parseInt(opponentScore, 10));
                            return Math.floor(diff / 8) + (diff % 8 === 0 ? 0 : 1);
                          })()}</td>
                          <td>{game.venue}</td>
                        </tr>
                      );

                      // update prevWeekNum if current week is numeric
                      if (!isNaN(weekNum)) prevWeekNum = weekNum;
                    });
                    return rows;
                  })()}
                </tbody>
                <tfoot>
                  <tr>
                    <td>{(() => {
                      const stats = getGameTimeStats();
                      return `🟨 ${stats.yellow} / 🟧 ${stats.orange} / 🟪 ${stats.purple}`;
                    })()}</td>
                    <td colSpan="2"></td>
                    <td className="text-center">{(() => {
                      const stats = getGameTimeStats();
                      const sum = stats.totalFor - stats.totalAgainst;
                      return `${stats.totalFor}-${stats.totalAgainst} (${sum})`;
                    })()}</td>
                    <td className="text-center">{(() => {
                      const stats = getGameTimeStats();
                      return stats.avgDelta;
                    })()}</td>
                    <td></td>
                    <td></td>
                  </tr>
                </tfoot>
              </Table>
            </div>
          </Col>
        </Row>
      )}

      {!loading && games.length === 0 && !error && (
        <Alert variant="info">Click "Load Season" to view games for {year}</Alert>
      )}
    </Container>
  );
}
