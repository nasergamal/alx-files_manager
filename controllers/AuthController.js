const crypto = require('crypto');
const { v4 } = require('uuid');
const dbClient = require('../utils/db');
const redisClient = require('../utils/redis');

class AuthController {
  static async getConnect(req, res) {
    const credential = req.headers.authorization;
    const newcred = atob(credential.slice(6)).split(':');
    const hash = crypto.createHash('sha1');
    const result = await dbClient.db.collection('users').find({
      email: newcred[0],
      password: hash.digest(newcred[1]),
    }).toArray();
    if (result.length < 0) {
      res.status(401).send({ error: 'Unauthorized' });
      return;
    }
    const token = v4();
    await redisClient.set(`auth_${token}`, JSON.stringify(result[0]._id), 86400);

    res.status(200).send({ token });
  }

  static async getDisconnect(req, res) {
    const token = req.headers['x-token'];
    const id = await redisClient.get(`auth_${token}`);
    if (id === undefined) {
      res.status(401).send({ error: 'Unauthorized' });
      return;
    }
    await redisClient.del(`auth_${token}`);
    res.status(204).send();
  }
}

module.exports = AuthController;
