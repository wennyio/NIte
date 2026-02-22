import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Public from './pages/Public';
import Dashboard from './pages/Dashboard';
import Intake from './pages/Intake';
import CommandCenter from './pages/CommandCenter';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Public />} />
        <Route path="/start" element={<Intake />} />
        <Route path="/dashboard/*" element={<Dashboard />} />
        <Route path="/admin" element={<CommandCenter />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
