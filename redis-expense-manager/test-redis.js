const Redis = require('ioredis');
const { execSync } = require('child_process');

// Create a Redis client
const redis = new Redis({
  host: 'localhost',
  port: 6379,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

// Test key and value
const TEST_KEY = 'test:persistence';
const TEST_VALUE = 'Redis persistence is working!';

async function cleanupRedisContainer() {
  try {
    console.log('Cleaning up Redis container...');
    execSync('./cleanup-redis.sh', { stdio: 'inherit' });
  } catch (error) {
    console.log('Note: Container might not have existed:', error.message);
  }
}

async function testRedisPersistence() {
  try {
    console.log('\n=== Testing Redis Persistence ===');
    console.log('Step 1: Setting initial data...');
    
    // Set initial data
    await redis.set(TEST_KEY, TEST_VALUE);
    console.log('✅ Initial data set successfully');

    // Get and verify initial data
    const initialValue = await redis.get(TEST_KEY);
    console.log(`Initial value: ${initialValue}`);
    
    if (initialValue === TEST_VALUE) {
      console.log('✅ Initial value matches expected value');
    } else {
      console.log('❌ Initial value does not match expected value');
    }

    // Close Redis connection before container operations
    await redis.quit();
    
    // Clean up container
    await cleanupRedisContainer();
    
    // Start new container
    console.log('Starting new Redis container...');
    execSync('./run-redis.sh', { stdio: 'inherit' });
    
    // Create new Redis client
    const newRedis = new Redis({
      host: 'localhost',
      port: 6379,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    });

    // Wait a bit for Redis to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('\nStep 2: Testing data persistence...');
    
    // Try to get the value from the new container
    const persistedValue = await newRedis.get(TEST_KEY);
    console.log(`Retrieved value after container restart: ${persistedValue}`);

    if (persistedValue === TEST_VALUE) {
      console.log('✅ Data persisted successfully across container restart!');
    } else {
      console.log('❌ Data did not persist across container restart');
    }

    // Clean up
    await newRedis.del(TEST_KEY);
    console.log('✅ Cleaned up test key');
    
    // Close connection
    await newRedis.quit();
    
    console.log('\n🎉 Redis persistence test completed!');
    
    // Final cleanup
    console.log('\nPerforming final cleanup...');
    await cleanupRedisContainer();
    
  } catch (error) {
    console.error('❌ Error during persistence test:', error.message);
    process.exit(1);
  }
}

// Run the test
testRedisPersistence(); 