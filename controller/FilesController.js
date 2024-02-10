const { ObjectID } = require('mongodb');
const fs = require('fs');
const mime = require('mime-types');
const { v4 } = require('uuid');
const dbClient = require('../utils/db');
const redisClient = require('../utils/redis');
const { userInfo } = require('os');

class FilesController {
  static async postUpload(req, res) {
    const {
      name,
      type,
      parentId,
      isPublic,
      data,
    } = req.body;
    const token = req.headers['x-token'];
    const pathToken = v4();
    const parameters = {};
    const path = process.env.FOLDER_PATH ? process.env.FOLDER_PATH : '/tmp/files_manager';
    const id = await redisClient.get(`auth_${token}`);
    if (id === null) {
      res.status(401).send({ error: 'Unauthorized' });
      return;
    }
    if (name === undefined) {
      res.status(400).send('Missing name');
      return;
    }
    if (type === undefined || !['folder', 'file', 'image'].includes(type)) {
      res.status(400).send('Missing type');
      return;
    }
    if (data === undefined && type !== 'folder') {
      res.status(400).send('Missing data');
      return;
    }
    parameters.userId = ObjectID(JSON.parse(id));
    parameters.name = name;
    parameters.type = type;
    parameters.isPublic = false;
    parameters.parentId = 0;
    if (type !== 'folder') {
      parameters.localPath = `${path}/${pathToken}`;
    }
    if (parentId) {
      const parent = await dbClient.db.collection('files').findOne({ _id: ObjectID(parentId) });
      if (parent === null) {
        res.status(400).send('Parent not found');
        return;
      }
      if (parent.type !== 'folder') {
        res.status(400).send('Parent is not a folder');
        return;
      }
      parameters.parentId = ObjectID(parentId);
    }

    if (isPublic !== undefined) {
      parameters.isPublic = true;
    }
    if (!fs.existsSync(path)) {
      fs.mkdirSync(path, { recursive: true });
    }
    const filePath = `${path}/${pathToken}`;

    if (['file', 'image'].includes(type)) {
      const buf = Buffer.from(data, 'base64');
      fs.writeFile(filePath, buf, (err) => {
        if (err) {
          console.log(err);
        }
      });
    }
    await dbClient.db.collection('files').insertOne(parameters).then((result) => {
      res.status(201).send({
        id: result.insertedId,
        userId: result.ops[0].userId,
        name: result.ops[0].name,
        type: result.ops[0].type,
        isPublic: result.ops[0].isPublic,
        parentId: result.ops[0].parentId,
      });
    });
  }

  static async getShow(req, res) {
    const token = req.headers['x-token'];
    let userId = await redisClient.get(`auth_${token}`);
    if (userId === null) {
      res.status(401).send({ error: 'Unauthorized' });
      return;
    }
    userId = ObjectID(JSON.parse(userId));
    const itemId = ObjectID(req.params.id);
    const result = await dbClient.db.collection('files').findOne(
      { userId, _id: itemId },
      {
        projection:
          {
            _id: 0,
            id: '$_id',
            userId: 1,
            name: 1,
            type: 1,
            isPublic: 1,
            parentId: 1,
          },
      },
    );
    if (result === null) {
      res.status(400).send({ error: 'Not found' });
      return;
    }
    res.status(200).send(result);
  }

  static async getIndex(req, res) {
    const token = req.headers['x-token'];
    const id = await redisClient.get(`auth_${token}`);
    if (id === null) {
      res.status(401).send({ error: 'Unauthorized' });
      return;
    }
    const parentId = req.query.parentId ? ObjectID(req.query.parentId) : 0;
    const page = req.query.page ? parseInt(req.query.page, 10) : 1;
    const params = { userId: ObjectID(JSON.parse(id)), parentId };
    const results = await dbClient.db.collection('files').aggregate([
      { $match: params },
      {
        $project:
            {
              id: '$_id',
              _id: 0,
              userId: 1,
              name: 1,
              type: 1,
              isPublic: 1,
              parentId: 1,
            },
      },
      {
        $facet: {
          data: [{ $skip: (page - 1) * 20 }, { $limit: 20 }],
        },
      },
    ]).toArray();
    res.status(200).send(results[0].data);
  }

  static async putPublish(req, res) {
    const token = req.headers['x-token'];
    let userId = await redisClient.get(`auth_${token}`);
    if (userId === null) {
      res.status(401).send({ error: 'Unauthorized' });
      return;
    }
    userId = ObjectID(JSON.parse(userId));
    const itemId = ObjectID(req.params.id);
    const file = await dbClient.db.collection('files').findOneAndUpdate(
      { userId, _id: itemId },
      { $set: { isPublic: true } },
      {
        returnDocument: 'after',
        projection:
          {
            id: '$_id',
            _id: 0,
            userId: 1,
            name: 1,
            type: 1,
            isPublic: 1,
            parentId: 1,
          },
      },
    );
    if (file.lastErrorObject.updatedExisting === false) {
      res.status(404).send({ error: 'Not found' });
      return;
    }
    res.status(200).send(file.value);
  }

  static async putUnPublish(req, res) {
    const token = req.headers['x-token'];
    let userId = await redisClient.get(`auth_${token}`);
    if (userId === null) {
      res.status(401).send({ error: 'Unauthorized' });
      return;
    }
    userId = ObjectID(JSON.parse(userId));
    const itemId = ObjectID(req.params.id);
    const file = await dbClient.db.collection('files').findOneAndUpdate(
      { userId, _id: itemId },
      { $set: { isPublic: false } },
      {
        returnDocument: 'after',
        projection:
          {
            id: '$_id',
            _id: 0,
            userId: 1,
            name: 1,
            type: 1,
            isPublic: 1,
            parentId: 1,
          },
      },
    );
    if (file.lastErrorObject.updatedExisting === false) {
      res.status(404).send({ error: 'Not found' });
      return;
    }
    res.status(200).send(file.value);
  }

  static async getFile(req, res) {
    const token = req.headers['x-token'];
    let userId = await redisClient.get(`auth_${token}`);
    const itemId = ObjectID(req.params.id);
    const result = await dbClient.db.collection('files').findOne({ _id: itemId });
    if (result === null) {
      res.status(404).send({ error: 'Not found' });
      return;
    }
    if (userId !== null) {
      userId = JSON.parse(userId);
    }
    if (result.isPublic === false && (
      userId === null || result.userId.toString() !== userId.toString())) {
      res.status(404).send({ error: 'Not found' });
      return;
    }
    if (result.type === 'folder') {
      res.status(400).send({ error: "A folder doesn't have content" });
      return;
    }
    const type = mime.lookup(result.name);
    if (!type) {
      res.status(404).send({ error: 'Not found' });
      return;
    }
    fs.readFile(result.localPath, (err, data) => {
      if (err) {
        res.status(404).send({ error: 'Not found' });
        return;
      }
      res.type(type);
      res.status(200).send(data);
    });
  }
}

module.exports = FilesController;
