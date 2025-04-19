const express = require('express');
const Expense = require('../models/Expense');

const router = express.Router();
const expenseManager = new Expense();

// Create a new expense
router.post('/trips/:tripId/expenses', async (req, res) => {
  try {
    const expense = await expenseManager.createExpense(req.params.tripId, req.body);
    res.status(201).json(expense);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get all expenses for a trip
router.get('/trips/:tripId/expenses', async (req, res) => {
  try {
    const expenses = await expenseManager.getTripExpenses(req.params.tripId);
    res.json(expenses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get a single expense
router.get('/:id', async (req, res) => {
  try {
    const expense = await expenseManager.getExpense(req.params.id);
    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    res.json(expense);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update an expense
router.put('/:id', async (req, res) => {
  try {
    const expense = await expenseManager.updateExpense(req.params.id, req.body);
    res.json(expense);
  } catch (error) {
    if (error.message === 'Expense not found') {
      return res.status(404).json({ error: error.message });
    }
    res.status(400).json({ error: error.message });
  }
});

// Delete an expense
router.delete('/:id', async (req, res) => {
  try {
    await expenseManager.deleteExpense(req.params.id);
    res.status(204).send();
  } catch (error) {
    if (error.message === 'Expense not found') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

// Add a payment to an expense
router.post('/:id/payments', async (req, res) => {
  try {
    const payment = await expenseManager.addPayment(req.params.id, req.body);
    res.status(201).json(payment);
  } catch (error) {
    if (error.message === 'Expense not found') {
      return res.status(404).json({ error: error.message });
    }
    res.status(400).json({ error: error.message });
  }
});

// Get all payments for an expense
router.get('/:id/payments', async (req, res) => {
  try {
    const payments = await expenseManager.getExpensePayments(req.params.id);
    res.json(payments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a payment
router.delete('/:expenseId/payments/:paymentId', async (req, res) => {
  try {
    await expenseManager.deletePayment(req.params.paymentId);
    res.status(204).send();
  } catch (error) {
    if (error.message === 'Payment not found') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;