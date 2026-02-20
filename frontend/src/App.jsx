import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Public from './pages/Public';
import Dashboard from './pages/Dashboard';
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Public />} />
        <Route path="/dashboard/*" element={<Dashboard />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}