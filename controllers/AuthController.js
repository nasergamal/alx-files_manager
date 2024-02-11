const sha1 = require('sha1');
const { v4 } = require('uuid');
const dbClient = require('../utils/db');
const redisClient = require('../utils/redis');

class AuthController {
  static async getConnect(req, res) {
    const credential = req.headers.authorization;
    const newcred = Buffer.from(credential.slice(6), 'base64').toString('ascii').split(':');
    if (newcred.length < 2) {
      res.status(401).send({ error: 'Unauthorized' });
      return;
    }
    const result = await dbClient.db.collection('users').findOne({
      email: newcred[0],
      password: sha1(newcred[1]),
    });
    if (result === null) {
      res.status(401).send({ error: 'Unauthorized' });
      return;
    }
    const token = v4();
    await redisClient.set(`auth_${token}`, JSON.stringify(result._id), 86400);

    res.status(200).send({ token });
  }

  static async getDisconnect(req, res) {
    const token = req.headers['x-token'];
    const id = await redisClient.get(`auth_${token}`);
    if (id === null) {
      res.status(401).send({ error: 'Unauthorized' });
      return;
    }
    await redisClient.del(`auth_${token}`);
    res.status(204).send();
  }
}

module.exports = AuthController;
