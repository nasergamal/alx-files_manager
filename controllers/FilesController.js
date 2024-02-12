import { v4 as uuidv4 } from 'uuid';

const { ObjectID } = require('mongodb');
const fs = require('fs');
const mime = require('mime-types');
const dbClient = require('../utils/db');
const redisClient = require('../utils/redis');

class FilesController {
  static async user(token) {
    const id = await redisClient.get(`auth_${token}`);
    if (id === null) {
      return null;
    }
    const users = dbClient.db.collection('users');
    const dbId = new ObjectID(id);
    const user = await users.findOne({ _id: dbId });
    if (!user) {
      return null;
    }
    return user;
  }

  static async postUpload(req, res) {
    const {
      name,
      type,
      parentId,
      isPublic,
      data,
    } = req.body;
    const user = await FilesController.user(req.headers['x-token']);
    if (user === null) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const pathToken = uuidv4();
    const parameters = {};
    const path = process.env.FOLDER_PATH ? process.env.FOLDER_PATH : '/tmp/files_manager';
    if (name === undefined) {
      res.status(400).json('Missing name');
      return;
    }
    if (type === undefined || !['folder', 'file', 'image'].includes(type)) {
      res.status(400).json('Missing type');
      return;
    }
    if (data === undefined && type !== 'folder') {
      res.status(400).json('Missing data');
      return;
    }
    parameters.userId = ObjectID(user._id);
    parameters.name = name;
    parameters.type = type;
    parameters.isPublic = false;
    parameters.parentId = 0;
    if (type !== 'folder') {
      parameters.localPath = `${path}/${pathToken}`;
    }
    if (isPublic !== undefined) {
      parameters.isPublic = isPublic;
    }
    if (parentId) {
      const parent = await dbClient.db.collection('files').findOne({ _id: ObjectID(parentId) });
      if (parent === null) {
        res.status(400).json('Parent not found');
        return;
      }
      if (parent.type !== 'folder') {
        res.status(400).json('Parent is not a folder');
        return;
      }
      parameters.parentId = parent._id;
    }

    if (['file', 'image'].includes(type)) {
      try {
        fs.mkdir(path, { recursive: true });
      } catch (err) { /* */ }
      const filePath = `${path}/${pathToken}`;
      const buf = Buffer.from(data, 'base64');
      fs.writeFile(filePath, buf, 'utf-8', (err) => {
        if (err) {
          console.log(err);
        }
      });
    }
    await dbClient.db.collection('files').insertOne(parameters).then((result) => {
      res.status(201).json({
        id: result.insertedId,
        userId: user._id,
        name: parameters.name,
        type: parameters.type,
        isPublic: parameters.isPublic,
        parentId: parameters.parentId,
      });
    });
  }

  static async getShow(req, res) {
    const user = await FilesController.user(req.headers['x-token']);
    if (user === null) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const itemId = ObjectID(req.params.id);
    const result = await dbClient.db.collection('files').findOne(
      { userId: user._id, _id: itemId },
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
      res.status(400).json({ error: 'Not found' });
      return;
    }
    res.status(200).json(result);
  }

  static async getIndex(req, res) {
    const user = await FilesController.user(req.headers['x-token']);
    if (user === null) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const parentId = req.query.parentId ? ObjectID(req.query.parentId) : 0;
    const page = req.query.page ? parseInt(req.query.page, 10) : 1;
    const params = { userId: user._id, parentId };
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
          data: [{ $skip: parseInt(page - 1, 10) * 20 }, { $limit: 20 }],
        },
      },
    ]).toArray();
    res.status(200).json(results[0].data);
  }

  static async putPublish(req, res) {
    const token = req.headers['x-token'];
    let userId = await redisClient.get(`auth_${token}`);
    if (userId === null) {
      res.status(401).json({ error: 'Unauthorized' });
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
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(200).json(file.value);
  }

  static async putUnPublish(req, res) {
    const token = req.headers['x-token'];
    let userId = await redisClient.get(`auth_${token}`);
    if (userId === null) {
      res.status(401).json({ error: 'Unauthorized' });
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
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(200).json(file.value);
  }

  static async getFile(req, res) {
    const token = req.headers['x-token'];
    let userId = await redisClient.get(`auth_${token}`);
    const itemId = ObjectID(req.params.id);
    const result = await dbClient.db.collection('files').findOne({ _id: itemId });
    if (result === null) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (userId !== null) {
      userId = JSON.parse(userId);
    }
    if (result.isPublic === false && (
      userId === null || result.userId.toString() !== userId.toString())) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (result.type === 'folder') {
      res.status(400).json({ error: "A folder doesn't have content" });
      return;
    }
    const type = mime.lookup(result.name);
    if (!type) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    fs.readFile(result.localPath, (err, data) => {
      if (err) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.type(type);
      res.status(200).json(data);
    });
  }
}

module.exports = FilesController;
