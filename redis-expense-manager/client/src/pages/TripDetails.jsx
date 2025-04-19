import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, Table, Button, Row, Col, Badge } from 'react-bootstrap';
import axios from 'axios';

function TripDetails() {
  const { id } = useParams();
  const [trip, setTrip] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTripDetails = async () => {
      try {
        const [tripResponse, expensesResponse] = await Promise.all([
          axios.get(`/api/trips/${id}`),
          axios.get(`/api/expenses/trips/${id}/expenses`)
        ]);
        setTrip(tripResponse.data);
        setExpenses(expensesResponse.data);
      } catch (error) {
        console.error('Error fetching trip details:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTripDetails();
  }, [id]);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!trip) {
    return <div>Trip not found</div>;
  }

  const totalExpenses = expenses.reduce((sum, expense) => sum + parseFloat(expense.amount), 0);
  const remainingBudget = trip.totalBudget - totalExpenses;

  return (
    <div>
      <Card className="mb-4">
        <Card.Header>
          <h3>{trip.name}</h3>
        </Card.Header>
        <Card.Body>
          <Row>
            <Col md={6}>
              <p><strong>Location:</strong> {trip.location}</p>
              <p><strong>Description:</strong> {trip.description}</p>
              <p><strong>Dates:</strong> {new Date(trip.startDate).toLocaleDateString()} - {new Date(trip.endDate).toLocaleDateString()}</p>
            </Col>
            <Col md={6}>
              <p><strong>Total Budget:</strong> ${trip.totalBudget}</p>
              <p><strong>Total Expenses:</strong> ${totalExpenses.toFixed(2)}</p>
              <p>
                <strong>Remaining Budget:</strong> 
                <Badge bg={remainingBudget >= 0 ? 'success' : 'danger'}>
                  ${remainingBudget.toFixed(2)}
                </Badge>
              </p>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header className="d-flex justify-content-between align-items-center">
          <h4>Expenses</h4>
          <Button as={Link} to={`/trips/${id}/expenses/new`} variant="primary">
            Add Expense
          </Button>
        </Card.Header>
        <Card.Body>
          <Table striped hover>
            <thead>
              <tr>
                <th>Description</th>
                <th>Amount</th>
                <th>Date</th>
                <th>Paid By</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr key={expense.id}>
                  <td>{expense.description}</td>
                  <td>${expense.amount}</td>
                  <td>{new Date(expense.date).toLocaleDateString()}</td>
                  <td>{expense.paidBy}</td>
                  <td>
                    <Badge bg={expense.remainingAmount === 0 ? 'success' : 'warning'}>
                      {expense.remainingAmount === 0 ? 'Paid' : 'Pending'}
                    </Badge>
                  </td>
                  <td>
                    <Button
                      variant="info"
                      size="sm"
                      className="me-2"
                      as={Link}
                      to={`/expenses/${expense.id}`}
                    >
                      View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card.Body>
      </Card>
    </div>
  );
}

export default TripDetails; 