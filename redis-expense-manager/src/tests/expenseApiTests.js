const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000/api';

// Helper function to create a test trip
async function createTestTrip() {
  const tripData = {
    name: 'Test Trip for Expenses',
    description: 'A test trip for expense testing',
    startDate: '2024-03-01',
    endDate: '2024-03-07',
    location: 'Test Location'
  };

  const response = await axios.post(`${API_BASE_URL}/trips`, tripData);
  return response.data;
}

// Helper function to delete a test trip
async function deleteTestTrip(tripId) {
  await axios.delete(`${API_BASE_URL}/trips/${tripId}`);
}

async function runExpenseTests() {
  let testTrip;
  let testExpenseId;
  let testPaymentId;

  try {
    console.log('Starting Expense API tests...\n');

    // Create a test trip first
    console.log('1. Creating test trip...');
    testTrip = await createTestTrip();
    console.log('Test trip created:', testTrip);

    // Test 1: Create an expense
    console.log('\n2. Testing expense creation...');
    const expenseData = {
      amount: 100.50,
      date: '2024-03-02',
      description: 'Test expense',
      currency: 'USD',
      paymentMethod: 'credit',
      paidBy: 'Test User'
    };

    const createResponse = await axios.post(
      `${API_BASE_URL}/expenses/trips/${testTrip.id}/expenses`,
      expenseData
    );
    testExpenseId = createResponse.data.id;
    console.log('Expense created:', createResponse.data);

    // Test 2: Get all expenses for the trip
    console.log('\n3. Testing get all expenses for trip...');
    const tripExpensesResponse = await axios.get(
      `${API_BASE_URL}/expenses/trips/${testTrip.id}/expenses`
    );
    console.log('Trip expenses:', tripExpensesResponse.data);

    // Test 3: Get single expense
    console.log('\n4. Testing get single expense...');
    const getExpenseResponse = await axios.get(
      `${API_BASE_URL}/expenses/${testExpenseId}`
    );
    console.log('Single expense:', getExpenseResponse.data);

    // Test 4: Update expense
    console.log('\n5. Testing expense update...');
    const updateData = {
      amount: 150.75,
      description: 'Updated test expense'
    };
    const updateResponse = await axios.put(
      `${API_BASE_URL}/expenses/${testExpenseId}`,
      updateData
    );
    console.log('Updated expense:', updateResponse.data);

    // Test 5: Add payment to expense
    console.log('\n6. Testing payment addition...');
    const paymentData = {
      amount: 50.25,
      date: '2024-03-03',
      paymentMethod: 'credit',
      status: 'completed'
    };
    const paymentResponse = await axios.post(
      `${API_BASE_URL}/expenses/${testExpenseId}/payments`,
      paymentData
    );
    testPaymentId = paymentResponse.data.id;
    console.log('Added payment:', paymentResponse.data);

    // Test 6: Get all payments for expense
    console.log('\n7. Testing get all payments for expense...');
    const paymentsResponse = await axios.get(
      `${API_BASE_URL}/expenses/${testExpenseId}/payments`
    );
    console.log('Expense payments:', paymentsResponse.data);

    // Test 7: Delete payment
    console.log('\n8. Testing payment deletion...');
    await axios.delete(`${API_BASE_URL}/expenses/${testExpenseId}/payments/${testPaymentId}`);
    console.log('Payment deleted successfully');

    // Test 8: Delete expense
    console.log('\n9. Testing expense deletion...');
    await axios.delete(`${API_BASE_URL}/expenses/${testExpenseId}`);
    console.log('Expense deleted successfully');

    // Test 9: Verify expense is deleted
    console.log('\n10. Verifying expense deletion...');
    try {
      await axios.get(`${API_BASE_URL}/expenses/${testExpenseId}`);
      console.error('Error: Expense still exists after deletion');
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.log('Success: Expense not found after deletion');
      } else {
        console.error('Unexpected error:', error.message);
      }
    }

    console.log('\nAll Expense API tests completed successfully!');

  } catch (error) {
    console.error('Test failed:', error.response ? error.response.data : error.message);
  } finally {
    // Cleanup: Delete the test trip
    if (testTrip) {
      console.log('\nCleaning up test trip...');
      await deleteTestTrip(testTrip.id);
      console.log('Test trip deleted');
    }
  }
}

// Run the tests
runExpenseTests(); 