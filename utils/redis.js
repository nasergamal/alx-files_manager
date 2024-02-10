import { promisify } from 'util';

const { createClient } = require('redis');

class RedisClient {
  constructor() {
    this.client = createClient();
    this.client.on('error', (err) => {
      console.log(err);
    });
    this.cget = promisify(this.client.get).bind(this.client);
    this.cset = promisify(this.client.set).bind(this.client);
    this.cdel = promisify(this.client.del).bind(this.client);
  }

  isAlive() {
    return this.client.connected;
  }

  async get(key) {
    const value = await this.cget(key);
    return value;
  }

  async set(key, value, duration) {
    await this.cset(key, value);
    this.client.expire(key, duration);
  }

  async del(key) {
    this.cdel(key);
  }
}

const redisClient = new RedisClient();
module.exports = redisClient;
