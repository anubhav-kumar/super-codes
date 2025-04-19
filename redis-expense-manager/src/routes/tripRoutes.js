const express = require('express');
const Trip = require('../models/Trip');

const router = express.Router();
const tripManager = new Trip();

// Create a new trip
router.post('/', async (req, res) => {
  try {
    const trip = await tripManager.createTrip(req.body);
    res.status(201).json(trip);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get all trips
router.get('/', async (req, res) => {
  try {
    const trips = await tripManager.listTrips();
    res.json(trips);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get a single trip
router.get('/:id', async (req, res) => {
  try {
    const trip = await tripManager.getTrip(req.params.id);
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    res.json(trip);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update a trip
router.put('/:id', async (req, res) => {
  try {
    const trip = await tripManager.updateTrip(req.params.id, req.body);
    res.json(trip);
  } catch (error) {
    if (error.message === 'Trip not found') {
      return res.status(404).json({ error: error.message });
    }
    res.status(400).json({ error: error.message });
  }
});

// Delete a trip
router.delete('/:id', async (req, res) => {

  try {
    await tripManager.deleteTrip(req.params.id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router; 