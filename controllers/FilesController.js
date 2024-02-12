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
    const user = await FilesController.user(req.headers['x-token']);
    if (user === null) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const {
      name,
      type,
      parentId,
      isPublic,
      data,
    } = req.body;
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
    const parameters = {};
    parameters.userId = ObjectID(user._id);
    parameters.name = name;
    parameters.type = type;
    parameters.isPublic = false;
    parameters.parentId = 0;
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

    const path = process.env.FOLDER_PATH ? process.env.FOLDER_PATH : '/tmp/files_manager';
    if (type !== 'folder') {
      parameters.localPath = `${path}/${uuidv4()}`;
    }

    if (['file', 'image'].includes(type)) {
      try {
        fs.mkdirSync(path);
      } catch (err) { /* */ }
      const buf = Buffer.from(data, 'base64');
      fs.writeFile(parameters.localPath, buf, 'utf-8', (err) => {
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
      { $sort: { _id: -1 } },
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
    const { parentId } = req.query;
    const page = req.query.page ? parseInt(req.query.page, 10) : 1;
    const params = { userId: user._id };
    if (parentId) {
      params.parentId = ObjectID(req.query.parentId);
    }
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
    const user = await FilesController.user(req.headers['x-token']);
    if (user === null) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const itemId = ObjectID(req.params.id);
    const file = await dbClient.db.collection('files').findOneAndUpdate(
      { userId: user._id, _id: itemId },
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
    const user = await FilesController.user(req.headers['x-token']);
    if (user === null) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const itemId = ObjectID(req.params.id);
    const file = await dbClient.db.collection('files').findOneAndUpdate(
      { userId: user._id, _id: itemId },
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
    const user = await FilesController.user(req.headers['x-token']);
    if (user === null) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const itemId = ObjectID(req.params.id);
    const result = await dbClient.db.collection('files').findOne({ _id: itemId });
    if (result === null) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (result.isPublic === false && (
      user === null || result.userId.toString() !== user._id.toString())) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (result.type === 'folder') {
      res.status(400).json({ error: "A folder doesn't have content" });
      return;
    }
    const type = mime.contentType(result.name);
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
      res.header('Content-Type', type).status(200).send(data);
    });
  }
}

module.exports = FilesController;
