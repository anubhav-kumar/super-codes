const Redis = require('ioredis');

class Expense {
  constructor(redisClient) {
    this.redis = redisClient || new Redis();
  }

  // Create a new expense
  async createExpense(tripId, expenseData) {
    const expenseId = await this.redis.incr('expense:counter');
    const expenseKey = `expense:${expenseId}`;
    const tripExpensesKey = `trip:${tripId}:expenses`;

    const expense = {
      id: expenseId,
      tripId,
      amount: expenseData.amount,
      date: expenseData.date,
      description: expenseData.description,
      currency: expenseData.currency || 'INR',
      paymentMethod: expenseData.paymentMethod,
      paidBy: expenseData.paidBy,
      remainingAmount: expenseData.amount,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await this.redis.hmset(expenseKey, expense);
    await this.redis.sadd(tripExpensesKey, expenseId);

    return expense;
  }

  // Get an expense by ID
  async getExpense(expenseId) {
    const expenseKey = `expense:${expenseId}`;
    const expense = await this.redis.hgetall(expenseKey);
    return expense.id ? expense : null;
  }

  // Update an expense
  async updateExpense(expenseId, expenseData) {
    const expenseKey = `expense:${expenseId}`;
    const existingExpense = await this.getExpense(expenseId);

    if (!existingExpense) {
      throw new Error('Expense not found');
    }

    const updatedExpense = {
      ...existingExpense,
      ...expenseData,
      updatedAt: new Date().toISOString()
    };

    await this.redis.hmset(expenseKey, updatedExpense);
    return updatedExpense;
  }

  // Delete an expense
  async deleteExpense(expenseId) {
    const expense = await this.getExpense(expenseId);
    if (!expense) {
      throw new Error('Expense not found');
    }

    const expenseKey = `expense:${expenseId}`;
    const tripExpensesKey = `trip:${expense.tripId}:expenses`;
    const expensePaymentsKey = `expense:${expenseId}:payments`;

    // Delete all payments associated with this expense
    const paymentIds = await this.redis.smembers(expensePaymentsKey);
    for (const paymentId of paymentIds) {
      await this.redis.del(`payment:${paymentId}`);
    }

    // Delete the expense and its references
    await this.redis.del(expenseKey);
    await this.redis.del(expensePaymentsKey);
    await this.redis.srem(tripExpensesKey, expenseId);

    return true;
  }

  // Get all expenses for a trip
  async getTripExpenses(tripId) {
    const tripExpensesKey = `trip:${tripId}:expenses`;
    const expenseIds = await this.redis.smembers(tripExpensesKey);
    const expenses = [];

    for (const expenseId of expenseIds) {
      const expense = await this.getExpense(expenseId);
      if (expense) {
        expenses.push(expense);
      }
    }

    return expenses;
  }

  // Add a payment to an expense
  async addPayment(expenseId, paymentData) {
    const expense = await this.getExpense(expenseId);
    if (!expense) {
      throw new Error('Expense not found');
    }

    const paymentId = await this.redis.incr('payment:counter');
    const paymentKey = `payment:${paymentId}`;
    const expensePaymentsKey = `expense:${expenseId}:payments`;

    const payment = {
      id: paymentId,
      expenseId,
      amount: paymentData.amount,
      date: paymentData.date || new Date().toISOString(),
      paymentMethod: paymentData.paymentMethod,
      status: paymentData.status || 'completed',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Update remaining amount in expense
    const remainingAmount = Number(expense.remainingAmount) - Number(payment.amount);
    if (remainingAmount < 0) {
      throw new Error('Payment amount exceeds remaining amount');
    }

    await this.updateExpense(expenseId, { remainingAmount });
    await this.redis.hmset(paymentKey, payment);
    await this.redis.sadd(expensePaymentsKey, paymentId);

    return payment;
  }

  // Get all payments for an expense
  async getExpensePayments(expenseId) {
    const expensePaymentsKey = `expense:${expenseId}:payments`;
    const paymentIds = await this.redis.smembers(expensePaymentsKey);
    const payments = [];

    for (const paymentId of paymentIds) {
      const paymentKey = `payment:${paymentId}`;
      const payment = await this.redis.hgetall(paymentKey);
      if (payment.id) {
        payments.push(payment);
      }
    }

    return payments;
  }

  // Delete a payment
  async deletePayment(paymentId) {
    const paymentKey = `payment:${paymentId}`;
    const payment = await this.redis.hgetall(paymentKey);
    
    if (!payment.id) {
      throw new Error('Payment not found');
    }

    const expense = await this.getExpense(payment.expenseId);
    if (!expense) {
      throw new Error('Associated expense not found');
    }

    // Update remaining amount in expense
    const remainingAmount = Number(expense.remainingAmount) + Number(payment.amount);
    await this.updateExpense(payment.expenseId, { remainingAmount });

    // Delete the payment
    await this.redis.del(paymentKey);
    await this.redis.srem(`expense:${payment.expenseId}:payments`, paymentId);

    return true;
  }
}

module.exports = Expense; 