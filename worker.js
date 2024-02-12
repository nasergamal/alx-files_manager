import imageThumbnail from 'image-thumbnail';

const { ObjectID } = require('mongodb');
const Queue = require('bull');
const fs = require('fs');

const dbClient = require('./utils/db');

const fileQueue = new Queue('fileQueue', 'redis://127.0.0.1:6379');
const userQueue = new Queue('userQueue', 'redus://127.0.0.1:6379');

fileQueue.process(async (job, done) => {
  const { fileId, userId } = job.data;
  if (!fileId) {
    done(new Error('Missing fileId'));
    return;
  }
  if (!userId) {
    done(new Error('Missing userId'));
    return;
  }
  const result = await dbClient.db.collection('files').findOne(
    {
      _id: ObjectID(fileId),
      userId: ObjectID(userId),
    },
  );
  if (!result) {
    done(new Error('File not found'));
    return;
  }
  const path = result.localPath;
  const thumbnail500 = await imageThumbnail(path, { width: 500 });
  const thumbnail250 = await imageThumbnail(path, { width: 250 });
  const thumbnail100 = await imageThumbnail(path, { width: 100 });
  await fs.promises.writeFile(`${path}_500`, thumbnail500);
  await fs.promises.writeFile(`${path}_250`, thumbnail250);
  await fs.promises.writeFile(`${path}_100`, thumbnail100);
  done();
});

userQueue.process(async (job, done) => {
  const { userId } = job.data;
  if (!userId) {
    done(new Error('Missing userId'));
  }
  const user = await dbClient.db.collection('users').findOne({ _id: ObjectID(userId) });
  if (!user) {
    done(new Error('User not found'));
    return;
  }
  console.log(`Welcome ${user.email}`);
});
