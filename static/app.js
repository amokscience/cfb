document.addEventListener('DOMContentLoaded', function(){
  const yearInput = document.getElementById('yearInput');
  const loadBtn = document.getElementById('loadBtn');
  const teamSelect = document.getElementById('teamSelect');

  async function loadTeams() {
    const year = yearInput.value || new Date().getFullYear();
    loadBtn.disabled = true;
    loadBtn.textContent = 'Loading...';
    try {
      const res = await fetch(`/api/teams?year=${encodeURIComponent(year)}`);
      if (!res.ok) throw new Error('Network error');
      const teams = await res.json();
      teamSelect.innerHTML = '<option value="">-- Select a team --</option>';
      teams.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id || t.ID || '';
        opt.textContent = t.name || t.Name || t.school || t.Alias || JSON.stringify(t);
        teamSelect.appendChild(opt);
      });
    } catch (e) {
      alert('Failed to load teams: ' + e.message);
    } finally {
      loadBtn.disabled = false;
      loadBtn.textContent = 'Load Teams';
    }
  }

  loadBtn.addEventListener('click', loadTeams);

  // Auto-load once on page open
  loadTeams();
});
