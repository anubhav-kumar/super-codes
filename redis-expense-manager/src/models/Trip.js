const Redis = require('ioredis');
const Expense = require('./Expense');

class Trip {
  constructor(redisClient) {
    this.redis = redisClient || new Redis();
    this.expenseManager = new Expense(this.redis);
  }

  // Create a new trip
  async createTrip(tripData) {
    const tripId = await this.redis.incr('trip:counter');
    const tripKey = `trip:${tripId}`;
    
    const trip = {
      id: tripId,
      name: tripData.name,
      description: tripData.description || '',
      startDate: tripData.startDate,
      endDate: tripData.endDate,
      location: tripData.location,
      totalBudget: tripData.totalBudget || 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await this.redis.hmset(tripKey, trip);
    await this.redis.sadd('trips', tripId);
    
    return trip;
  }

  // Get a trip by ID
  async getTrip(tripId) {
    const tripKey = `trip:${tripId}`;
    const trip = await this.redis.hgetall(tripKey);
    if (!trip.id) {
      return null;
    }

    // Get expenses for the trip
    trip.expenses = await this.expenseManager.getTripExpenses(tripId);
    return trip;
  }

  // Update a trip
  async updateTrip(tripId, tripData) {
    const tripKey = `trip:${tripId}`;
    const existingTrip = await this.getTrip(tripId);
    
    if (!existingTrip) {
      throw new Error('Trip not found');
    }

    const updatedTrip = {
      ...existingTrip,
      ...tripData,
      updatedAt: new Date().toISOString()
    };

    await this.redis.hmset(tripKey, updatedTrip);
    return updatedTrip;
  }

  // Delete a trip
  async deleteTrip(tripId) {
    const tripKey = `trip:${tripId}`;
    const trip = await this.getTrip(tripId);
    
    if (!trip) {
      throw new Error('Trip not found');
    }

    // Delete all expenses associated with this trip
    for (const expense of trip.expenses) {
      await this.expenseManager.deleteExpense(expense.id);
    }

    await this.redis.del(tripKey);
    await this.redis.srem('trips', tripId);
    return true;
  }

  // List all trips
  async listTrips() {
    const tripIds = await this.redis.smembers('trips');
    const trips = [];
    
    for (const tripId of tripIds) {
      const trip = await this.getTrip(tripId);
      if (trip) {
        trips.push(trip);
      }
    }
    
    return trips;
  }
}

module.exports = Trip;