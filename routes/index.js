import AppController from '../controller/AppController';
import AuthController from '../controller/AuthController';
import FilesController from '../controller/FilesController';
import UsersController from '../controller/UsersController';

const { Router } = require('express');

const Routes = Router();
Routes.get('/status', AppController.getStatus);
Routes.get('/stats', AppController.getStats);
Routes.post('/users', UsersController.postNew);
Routes.get('/users/me', UsersController.getMe);
Routes.get('/connect', AuthController.getConnect);
Routes.get('/disconnect', AuthController.getDisconnect);
Routes.post('/files', FilesController.postUpload);
Routes.get('/files/:id/publish', FilesController.putPublish);
Routes.get('/files/:id/unpublish', FilesController.putUnPublish);
Routes.get('/files/:id/data', FilesController.getFile);
Routes.get('/files/:id', FilesController.getShow);
Routes.get('/files', FilesController.getIndex);

module.exports = Routes;