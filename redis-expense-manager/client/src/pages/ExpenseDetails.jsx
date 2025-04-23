import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Table, Button, Row, Col, Badge, Modal, Form } from 'react-bootstrap';
import axios from 'axios';

function ExpenseDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [expense, setExpense] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    date: '',
    paymentMethod: 'credit',
    status: 'completed'
  });

  useEffect(() => {
    const fetchExpenseDetails = async () => {
      try {
        const [expenseResponse, paymentsResponse] = await Promise.all([
          axios.get(`/api/expenses/${id}`),
          axios.get(`/api/expenses/${id}/payments`)
        ]);
        setExpense(expenseResponse.data);
        setPayments(paymentsResponse.data);
      } catch (error) {
        console.error('Error fetching expense details:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchExpenseDetails();
  }, [id]);

  const handlePaymentChange = (e) => {
    const { name, value } = e.target;
    setPaymentForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleAddPayment = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`/api/expenses/${id}/payments`, paymentForm);
      const paymentsResponse = await axios.get(`/api/expenses/${id}/payments`);
      setPayments(paymentsResponse.data);
      setShowPaymentModal(false);
      setPaymentForm({
        amount: '',
        date: '',
        paymentMethod: 'credit',
        status: 'completed'
      });
    } catch (error) {
      console.error('Error adding payment:', error);
    }
  };

  const handleDeletePayment = async (paymentId) => {
    try {
      await axios.delete(`/api/expenses/${id}/payments/${paymentId}`);
      const paymentsResponse = await axios.get(`/api/expenses/${id}/payments`);
      setPayments(paymentsResponse.data);
    } catch (error) {
      console.error('Error deleting payment:', error);
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!expense) {
    return <div>Expense not found</div>;
  }

  return (
    <div>
      <Card className="mb-4">
        <Card.Header>
          <h3>{expense.description}</h3>
        </Card.Header>
        <Card.Body>
          <Row>
            <Col md={6}>
              <p>
                <strong>Amount:</strong> ₹{expense.amount}
              </p>
              <p>
                <strong>Date:</strong>{" "}
                {new Date(expense.date).toLocaleDateString()}
              </p>
              <p>
                <strong>Currency:</strong> {expense.currency}
              </p>
            </Col>
            <Col md={6}>
              <p>
                <strong>Payment Method:</strong> {expense.paymentMethod}
              </p>
              <p>
                <strong>Paid By:</strong> {expense.paidBy}
              </p>
              <p>
                <strong>Remaining Amount:</strong> ₹{expense.remainingAmount}
              </p>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header className="d-flex justify-content-between align-items-center">
          <h4>Payments</h4>
          <Button variant="primary" onClick={() => setShowPaymentModal(true)}>
            Add Payment
          </Button>
        </Card.Header>
        <Card.Body>
          <Table striped hover>
            <thead>
              <tr>
                <th>Amount</th>
                <th>Date</th>
                <th>Payment Method</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td>${payment.amount}</td>
                  <td>{new Date(payment.date).toLocaleDateString()}</td>
                  <td>{payment.paymentMethod}</td>
                  <td>
                    <Badge
                      bg={
                        payment.status === "completed" ? "success" : "warning"
                      }
                    >
                      {payment.status}
                    </Badge>
                  </td>
                  <td>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleDeletePayment(payment.id)}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card.Body>
      </Card>

      <Modal show={showPaymentModal} onHide={() => setShowPaymentModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Add Payment</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form onSubmit={handleAddPayment}>
            <Form.Group className="mb-3">
              <Form.Label>Amount</Form.Label>
              <Form.Control
                type="number"
                name="amount"
                value={paymentForm.amount}
                onChange={handlePaymentChange}
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
                value={paymentForm.date}
                onChange={handlePaymentChange}
                required
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Payment Method</Form.Label>
              <Form.Select
                name="paymentMethod"
                value={paymentForm.paymentMethod}
                onChange={handlePaymentChange}
                required
              >
                <option value="credit">Credit Card</option>
                <option value="debit">Debit Card</option>
                <option value="cash">Cash</option>
                <option value="bank">Bank Transfer</option>
              </Form.Select>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Status</Form.Label>
              <Form.Select
                name="status"
                value={paymentForm.status}
                onChange={handlePaymentChange}
                required
              >
                <option value="completed">Completed</option>
                <option value="pending">Pending</option>
              </Form.Select>
            </Form.Group>

            <Button variant="primary" type="submit">
              Add Payment
            </Button>
          </Form>
        </Modal.Body>
      </Modal>
    </div>
  );
}

export default ExpenseDetails; 