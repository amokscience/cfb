import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Form, Button, Alert, Table } from 'react-bootstrap';
import './App.css';

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

  // Global error handlers so runtime errors surface in the UI instead of blanking
  useEffect(() => {
    const onError = (message, source, lineno, colno, error) => {
      console.error('Global error', { message, source, lineno, colno, error });
      setError(String(message || error || 'Unknown error'));
      return false;
    };
    const onRejection = (ev) => {
      console.error('Unhandled rejection', ev);
      const reason = ev && (ev.reason || ev.detail) ? (ev.reason || ev.detail) : ev;
      setError(String(reason || 'Unhandled promise rejection'));
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
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
    try {
      console.log('handleOpponentClick start', { opponentTeamName });
      // Normalize clicked name: remove leading '@', 'vs', 'vs.' any leading '#N' rank, and parenthesized vote counts, then trim
      let cleanName = (opponentTeamName || '').replace(/@/g, '').trim();
      cleanName = cleanName.replace(/^vs\.?\s+/i, '');
      cleanName = cleanName.replace(/^#?\d+(\s*\/\s*#?\d+)?\s+/, '').trim();
      // remove parenthesized numbers like "(25)" that represent first-place votes
      cleanName = cleanName.replace(/\(\s*\d+\s*\)/g, '').trim();

      const normalize = (s) => String(s || '').toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
      const target = normalize(cleanName);

      // Find the opponent team ID from teams array: exact then fuzzy
      let opponentTeam = teams.find(t => {
        const teamName = normalize(t.name || t.Name || t.school || t.Alias || '');
        return teamName === target;
      });
      if (!opponentTeam) {
        opponentTeam = teams.find(t => {
          const teamName = normalize(t.name || t.Name || t.school || t.Alias || '');
          return teamName.includes(target) || target.includes(teamName);
        });
      }

      if (!opponentTeam) {
        console.warn('Opponent team not found for', cleanName);
        return;
      }

      const teamIdVal = opponentTeam.id ?? opponentTeam.ID ?? '';
      console.log('opponentTeam resolved', { opponentTeam, teamIdVal });
      const teamIdStr = String(teamIdVal);
      setSelectedTeam(teamIdStr);

      // Update URL bar with new team
      const params = new URLSearchParams();
      params.set('year', year);
      params.set('team', teamIdStr);
      window.history.replaceState({}, '', `?${params.toString()}`);

      // Load games for the new team
      setLoading(true);
      setError('');
      try {
        let url = `/api/games?year=${year}`;
        const newTeamName = opponentTeam.name || opponentTeam.Name || opponentTeam.school || opponentTeam.Alias || '';
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
    } catch (err) {
      console.error('handleOpponentClick error', err);
      setError('Error handling opponent click');
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

  const getRowClass = (game) => {
    if (!selectedTeam) return '';

    const team = teams.find(t => (t.id || t.ID) == selectedTeam);
    if (!team) return '';

    const teamName = (team.name || team.Name || team.school || team.Alias || '').toLowerCase();
    const homeTeamName = (game.homeTeam || '').toLowerCase();
    const awayTeamName = (game.awayTeam || '').toLowerCase();

    const teamIsHome = homeTeamName.includes(teamName) || teamName.includes(homeTeamName);
    const teamIsAway = awayTeamName.includes(teamName) || teamName.includes(awayTeamName);

    if (!teamIsHome && !teamIsAway) return '';

    const homePoints = game.homePoints ?? 0;
    const awayPoints = game.awayPoints ?? 0;

    const won = (teamIsHome && homePoints > awayPoints) || (teamIsAway && awayPoints > homePoints);
    return won ? 'row-win' : 'row-loss';
  };

  const getRowStyleInline = (game) => {
    if (!selectedTeam) return {};
    const team = teams.find(t => (t.id || t.ID) == selectedTeam);
    if (!team) return {};
    const teamName = (team.name || team.Name || team.school || team.Alias || '').toLowerCase();
    const homeTeamName = (game.homeTeam || '').toLowerCase();
    const awayTeamName = (game.awayTeam || '').toLowerCase();
    const teamIsHome = homeTeamName.includes(teamName) || teamName.includes(homeTeamName);
    const teamIsAway = awayTeamName.includes(teamName) || teamName.includes(awayTeamName);
    if (!teamIsHome && !teamIsAway) return {};
    const homePoints = game.homePoints ?? 0;
    const awayPoints = game.awayPoints ?? 0;
    const won = (teamIsHome && homePoints > awayPoints) || (teamIsAway && awayPoints > homePoints);
    return { backgroundColor: won ? '#d4edda' : '#f8d7da' };
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

  const getDateCellStyle = (game) => {
    const date = new Date(game.startDate);
    const hours = date.getHours();
    if (hours < 12) return { backgroundColor: '#ffff99' };
    if (hours < 18) return { backgroundColor: '#ffc266' };
    return { backgroundColor: '#e6d9f2' };
  };

  const getScoreCellClass = (teamScore, opponentScore) => {
    if (teamScore === '-' || opponentScore === '-') return '';

    const teamScoreNum = parseInt(teamScore, 10);
    const opponentScoreNum = parseInt(opponentScore, 10);

    if (teamScoreNum > opponentScoreNum) return 'score-win';
    if (teamScoreNum < opponentScoreNum) return 'score-loss';
    return '';
  };

  const getScoreCellStyle = (teamScore, opponentScore) => {
    if (teamScore === '-' || opponentScore === '-') return {};
    const teamScoreNum = parseInt(teamScore, 10);
    const opponentScoreNum = parseInt(opponentScore, 10);
    if (teamScoreNum > opponentScoreNum) return { backgroundColor: '#A8D8A8' };
    if (teamScoreNum < opponentScoreNum) return { backgroundColor: '#F0A0A0' };
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

  const getDateCellClass = (game) => {
    const date = new Date(game.startDate);
    const hours = date.getHours();

    if (hours < 12) return 'date-morning';
    if (hours < 18) return 'date-afternoon';
    return 'date-evening';
  };

  const normalizeName = (s) => String(s || '').toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();

  // Now requires `teamId` (number or string) and `seasonType` to disambiguate regular vs postseason
  const getRankForTeamWeek = (week, teamId, seasonType = 'regular') => {
    if (!rankings || rankings.length === 0 || !teamId) return '';

    // Find rankings entry for the given week AND seasonType
    const rankEntry = rankings.find(r => {
      if (r.week == null) return false;
      if (r.seasonType == null) return false;
      return String(r.week) === String(week) && String(r.seasonType).toLowerCase() === String(seasonType).toLowerCase();
    });
    if (!rankEntry || !Array.isArray(rankEntry.polls)) return '';

    const maybeId = Number(teamId);
    if (isNaN(maybeId) || maybeId <= 0) return '';

    let apRank = null;
    let coachesRank = null;

    for (const p of rankEntry.polls) {
      if (!Array.isArray(p.ranks)) continue;
      const pollName = p.poll || '';
      const found = p.ranks.find(r => Number(r.teamId) === maybeId || Number(r.team_id) === maybeId || Number(r.teamID) === maybeId);
      if (!found) continue;
      const rVal = found.rank != null ? Number(found.rank) : (found.position != null ? Number(found.position) : null);
      if (pollName === 'AP Top 25') apRank = rVal;
      if (pollName === 'Coaches Poll') coachesRank = rVal;
      // if neither AP/Coaches, consider as apRank fallback
      if (apRank == null && coachesRank == null && rVal != null) apRank = rVal;
    }

    if (apRank != null && coachesRank != null) {
      if (apRank === coachesRank) return String(apRank);
      return `${apRank}/${coachesRank}`;
    }
    if (apRank != null) return String(apRank);
    if (coachesRank != null) return String(coachesRank);
    return '';
  };

  const formatRankForDisplay = (rankStr) => {
    if (!rankStr) return '';
    // rankStr may be 'A' or 'A/B'
    if (rankStr.includes('/')) {
      return rankStr.split('/').map(s => `#${s.trim()}`).join(' / ');
    }
    return `#${rankStr}`;
  };

  const renderRankSpan = (rankStr) => {
    if (!rankStr) return null;
    return <span className="rank">{formatRankForDisplay(rankStr)} </span>;
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
                        // try find opponent team id
                        const oppTeamObj = teams.find(t => normalizeName(t.name || t.Name || t.school || t.Alias || '') === normalizeName(oppRaw));
                        const oppId = oppTeamObj ? (oppTeamObj.id ?? oppTeamObj.ID) : null;
                        const oppRank = getRankForTeamWeek(game.week, oppId, game.seasonType);
                        const rankText = oppRank ? `${formatRankForDisplay(oppRank)} ` : '';
                        const rankSpan = renderRankSpan(oppRank);
                        if (game.neutralSite) {
                          opponentName = <>{'vs '}{rankSpan}{oppRaw}</>;
                          var opponentText = `vs ${rankText}${oppRaw}`;
                        } else {
                          opponentName = <>{rankSpan}{oppRaw}</>;
                          var opponentText = `${rankText}${oppRaw}`;
                        }
                        teamScore = game.homePoints ?? '-';
                        opponentScore = game.awayPoints ?? '-';
                      } else if (teamIsAway) {
                        const oppRaw = game.homeTeam || '';
                        const oppTeamObj = teams.find(t => normalizeName(t.name || t.Name || t.school || t.Alias || '') === normalizeName(oppRaw));
                        const oppId = oppTeamObj ? (oppTeamObj.id ?? oppTeamObj.ID) : null;
                        const oppRank = getRankForTeamWeek(game.week, oppId, game.seasonType);
                        const rankText = oppRank ? `${formatRankForDisplay(oppRank)} ` : '';
                        const rankSpan = renderRankSpan(oppRank);
                        if (game.neutralSite) {
                          opponentName = <>{'vs '}{rankSpan}{oppRaw}</>;
                          var opponentText = `vs ${rankText}${oppRaw}`;
                        } else {
                          opponentName = <>{'@ '}{rankSpan}{oppRaw}</>;
                          var opponentText = `@ ${rankText}${oppRaw}`;
                        }
                        teamScore = game.awayPoints ?? '-';
                        opponentScore = game.homePoints ?? '-';
                      } else {
                        const awayRaw = game.awayTeam || '';
                        const homeRaw = game.homeTeam || '';
                        const awayTeamObj = teams.find(t => normalizeName(t.name || t.Name || t.school || t.Alias || '') === normalizeName(awayRaw));
                        const homeTeamObj = teams.find(t => normalizeName(t.name || t.Name || t.school || t.Alias || '') === normalizeName(homeRaw));
                        const awayId = awayTeamObj ? (awayTeamObj.id ?? awayTeamObj.ID) : null;
                        const homeId = homeTeamObj ? (homeTeamObj.id ?? homeTeamObj.ID) : null;
                        const awayRank = getRankForTeamWeek(game.week, awayId, game.seasonType);
                        const homeRank = getRankForTeamWeek(game.week, homeId, game.seasonType);
                        const awayRankText = awayRank ? `${formatRankForDisplay(awayRank)} ` : '';
                        const homeRankText = homeRank ? `${formatRankForDisplay(homeRank)} ` : '';
                        const awayRankSpan = renderRankSpan(awayRank);
                        const homeRankSpan = renderRankSpan(homeRank);
                        opponentName = <>{awayRankSpan}{awayRaw}{' @ '}{homeRankSpan}{homeRaw}</>;
                        var opponentText = `${awayRankText}${awayRaw} @ ${homeRankText}${homeRaw}`;
                        teamScore = game.awayPoints ?? '-';
                        opponentScore = game.homePoints ?? '-';
                      }

                      // Cleaned name for click handler: use the textual opponentText and remove '@', 'vs', any leading #rank, and parenthesized vote counts
                      let displayOpponentName = (typeof opponentText === 'string' ? opponentText : String(opponentText || ''));
                      displayOpponentName = displayOpponentName.replace(/@/g, '').trim();
                      displayOpponentName = displayOpponentName.replace(/^vs\.?\s*/i, '').trim();
                      displayOpponentName = displayOpponentName.replace(/^#?\d+(\s*\/\s*#?\d+)?\s*/,'').trim();
                      displayOpponentName = displayOpponentName.replace(/\(\s*\d+\s*\)/g, '').trim();

                      const teamIdVal = team ? (team.id ?? team.ID) : null;
                      const rankStr = getRankForTeamWeek(game.week, teamIdVal, game.seasonType);
                      const rankDisplay = rankStr ? formatRankForDisplay(rankStr) : '';

                      rows.push(
                        <tr key={game.id || `game-${idx}`}>
                          <td className={getDateCellClass(game)} style={getDateCellStyle(game)}>{formatDate(game.startDate)}</td>
                          <td className="text-center">{game.seasonType === 'postseason' ? 'Bowl' : game.week}</td>
                          <td className="text-center">{rankDisplay ? <span className="rank">{rankDisplay}</span> : ''}</td>
                          <td>
                            <a
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                handleOpponentClick(displayOpponentName);
                              }}
                              className="link-no-decoration"
                            >
                              {opponentName}
                            </a>
                          </td>
                          <td className={`text-center ${getScoreCellClass(teamScore, opponentScore)}`} style={getScoreCellStyle(teamScore, opponentScore)}>{teamScore}-{opponentScore}</td>
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
