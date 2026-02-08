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
  const [infoData, setInfoData] = useState(null);
  const [showInfoPopover, setShowInfoPopover] = useState(false);

  // Parse URL parameters on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlYear = params.get('year');
    const urlTeam = params.get('teamId');
    
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

  // Fetch API info
  const fetchInfo = async () => {
    try {
      const res = await fetch('/api/info');
      if (!res.ok) throw new Error('Failed to fetch API info');
      const data = await res.json();
      setInfoData(data);
      setShowInfoPopover(true);
    } catch (e) {
      setError('Error fetching API info: ' + e.message);
      setShowInfoPopover(true);
    }
  };

  // New: handle clicks by teamId (no name matching)
  const handleOpponentClick = async (opponentTeamId) => {
    try {
      console.log('handleOpponentClick by id', { opponentTeamId });
      if (!opponentTeamId) return;
      const teamIdStr = String(opponentTeamId);
      setSelectedTeam(teamIdStr);

      // Update URL
      const params = new URLSearchParams();
      params.set('year', year);
      params.set('teamId', teamIdStr);
      window.history.replaceState({}, '', `?${params.toString()}`);

      // Load games for the new team (query by team name from teams list)
      setLoading(true);
      setError('');
      try {
        const teamObj = teams.find(t => String(t.id || t.ID) === teamIdStr);
        let res;
        if (teamObj) {
          const teamNameParam = encodeURIComponent(String((teamObj.name || teamObj.Name || teamObj.school || teamObj.Alias) || '').toLowerCase());
          const url = `/api/games?year=${year}&team=${teamNameParam}`;
          console.log('GET', url);
          res = await fetch(url);
        } else {
          // Team name not available locally; fall back to year-only query (no team filter)
          const url = `/api/games?year=${year}`;
          console.warn('Team name not found locally; loading all games for year', { year, teamId: teamIdStr });
          console.log('GET', url);
          res = await fetch(url);
        }
        if (!res.ok) throw new Error('Failed to load games');
        const data = await res.json();
        const gamesList = Array.isArray(data) ? data : [];
        gamesList.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
        setGames(gamesList);
      } catch (e) {
        setError('Error loading games: ' + (e && e.message ? e.message : String(e)));
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
        // If selectedTeam is an id, prefer querying by id; fall back to name if id not available
        const maybeId = Number(selectedTeam);
        if (!isNaN(maybeId) && maybeId > 0) {
          const teamObj = teams.find(t => String(t.id || t.ID) === String(selectedTeam));
          if (teamObj) {
            const teamNameParam = encodeURIComponent(String((teamObj.name || teamObj.Name || teamObj.school || teamObj.Alias) || '').toLowerCase());
            url += `&team=${teamNameParam}`;
          }
        } else {
          const team = teams.find(t => (t.id || t.ID) == selectedTeam);
          if (team) {
            const teamName = team.name || team.Name || team.school || team.Alias;
            url += `&team=${encodeURIComponent(teamName.toLowerCase())}`;
          }
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
        params.set('teamId', selectedTeam);
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

    const teamIdStr = String(selectedTeam);
    // Prefer the explicit `homeId` / `awayId` fields, fall back to other variants
    const homeId = String(game.homeId ?? game.homeTeamId ?? game.home_tid ?? '');
    const awayId = String(game.awayId ?? game.awayTeamId ?? game.away_tid ?? '');

    const teamIsHome = homeId && homeId === teamIdStr;
    const teamIsAway = awayId && awayId === teamIdStr;

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
    const teamIdStr = String(selectedTeam);
    const homeId = String(game.homeId ?? game.homeTeamId ?? game.home_tid ?? '');
    const awayId = String(game.awayId ?? game.awayTeamId ?? game.away_tid ?? '');
    const teamIsHome = homeId && homeId === teamIdStr;
    const teamIsAway = awayId && awayId === teamIdStr;
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

  const formatDateOnly = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatTimeOnly = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const hours = String(date.getHours() % 12 || 12);
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = date.getHours() >= 12 ? 'PM' : 'AM';
    return `${hours}:${minutes} ${ampm}`;
  };

  const formatAttendance = (val) => {
    if (val == null || val === '') return '';
    const n = Number(val);
    if (isNaN(n)) return String(val);
    return n.toLocaleString();
  };

  const getHomeAttendanceAverage = () => {
    if (!selectedTeam) return '';
    const team = teams.find(t => (t.id || t.ID) == selectedTeam);
    if (!team) return '';
    const teamIdStr = String((team.id ?? team.ID) || '');
    if (!teamIdStr) return '';

    let sum = 0;
    let count = 0;
    games.forEach(game => {
      const homeId = String(game.homeId ?? game.homeTeamId ?? game.home_tid ?? '');
      const awayId = String(game.awayId ?? game.awayTeamId ?? game.away_tid ?? '');
      const teamIsHome = homeId && homeId === teamIdStr;
      // Exclude neutral site games and away games
      if (!teamIsHome) return;
      if (game.neutralSite) return;
      const att = game.attendance;
      const n = Number(att);
      if (att == null || att === '' || isNaN(n)) return;
      sum += n;
      count += 1;
    });
    if (count === 0) return '';
    const avg = Math.round(sum / count);
    return formatAttendance(avg);
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
          const teamIdStr = String(selectedTeam);
          const homeId = String(game.homeTeamId ?? game.homeId ?? game.home_tid ?? '');
          const awayId = String(game.awayTeamId ?? game.awayId ?? game.away_tid ?? '');
          const teamIsHome = homeId && homeId === teamIdStr;
          const teamIsAway = awayId && awayId === teamIdStr;

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

  // name normalization removed — opponent resolution uses team IDs only

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

  // Return postseason AP Top 25 rank for a team (use AP Top 25 where seasonType is 'postseason')
  const getPostseasonRankForTeam = (teamId) => {
    if (!rankings || rankings.length === 0 || !teamId) return '';
    const maybeId = Number(teamId);
    if (isNaN(maybeId) || maybeId <= 0) return '';

    for (const rankEntry of rankings) {
      if (!rankEntry || String(rankEntry.seasonType).toLowerCase() !== 'postseason') continue;
      if (!Array.isArray(rankEntry.polls)) continue;
      for (const p of rankEntry.polls) {
        const pollName = (p.poll || '').trim();
        if (pollName !== 'AP Top 25') continue;
        if (!Array.isArray(p.ranks)) continue;
        const found = p.ranks.find(r => Number(r.teamId) === maybeId || Number(r.team_id) === maybeId || Number(r.teamID) === maybeId);
        if (!found) continue;
        const rVal = found.rank != null ? Number(found.rank) : (found.position != null ? Number(found.position) : null);
        return rVal != null ? String(rVal) : '';
      }
    }
    return '';
  };

  // Return Playoff Committee Rankings rank for a given postseason week and team
  const getCommitteeRankForTeamWeek = (week, teamId) => {
    if (!rankings || rankings.length === 0 || !teamId) return '';
    const maybeId = Number(teamId);
    if (isNaN(maybeId) || maybeId <= 0) return '';

    const rankEntry = rankings.find(r => r.week != null && String(r.week) === String(week) && String(r.seasonType).toLowerCase() === 'postseason');
    if (!rankEntry || !Array.isArray(rankEntry.polls)) return '';

    for (const p of rankEntry.polls) {
      const pollName = (p.poll || '').trim();
      if (pollName !== 'Playoff Committee Rankings') continue;
      if (!Array.isArray(p.ranks)) continue;
      const found = p.ranks.find(r => Number(r.teamId) === maybeId || Number(r.team_id) === maybeId || Number(r.teamID) === maybeId);
      if (!found) continue;
      const rVal = found.rank != null ? Number(found.rank) : (found.position != null ? Number(found.position) : null);
      return rVal != null ? String(rVal) : '';
    }
    return '';
  };

  return (
    <div className="page-bg">
      <Container className="">
      <Row className="mb-3">
        <Col md={8}>
          <h2>College Football Season</h2>
        </Col>
        <Col md={4} className="d-flex justify-content-end">
          <Button variant="info" size="sm" onClick={fetchInfo} title="Check API remaining calls">
            API Info
          </Button>
          {showInfoPopover && (
            <div className="position-absolute" style={{ top: '50px', right: '10px', zIndex: 1050 }}>
              <div className="alert alert-info" role="alert" style={{ minWidth: '250px', marginBottom: 0 }}>
                <strong>API Status</strong>
                {infoData ? (
                  <>
                    <hr style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }} />
                    <div>Remaining Calls: <strong>{infoData.remainingCalls ?? 'N/A'}</strong></div>
                    {infoData.totalCalls && <div>Total Calls: <strong>{infoData.totalCalls}</strong></div>}
                  </>
                ) : (
                  <div>Loading...</div>
                )}
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  onClick={() => setShowInfoPopover(false)}
                  style={{ position: 'absolute', top: '10px', right: '10px' }}
                />
              </div>
            </div>
          )}
        </Col>
      </Row>

      {error && <Alert variant="danger">{error}</Alert>}

      <Row className="mb-3">
        <Col md={3}>
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
        <Col md={3}>
          <Form.Group>
            <Form.Label>Year</Form.Label>
            <Form.Control
              type="number"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value, 10))}
            />
          </Form.Group>
        </Col>
        <Col md={3} className="d-flex align-items-end">
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
                  const teamIdStr = String(selectedTeam);
                  const homeId = String(game.homeId ?? game.homeTeamId ?? game.home_tid ?? '');
                  const awayId = String(game.awayId ?? game.awayTeamId ?? game.away_tid ?? '');
                  const teamIsHome = homeId && homeId === teamIdStr;
                  const teamIsAway = awayId && awayId === teamIdStr;

                  if (teamIsHome) {
                    if ((game.homePoints ?? 0) > (game.awayPoints ?? 0)) wins++;
                    else if ((game.homePoints ?? 0) < (game.awayPoints ?? 0)) losses++;
                  } else if (teamIsAway) {
                    if ((game.awayPoints ?? 0) > (game.homePoints ?? 0)) wins++;
                    else if ((game.awayPoints ?? 0) < (game.homePoints ?? 0)) losses++;
                  }
                }
              });

              // include postseason rank between year and team name
              const postseasonRank = getPostseasonRankForTeam(selectedTeam);
              const psText = postseasonRank ? `${formatRankForDisplay(postseasonRank)} ` : '';
              return `${year} ${psText} ${teamName} ${wins}-${losses}`;
            })()}</h3>
            <div className="table-responsive">
              <Table striped bordered hover className="w-100">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Week</th>
                    <th>Rank</th>
                    <th>Opponent</th>
                    <th>Score</th>
                    <th>Delta</th>
                    <th>Pos</th>
                    <th>Conference</th>
                    <th>Venue</th>
                    <th>Attendance</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const rows = [];
                    let prevWeekNum = null;
                    games.forEach((game, idx) => {
                      const team = teams.find(t => (t.id || t.ID) == selectedTeam);
                      const teamIdVal = team ? (team.id ?? team.ID) : null;
                      const teamIdStr = teamIdVal ? String(teamIdVal) : '';
                      const homeId = String(game.homeTeamId ?? game.homeId ?? game.home_tid ?? '');
                      const awayId = String(game.awayTeamId ?? game.awayId ?? game.away_tid ?? '');
                      const teamIsHome = homeId && teamIdStr && homeId === teamIdStr;
                      const teamIsAway = awayId && teamIdStr && awayId === teamIdStr;
                      let rowOppId = null;

                      // Determine numeric week if available
                      const weekVal = game.week;
                      const weekNum = parseInt(weekVal, 10);

                      if (!isNaN(weekNum) && prevWeekNum !== null && weekNum > prevWeekNum + 1) {
                        // insert missing bye rows for gaps between prevWeekNum and weekNum
                        for (let w = prevWeekNum + 1; w < weekNum; w++) {
                          rows.push(
                            <tr key={`bye-${w}-${idx}`}>
                              <td></td>
                              <td></td>
                              <td className="text-center">{w}</td>
                              <td></td>
                              <td>bye</td>
                              <td className="text-center">-</td>
                              <td className="text-center">-</td>
                              <td className="text-center">-</td>
                              <td></td>
                              <td></td>
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
                        // Use opponent id fields if provided on the game object
                        rowOppId = (game.awayId ?? game.awayTeamId ?? game.away_tid) ?? null;
                        // Prefer committee rank for postseason rows, regular-season ranks for in-season
                        const oppRank = game && String(game.seasonType).toLowerCase() === 'postseason'
                          ? getCommitteeRankForTeamWeek(game.week, rowOppId)
                          : getRankForTeamWeek(game.week, rowOppId, 'regular');
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
                        rowOppId = (game.homeId ?? game.homeTeamId ?? game.home_tid) ?? null;
                        const oppRank = game && String(game.seasonType).toLowerCase() === 'postseason'
                          ? getCommitteeRankForTeamWeek(game.week, rowOppId)
                          : getRankForTeamWeek(game.week, rowOppId, 'regular');
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
                        const awayId = (game.awayId ?? game.awayTeamId ?? game.away_tid) ?? null;
                        const homeId = (game.homeId ?? game.homeTeamId ?? game.home_tid) ?? null;
                        rowOppId = null; // ambiguous; no single opponent id
                        const awayRank = game && String(game.seasonType).toLowerCase() === 'postseason'
                          ? getCommitteeRankForTeamWeek(game.week, awayId)
                          : getRankForTeamWeek(game.week, awayId, 'regular');
                        const homeRank = game && String(game.seasonType).toLowerCase() === 'postseason'
                          ? getCommitteeRankForTeamWeek(game.week, homeId)
                          : getRankForTeamWeek(game.week, homeId, 'regular');
                        const awayRankText = awayRank ? `${formatRankForDisplay(awayRank)} ` : '';
                        const homeRankText = homeRank ? `${formatRankForDisplay(homeRank)} ` : '';
                        const awayRankSpan = renderRankSpan(awayRank);
                        const homeRankSpan = renderRankSpan(homeRank);
                        const sep = game.neutralSite ? ' vs ' : ' @ ';
                        opponentName = <>{awayRankSpan}{awayRaw}{sep}{homeRankSpan}{homeRaw}</>;
                        var opponentText = `${awayRankText}${awayRaw}${sep}${homeRankText}${homeRaw}`;
                        teamScore = game.awayPoints ?? '-';
                        opponentScore = game.homePoints ?? '-';
                      }

                      // rowOppId holds the opponent team id when available; we will pass that to the click handler

                      // Determine opponent conference from game fields
                      let opponentConference = '';
                      const homeConf = game.homeConference || '';
                      const awayConf = game.awayConference || '';
                      if (teamIsHome) {
                        opponentConference = awayConf;
                      } else if (teamIsAway) {
                        opponentConference = homeConf;
                      } else {
                        // ambiguous / both teams visible
                        opponentConference = awayConf && homeConf ? `${awayConf} / ${homeConf}` : (awayConf || homeConf || '');
                      }

                      // reuse `teamIdVal` declared at the start of the loop
                      const rankStr = game && String(game.seasonType).toLowerCase() === 'postseason'
                        ? getCommitteeRankForTeamWeek(game.week, teamIdVal)
                        : getRankForTeamWeek(game.week, teamIdVal, 'regular');
                      const rankDisplay = rankStr ? formatRankForDisplay(rankStr) : '';

                      rows.push(
                        <tr key={game.id || `game-${idx}`}>
                          <td className={game.notes && game.notes.includes('Championship') ? 'date-championship' : (game.seasonType === 'postseason' ? 'date-postseason' : '')}>{formatDateOnly(game.startDate)}</td>
                          <td className={getDateCellClass(game)} style={getDateCellStyle(game)}>{formatTimeOnly(game.startDate)}</td>
                          <td className="text-center">{game.seasonType === 'postseason' ? 'Bowl' : game.week}</td>
                          <td className="text-center">{rankDisplay ? <span className="rank">{rankDisplay}</span> : ''}</td>
                          <td>
                            <a
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                handleOpponentClick(rowOppId);
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
                          <td className="text-center">{opponentConference}</td>
                          <td>{game.venue}</td>
                          <td className="text-end">{formatAttendance(game.attendance)}</td>
                        </tr>
                      );

                      // update prevWeekNum if current week is numeric
                      if (!isNaN(weekNum)) prevWeekNum = weekNum;
                    });
                    return rows;
                  })()}
                </tbody>
                <tfoot>
                  <tr className="nobr">
                    <td>{(() => {
                      const stats = getGameTimeStats();
                      return `🟨 ${stats.yellow} / 🟧 ${stats.orange} / 🟪 ${stats.purple}`;
                    })()}</td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
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
                    <td></td>
                    <td className="text-end">{getHomeAttendanceAverage()}</td>
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
    </div>
  );
}
