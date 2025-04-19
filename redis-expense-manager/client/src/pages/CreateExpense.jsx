import { useState } from 'react';
import { Form, Button, Card } from 'react-bootstrap';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

function CreateExpense() {
  const { id: tripId } = useParams();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    amount: '',
    date: '',
    description: '',
    currency: 'USD',
    paymentMethod: 'credit',
    paidBy: ''
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`/api/expenses/trips/${tripId}/expenses`, formData);
      navigate(`/trips/${tripId}`);
    } catch (error) {
      console.error('Error creating expense:', error);
    }
  };

  return (
    <Card>
      <Card.Header>
        <h3>Add New Expense</h3>
      </Card.Header>
      <Card.Body>
        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-3">
            <Form.Label>Amount</Form.Label>
            <Form.Control
              type="number"
              name="amount"
              value={formData.amount}
              onChange={handleChange}
              min="0"
              step="0.01"
              required
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Date</Form.Label>
            <Form.Control
              type="date"
              name="date"
              value={formData.date}
              onChange={handleChange}
              required
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Description</Form.Label>
            <Form.Control
              type="text"
              name="description"
              value={formData.description}
              onChange={handleChange}
              required
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Currency</Form.Label>
            <Form.Select
              name="currency"
              value={formData.currency}
              onChange={handleChange}
              required
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="INR">INR</option>
            </Form.Select>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Payment Method</Form.Label>
            <Form.Select
              name="paymentMethod"
              value={formData.paymentMethod}
              onChange={handleChange}
              required
            >
              <option value="credit">Credit Card</option>
              <option value="debit">Debit Card</option>
              <option value="cash">Cash</option>
              <option value="bank">Bank Transfer</option>
            </Form.Select>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Paid By</Form.Label>
            <Form.Control
              type="text"
              name="paidBy"
              value={formData.paidBy}
              onChange={handleChange}
              required
            />
          </Form.Group>

          <Button variant="primary" type="submit">
            Add Expense
          </Button>
        </Form>
      </Card.Body>
    </Card>
  );
}

export default CreateExpense; 