import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Public from './pages/Public';
export default function App() {
  return (<BrowserRouter><Routes><Route path="/" element={<Public />} /><Route path="/dashboard/*" element={<Dashboard />} /></Routes></BrowserRouter>);
}