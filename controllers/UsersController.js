const sha1 = require('sha1');
const Queue = require('bull');
const { ObjectID } = require('mongodb');
const dbClient = require('../utils/db');
const redisClient = require('../utils/redis');

const userQueue = new Queue('userQueue', 'redis://127.0.0.1:6379');

class UserController {
  static async postNew(req, res) {
    const { email, password } = req.body;
    if (email === undefined) {
      res.status(400).send({ error: 'Missing email' });
      return;
    }
    if (password === undefined) {
      res.status(400).send({ error: 'Missing password' });
      return;
    }
    const users = await dbClient.db.collection('users');
    const results = await users.findOne({ email });
    if (results) {
      res.status(400).send({ error: 'Already exist' });
      return;
    }
    const pass = sha1(password);
    try {
      users.insertOne({ email, password: pass }).then((result) => {
        userQueue.add({ userId: result.insertedId });
        res.status(201).send({ id: result.insertedId, email });
      });
    } catch (error) {
      console.log(error);
    }
  }

  static async getMe(req, res) {
    const token = req.headers['x-token'];
    const id = await redisClient.get(`auth_${token}`);
    if (id === null) {
      res.status(401).send({ error: 'Unauthorized' });
      return;
    }
    const result = await dbClient.db.collection('users').findOne({ _id: ObjectID(id) });
    if (result === null) {
      res.status(401).send({ error: 'Unauthorized' });
      return;
    }
    res.status(200).send({ id: result._id, email: result.email });
  }
}

module.exports = UserController;
