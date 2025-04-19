const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000/api';

async function runTripTests() {
  let testTripId;

  try {
    console.log('Starting Trip API tests...\n');

    // Test 1: Create a new trip
    console.log('1. Testing trip creation...');
    const tripData = {
      name: 'Test Trip',
      description: 'A test trip for API testing',
      startDate: '2024-03-01',
      endDate: '2024-03-07',
      location: 'Test Location'
    };

    const createResponse = await axios.post(`${API_BASE_URL}/trips`, tripData);
    testTripId = createResponse.data.id;
    console.log('Trip created:', createResponse.data);

    // Test 2: Get all trips
    console.log('\n2. Testing get all trips...');
    const getAllResponse = await axios.get(`${API_BASE_URL}/trips`);
    console.log('All trips:', getAllResponse.data);

    // Test 3: Get single trip
    console.log('\n3. Testing get single trip...');
    const getSingleResponse = await axios.get(`${API_BASE_URL}/trips/${testTripId}`);
    console.log('Single trip:', getSingleResponse.data);

    // Test 4: Update trip
    console.log('\n4. Testing trip update...');
    const updateData = {
      name: 'Updated Test Trip',
      description: 'Updated test trip description'
    };
    const updateResponse = await axios.put(`${API_BASE_URL}/trips/${testTripId}`, updateData);
    console.log('Updated trip:', updateResponse.data);

    // Test 5: Delete trip
    console.log('\n5. Testing trip deletion...');
    await axios.delete(`${API_BASE_URL}/trips/${testTripId}`);
    console.log('Trip deleted successfully');

    // Test 6: Verify trip is deleted
    console.log('\n6. Verifying trip deletion...');
    try {
      await axios.get(`${API_BASE_URL}/trips/${testTripId}`);
      console.error('Error: Trip still exists after deletion');
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.log('Success: Trip not found after deletion');
      } else {
        console.error('Unexpected error:', error.message);
      }
    }

    console.log('\nAll Trip API tests completed successfully!');

  } catch (error) {
    console.error('Test failed:', error.response ? error.response.data : error.message);
  }
}

// Run the tests
runTripTests(); 