const express = require('express');
const Routes = require('./routes/index');

const app = express();
app.use(express.json({ limit: '2MB' }));
app.use(Routes);

let port = parseInt(process.env.PORT, 10);
if (Number.isNaN(port)) {
  port = 5000;
}

app.listen(port);
