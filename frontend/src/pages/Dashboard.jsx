import { useState, useEffect } from 'react';
import axios from 'axios';

const TABS = ['appointments', 'clients', 'revenue', 'staff'];

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('appointments');
  const [appointments, setAppointments] = useState([]);
  const [clients, setClients] = useState([]);
  const [services, setServices] = useState([]);
  const [dateFilter, setDateFilter] = useState('');
  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => { fetchAppointments(); fetchClients(); fetchServices(); }, []);
  useEffect(() => { if (activeTab === 'appointments') fetchAppointments(); }, [dateFilter]);

  const fetchAppointments = async () => {
    try {
      const params = {};
      if (dateFilter) params.date = dateFilter;
      const { data } = await axios.get('/api/dashboard/appointments', { params, headers });
      setAppointments(data);
    } catch (err) { console.error(err); }
  };
  const fetchClients = async () => {
    try { const { data } = await axios.get('/api/dashboard/clients', { headers }); setClients(data); }
    catch (err) { console.error(err); }
  };
  const fetchServices = async () => {
    try { const { data } = await axios.get('/api/services'); setServices(data); }
    catch (err) { console.error(err); }
  };
  const updateStatus = async (id, status) => {
    try { await axios.patch(`/api/dashboard/appointments/${id}`, { status }, { headers }); fetchAppointments(); }
    catch (err) { console.error(err); }
  };

  return (
    <div>
      <nav>
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}>{tab}</button>
        ))}
      </nav>
      {activeTab === 'appointments' && (
        <div>
          <h2>Appointments</h2>
          <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} />
          {appointments.map(a => (
            <div key={a.id}>
              <p>{a.appointment_date} {a.appointment_time} — {a.client_name}</p>
              <p>Service: {a.services?.name} | Staff: {a.staff?.name || 'Any'}</p>
              <p>Status: {a.status}</p>
              <button onClick={() => updateStatus(a.id, 'confirmed')}>Confirm</button>
              <button onClick={() => updateStatus(a.id, 'completed')}>Complete</button>
              <button onClick={() => updateStatus(a.id, 'cancelled')}>Cancel</button>
            </div>
          ))}
        </div>
      )}
      {activeTab === 'clients' && (
        <div>
          <h2>Clients</h2>
          {clients.map(c => (
            <div key={c.id}><strong>{c.name}</strong> — {c.email} {c.phone}</div>
          ))}
        </div>
      )}
      {activeTab === 'revenue' && (
        <div><h2>Revenue</h2><p>Filter by date range to view revenue data.</p></div>
      )}
      {activeTab === 'staff' && (
        <div>
          <h2>Staff</h2>
        </div>
      )}
    </div>
  );
}