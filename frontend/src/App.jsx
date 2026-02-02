import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Form, Button, Alert } from 'react-bootstrap';

export default function App() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadTeams = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/teams?year=${encodeURIComponent(year)}`);
      if (!res.ok) throw new Error('Failed to load teams');
      const data = await res.json();
      setTeams(Array.isArray(data) ? data : []);
      setSelectedTeam('');
    } catch (e) {
      setError('Error loading teams: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTeams();
  }, []);

  return (
    <Container className="mt-5">
      <Row className="mb-4">
        <Col md={8}>
          <h1>College Football Teams</h1>
        </Col>
      </Row>

      {error && <Alert variant="danger">{error}</Alert>}

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
            onClick={loadTeams}
            disabled={loading}
            className="w-100"
          >
            {loading ? 'Loading...' : 'Load Teams'}
          </Button>
        </Col>
      </Row>

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

      {selectedTeam && (
        <Row>
          <Col md={6}>
            <Alert variant="info">
              Selected team ID: <strong>{selectedTeam}</strong>
            </Alert>
          </Col>
        </Row>
      )}
    </Container>
  );
}
