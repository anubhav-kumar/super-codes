import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Container } from 'react-bootstrap';
import Navigation from './components/Navigation';
import TripList from './pages/TripList';
import TripDetails from './pages/TripDetails';
import CreateTrip from './pages/CreateTrip';
import CreateExpense from './pages/CreateExpense';
import ExpenseDetails from './pages/ExpenseDetails';
import 'bootstrap/dist/css/bootstrap.min.css';

function App() {
  return (
    <Router>
      <Navigation />
      <Container className="mt-4">
        <Routes>
          <Route path="/" element={<TripList />} />
          <Route path="/trips/new" element={<CreateTrip />} />
          <Route path="/trips/:id" element={<TripDetails />} />
          <Route path="/trips/:id/expenses/new" element={<CreateExpense />} />
          <Route path="/expenses/:id" element={<ExpenseDetails />} />
        </Routes>
      </Container>
    </Router>
  );
}

export default App;
